import { Prisma } from "@prisma/client";

import { listAutomationFlowsForWorkspace, getAutomationRuntimeStatus } from "@/lib/automation/automation-service";
import { dispatchDueCampaigns } from "@/lib/campaigns/campaign-service";
import { prisma } from "@/lib/db/prisma";
import { dispatchQueuedOutboundBatch } from "@/lib/outbound/outbound-service";
import { executePublishedAutomation } from "@/modules/automations/application/runtime-executor";
import { materializeWhatsAppTimeTriggers } from "@/modules/automations/application/whatsapp-time-trigger-materializer";
import { processDueJourneys, getJourneyRuntimeStatus } from "@/modules/journeys/application/journey-persistence-runtime";
import type { WhatsAppAutomationTrigger } from "@/modules/automations/application/whatsapp-automation-event-outbox";

const MAX_EVENT_ATTEMPTS = 3;
const STALE_CLAIM_MS = 5 * 60_000;

function enabled(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function relatedTriggers(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function triggerMatches(input: {
  flowTrigger: string;
  flowConfig: Record<string, unknown>;
  eventTrigger: string;
  related: readonly string[];
  payload: Record<string, unknown>;
}): boolean {
  const accepted = new Set([input.eventTrigger, ...input.related].map((item) => item.trim().toUpperCase()));
  const flowTrigger = input.flowTrigger.trim().toUpperCase();
  if (!accepted.has(flowTrigger)) return false;

  if (flowTrigger === "INCOMING_KEYWORD") {
    const keyword = clean(input.flowConfig.keyword, 200).toLocaleLowerCase("en-IN");
    if (!keyword) return false;
    const text = clean(input.payload.text, 4096).toLocaleLowerCase("en-IN");
    return text.includes(keyword);
  }

  if (flowTrigger === "STAGE_CHANGED") {
    const expected = clean(input.flowConfig.stage, 50).toUpperCase();
    const actual = clean(input.payload.stage, 50).toUpperCase();
    return Boolean(expected && actual && expected === actual);
  }

  if (flowTrigger === "TAG_ADDED") {
    const expected = clean(input.flowConfig.tag, 100).toLocaleLowerCase("en-IN");
    const actual = clean(input.payload.tagName ?? input.payload.tag, 100).toLocaleLowerCase("en-IN");
    return Boolean(expected && actual && expected === actual);
  }

  return true;
}

async function resolveConversation(input: { conversationId: string | null; contactId: string | null }) {
  if (input.conversationId) {
    return prisma.whatsAppConversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, contactId: true },
    });
  }
  if (!input.contactId) return null;
  const lead = await prisma.lead.findUnique({
    where: { contactId: input.contactId },
    select: { conversationId: true, contactId: true },
  });
  if (lead) return { id: lead.conversationId, contactId: lead.contactId };
  return prisma.whatsAppConversation.findFirst({
    where: { contactId: input.contactId },
    orderBy: { createdAt: "desc" },
    select: { id: true, contactId: true },
  });
}

async function recoverStaleClaims(now: Date, sourceEventPrefix: string): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS);
  const cohortWhere = sourceEventPrefix ? { sourceEventId: { startsWith: sourceEventPrefix } } : {};
  const retryable = await prisma.engageWhatsAppAutomationEvent.updateMany({
    where: {
      ...cohortWhere,
      status: "PROCESSING",
      claimedAt: { lt: cutoff },
      attemptCount: { lt: MAX_EVENT_ATTEMPTS },
    },
    data: { status: "PENDING", claimedAt: null, lastError: "STALE_CLAIM_RECOVERED" },
  });
  await prisma.engageWhatsAppAutomationEvent.updateMany({
    where: {
      ...cohortWhere,
      status: "PROCESSING",
      claimedAt: { lt: cutoff },
      attemptCount: { gte: MAX_EVENT_ATTEMPTS },
    },
    data: { status: "FAILED", claimedAt: null, processedAt: now, lastError: "STALE_CLAIM_RETRY_LIMIT" },
  });
  return retryable.count;
}

async function processAutomationEvent(eventId: string, now: Date) {
  const claimed = await prisma.engageWhatsAppAutomationEvent.updateMany({
    where: { id: eventId, status: "PENDING", availableAt: { lte: now } },
    data: { status: "PROCESSING", claimedAt: now, attemptCount: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return { claimed: false, matched: 0, executed: 0, queuedMessageIds: [] as string[] };

  const event = await prisma.engageWhatsAppAutomationEvent.findUnique({ where: { id: eventId } });
  if (!event) return { claimed: false, matched: 0, executed: 0, queuedMessageIds: [] as string[] };
  try {
    const conversation = await resolveConversation({ conversationId: event.conversationId, contactId: event.contactId });
    if (!conversation) throw new Error("WhatsApp automation event has no resolvable conversation.");
    const payload = record(event.payload);
    const targetFlowId = clean(payload.targetFlowId, 120);
    const targetFlowVersion = Number(payload.targetFlowVersion);
    const flows = (await listAutomationFlowsForWorkspace(event.workspaceId, true)).filter((flow) => flow.status === "ACTIVE");
    let matched = 0;
    let executed = 0;
    const queuedMessageIds = new Set<string>();
    for (const flow of flows) {
      if (targetFlowId && flow.flowId !== targetFlowId) continue;
      if (targetFlowId && Number.isFinite(targetFlowVersion) && flow.version !== targetFlowVersion) continue;
      const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
      if (!trigger) continue;
      if (!triggerMatches({
        flowTrigger: trigger.type,
        flowConfig: trigger.config,
        eventTrigger: event.trigger,
        related: relatedTriggers(event.relatedTriggers),
        payload,
      })) continue;
      matched += 1;
      const execution = await executePublishedAutomation({
        flowId: flow.flowId,
        eventId: event.eventKey,
        conversationId: conversation.id,
        sample: {
          ...payload,
          automationEvent: {
            id: event.id,
            sourceEventId: event.sourceEventId,
            trigger: event.trigger,
            workspaceId: event.workspaceId,
          },
        },
        now,
      });
      for (const messageId of execution.run.queuedMessageIds) queuedMessageIds.add(messageId);
      executed += 1;
    }
    await prisma.engageWhatsAppAutomationEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", claimedAt: null, processedAt: now, lastError: null },
    });
    return { claimed: true, matched, executed, queuedMessageIds: [...queuedMessageIds] };
  } catch (error) {
    const current = await prisma.engageWhatsAppAutomationEvent.findUnique({ where: { id: event.id }, select: { attemptCount: true } });
    const attempts = current?.attemptCount ?? MAX_EVENT_ATTEMPTS;
    const failed = attempts >= MAX_EVENT_ATTEMPTS;
    await prisma.engageWhatsAppAutomationEvent.update({
      where: { id: event.id },
      data: {
        status: failed ? "FAILED" : "PENDING",
        claimedAt: null,
        processedAt: failed ? now : null,
        lastError: (error instanceof Error ? error.message : "Automation event processing failed.").slice(0, 1_000),
      },
    });
    return { claimed: true, matched: 0, executed: 0, queuedMessageIds: [] as string[], error: error instanceof Error ? error.message : "Automation event processing failed." };
  }
}

async function processDueAutomationEvents(now: Date, limit: number, sourceEventPrefix: string) {
  const rows = await prisma.engageWhatsAppAutomationEvent.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
      ...(sourceEventPrefix ? { sourceEventId: { startsWith: sourceEventPrefix } } : {}),
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });
  const results = [];
  for (const row of rows) results.push(await processAutomationEvent(row.id, now));
  return {
    inspected: rows.length,
    processed: results.filter((item) => item.claimed).length,
    matched: results.reduce((sum, item) => sum + item.matched, 0),
    executed: results.reduce((sum, item) => sum + item.executed, 0),
    failed: results.filter((item) => "error" in item).length,
    queuedMessageIds: [...new Set(results.flatMap((item) => item.queuedMessageIds))],
  };
}

async function resumeAutomationRuns(now: Date, limit: number) {
  const rows = await prisma.webhookEvent.findMany({
    where: { eventType: "automation_runtime_run", processedAt: null },
    orderBy: { receivedAt: "asc" },
    take: limit,
    select: { payload: true },
  });
  let resumed = 0;
  for (const row of rows) {
    const run = record(row.payload);
    const status = clean(run.status, 40).toUpperCase();
    if (!["WAITING", "RETRYABLE"].includes(status)) continue;
    const waitUntil = clean(run.waitUntil, 80);
    if (waitUntil && Date.parse(waitUntil) > now.getTime()) continue;
    const flowId = clean(run.flowId, 120);
    const eventId = clean(run.eventId, 250);
    const conversationId = clean(run.conversationId, 120);
    if (!flowId || !eventId || !conversationId) continue;
    await executePublishedAutomation({ flowId, eventId, conversationId, sample: record(run.sample), now });
    resumed += 1;
  }
  return { inspected: rows.length, resumed };
}

export function getWhatsAppAutomationSchedulerStatus() {
  const automation = getAutomationRuntimeStatus();
  const journey = getJourneyRuntimeStatus();
  return {
    schedulerEnabled: enabled("WHATSAPP_AUTOMATION_SCHEDULER_ENABLED", false),
    automation,
    journey,
    campaignsEnabled: enabled("WHATSAPP_CAMPAIGNS_ENABLED", false),
    outboundDispatchEnabled: enabled("WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED", false),
    allowGlobalQueuedDispatch: enabled("WHATSAPP_AUTOMATION_ALLOW_GLOBAL_QUEUED_DISPATCH", false),
    systemActorIdConfigured: Boolean(process.env.WHATSAPP_AUTOMATION_SYSTEM_ACTOR_ID?.trim()),
    eventSourcePrefix: process.env.WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX?.trim() || "",
  };
}

export async function runWhatsAppAutomationSchedulerCycle(input?: { now?: Date; limit?: number }) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(50, Math.floor(input?.limit ?? 20)));
  const status = getWhatsAppAutomationSchedulerStatus();
  if (!status.schedulerEnabled) return { status, paused: true, reason: "SCHEDULER_DISABLED" as const };

  const recoveredClaims = await recoverStaleClaims(now, status.eventSourcePrefix);
  if (!status.automation.runtimeEnabled || !status.automation.actionExecutionEnabled) {
    return {
      status,
      paused: true,
      reason: "AUTOMATION_RUNTIME_GATED" as const,
      recoveredClaims,
      pendingEvents: await prisma.engageWhatsAppAutomationEvent.count({ where: { status: "PENDING", availableAt: { lte: now } } }),
    };
  }

  const targetedEventCohort = Boolean(status.eventSourcePrefix);
  const timeTriggers = targetedEventCohort
    ? { skipped: true, reason: "TARGETED_EVENT_COHORT" as const }
    : await materializeWhatsAppTimeTriggers({ now, limit });
  const automationEvents = await processDueAutomationEvents(now, limit, status.eventSourcePrefix);
  const resumedRuns = targetedEventCohort
    ? { skipped: true, reason: "TARGETED_EVENT_COHORT" as const }
    : await resumeAutomationRuns(now, limit);
  const actorId = process.env.WHATSAPP_AUTOMATION_SYSTEM_ACTOR_ID?.trim() || "";

  let journeys: unknown = { skipped: true, reason: "JOURNEY_RUNTIME_GATED" };
  if (status.journey.runtimeEnabled && status.journey.actionExecutionEnabled) {
    if (!actorId) throw new Error("WHATSAPP_AUTOMATION_SYSTEM_ACTOR_ID is required when Journey actions are enabled.");
    journeys = await processDueJourneys({ actorId, limit, now });
  }

  let campaigns: unknown = { skipped: true, reason: "CAMPAIGNS_GATED" };
  if (status.campaignsEnabled) {
    if (!actorId) throw new Error("WHATSAPP_AUTOMATION_SYSTEM_ACTOR_ID is required when Campaigns are enabled.");
    campaigns = await dispatchDueCampaigns(actorId);
  }

  let outbound: unknown = { skipped: true, reason: "OUTBOUND_DISPATCH_GATED" };
  if (status.outboundDispatchEnabled) {
    if (status.automation.outboundMode !== "live") {
      throw new Error("WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED requires WHATSAPP_OUTBOUND_MODE=live.");
    }
    if (targetedEventCohort) {
      outbound = await dispatchQueuedOutboundBatch(limit, {
        messageIds: automationEvents.queuedMessageIds,
      });
    } else {
      if (!status.allowGlobalQueuedDispatch) {
        throw new Error(
          "Global queued outbound dispatch requires WHATSAPP_AUTOMATION_ALLOW_GLOBAL_QUEUED_DISPATCH=true.",
        );
      }
      outbound = await dispatchQueuedOutboundBatch(limit);
    }
  }

  return { status, paused: false, recoveredClaims, timeTriggers, automationEvents, resumedRuns, journeys, campaigns, outbound };
}

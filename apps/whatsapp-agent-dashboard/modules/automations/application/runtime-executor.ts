import { AgentMode, DashboardRole, LeadStage, MessageActor, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getAutomationRuntimeStatus } from "@/lib/automation/automation-service";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import type { AutomationEdge, AutomationGraph, AutomationNode } from "@/modules/automations/domain/automation-graph";
import { insideQuietHours, type QuietHours } from "@/modules/journeys/domain/journey-policy";

const RUN_EVENT_TYPE = "automation_runtime_run";
const ACTION_EVENT_TYPE = "automation_runtime_action";
const MAX_ATTEMPTS = 3;
const DEFAULT_QUIET_HOURS: QuietHours = { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 };
const DEFAULT_FREQUENCY_CAP = 5;

type RunStatus =
  | "RUNNING"
  | "WAITING"
  | "HANDOFF_REQUIRED"
  | "COMPLETED"
  | "CANCELLED"
  | "RETRYABLE"
  | "FAILED";

type RunState = {
  flowId: string;
  flowVersion: number;
  eventId: string;
  conversationId: string;
  status: RunStatus;
  currentNodeId: string;
  startedAt: string;
  updatedAt: string;
  attemptCount: number;
  waitUntil: string | null;
  baselineLeadStage: string | null;
  queuedMessageIds: string[];
  completedNodeIds: string[];
  cancellationReason: string | null;
  lastError: string | null;
  sample: Record<string, unknown>;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function key(flowId: string, eventId: string) {
  const digest = createHash("sha256").update(`${flowId}:${eventId}`).digest("hex");
  return `automation-runtime:${digest}`;
}

function actionKey(run: RunState, nodeId: string) {
  return `automation-runtime-action:${createHash("sha256")
    .update(`${run.flowId}:${run.flowVersion}:${run.eventId}:${nodeId}`)
    .digest("hex")}`;
}

function localMinute(now: Date, timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function valueAt(sample: Record<string, unknown>, path: unknown): unknown {
  if (typeof path !== "string" || !path.trim()) return undefined;
  let current: unknown = sample;
  for (const part of path.trim().split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function conditionMatches(node: AutomationNode, sample: Record<string, unknown>) {
  const config = rec(node.config);
  const actual = valueAt(sample, config.field);
  const expected = config.value;
  const operator = clean(config.operator, 30).toLowerCase() || "equals";
  if (operator === "exists") return actual !== undefined && actual !== null;
  if (operator === "not_exists") return actual === undefined || actual === null;
  if (operator === "contains") {
    return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  }
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  return String(actual ?? "") === String(expected ?? "");
}

function nextNode(graph: AutomationGraph, node: AutomationNode, sample: Record<string, unknown>) {
  const outgoing = graph.edges
    .filter((edge) => edge.from === node.id)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (node.type === "CONDITION" || node.type === "BRANCH") {
    const matched = conditionMatches(node, sample);
    const labels = matched ? ["true", "yes", "match", "matched"] : ["false", "no", "else", "default"];
    return (outgoing.find((edge) => labels.includes(edge.label?.trim().toLowerCase() ?? "")) ?? outgoing[0])?.to ?? null;
  }
  return outgoing[0]?.to ?? null;
}

async function loadPublishedFlow(flowId: string) {
  const legacy = await prisma.webhookEvent.findUnique({ where: { eventKey: `automation-flow:${flowId}` } });
  if (!legacy) throw new Error("Automation flow not found.");
  const payload = rec(legacy.payload);
  if (clean(payload.status, 20).toUpperCase() !== "ACTIVE") throw new Error("Automation flow is not ACTIVE.");
  const version = Math.max(1, Math.floor(Number(payload.version) || 1));
  const published = await prisma.webhookEvent.findUnique({
    where: { eventKey: `automation-graph-published:${flowId}:source-v${version}` },
  });
  if (!published) throw new Error("Current automation version is not published.");
  const root = rec(published.payload);
  const graphRoot = rec(root.graph);
  const nodes = Array.isArray(graphRoot.nodes) ? graphRoot.nodes : [];
  const edges = Array.isArray(graphRoot.edges) ? graphRoot.edges : [];
  const graph: AutomationGraph = {
    nodes: nodes.map((raw) => {
      const node = rec(raw);
      return { id: clean(node.id), type: clean(node.type) as AutomationNode["type"], config: rec(node.config) };
    }),
    edges: edges.map((raw) => {
      const edge = rec(raw);
      const label = clean(edge.label);
      return { id: clean(edge.id), from: clean(edge.from), to: clean(edge.to), ...(label ? { label } : {}) };
    }),
  };
  const trigger = graph.nodes.find((node) => node.type === "TRIGGER");
  if (!trigger) throw new Error("Published automation has no trigger.");
  return { graph, version, trigger };
}

function parseRun(value: unknown): RunState {
  const row = rec(value);
  return {
    flowId: clean(row.flowId, 100),
    flowVersion: Number(row.flowVersion),
    eventId: clean(row.eventId, 200),
    conversationId: clean(row.conversationId, 100),
    status: clean(row.status, 40) as RunStatus,
    currentNodeId: clean(row.currentNodeId, 100),
    startedAt: clean(row.startedAt, 60),
    updatedAt: clean(row.updatedAt, 60),
    attemptCount: Math.max(0, Number(row.attemptCount) || 0),
    waitUntil: clean(row.waitUntil, 60) || null,
    baselineLeadStage: clean(row.baselineLeadStage, 60) || null,
    queuedMessageIds: Array.isArray(row.queuedMessageIds) ? row.queuedMessageIds.filter((x): x is string => typeof x === "string") : [],
    completedNodeIds: Array.isArray(row.completedNodeIds) ? row.completedNodeIds.filter((x): x is string => typeof x === "string") : [],
    cancellationReason: clean(row.cancellationReason, 500) || null,
    lastError: clean(row.lastError, 1000) || null,
    sample: rec(row.sample),
  };
}

async function persistRun(eventKey: string, run: RunState, error?: string | null) {
  await prisma.webhookEvent.update({
    where: { eventKey },
    data: {
      payload: json(run),
      attemptCount: run.attemptCount,
      processingError: error ?? null,
      processedAt: ["COMPLETED", "CANCELLED", "FAILED", "HANDOFF_REQUIRED"].includes(run.status) ? new Date() : null,
    },
  });
}

async function cancellationReason(run: RunState, now: Date) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: run.conversationId },
    select: {
      contactId: true,
      contact: { select: { consentStatus: true, metadata: true } },
      lead: { select: { stage: true } },
      messages: {
        where: { direction: "INBOUND", messageTimestamp: { gt: new Date(run.startedAt) } },
        orderBy: { messageTimestamp: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!conversation) return "Conversation no longer exists.";
  if (conversation.contact.consentStatus === "OPTED_OUT") return "Customer opted out.";
  if (conversation.messages.length > 0) return "Customer response cancels obsolete automation.";
  if (run.baselineLeadStage && conversation.lead?.stage && conversation.lead.stage !== run.baselineLeadStage) {
    return "Lead-stage change cancels obsolete automation.";
  }
  const mapping = readLegacyWhatsAppMappingMetadata(conversation.contact.metadata);
  const refs = [conversation.contactId, mapping?.customerRef].filter((x): x is string => Boolean(x));
  const suppression = await prisma.engageCustomerSuppression.findFirst({
    where: {
      workspaceId: mapping?.workspaceId ?? "engagews_default",
      customerRef: { in: refs },
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [
        { OR: [{ revokedAt: null }, { revokedAt: { gt: now } }] },
        { OR: [{ channel: null }, { channel: "WHATSAPP" }] },
      ],
    },
    select: { id: true },
  });
  return suppression ? "Customer is suppressed for WhatsApp." : null;
}

async function executeAction(run: RunState, node: AutomationNode, now: Date) {
  const config = rec(node.config);
  const legacyType = clean(config.legacyType, 60).toUpperCase();
  if (["SEND_TEXT", "ASK_QUESTION", "SEND_TEMPLATE", "SEND_MEDIA"].includes(legacyType)) {
    const blocked = await cancellationReason(run, now);
    if (blocked) return { kind: "cancel" as const, reason: blocked };
    if (insideQuietHours(localMinute(now), DEFAULT_QUIET_HOURS)) {
      return { kind: "wait" as const, until: new Date(now.getTime() + 30 * 60_000) };
    }
    const sentInWindow = await prisma.webhookEvent.count({
      where: {
        eventType: ACTION_EVENT_TYPE,
        receivedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        payload: { path: ["conversationId"], equals: run.conversationId },
      },
    });
    if (sentInWindow >= DEFAULT_FREQUENCY_CAP) {
      return { kind: "wait" as const, until: new Date(now.getTime() + 60 * 60_000) };
    }

    const content =
      legacyType === "SEND_TEMPLATE"
        ? ({ kind: "template", templateId: clean(config.templateId, 100) } as const)
        : legacyType === "SEND_MEDIA"
          ? ({
              kind: "media",
              assetId: clean(config.assetId, 100),
              mediaType: clean(config.mediaType, 20).toLowerCase() as "image" | "document" | "video" | "audio",
              caption: clean(config.caption, 1024) || null,
            } as const)
          : ({ kind: "text", text: clean(config.text, 4096) } as const);

    const queued = await queueOutboundMessage({
      conversationId: run.conversationId,
      actor: MessageActor.AI,
      content,
      idempotencyKey: actionKey(run, node.id),
      flowProvenance: { flowType: "AUTOMATION", flowId: run.flowId, flowVersion: run.flowVersion },
      now,
    });
    if (queued.message?.id) {
      await prisma.webhookEvent.create({
        data: {
          eventKey: actionKey(run, node.id),
          eventType: ACTION_EVENT_TYPE,
          payload: json({ flowId: run.flowId, flowVersion: run.flowVersion, conversationId: run.conversationId, nodeId: node.id, messageId: queued.message.id }),
          attemptCount: 1,
          processedAt: new Date(),
        },
      }).catch(() => undefined);
      run.queuedMessageIds = [...new Set([...run.queuedMessageIds, queued.message.id])];
    }
    return { kind: "done" as const };
  }

  if (legacyType === "ADD_TAG" || legacyType === "REMOVE_TAG") {
    const tagName = clean(config.tag, 100).toLowerCase();
    if (!tagName) throw new Error("Automation tag action requires a tag.");
    const tag = await prisma.conversationTag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } });
    if (legacyType === "ADD_TAG") {
      await prisma.conversationTagLink.upsert({
        where: { conversationId_tagId: { conversationId: run.conversationId, tagId: tag.id } },
        update: {},
        create: { conversationId: run.conversationId, tagId: tag.id },
      });
    } else {
      await prisma.conversationTagLink.deleteMany({ where: { conversationId: run.conversationId, tagId: tag.id } });
    }
    return { kind: "done" as const };
  }

  if (legacyType === "UPDATE_STAGE") {
    const stage = clean(config.stage, 60).toUpperCase() as LeadStage;
    if (!Object.values(LeadStage).includes(stage)) throw new Error("Automation stage is invalid.");
    await prisma.lead.update({ where: { conversationId: run.conversationId }, data: { stage } });
    return { kind: "done" as const };
  }

  if (legacyType === "ASSIGN_COUNSELOR") {
    const counselorId = clean(config.counselorId, 100);
    const counselor = await prisma.dashboardUser.findFirst({
      where: { id: counselorId, isActive: true, role: { in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR] } },
      select: { id: true },
    });
    if (!counselor) throw new Error("Automation counselor is unavailable.");
    await prisma.$transaction([
      prisma.whatsAppConversation.update({ where: { id: run.conversationId }, data: { assignedToId: counselor.id, agentMode: AgentMode.HUMAN } }),
      prisma.lead.update({ where: { conversationId: run.conversationId }, data: { assignedToId: counselor.id } }),
    ]);
    return { kind: "done" as const };
  }

  if (legacyType === "SEND_EMAIL") throw new Error("Email actions are outside the WhatsApp automation runtime.");
  return { kind: "done" as const };
}

export async function executePublishedAutomation(input: {
  flowId: string;
  eventId: string;
  conversationId: string;
  sample?: unknown;
  now?: Date;
}) {
  const flowId = clean(input.flowId, 100);
  const eventId = clean(input.eventId, 200);
  const conversationId = clean(input.conversationId, 100);
  if (!flowId || !eventId || !conversationId) throw new Error("flowId, eventId and conversationId are required.");
  const runtimeStatus = getAutomationRuntimeStatus();
  if (!runtimeStatus.runtimeEnabled) throw new Error("Automation runtime is disabled.");
  if (!runtimeStatus.actionExecutionEnabled) throw new Error("Automation action execution is disabled.");
  const now = input.now ?? new Date();
  const { graph, version, trigger } = await loadPublishedFlow(flowId);
  const eventKey = key(flowId, eventId);
  let event = await prisma.webhookEvent.findUnique({ where: { eventKey } });

  if (!event) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { lead: { select: { stage: true } } },
    });
    if (!conversation) throw new Error("Automation conversation not found.");
    const state: RunState = {
      flowId,
      flowVersion: version,
      eventId,
      conversationId,
      status: "RUNNING",
      currentNodeId: trigger.id,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      attemptCount: 0,
      waitUntil: null,
      baselineLeadStage: conversation.lead?.stage ?? null,
      queuedMessageIds: [],
      completedNodeIds: [],
      cancellationReason: null,
      lastError: null,
      sample: rec(input.sample),
    };
    event = await prisma.webhookEvent.create({
      data: { eventKey, eventType: RUN_EVENT_TYPE, payload: json(state), attemptCount: 0 },
    });
  }

  const run = parseRun(event.payload);
  if (["COMPLETED", "CANCELLED", "FAILED", "HANDOFF_REQUIRED"].includes(run.status)) {
    return { run, replayed: true, outboundSent: false };
  }
  if (run.flowVersion !== version) throw new Error("Automation run version no longer matches the active published flow.");
  if (run.waitUntil && new Date(run.waitUntil).getTime() > now.getTime()) {
    return { run, replayed: true, outboundSent: false };
  }

  run.status = "RUNNING";
  run.waitUntil = null;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));

  try {
    for (let guard = 0; guard < 100; guard += 1) {
      const node = nodeMap.get(run.currentNodeId);
      if (!node) throw new Error("Automation run points to a missing node.");

      if (node.type === "STOP" || node.type === "GOAL") {
        run.status = "COMPLETED";
        run.completedNodeIds = [...new Set([...run.completedNodeIds, node.id])];
        run.updatedAt = now.toISOString();
        await persistRun(eventKey, run);
        return { run, replayed: false, outboundSent: false };
      }

      if (node.type === "APPROVAL") {
        await prisma.whatsAppConversation.update({
          where: { id: run.conversationId },
          data: { agentMode: AgentMode.REVIEW_REQUIRED, humanTakeoverReason: "Automation requires human approval." },
        });
        run.status = "HANDOFF_REQUIRED";
        run.updatedAt = now.toISOString();
        await persistRun(eventKey, run);
        return { run, replayed: false, outboundSent: false };
      }

      if (node.type === "DELAY") {
        const minutes = Math.max(1, Math.min(43_200, Math.floor(Number(rec(node.config).minutes) || 1)));
        run.waitUntil = new Date(now.getTime() + minutes * 60_000).toISOString();
        run.status = "WAITING";
        run.currentNodeId = nextNode(graph, node, run.sample) ?? node.id;
        run.completedNodeIds = [...new Set([...run.completedNodeIds, node.id])];
        run.updatedAt = now.toISOString();
        await persistRun(eventKey, run);
        return { run, replayed: false, outboundSent: false };
      }

      if (node.type === "ACTION") {
        const result = await executeAction(run, node, now);
        if (result.kind === "cancel") {
          run.status = "CANCELLED";
          run.cancellationReason = result.reason;
          run.updatedAt = now.toISOString();
          await persistRun(eventKey, run);
          return { run, replayed: false, outboundSent: false };
        }
        if (result.kind === "wait") {
          run.status = "WAITING";
          run.waitUntil = result.until.toISOString();
          run.updatedAt = now.toISOString();
          await persistRun(eventKey, run);
          return { run, replayed: false, outboundSent: false };
        }
      }

      const target = nextNode(graph, node, run.sample);
      run.completedNodeIds = [...new Set([...run.completedNodeIds, node.id])];
      if (!target) {
        run.status = "COMPLETED";
        run.updatedAt = now.toISOString();
        await persistRun(eventKey, run);
        return { run, replayed: false, outboundSent: false };
      }
      run.currentNodeId = target;
    }
    throw new Error("Automation execution step limit exceeded.");
  } catch (error) {
    run.attemptCount += 1;
    run.lastError = error instanceof Error ? error.message : "Automation execution failed.";
    run.status = run.attemptCount >= MAX_ATTEMPTS ? "FAILED" : "RETRYABLE";
    run.updatedAt = now.toISOString();
    await persistRun(eventKey, run, run.lastError);
    return { run, replayed: false, outboundSent: false };
  }
}


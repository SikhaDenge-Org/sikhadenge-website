import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { listAutomationFlows } from "@/lib/automation/automation-service";
import { enqueueEmailAutomationEvent } from "./event-outbox";
import { processDueEmailCampaigns } from "../campaigns/campaign-service";
import { processDueEmailSequences } from "../sequences/sequence-service";
import { syncWatchedGmailMailboxes } from "../inbound/gmail-inbound-service";
import { refreshEmailDeliverabilityEvidence } from "../application/deliverability-evidence-service";
import { getEmailRuntimePolicy } from "../application/runtime-policy";
import { processEmailAutomationEvents } from "./dispatcher";
import { EMAIL_AUTOMATION_RETRY_PENDING_PREFIX } from "../providers/provider-error-policy";

export async function getEmailAutomationSchedulerHealth() {
  const now = new Date();
  const scheduledMaterialized = await materializeScheduledAutomationEvents(now);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const [pending, processing, failed, retryPending, staleProcessing, oldestPending, workspaces, latestSchedulerRun] = await Promise.all([
    prisma.engageEmailAutomationEvent.count({ where: { status: "PENDING", availableAt: { lte: now } } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "PROCESSING" } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "FAILED" } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "PENDING", lastError: { startsWith: EMAIL_AUTOMATION_RETRY_PENDING_PREFIX } } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "PROCESSING", updatedAt: { lt: staleBefore } } }),
    prisma.engageEmailAutomationEvent.findFirst({ where: { status: "PENDING", availableAt: { lte: now } }, orderBy: { availableAt: "asc" }, select: { availableAt: true, createdAt: true } }),
    prisma.engageEmailAutomationEvent.findMany({ where: { OR: [{ status: "PENDING", availableAt: { lte: now } }, { status: "PROCESSING", updatedAt: { lt: staleBefore } }] }, select: { workspaceId: true }, distinct: ["workspaceId"] }),
    prisma.auditLog.findFirst({
      where: { action: "EMAIL_AUTOMATION_SCHEDULER_RUN", entityType: "EmailAutomationScheduler" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, createdAt: true, after: true },
    }),
  ]);
  const policy = getEmailRuntimePolicy();
  return {
    runtimeEnabled: policy.runtimeEnabled,
    automationEnabled: policy.automationEnabled,
    inboundSyncEnabled: policy.inboundSyncEnabled,
    runtimeMode: policy.mode,
    externalWritesEnabled: policy.externalWritesEnabled,
    pending,
    processing,
    failed,
    deadLettered: failed,
    retryPending,
    staleProcessing,
    workspacesWithRunnableEvents: workspaces.length,
    oldestPendingAt: oldestPending?.availableAt ?? oldestPending?.createdAt ?? null,
    latestSchedulerRun: latestSchedulerRun
      ? { runId: latestSchedulerRun.entityId, createdAt: latestSchedulerRun.createdAt, summary: latestSchedulerRun.after }
      : null,
  };
}

async function materializeScheduledAutomationEvents(now: Date) {
  const flows = (await listAutomationFlows()).filter((flow) => flow.workspaceId && flow.status === "ACTIVE");
  let materialized = 0;
  for (const flow of flows) {
    const trigger = flow.nodes.find((node) => node.kind === "TRIGGER" && node.type === "SCHEDULE");
    if (!trigger || !flow.workspaceId) continue;
    const intervalMinutes = Number(trigger.config.intervalMinutes);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 10_080) continue;
    const intervalMs = Math.floor(intervalMinutes) * 60_000;
    const bucket = Math.floor(now.getTime() / intervalMs) * intervalMs;
    const sourceEventId = `schedule:${flow.flowId}:v${flow.version}:${bucket}`;
    try {
      await prisma.$transaction(async (tx) => enqueueEmailAutomationEvent(tx, {
        workspaceId: flow.workspaceId!, sourceEventId, trigger: "SCHEDULE", availableAt: new Date(bucket),
        payload: { targetFlowId: flow.flowId, targetFlowVersion: flow.version, intervalMinutes: Math.floor(intervalMinutes), scheduledBucket: new Date(bucket).toISOString() },
      }));
      materialized += 1;
    } catch (error) { if (!(error instanceof Error) || !/unique|duplicate/i.test(error.message)) throw error; }
  }
  return materialized;
}

export async function processEmailAutomationScheduler(input: {
  workspaceLimit?: number;
  perWorkspaceLimit?: number;
}) {
  const now = new Date();
  const scheduledMaterialized = await materializeScheduledAutomationEvents(now);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const candidates = await prisma.engageEmailAutomationEvent.findMany({
    where: {
      OR: [
        { status: "PENDING", availableAt: { lte: now } },
        { status: "PROCESSING", updatedAt: { lt: staleBefore } },
      ],
    },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    orderBy: { workspaceId: "asc" },
    take: Math.min(Math.max(input.workspaceLimit ?? 20, 1), 100),
  });

  let deliverabilityRefresh: Record<string, unknown>;
  try {
    const refreshed = await refreshEmailDeliverabilityEvidence();
    deliverabilityRefresh = { ok: true, ...refreshed };
  } catch (error) {
    deliverabilityRefresh = {
      ok: false,
      error: error instanceof Error ? error.message : "Email deliverability evidence refresh failed.",
    };
  }

  const results = [];
  for (const candidate of candidates) {
    const result = await processEmailAutomationEvents({
      workspaceId: candidate.workspaceId,
      actorUserId: "internal:email-automation-scheduler",
      limit: Math.min(Math.max(input.perWorkspaceLimit ?? 20, 1), 100),
    });
    results.push({ workspaceId: candidate.workspaceId, ...result });
  }
  const inboundSync = await syncWatchedGmailMailboxes({ limit: Math.min(Math.max(input.workspaceLimit ?? 20, 1), 50) });
  const campaignResults = await processDueEmailCampaigns(20);
  const sequenceResults = await processDueEmailSequences(50);
  const summary = {
    workspacesScanned: candidates.length,
    scheduledMaterialized,
    deliverabilityRefresh,
    inboundSync,
    campaignRuns: campaignResults.length,
    campaignResults,
    sequenceResults,
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
    retried: results.reduce((sum, item) => sum + item.retried, 0),
    deadLettered: results.reduce((sum, item) => sum + item.deadLettered, 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    recovered: results.reduce((sum, item) => sum + item.recovered, 0),
    results,
  };
  const runId = randomUUID();
  let auditRecorded = false;
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "EMAIL_AUTOMATION_SCHEDULER_RUN",
        entityType: "EmailAutomationScheduler",
        entityId: runId,
        after: JSON.parse(JSON.stringify(summary)),
      },
    });
    auditRecorded = true;
  } catch {
    auditRecorded = false;
  }
  return { runId, auditRecorded, ...summary };
}

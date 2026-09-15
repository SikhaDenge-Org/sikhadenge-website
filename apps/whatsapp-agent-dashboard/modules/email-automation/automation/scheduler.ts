import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getEmailRuntimePolicy } from "../application/runtime-policy";
import { processEmailAutomationEvents } from "./dispatcher";

export async function getEmailAutomationSchedulerHealth() {
  const now = new Date();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const [pending, processing, failed, staleProcessing, oldestPending, workspaces, latestSchedulerRun] = await Promise.all([
    prisma.engageEmailAutomationEvent.count({ where: { status: "PENDING", availableAt: { lte: now } } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "PROCESSING" } }),
    prisma.engageEmailAutomationEvent.count({ where: { status: "FAILED" } }),
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
    runtimeMode: policy.mode,
    externalWritesEnabled: policy.externalWritesEnabled,
    pending,
    processing,
    failed,
    staleProcessing,
    workspacesWithRunnableEvents: workspaces.length,
    oldestPendingAt: oldestPending?.availableAt ?? oldestPending?.createdAt ?? null,
    latestSchedulerRun: latestSchedulerRun
      ? { runId: latestSchedulerRun.entityId, createdAt: latestSchedulerRun.createdAt, summary: latestSchedulerRun.after }
      : null,
  };
}

export async function processEmailAutomationScheduler(input: {
  workspaceLimit?: number;
  perWorkspaceLimit?: number;
}) {
  const now = new Date();
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

  const results = [];
  for (const candidate of candidates) {
    const result = await processEmailAutomationEvents({
      workspaceId: candidate.workspaceId,
      actorUserId: "internal:email-automation-scheduler",
      limit: Math.min(Math.max(input.perWorkspaceLimit ?? 20, 1), 100),
    });
    results.push({ workspaceId: candidate.workspaceId, ...result });
  }
  const summary = {
    workspacesScanned: candidates.length,
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
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
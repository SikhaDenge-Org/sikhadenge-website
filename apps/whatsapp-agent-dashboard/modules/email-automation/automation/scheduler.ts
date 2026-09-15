import { prisma } from "@/lib/db/prisma";
import { processEmailAutomationEvents } from "./dispatcher";

export async function processEmailAutomationScheduler(input: {
  workspaceLimit?: number;
  perWorkspaceLimit?: number;
}) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const candidates = await prisma.engageEmailAutomationEvent.findMany({
    where: {
      OR: [
        { status: "PENDING" },
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
  return {
    workspacesScanned: candidates.length,
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    recovered: results.reduce((sum, item) => sum + item.recovered, 0),
    results,
  };
}
import {
  AUTOMATION_TRIGGER_TYPES,
  listAutomationFlowsForRuntime,
  validateAutomationFlow,
} from "@/lib/automation/automation-service";
import { prisma } from "@/lib/db/prisma";

async function main() {
  const flows = await listAutomationFlowsForRuntime();
  const statusCounts: Record<string, number> = {};
  const triggerCoverage: Record<string, { active: number; published: number; executable: number }> =
    Object.fromEntries(AUTOMATION_TRIGGER_TYPES.map((trigger) => [trigger, { active: 0, published: 0, executable: 0 }]));

  const activeActionTypes: Record<string, number> = {};
  const activeWorkspaceKeys = new Set<string>();
  const executableWorkspaceTriggerKeys = new Set<string>();
  const legacyExecutableTriggers = new Set<string>();
  let activeFlows = 0;
  let activeValidFlows = 0;
  let activePublishedFlows = 0;
  let activeExecutableFlows = 0;
  let activeWithoutTrigger = 0;
  let activeWithoutPublishedGraph = 0;
  let activeInvalidFlows = 0;

  for (const flow of flows) {
    statusCounts[flow.status] = (statusCounts[flow.status] ?? 0) + 1;
    if (flow.status !== "ACTIVE") continue;
    activeFlows += 1;
    activeWorkspaceKeys.add(flow.workspaceId ?? "legacy");

    const validation = validateAutomationFlow(flow);
    if (validation.valid) activeValidFlows += 1;
    else activeInvalidFlows += 1;

    const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
    if (!trigger) {
      activeWithoutTrigger += 1;
      continue;
    }

    const coverage = triggerCoverage[trigger.type];
    if (coverage) coverage.active += 1;

    for (const node of flow.nodes) {
      if (node.kind === "ACTION") {
        activeActionTypes[node.type] = (activeActionTypes[node.type] ?? 0) + 1;
      }
    }

    const published = await prisma.webhookEvent.findUnique({
      where: { eventKey: `automation-graph-published:${flow.flowId}:source-v${flow.version}` },
      select: { id: true },
    });
    if (!published) {
      activeWithoutPublishedGraph += 1;
      continue;
    }

    activePublishedFlows += 1;
    if (coverage) coverage.published += 1;
    if (validation.valid) {
      activeExecutableFlows += 1;
      if (coverage) coverage.executable += 1;
      if (flow.workspaceId) {
        executableWorkspaceTriggerKeys.add(`${flow.workspaceId}::${trigger.type}`);
      } else {
        legacyExecutableTriggers.add(trigger.type);
      }
    }
  }

  const pendingWorkspaceTriggerRows = await prisma.engageWhatsAppAutomationEvent.groupBy({
    by: ["workspaceId", "trigger"],
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    _count: { _all: true },
  });

  const pendingByTrigger: Record<string, number> = {};
  const uncoveredDueByTrigger: Record<string, number> = {};
  let uncoveredDueWorkspaceTriggerGroups = 0;
  for (const row of pendingWorkspaceTriggerRows) {
    pendingByTrigger[row.trigger] = (pendingByTrigger[row.trigger] ?? 0) + row._count._all;
    const covered =
      legacyExecutableTriggers.has(row.trigger) ||
      executableWorkspaceTriggerKeys.has(`${row.workspaceId}::${row.trigger}`);
    if (!covered) {
      uncoveredDueWorkspaceTriggerGroups += 1;
      uncoveredDueByTrigger[row.trigger] = (uncoveredDueByTrigger[row.trigger] ?? 0) + row._count._all;
    }
  }

  const uncoveredDueTriggers = Object.entries(uncoveredDueByTrigger)
    .map(([trigger, count]) => ({ trigger, pendingDue: count }));

  process.stdout.write(`${JSON.stringify({
    mode: "READ_ONLY_FLOW_COVERAGE",
    totalFlows: flows.length,
    statusCounts,
    activeFlows,
    activeValidFlows,
    activeInvalidFlows,
    activePublishedFlows,
    activeExecutableFlows,
    activeWithoutTrigger,
    activeWithoutPublishedGraph,
    activeWorkspaceCount: activeWorkspaceKeys.size,
    triggerCoverage,
    activeActionTypes,
    pendingByTrigger,
    uncoveredDueTriggers,
    uncoveredDueWorkspaceTriggerGroups,
    executableWorkspaceTriggerGroups: executableWorkspaceTriggerKeys.size,
    legacyExecutableTriggerCount: legacyExecutableTriggers.size,
    databaseMutationsAttempted: false,
    externalWritesAttempted: false,
    outboundMessagesQueued: false,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Flow coverage audit failed."}\n`);
  process.exitCode = 1;
});

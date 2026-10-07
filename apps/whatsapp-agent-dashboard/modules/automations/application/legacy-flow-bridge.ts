import {
  validateAutomationGraph,
  type AutomationGraph,
  type AutomationNode,
} from "@/modules/automations/domain/automation-graph";

export type LegacyLinearAutomationNode = {
  id: string;
  kind: "TRIGGER" | "ACTION";
  type: string;
  config: Readonly<Record<string, unknown>>;
};

function targetNodeType(node: LegacyLinearAutomationNode): AutomationNode["type"] {
  if (node.kind === "TRIGGER") return "TRIGGER";
  if (node.type === "WAIT") return "DELAY";
  if (node.type === "CONDITION") return "CONDITION";
  if (node.type === "HUMAN_HANDOFF") return "APPROVAL";
  if (node.type === "END") return "STOP";
  return "ACTION";
}

export function legacyLinearFlowToGraph(
  nodes: readonly LegacyLinearAutomationNode[],
): AutomationGraph {
  const mappedNodes = nodes.map((node) => ({
    id: node.id,
    type: targetNodeType(node),
    config: { legacyType: node.type, ...node.config },
  }));
  const edges = mappedNodes.slice(0, -1).map((node, index) => ({
    id: `legacy-edge-${index + 1}`,
    from: node.id,
    to: mappedNodes[index + 1]!.id,
  }));
  return { nodes: mappedNodes, edges };
}

export function validateLegacyFlowForGraphMigration(
  nodes: readonly LegacyLinearAutomationNode[],
): string[] {
  const graph = legacyLinearFlowToGraph(nodes);
  return validateAutomationGraph(graph, { maxNodes: 100, maxEdges: 200 }).map(
    (issue) => `${issue.code}: ${issue.message}`,
  );
}

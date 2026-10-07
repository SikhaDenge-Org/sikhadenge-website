import {
  validateAutomationGraph,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
} from "@/modules/automations/domain/automation-graph";

export type GraphSimulationStep = {
  index: number;
  nodeId: string;
  nodeType: AutomationNode["type"];
  result:
    | "TRIGGER_MATCHED"
    | "CONDITION_TRUE"
    | "CONDITION_FALSE"
    | "WOULD_EXECUTE"
    | "WOULD_WAIT"
    | "REQUIRES_APPROVAL"
    | "GOAL_REACHED"
    | "STOPPED";
  nextNodeId: string | null;
};

export type GraphSimulationResult = {
  steps: GraphSimulationStep[];
  completed: boolean;
  stoppedAt: string | null;
  outboundSent: false;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sampleValue(sample: Record<string, unknown>, path: unknown): unknown {
  if (typeof path !== "string" || !path.trim()) return undefined;
  let current: unknown = sample;
  for (const part of path.trim().split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function conditionMatches(node: AutomationNode, sample: Record<string, unknown>): boolean {
  const config = object(node.config);
  const field = config.field;
  const actual = sampleValue(sample, field);
  const expected = config.value;
  const operator = typeof config.operator === "string" ? config.operator.trim().toLowerCase() : "equals";

  if (operator === "exists") return actual !== undefined && actual !== null;
  if (operator === "not_exists") return actual === undefined || actual === null;
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "equals") return String(actual ?? "") === String(expected ?? "");

  // Legacy CONDITION nodes often store a human-readable expression only.
  // Unknown operators deliberately fail closed to the false branch.
  return false;
}

function sortedOutgoing(edges: readonly AutomationEdge[], nodeId: string): AutomationEdge[] {
  return edges
    .filter((edge) => edge.from === nodeId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

function chooseEdge(
  node: AutomationNode,
  outgoing: AutomationEdge[],
  sample: Record<string, unknown>,
): { edge: AutomationEdge | null; result: GraphSimulationStep["result"] } {
  if (node.type === "STOP") return { edge: null, result: "STOPPED" };
  if (node.type === "GOAL") return { edge: outgoing[0] ?? null, result: "GOAL_REACHED" };
  if (node.type === "APPROVAL") return { edge: null, result: "REQUIRES_APPROVAL" };
  if (node.type === "DELAY") return { edge: outgoing[0] ?? null, result: "WOULD_WAIT" };
  if (node.type === "TRIGGER") return { edge: outgoing[0] ?? null, result: "TRIGGER_MATCHED" };
  if (node.type === "CONDITION" || node.type === "BRANCH") {
    const matched = conditionMatches(node, sample);
    const labels = matched ? ["true", "yes", "match", "matched"] : ["false", "no", "default", "else"];
    const labelled = outgoing.find((edge) => labels.includes(edge.label?.trim().toLowerCase() ?? ""));
    return {
      edge: labelled ?? outgoing[0] ?? null,
      result: matched ? "CONDITION_TRUE" : "CONDITION_FALSE",
    };
  }
  return { edge: outgoing[0] ?? null, result: "WOULD_EXECUTE" };
}

export function simulateAutomationGraph(input: {
  graph: AutomationGraph;
  sample?: unknown;
  maxSteps?: number;
}): GraphSimulationResult {
  const issues = validateAutomationGraph(input.graph, { maxNodes: 100, maxEdges: 200 });
  if (issues.length) throw new Error(`Automation graph simulation blocked: ${issues[0]!.code}.`);

  const triggers = input.graph.nodes.filter((node) => node.type === "TRIGGER");
  if (triggers.length !== 1) throw new Error("Graph simulation requires exactly one trigger node.");

  const maxSteps = input.maxSteps ?? 100;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 500) {
    throw new Error("Graph simulation maxSteps must be between 1 and 500.");
  }

  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const sample = object(input.sample);
  const steps: GraphSimulationStep[] = [];
  let current: AutomationNode | undefined = triggers[0];

  while (current) {
    if (steps.length >= maxSteps) throw new Error("Graph simulation step limit exceeded.");
    const outgoing = sortedOutgoing(input.graph.edges, current.id);
    const decision = chooseEdge(current, outgoing, sample);
    const nextNodeId = decision.edge?.to ?? null;
    steps.push({
      index: steps.length + 1,
      nodeId: current.id,
      nodeType: current.type,
      result: decision.result,
      nextNodeId,
    });

    if (current.type === "STOP" || current.type === "APPROVAL") break;
    if (!nextNodeId) break;
    current = nodes.get(nextNodeId);
    if (!current) throw new Error(`Graph simulation encountered missing node ${nextNodeId}.`);
  }

  const last = steps.at(-1);
  return {
    steps,
    completed: Boolean(last && ["STOPPED", "GOAL_REACHED", "REQUIRES_APPROVAL"].includes(last.result)),
    stoppedAt: last?.nodeId ?? null,
    outboundSent: false,
  };
}

export type AutomationNodeType =
  | "TRIGGER"
  | "CONDITION"
  | "ACTION"
  | "DELAY"
  | "BRANCH"
  | "APPROVAL"
  | "GOAL"
  | "STOP";

export type AutomationNode = {
  id: string;
  type: AutomationNodeType;
  config: Readonly<Record<string, unknown>>;
};

export type AutomationEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type AutomationGraph = {
  nodes: readonly AutomationNode[];
  edges: readonly AutomationEdge[];
};

export type AutomationGraphLimits = {
  maxNodes: number;
  maxEdges: number;
};

export type AutomationGraphIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export function validateAutomationGraph(
  graph: AutomationGraph,
  limits: AutomationGraphLimits,
): AutomationGraphIssue[] {
  const issues: AutomationGraphIssue[] = [];
  if (!Number.isInteger(limits.maxNodes) || limits.maxNodes < 1) {
    throw new Error("maxNodes must be a positive integer.");
  }
  if (!Number.isInteger(limits.maxEdges) || limits.maxEdges < 0) {
    throw new Error("maxEdges must be a non-negative integer.");
  }
  if (graph.nodes.length > limits.maxNodes) {
    issues.push({ code: "NODE_LIMIT", message: "Automation exceeds the node limit." });
  }
  if (graph.edges.length > limits.maxEdges) {
    issues.push({ code: "EDGE_LIMIT", message: "Automation exceeds the edge limit." });
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id.trim()) issues.push({ code: "EMPTY_NODE_ID", message: "Node id is required." });
    if (nodeIds.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE", message: "Node ids must be unique.", nodeId: node.id });
    }
    nodeIds.add(node.id);
  }

  if (!graph.nodes.some((node) => node.type === "TRIGGER")) {
    issues.push({ code: "MISSING_TRIGGER", message: "Automation requires at least one trigger." });
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: "DANGLING_EDGE", message: "Edge references a missing node.", edgeId: edge.id });
      continue;
    }
    if (edge.from === edge.to) {
      issues.push({ code: "SELF_LOOP", message: "Self loops are not allowed.", edgeId: edge.id });
    }
    const next = adjacency.get(edge.from) ?? [];
    next.push(edge.to);
    adjacency.set(edge.from, next);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycleFrom = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (hasCycleFrom(target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of nodeIds) {
    if (hasCycleFrom(id)) {
      issues.push({ code: "CYCLE", message: "Recursive automation cycles are not allowed." });
      break;
    }
  }

  return issues;
}

export type PublishedAutomationVersion = {
  automationId: string;
  version: number;
  publishedAt: Date;
  graph: AutomationGraph;
};

export function publishAutomationVersion(input: {
  automationId: string;
  version: number;
  graph: AutomationGraph;
  limits: AutomationGraphLimits;
  publishedAt?: Date;
}): PublishedAutomationVersion {
  if (!input.automationId.trim()) throw new Error("automationId is required.");
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("version must be a positive integer.");
  }
  const issues = validateAutomationGraph(input.graph, input.limits);
  if (issues.length) throw new Error(`Automation graph cannot publish: ${issues[0].code}.`);

  const graph: AutomationGraph = {
    nodes: input.graph.nodes.map((node) => ({ ...node, config: { ...node.config } })),
    edges: input.graph.edges.map((edge) => ({ ...edge })),
  };
  return Object.freeze({
    automationId: input.automationId,
    version: input.version,
    publishedAt: input.publishedAt ?? new Date(),
    graph: Object.freeze(graph),
  });
}

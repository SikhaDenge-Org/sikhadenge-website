import { Prisma } from "@prisma/client";

import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";
import { prisma } from "@/lib/db/prisma";
import type { AutomationGraph, AutomationNode } from "@/modules/automations/domain/automation-graph";

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

function valueAt(sample: Record<string, unknown>, path: unknown): unknown {
  if (typeof path !== "string" || !path.trim()) return undefined;
  let current: unknown = sample;
  for (const part of path.trim().split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function conditionMatches(node: AutomationNode, sample: Record<string, unknown>): boolean {
  const config = record(node.config);
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

function nextNode(graph: AutomationGraph, node: AutomationNode, sample: Record<string, unknown>): string | null {
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

export type ShadowPlan = {
  visitedNodeTypes: string[];
  plannedActionTypes: string[];
  terminalOutcome: "COMPLETED" | "WAITING" | "HANDOFF_REQUIRED";
};

export function evaluatePublishedGraphShadow(graph: AutomationGraph, sample: Record<string, unknown>): ShadowPlan {
  const trigger = graph.nodes.find((node) => node.type === "TRIGGER");
  if (!trigger) throw new Error("Published automation has no trigger.");

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const visitedNodeTypes: string[] = [];
  const plannedActionTypes: string[] = [];
  let currentNodeId: string | null = trigger.id;
  let terminalOutcome: ShadowPlan["terminalOutcome"] = "COMPLETED";
  const maxSteps = Math.max(1, graph.nodes.length + 2);

  for (let step = 0; currentNodeId && step < maxSteps; step += 1) {
    if (visited.has(currentNodeId)) throw new Error("Shadow evaluator detected an automation cycle.");
    visited.add(currentNodeId);

    const node = nodeMap.get(currentNodeId);
    if (!node) throw new Error("Shadow evaluator encountered a missing automation node.");
    visitedNodeTypes.push(node.type);

    if (node.type === "STOP" || node.type === "GOAL") {
      terminalOutcome = "COMPLETED";
      break;
    }
    if (node.type === "APPROVAL") {
      terminalOutcome = "HANDOFF_REQUIRED";
      break;
    }
    if (node.type === "DELAY") {
      terminalOutcome = "WAITING";
      break;
    }
    if (node.type === "ACTION") {
      plannedActionTypes.push(clean(record(node.config).legacyType, 60).toUpperCase() || "UNKNOWN_ACTION");
    }

    currentNodeId = nextNode(graph, node, sample);
    if (!currentNodeId) terminalOutcome = "COMPLETED";
  }

  if (currentNodeId && visited.size >= maxSteps) {
    throw new Error("Shadow evaluator exceeded the bounded graph traversal limit.");
  }

  return { visitedNodeTypes, plannedActionTypes, terminalOutcome };
}

async function resolveConversation(input: { conversationId: string | null; contactId: string | null }) {
  if (input.conversationId) {
    return prisma.whatsAppConversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true },
    });
  }
  if (!input.contactId) return null;
  const lead = await prisma.lead.findUnique({
    where: { contactId: input.contactId },
    select: { conversationId: true },
  });
  if (lead?.conversationId) return { id: lead.conversationId };
  return prisma.whatsAppConversation.findFirst({
    where: { contactId: input.contactId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

async function loadPublishedGraph(flowId: string, expectedVersion: number): Promise<AutomationGraph> {
  const published = await prisma.webhookEvent.findUnique({
    where: { eventKey: `automation-graph-published:${flowId}:source-v${expectedVersion}` },
    select: { payload: true },
  });
  if (!published) throw new Error("Current automation version is not published.");

  const root = record(published.payload);
  const graphRoot = record(root.graph);
  const nodes = Array.isArray(graphRoot.nodes) ? graphRoot.nodes : [];
  const edges = Array.isArray(graphRoot.edges) ? graphRoot.edges : [];
  return {
    nodes: nodes.map((raw) => {
      const node = record(raw);
      return {
        id: clean(node.id, 120),
        type: clean(node.type, 40) as AutomationNode["type"],
        config: record(node.config),
      };
    }),
    edges: edges.map((raw) => {
      const edge = record(raw);
      const label = clean(edge.label, 80);
      return {
        id: clean(edge.id, 120),
        from: clean(edge.from, 120),
        to: clean(edge.to, 120),
        ...(label ? { label } : {}),
      };
    }),
  };
}

export async function evaluatePendingWhatsAppAutomationEventsShadow(input?: { now?: Date; limit?: number }) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(50, Math.floor(input?.limit ?? 20)));
  const events = await prisma.engageWhatsAppAutomationEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const plannedActionTypes: Record<string, number> = {};
  const terminalOutcomes: Record<string, number> = {};
  const triggerCounts: Record<string, number> = {};
  let resolvableEvents = 0;
  let matchedFlows = 0;
  let plannedRuns = 0;
  let unresolvableEvents = 0;
  let evaluationErrors = 0;

  for (const event of events) {
    triggerCounts[event.trigger] = (triggerCounts[event.trigger] ?? 0) + 1;
    const conversation = await resolveConversation({
      conversationId: event.conversationId,
      contactId: event.contactId,
    });
    if (!conversation) {
      unresolvableEvents += 1;
      continue;
    }
    resolvableEvents += 1;

    const payload = record(event.payload);
    const targetFlowId = clean(payload.targetFlowId, 120);
    const targetFlowVersion = Number(payload.targetFlowVersion);
    const flows = (await listAutomationFlowsForWorkspace(event.workspaceId, true))
      .filter((flow) => flow.status === "ACTIVE");

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

      matchedFlows += 1;
      try {
        const graph = await loadPublishedGraph(flow.flowId, flow.version);
        const plan = evaluatePublishedGraphShadow(graph, {
          ...payload,
          automationEvent: {
            trigger: event.trigger,
            workspacePresent: Boolean(event.workspaceId),
            conversationPresent: Boolean(conversation.id),
          },
        });
        plannedRuns += 1;
        terminalOutcomes[plan.terminalOutcome] = (terminalOutcomes[plan.terminalOutcome] ?? 0) + 1;
        for (const actionType of plan.plannedActionTypes) {
          plannedActionTypes[actionType] = (plannedActionTypes[actionType] ?? 0) + 1;
        }
      } catch {
        evaluationErrors += 1;
      }
    }
  }

  return {
    mode: "READ_ONLY_SHADOW",
    inspectedEvents: events.length,
    resolvableEvents,
    unresolvableEvents,
    matchedFlows,
    plannedRuns,
    evaluationErrors,
    triggerCounts,
    plannedActionTypes,
    terminalOutcomes,
    databaseMutationsAttempted: false,
    externalWritesAttempted: false,
    outboundMessagesQueued: false,
  };
}

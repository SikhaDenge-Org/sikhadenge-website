import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { legacyLinearFlowToGraph } from "@/modules/automations/application/legacy-flow-bridge";
import { simulateAutomationGraph } from "@/modules/automations/application/graph-simulator";
import {
  publishAutomationVersion,
  validateAutomationGraph,
  type AutomationGraph,
} from "@/modules/automations/domain/automation-graph";

const LEGACY_FLOW_TYPE = "automation_flow";
const GRAPH_DRAFT_TYPE = "automation_graph_draft";
const GRAPH_PUBLISHED_TYPE = "automation_graph_published";

export type GraphDraftRecord = {
  flowId: string;
  sourceFlowVersion: number;
  graph: AutomationGraph;
  updatedAt: string;
  updatedBy: string;
};

export type PublishedGraphRecord = {
  flowId: string;
  sourceFlowVersion: number;
  publishedAt: string;
  publishedBy: string;
  graph: AutomationGraph;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function legacyKey(flowId: string) {
  return `automation-flow:${flowId}`;
}

function draftKey(flowId: string) {
  return `automation-graph-draft:${flowId}`;
}

function publishedKey(flowId: string, sourceVersion: number) {
  return `automation-graph-published:${flowId}:source-v${sourceVersion}`;
}

function parseGraph(value: unknown): AutomationGraph {
  const root = record(value);
  if (!Array.isArray(root.nodes) || !Array.isArray(root.edges)) {
    throw new Error("Automation graph payload is invalid.");
  }
  return {
    nodes: root.nodes.map((nodeValue) => {
      const node = record(nodeValue);
      return {
        id: clean(node.id),
        type: clean(node.type) as AutomationGraph["nodes"][number]["type"],
        config: record(node.config),
      };
    }),
    edges: root.edges.map((edgeValue) => {
      const edge = record(edgeValue);
      const label = clean(edge.label);
      return {
        id: clean(edge.id),
        from: clean(edge.from),
        to: clean(edge.to),
        ...(label ? { label } : {}),
      };
    }),
  };
}

function parseDraft(value: unknown): GraphDraftRecord | null {
  const root = record(value);
  const flowId = clean(root.flowId);
  const sourceFlowVersion = Number(root.sourceFlowVersion);
  if (!flowId || !Number.isInteger(sourceFlowVersion) || sourceFlowVersion < 1) return null;
  try {
    return {
      flowId,
      sourceFlowVersion,
      graph: parseGraph(root.graph),
      updatedAt: clean(root.updatedAt),
      updatedBy: clean(root.updatedBy),
    };
  } catch {
    return null;
  }
}

async function legacyFlow(flowId: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { eventKey: legacyKey(flowId) } });
  if (!event || event.eventType !== LEGACY_FLOW_TYPE) throw new Error("Automation flow not found.");
  const payload = record(event.payload);
  const version = Math.max(1, Math.floor(Number(payload.version) || 1));
  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes.map((value) => {
        const node = record(value);
        return {
          id: clean(node.id),
          kind: clean(node.kind) === "TRIGGER" ? ("TRIGGER" as const) : ("ACTION" as const),
          type: clean(node.type),
          config: record(node.config),
        };
      })
    : [];
  return { flowId, version, nodes };
}

function validateGraphOrThrow(graph: AutomationGraph) {
  const issues = validateAutomationGraph(graph, { maxNodes: 100, maxEdges: 200 });
  if (issues.length) throw new Error(`Automation graph is invalid: ${issues[0]!.code} — ${issues[0]!.message}`);
}

export async function getAutomationGraphWorkspace(flowIdInput: string) {
  const flowId = flowIdInput.trim();
  if (!flowId) throw new Error("flowId is required.");
  const legacy = await legacyFlow(flowId);
  const event = await prisma.webhookEvent.findUnique({ where: { eventKey: draftKey(flowId) } });
  const persisted = event ? parseDraft(event.payload) : null;
  const derivedGraph = legacyLinearFlowToGraph(legacy.nodes);
  validateGraphOrThrow(derivedGraph);

  const publishedRows = await prisma.webhookEvent.findMany({
    where: { eventType: GRAPH_PUBLISHED_TYPE, eventKey: { startsWith: `automation-graph-published:${flowId}:` } },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  return {
    flowId,
    sourceFlowVersion: legacy.version,
    draft: persisted ?? {
      flowId,
      sourceFlowVersion: legacy.version,
      graph: derivedGraph,
      updatedAt: "",
      updatedBy: "",
    },
    draftPersisted: Boolean(persisted),
    draftStale: Boolean(persisted && persisted.sourceFlowVersion !== legacy.version),
    publishedVersions: publishedRows
      .map((row) => record(row.payload))
      .map((payload) => ({
        sourceFlowVersion: Number(payload.sourceFlowVersion),
        publishedAt: clean(payload.publishedAt),
        publishedBy: clean(payload.publishedBy),
      }))
      .filter((item) => Number.isInteger(item.sourceFlowVersion) && item.sourceFlowVersion > 0),
  };
}

export async function syncAutomationGraphDraft(input: { flowId: string; actorId: string }) {
  const legacy = await legacyFlow(input.flowId);
  const graph = legacyLinearFlowToGraph(legacy.nodes);
  validateGraphOrThrow(graph);
  return saveAutomationGraphDraft({
    flowId: input.flowId,
    sourceFlowVersion: legacy.version,
    graph,
    actorId: input.actorId,
    action: "AUTOMATION_GRAPH_SYNCED_FROM_LINEAR",
  });
}

export async function saveAutomationGraphDraft(input: {
  flowId: string;
  sourceFlowVersion: number;
  graph: AutomationGraph;
  actorId: string;
  action?: string;
}) {
  const legacy = await legacyFlow(input.flowId);
  if (input.sourceFlowVersion !== legacy.version) {
    throw new Error("Graph draft source version is stale; sync from the current flow before saving.");
  }
  validateGraphOrThrow(input.graph);
  const draft: GraphDraftRecord = {
    flowId: input.flowId,
    sourceFlowVersion: input.sourceFlowVersion,
    graph: input.graph,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actorId,
  };

  await prisma.$transaction([
    prisma.webhookEvent.upsert({
      where: { eventKey: draftKey(input.flowId) },
      create: {
        eventKey: draftKey(input.flowId),
        eventType: GRAPH_DRAFT_TYPE,
        payload: toJson(draft),
        attemptCount: 0,
      },
      update: { payload: toJson(draft), processedAt: null, processingError: null },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action ?? "AUTOMATION_GRAPH_DRAFT_SAVED",
        entityType: "AutomationGraph",
        entityId: input.flowId,
        after: toJson({ sourceFlowVersion: input.sourceFlowVersion, nodes: input.graph.nodes.length, edges: input.graph.edges.length }),
      },
    }),
  ]);
  return draft;
}

export async function publishAutomationGraph(input: { flowId: string; actorId: string }) {
  const workspace = await getAutomationGraphWorkspace(input.flowId);
  const draft = workspace.draft;
  if (workspace.draftStale) throw new Error("Graph draft is stale; sync it from the current linear flow before publishing.");
  validateGraphOrThrow(draft.graph);

  const immutable = publishAutomationVersion({
    automationId: input.flowId,
    version: draft.sourceFlowVersion,
    graph: draft.graph,
    limits: { maxNodes: 100, maxEdges: 200 },
  });
  const key = publishedKey(input.flowId, draft.sourceFlowVersion);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
  if (existing) throw new Error(`Source flow version ${draft.sourceFlowVersion} is already published and immutable.`);

  const published: PublishedGraphRecord = {
    flowId: input.flowId,
    sourceFlowVersion: draft.sourceFlowVersion,
    graph: immutable.graph,
    publishedAt: immutable.publishedAt.toISOString(),
    publishedBy: input.actorId,
  };

  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: key,
        eventType: GRAPH_PUBLISHED_TYPE,
        payload: toJson(published),
        attemptCount: 0,
        processedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "AUTOMATION_GRAPH_VERSION_PUBLISHED",
        entityType: "AutomationGraph",
        entityId: input.flowId,
        after: toJson({ sourceFlowVersion: draft.sourceFlowVersion, nodes: draft.graph.nodes.length, edges: draft.graph.edges.length }),
      },
    }),
  ]);

  return published;
}

export async function simulateAutomationGraphDraft(input: {
  flowId: string;
  sample?: unknown;
  actorId: string;
}) {
  const workspace = await getAutomationGraphWorkspace(input.flowId);
  const result = simulateAutomationGraph({ graph: workspace.draft.graph, sample: input.sample });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "AUTOMATION_GRAPH_SIMULATED",
      entityType: "AutomationGraph",
      entityId: input.flowId,
      after: toJson({ sourceFlowVersion: workspace.draft.sourceFlowVersion, steps: result.steps.length, outboundSent: false }),
    },
  });
  return { ...result, sourceFlowVersion: workspace.draft.sourceFlowVersion, draftStale: workspace.draftStale };
}

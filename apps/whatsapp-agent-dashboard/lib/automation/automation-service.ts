import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";
import { getOutboundMode } from "../meta/outbound-client";

const FLOW_EVENT_TYPE = "automation_flow";
const MAX_FLOWS = 100;
const MAX_NODES = 40;

export const AUTOMATION_TRIGGER_TYPES = [
  "INCOMING_KEYWORD",
  "NEW_LEAD",
  "TAG_ADDED",
  "STAGE_CHANGED",
  "FOLLOW_UP_DUE",
  "NO_REPLY",
  "SCHEDULE",
  "WEBHOOK",
] as const;

export const AUTOMATION_ACTION_TYPES = [
  "SEND_TEXT",
  "SEND_TEMPLATE",
  "SEND_MEDIA",
  "ASK_QUESTION",
  "ADD_TAG",
  "REMOVE_TAG",
  "UPDATE_STAGE",
  "ASSIGN_COUNSELOR",
  "WAIT",
  "CONDITION",
  "HUMAN_HANDOFF",
  "END",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];
export type AutomationFlowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type AutomationNode = {
  id: string;
  kind: "TRIGGER" | "ACTION";
  type: AutomationTriggerType | AutomationActionType;
  label: string;
  config: Record<string, unknown>;
};

export type AutomationFlow = {
  flowId: string;
  name: string;
  description: string;
  status: AutomationFlowStatus;
  version: number;
  nodes: AutomationNode[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
  lastSimulationAt: string | null;
};

export type AutomationValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  triggerCount: number;
  actionCount: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function normalizeStatus(value: unknown): AutomationFlowStatus {
  const status = clean(value, 20).toUpperCase();
  return ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(status)
    ? (status as AutomationFlowStatus)
    : "DRAFT";
}

function normalizeConfig(value: unknown): Record<string, unknown> {
  const input = record(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input).slice(0, 30)) {
    const safeKey = clean(key, 60);
    if (!safeKey) continue;
    if (typeof item === "string") output[safeKey] = item.trim().slice(0, 4_000);
    else if (typeof item === "number" && Number.isFinite(item)) output[safeKey] = item;
    else if (typeof item === "boolean" || item === null) output[safeKey] = item;
    else if (Array.isArray(item)) output[safeKey] = item.slice(0, 50);
  }
  return output;
}

function normalizeNodes(value: unknown): AutomationNode[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_NODES).map((item, index) => {
    const input = record(item);
    const kind = clean(input.kind, 20).toUpperCase() === "TRIGGER" ? "TRIGGER" : "ACTION";
    const rawType = clean(input.type, 50).toUpperCase();
    const allowed = kind === "TRIGGER" ? AUTOMATION_TRIGGER_TYPES : AUTOMATION_ACTION_TYPES;
    const fallback = kind === "TRIGGER" ? "INCOMING_KEYWORD" : "SEND_TEXT";
    const type = allowed.includes(rawType as never) ? rawType : fallback;
    return {
      id: clean(input.id, 80) || `node-${index + 1}-${randomUUID().slice(0, 8)}`,
      kind,
      type: type as AutomationNode["type"],
      label: clean(input.label, 100) || type.replaceAll("_", " "),
      config: normalizeConfig(input.config),
    };
  });
}

function parseFlow(value: unknown): AutomationFlow | null {
  const input = record(value);
  const flowId = clean(input.flowId, 80);
  const name = clean(input.name, 120);
  if (!flowId || !name) return null;
  return {
    flowId,
    name,
    description: clean(input.description, 500),
    status: normalizeStatus(input.status),
    version: Math.max(1, Math.floor(Number(input.version) || 1)),
    nodes: normalizeNodes(input.nodes),
    createdBy: clean(input.createdBy, 100),
    updatedBy: clean(input.updatedBy, 100),
    createdAt: clean(input.createdAt, 50) || new Date().toISOString(),
    updatedAt: clean(input.updatedAt, 50) || new Date().toISOString(),
    lastValidatedAt: clean(input.lastValidatedAt, 50) || null,
    lastSimulationAt: clean(input.lastSimulationAt, 50) || null,
  };
}

function eventKey(flowId: string): string {
  return `automation-flow:${flowId}`;
}

export function getAutomationRuntimeStatus() {
  const runtimeEnabled = booleanEnvironment("AUTOMATION_RUNTIME_ENABLED", false);
  const actionExecutionEnabled = booleanEnvironment("AUTOMATION_ACTIONS_ENABLED", false);
  const outboundMode = getOutboundMode();
  return {
    runtimeEnabled,
    actionExecutionEnabled,
    outboundMode,
    externalActionsReady:
      runtimeEnabled && actionExecutionEnabled && outboundMode === "live",
  };
}

export function validateAutomationFlow(flow: Pick<AutomationFlow, "name" | "nodes">): AutomationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const triggers = flow.nodes.filter((node) => node.kind === "TRIGGER");
  const actions = flow.nodes.filter((node) => node.kind === "ACTION");

  if (clean(flow.name, 120).length < 3) errors.push("Flow name must contain at least 3 characters.");
  if (flow.nodes.length === 0) errors.push("Add at least one trigger and one action.");
  if (triggers.length !== 1) errors.push("A flow must contain exactly one trigger.");
  if (flow.nodes[0]?.kind !== "TRIGGER") errors.push("The first node must be the trigger.");
  if (actions.length === 0) errors.push("Add at least one action node.");

  const ids = new Set<string>();
  for (const [index, node] of flow.nodes.entries()) {
    if (ids.has(node.id)) errors.push(`Node ${index + 1} has a duplicate ID.`);
    ids.add(node.id);

    const config = node.config;
    if (node.type === "INCOMING_KEYWORD" && !clean(config.keyword, 200)) {
      errors.push("Incoming Keyword trigger requires a keyword.");
    }
    if (node.type === "SCHEDULE" && !clean(config.schedule, 200)) {
      errors.push("Schedule trigger requires a schedule value.");
    }
    if ((node.type === "SEND_TEXT" || node.type === "ASK_QUESTION") && !clean(config.text, 4_000)) {
      errors.push(`${node.label} requires message text.`);
    }
    if (node.type === "SEND_TEMPLATE" && !clean(config.templateId, 100)) {
      errors.push("Send Template action requires an approved template ID.");
    }
    if (node.type === "SEND_MEDIA" && !clean(config.assetId, 100)) {
      errors.push("Send Media action requires an uploaded media asset ID.");
    }
    if ((node.type === "ADD_TAG" || node.type === "REMOVE_TAG") && !clean(config.tag, 100)) {
      errors.push(`${node.label} requires a tag name.`);
    }
    if (node.type === "UPDATE_STAGE" && !clean(config.stage, 50)) {
      errors.push("Update Stage action requires a lead stage.");
    }
    if (node.type === "ASSIGN_COUNSELOR" && !clean(config.counselorId, 100)) {
      errors.push("Assign Counselor action requires a counselor ID.");
    }
    if (node.type === "WAIT") {
      const minutes = Number(config.minutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 43_200) {
        errors.push("Wait action must be between 1 and 43,200 minutes.");
      }
    }
    if (node.type === "CONDITION" && !clean(config.field, 100)) {
      errors.push("Condition action requires a field.");
    }
  }

  if (flow.nodes.at(-1)?.type !== "END") warnings.push("Add an End node for a clear flow finish.");
  if (actions.some((node) => ["SEND_TEXT", "SEND_TEMPLATE", "SEND_MEDIA"].includes(node.type))) {
    warnings.push("External message actions remain locked until final Meta cutover.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    triggerCount: triggers.length,
    actionCount: actions.length,
  };
}

async function findFlow(flowId: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { eventKey: eventKey(flowId) } });
  if (!event) throw new Error("Automation flow not found.");
  const flow = parseFlow(event.payload);
  if (!flow) throw new Error("Automation flow payload is invalid.");
  return { event, flow };
}

export async function listAutomationFlows(limit = MAX_FLOWS) {
  const events = await prisma.webhookEvent.findMany({
    where: { eventType: FLOW_EVENT_TYPE },
    orderBy: { receivedAt: "desc" },
    take: Math.max(1, Math.min(MAX_FLOWS, Math.floor(limit))),
  });
  return events.map((event) => parseFlow(event.payload)).filter((flow): flow is AutomationFlow => Boolean(flow));
}

export async function createAutomationFlow(input: {
  name: unknown;
  description?: unknown;
  nodes?: unknown;
  actorId: string;
}) {
  const name = clean(input.name, 120);
  if (name.length < 3) throw new Error("Flow name must contain at least 3 characters.");
  const now = new Date().toISOString();
  const flow: AutomationFlow = {
    flowId: randomUUID(),
    name,
    description: clean(input.description, 500),
    status: "DRAFT",
    version: 1,
    nodes: normalizeNodes(input.nodes),
    createdBy: input.actorId,
    updatedBy: input.actorId,
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: null,
    lastSimulationAt: null,
  };

  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: eventKey(flow.flowId),
        eventType: FLOW_EVENT_TYPE,
        payload: toJson(flow),
        attemptCount: 0,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "AUTOMATION_FLOW_CREATED",
        entityType: "AutomationFlow",
        entityId: flow.flowId,
        after: toJson({ name: flow.name, status: flow.status, nodes: flow.nodes.length }),
      },
    }),
  ]);
  return { flow, validation: validateAutomationFlow(flow) };
}

export async function updateAutomationFlow(input: {
  flowId: string;
  name?: unknown;
  description?: unknown;
  nodes?: unknown;
  actorId: string;
}) {
  const { event, flow } = await findFlow(input.flowId);
  if (flow.status === "ARCHIVED") throw new Error("Archived flows cannot be edited.");
  const updated: AutomationFlow = {
    ...flow,
    name: input.name === undefined ? flow.name : clean(input.name, 120),
    description: input.description === undefined ? flow.description : clean(input.description, 500),
    nodes: input.nodes === undefined ? flow.nodes : normalizeNodes(input.nodes),
    version: flow.version + 1,
    status: flow.status === "ACTIVE" ? "PAUSED" : flow.status,
    updatedBy: input.actorId,
    updatedAt: new Date().toISOString(),
    lastValidatedAt: null,
  };
  if (updated.name.length < 3) throw new Error("Flow name must contain at least 3 characters.");

  await prisma.$transaction([
    prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "AUTOMATION_FLOW_UPDATED",
        entityType: "AutomationFlow",
        entityId: flow.flowId,
        before: toJson({ version: flow.version, status: flow.status }),
        after: toJson({ version: updated.version, status: updated.status, nodes: updated.nodes.length }),
      },
    }),
  ]);
  return { flow: updated, validation: validateAutomationFlow(updated) };
}

export async function setAutomationFlowStatus(input: {
  flowId: string;
  status: unknown;
  actorId: string;
}) {
  const { event, flow } = await findFlow(input.flowId);
  const status = normalizeStatus(input.status);
  if (status === "DRAFT" && clean(input.status, 20).toUpperCase() !== "DRAFT") {
    throw new Error("Status must be DRAFT, ACTIVE, PAUSED or ARCHIVED.");
  }
  const validation = validateAutomationFlow(flow);
  if (status === "ACTIVE" && !validation.valid) {
    throw new Error(`Flow cannot be activated: ${validation.errors.join(" ")}`);
  }
  const now = new Date().toISOString();
  const updated: AutomationFlow = {
    ...flow,
    status,
    updatedBy: input.actorId,
    updatedAt: now,
    lastValidatedAt: status === "ACTIVE" ? now : flow.lastValidatedAt,
  };

  await prisma.$transaction([
    prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `AUTOMATION_FLOW_${status}`,
        entityType: "AutomationFlow",
        entityId: flow.flowId,
        before: toJson({ status: flow.status }),
        after: toJson({ status }),
      },
    }),
  ]);
  return { flow: updated, validation };
}

export async function simulateAutomationFlow(input: {
  flowId: string;
  sample: unknown;
  actorId: string;
}) {
  const { event, flow } = await findFlow(input.flowId);
  const validation = validateAutomationFlow(flow);
  if (!validation.valid) throw new Error(`Flow validation failed: ${validation.errors.join(" ")}`);

  const sample = record(input.sample);
  const steps = flow.nodes.map((node, index) => ({
    index: index + 1,
    nodeId: node.id,
    label: node.label,
    type: node.type,
    result:
      node.kind === "TRIGGER"
        ? "TRIGGER_MATCH_SIMULATED"
        : ["SEND_TEXT", "SEND_TEMPLATE", "SEND_MEDIA"].includes(node.type)
          ? "MESSAGE_ACTION_DRY_RUN"
          : "ACTION_SIMULATED",
  }));
  const now = new Date().toISOString();
  const updated = { ...flow, lastSimulationAt: now, updatedAt: now, updatedBy: input.actorId };

  await prisma.$transaction([
    prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } }),
    prisma.webhookEvent.create({
      data: {
        eventKey: `automation-simulation:${flow.flowId}:${randomUUID()}`,
        eventType: "automation_simulation",
        payload: toJson({ flowId: flow.flowId, sample, steps, outboundSent: false, simulatedAt: now }),
        attemptCount: 1,
        processedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "AUTOMATION_FLOW_SIMULATED",
        entityType: "AutomationFlow",
        entityId: flow.flowId,
        after: toJson({ steps: steps.length, outboundSent: false }),
      },
    }),
  ]);

  return {
    flowId: flow.flowId,
    valid: true,
    steps,
    sample,
    outboundSent: false,
    runtime: getAutomationRuntimeStatus(),
    simulatedAt: now,
  };
}

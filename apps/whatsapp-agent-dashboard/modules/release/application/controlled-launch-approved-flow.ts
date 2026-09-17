import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

export type ControlledLaunchApprovedFlowProof = {
  flowType: "AUTOMATION" | "CAMPAIGN";
  flowId: string;
  flowVersion: number;
};

export class ControlledLaunchApprovedFlowError extends Error {
  readonly code:
    | "APPROVED_FLOW_PROVENANCE_MISSING"
    | "APPROVED_FLOW_SCOPE_MISMATCH"
    | "APPROVED_FLOW_STATE_INVALID"
    | "APPROVED_FLOW_NOT_APPROVED";

  constructor(code: ControlledLaunchApprovedFlowError["code"], message: string) {
    super(message);
    this.name = "ControlledLaunchApprovedFlowError";
    this.code = code;
  }
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseControlledLaunchApprovedFlowProof(rawPayload: unknown): ControlledLaunchApprovedFlowProof | null {
  const outbound = asRecord(asRecord(rawPayload).outbound);
  const proof = asRecord(outbound.approvedFlow);
  const flowType = proof.flowType;
  const flowId = typeof proof.flowId === "string" ? proof.flowId.trim() : "";
  const flowVersion = proof.flowVersion;
  if ((flowType !== "AUTOMATION" && flowType !== "CAMPAIGN") || !flowId) return null;
  if (typeof flowVersion !== "number" || !Number.isInteger(flowVersion) || flowVersion < 1) return null;
  return { flowType, flowId, flowVersion };
}

export async function assertCurrentControlledLaunchApprovedFlow(input: {
  workspaceId: string;
  connectionId: string;
  messageId: string;
}): Promise<ControlledLaunchApprovedFlowProof> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: input.messageId },
    select: {
      direction: true,
      status: true,
      rawPayload: true,
      conversation: { select: { contact: { select: { metadata: true } } } },
    },
  });
  if (!message || message.direction !== "OUTBOUND" || message.status !== "QUEUED") {
    throw new ControlledLaunchApprovedFlowError(
      "APPROVED_FLOW_PROVENANCE_MISSING",
      "Approved-flow proof requires the exact queued outbound message.",
    );
  }

  const mapping = readLegacyWhatsAppMappingMetadata(message.conversation.contact.metadata);
  if (!mapping || mapping.workspaceId !== input.workspaceId || mapping.connectionId !== input.connectionId) {
    throw new ControlledLaunchApprovedFlowError(
      "APPROVED_FLOW_SCOPE_MISMATCH",
      "Queued outbound flow proof does not match the persisted workspace/connection scope.",
    );
  }

  const proof = parseControlledLaunchApprovedFlowProof(message.rawPayload);
  if (!proof) {
    throw new ControlledLaunchApprovedFlowError(
      "APPROVED_FLOW_PROVENANCE_MISSING",
      "Queued outbound message is missing authoritative approved-flow provenance.",
    );
  }

  const state = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { version: true, mode: true, writePolicy: true, externalWritesAllowed: true },
  });
  if (
    !state ||
    state.mode !== "FULL_AUTOPILOT_FOR_APPROVED_FLOWS" ||
    state.writePolicy !== "APPROVED_FLOWS_ONLY" ||
    !state.externalWritesAllowed
  ) {
    throw new ControlledLaunchApprovedFlowError(
      "APPROVED_FLOW_STATE_INVALID",
      "Current controlled-launch state is not eligible for approved-flow outbound writes.",
    );
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "EngageControlledLaunchApprovedFlow"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "connectionId" = ${input.connectionId}
      AND "controlledLaunchStateVersion" = ${state.version}
      AND "flowType" = ${proof.flowType}
      AND "flowId" = ${proof.flowId}
      AND "flowVersion" = ${proof.flowVersion}
      AND "revokedAt" IS NULL
    LIMIT 1
  `;
  if (!rows[0]) {
    throw new ControlledLaunchApprovedFlowError(
      "APPROVED_FLOW_NOT_APPROVED",
      "Queued outbound flow is not approved for the current controlled-launch state version.",
    );
  }

  return proof;
}

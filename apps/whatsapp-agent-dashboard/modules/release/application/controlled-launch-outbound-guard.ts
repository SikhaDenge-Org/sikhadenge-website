import { prisma } from "@/lib/db/prisma";
import { assertCurrentControlledLaunchApprovedFlow, ControlledLaunchApprovedFlowError } from "@/modules/release/application/controlled-launch-approved-flow";
import { assertActiveControlledLaunchOutboundApproval, ControlledLaunchOutboundApprovalError } from "@/modules/release/application/controlled-launch-outbound-approval";
import type { ControlledWritePolicy } from "@/modules/release/application/controlled-launch";
import type { ControlledLaunchStateRecord } from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

export type ControlledLaunchOutboundContext = {
  workspaceId: string;
  connectionId: string;
  channel: "WHATSAPP";
  action: "OUTBOUND_QUEUED";
  messageId: string;
  recipientKey: string;
};

export type ControlledLaunchOutboundDenyCode =
  | "CONTROLLED_LAUNCH_STATE_MISSING"
  | "CONTROLLED_LAUNCH_WORKSPACE_MISMATCH"
  | "CONTROLLED_LAUNCH_SHADOW"
  | "CONTROLLED_LAUNCH_EXTERNAL_WRITES_DISABLED"
  | "CONTROLLED_LAUNCH_WRITE_NOT_REQUESTED"
  | "CONTROLLED_LAUNCH_CHANNEL_NOT_SCOPED"
  | "CONTROLLED_LAUNCH_CONNECTION_NOT_SCOPED"
  | "CONTROLLED_LAUNCH_CONNECTION_NOT_ACTIVE"
  | "CONTROLLED_LAUNCH_KILL_SWITCH_ACTIVE"
  | "CONTROLLED_LAUNCH_APPROVAL_ENGINE_REQUIRED"
  | "CONTROLLED_LAUNCH_APPROVAL_REQUIRED"
  | "CONTROLLED_LAUNCH_BOUNDED_SCOPE_ENFORCEMENT_REQUIRED"
  | "CONTROLLED_LAUNCH_BOUNDED_CAP_DENIED"
  | "CONTROLLED_LAUNCH_APPROVED_FLOW_PROOF_REQUIRED"
  | "CONTROLLED_LAUNCH_PROVIDER_CONNECTION_MISMATCH"
  | "CONTROLLED_LAUNCH_GOVERNANCE_INVALID"
  | "CONTROLLED_LAUNCH_GOVERNANCE_UNAVAILABLE";

export type ControlledLaunchKillSwitchSnapshot = {
  id: string;
  workspaceId: string;
  scopeType: string;
  channel: string | null;
  connectionId: string | null;
  blockedActions: readonly string[];
  reason: string;
};

export type ControlledLaunchOutboundAuthorization = {
  writePolicy: ControlledWritePolicy;
  stateVersion: number;
  maxRealLeads: number;
};

export type ControlledLaunchOutboundDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: ControlledLaunchOutboundDenyCode;
      reason: string;
    };

export class ControlledLaunchOutboundDeniedError extends Error {
  readonly code: ControlledLaunchOutboundDenyCode;

  constructor(code: ControlledLaunchOutboundDenyCode, message: string) {
    super(message);
    this.name = "ControlledLaunchOutboundDeniedError";
    this.code = code;
  }
}

function deny(
  code: ControlledLaunchOutboundDenyCode,
  reason: string,
): ControlledLaunchOutboundDecision {
  return { allowed: false, code, reason };
}

function normalized(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function matchingKillSwitch(
  context: ControlledLaunchOutboundContext,
  switches: readonly ControlledLaunchKillSwitchSnapshot[],
): ControlledLaunchKillSwitchSnapshot | null {
  for (const killSwitch of switches) {
    if (killSwitch.workspaceId !== context.workspaceId) continue;
    if (!killSwitch.blockedActions.includes(context.action)) continue;

    if (killSwitch.scopeType === "WORKSPACE") return killSwitch;
    if (
      killSwitch.scopeType === "CHANNEL" &&
      killSwitch.channel?.trim().toUpperCase() === context.channel
    ) {
      return killSwitch;
    }
    if (
      killSwitch.scopeType === "CONNECTION" &&
      killSwitch.connectionId === context.connectionId
    ) {
      return killSwitch;
    }
  }
  return null;
}

export function evaluateControlledLaunchOutbound(input: {
  context: ControlledLaunchOutboundContext;
  state: ControlledLaunchStateRecord | null;
  killSwitches?: readonly ControlledLaunchKillSwitchSnapshot[];
  approvalVerified?: boolean;
  boundedScopeVerified?: boolean;
  approvedFlowVerified?: boolean;
}): ControlledLaunchOutboundDecision {
  const { context, state } = input;
  if (!state) {
    return deny(
      "CONTROLLED_LAUNCH_STATE_MISSING",
      "Persisted controlled launch state is missing for the outbound workspace.",
    );
  }

  if (
    state.workspaceId !== context.workspaceId ||
    state.scope.workspaceId !== context.workspaceId
  ) {
    return deny(
      "CONTROLLED_LAUNCH_WORKSPACE_MISMATCH",
      "Persisted controlled launch state does not match the outbound workspace.",
    );
  }

  if (state.mode === "SHADOW" || state.writePolicy === "NO_EXTERNAL_WRITES") {
    return deny(
      "CONTROLLED_LAUNCH_SHADOW",
      "Controlled launch is in SHADOW/no-external-write mode.",
    );
  }

  if (!state.externalWritesAllowed) {
    return deny(
      "CONTROLLED_LAUNCH_EXTERNAL_WRITES_DISABLED",
      "Persisted controlled launch state does not allow external writes.",
    );
  }

  if (!state.scope.externalWritesRequested) {
    return deny(
      "CONTROLLED_LAUNCH_WRITE_NOT_REQUESTED",
      "Controlled launch scope did not request external writes.",
    );
  }

  const channels = normalized(state.scope.enabledChannels);
  if (!channels.has("whatsapp")) {
    return deny(
      "CONTROLLED_LAUNCH_CHANNEL_NOT_SCOPED",
      "WhatsApp is not explicitly included in the persisted controlled launch scope.",
    );
  }

  if (!state.scope.connectedAccountIds.includes(context.connectionId)) {
    return deny(
      "CONTROLLED_LAUNCH_CONNECTION_NOT_SCOPED",
      "The current WhatsApp connection is not explicitly included in the persisted controlled launch scope.",
    );
  }

  const killSwitch = matchingKillSwitch(context, input.killSwitches ?? []);
  if (killSwitch) {
    return deny(
      "CONTROLLED_LAUNCH_KILL_SWITCH_ACTIVE",
      `Persisted kill switch ${killSwitch.id} blocks queued outbound writes: ${killSwitch.reason}`,
    );
  }

  switch (state.writePolicy) {
    case "HUMAN_APPROVAL_REQUIRED":
      return input.approvalVerified ? { allowed: true } : deny(
        "CONTROLLED_LAUNCH_APPROVAL_REQUIRED",
        "This queued outbound message does not have a current persisted human approval.",
      );
    case "BOUNDED_AUTOPILOT":
      return input.boundedScopeVerified ? { allowed: true } : deny(
        "CONTROLLED_LAUNCH_BOUNDED_SCOPE_ENFORCEMENT_REQUIRED",
        "Bounded autopilot requires a positive persisted real-lead cap and runtime recipient enforcement.",
      );
    case "APPROVED_FLOWS_ONLY":
      return input.approvedFlowVerified ? { allowed: true } : deny(
        "CONTROLLED_LAUNCH_APPROVED_FLOW_PROOF_REQUIRED",
        "Approved-flow outbound writes remain blocked until the provider boundary receives and verifies an authoritative persisted flow proof.",
      );
  }
}

function parseBlockedActions(value: unknown, switchId: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ControlledLaunchOutboundDeniedError(
      "CONTROLLED_LAUNCH_GOVERNANCE_INVALID",
      `Persisted kill switch ${switchId} has invalid blockedActions.`,
    );
  }
  return value;
}

export function assertWhatsAppProviderConnectionBinding(
  context: ControlledLaunchOutboundContext,
  phoneNumberId: string,
): void {
  const normalizedPhoneNumberId = phoneNumberId.trim();
  const expectedConnectionId = `whatsapp:${normalizedPhoneNumberId}`;
  if (!normalizedPhoneNumberId || context.connectionId !== expectedConnectionId) {
    throw new ControlledLaunchOutboundDeniedError(
      "CONTROLLED_LAUNCH_PROVIDER_CONNECTION_MISMATCH",
      "Outbound governance context does not match the configured WhatsApp provider connection.",
    );
  }
}


export function assertWhatsAppProviderRecipientBinding(
  context: ControlledLaunchOutboundContext,
  providerRecipient: string,
): void {
  const normalize = (value: string) => value.replace(/^\+/, "").replace(/\D/g, "");
  const expected = normalize(context.recipientKey);
  const actual = normalize(providerRecipient);
  if (!expected || !actual || expected !== actual) {
    throw new ControlledLaunchOutboundDeniedError(
      "CONTROLLED_LAUNCH_PROVIDER_CONNECTION_MISMATCH",
      "Outbound provider recipient does not match the persisted WhatsApp governance recipient.",
    );
  }
}
export async function assertControlledLaunchOutboundAllowed(
  context: ControlledLaunchOutboundContext,
): Promise<ControlledLaunchOutboundAuthorization> {
  try {
    if (
      !context.workspaceId.trim() ||
      !context.connectionId.trim() ||
      !context.messageId.trim() ||
      !context.recipientKey.trim() ||
      context.channel !== "WHATSAPP" ||
      context.action !== "OUTBOUND_QUEUED"
    ) {
      throw new ControlledLaunchOutboundDeniedError(
        "CONTROLLED_LAUNCH_GOVERNANCE_INVALID",
        "Outbound controlled-launch context is invalid.",
      );
    }

    const [state, connection, killSwitchRecords] = await Promise.all([
      prismaControlledLaunchStateRepository.getState(context.workspaceId),
      prisma.engageChannelConnection.findFirst({
        where: {
          id: context.connectionId,
          workspaceId: context.workspaceId,
          channel: "WHATSAPP",
          status: { in: ["CONNECTED", "DEGRADED"] },
        },
        select: { id: true },
      }),
      prisma.engageKillSwitch.findMany({
        where: {
          workspaceId: context.workspaceId,
          active: true,
          deactivatedAt: null,
          OR: [
            { scopeType: "WORKSPACE" },
            { scopeType: "CHANNEL", channel: "WHATSAPP" },
            { scopeType: "CONNECTION", connectionId: context.connectionId },
          ],
        },
        select: {
          id: true,
          workspaceId: true,
          scopeType: true,
          channel: true,
          connectionId: true,
          blockedActions: true,
          reason: true,
        },
      }),
    ]);

    if (!connection) {
      throw new ControlledLaunchOutboundDeniedError(
        "CONTROLLED_LAUNCH_CONNECTION_NOT_ACTIVE",
        "The persisted WhatsApp connection is not active for this workspace.",
      );
    }

    const killSwitches: ControlledLaunchKillSwitchSnapshot[] = killSwitchRecords.map(
      (record) => ({
        id: record.id,
        workspaceId: record.workspaceId,
        scopeType: record.scopeType,
        channel: record.channel,
        connectionId: record.connectionId,
        blockedActions: parseBlockedActions(record.blockedActions, record.id),
        reason: record.reason,
      }),
    );

    let approvalVerified = false;
    if (state?.writePolicy === "HUMAN_APPROVAL_REQUIRED") {
      await assertActiveControlledLaunchOutboundApproval({ workspaceId: context.workspaceId, connectionId: context.connectionId, messageId: context.messageId, controlledLaunchStateVersion: state.version });
      approvalVerified = true;
    }
    const boundedScopeVerified = Boolean(state?.writePolicy === "BOUNDED_AUTOPILOT" && state.mode === "LIMITED_AUTOPILOT" && state.scope.maxRealLeads > 0);
    let approvedFlowVerified = false;
    if (state?.writePolicy === "APPROVED_FLOWS_ONLY") {
      await assertCurrentControlledLaunchApprovedFlow({ workspaceId: context.workspaceId, connectionId: context.connectionId, messageId: context.messageId });
      approvedFlowVerified = true;
    }
    const decision = evaluateControlledLaunchOutbound({ context, state, killSwitches, approvalVerified, boundedScopeVerified, approvedFlowVerified });
    if (!decision.allowed) {
      throw new ControlledLaunchOutboundDeniedError(
        decision.code,
        decision.reason,
      );
    }
    if (!state) throw new ControlledLaunchOutboundDeniedError("CONTROLLED_LAUNCH_STATE_MISSING", "Persisted controlled launch state is missing.");
    return { writePolicy: state.writePolicy, stateVersion: state.version, maxRealLeads: state.scope.maxRealLeads };
  } catch (error) {
    if (error instanceof ControlledLaunchOutboundDeniedError) throw error;
    if (error instanceof ControlledLaunchOutboundApprovalError) throw new ControlledLaunchOutboundDeniedError("CONTROLLED_LAUNCH_APPROVAL_REQUIRED", error.message);
    if (error instanceof ControlledLaunchApprovedFlowError) throw new ControlledLaunchOutboundDeniedError("CONTROLLED_LAUNCH_APPROVED_FLOW_PROOF_REQUIRED", error.message);
    throw new ControlledLaunchOutboundDeniedError(
      "CONTROLLED_LAUNCH_GOVERNANCE_UNAVAILABLE",
      `Persisted outbound governance could not be verified: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

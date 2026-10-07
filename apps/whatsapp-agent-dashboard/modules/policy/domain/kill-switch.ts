import type {
  ChannelConnectionId,
  ChannelType,
} from "@/modules/channels/core/contracts/channel";
import type { WorkspaceId } from "@/modules/workspaces/domain/workspace";

export type KillSwitchAction =
  | "OUTBOUND_NEW"
  | "OUTBOUND_QUEUED"
  | "AUTOMATION_EXECUTION"
  | "AI_GENERATION"
  | "CAMPAIGN_EXECUTION";

export type KillSwitchScope =
  | { type: "WORKSPACE" }
  | { type: "CHANNEL"; channel: ChannelType }
  | { type: "CONNECTION"; connectionId: ChannelConnectionId }
  | { type: "AUTOMATION"; automationId: string }
  | { type: "AI" }
  | { type: "CAMPAIGN"; campaignId: string };

export type KillSwitch = {
  id: string;
  workspaceId: WorkspaceId;
  scope: KillSwitchScope;
  blockedActions: readonly KillSwitchAction[];
  active: boolean;
  reason: string;
  activatedAt: Date;
  deactivatedAt?: Date;
};

export type KillSwitchContext = {
  workspaceId: WorkspaceId;
  action: KillSwitchAction;
  channel?: ChannelType;
  connectionId?: ChannelConnectionId;
  automationId?: string;
  campaignId?: string;
};

export type KillSwitchDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "KILL_SWITCH_ACTIVE";
      switchId: string;
      reason: string;
    };

function scopeMatches(
  scope: KillSwitchScope,
  context: KillSwitchContext,
): boolean {
  switch (scope.type) {
    case "WORKSPACE":
      return true;
    case "CHANNEL":
      return scope.channel === context.channel;
    case "CONNECTION":
      return scope.connectionId === context.connectionId;
    case "AUTOMATION":
      return scope.automationId === context.automationId;
    case "AI":
      return context.action === "AI_GENERATION";
    case "CAMPAIGN":
      return scope.campaignId === context.campaignId;
  }
}

export function evaluateKillSwitches(input: {
  context: KillSwitchContext;
  switches: readonly KillSwitch[];
}): KillSwitchDecision {
  const activeSwitch = input.switches.find(
    (killSwitch) =>
      killSwitch.workspaceId === input.context.workspaceId &&
      killSwitch.active &&
      !killSwitch.deactivatedAt &&
      killSwitch.blockedActions.includes(input.context.action) &&
      scopeMatches(killSwitch.scope, input.context),
  );

  if (!activeSwitch) return { allowed: true };

  return {
    allowed: false,
    code: "KILL_SWITCH_ACTIVE",
    switchId: activeSwitch.id,
    reason: activeSwitch.reason,
  };
}

export class KillSwitchError extends Error {
  readonly code = "KILL_SWITCH_ACTIVE";
  readonly switchId: string;

  constructor(decision: Exclude<KillSwitchDecision, { allowed: true }>) {
    super(decision.reason);
    this.name = "KillSwitchError";
    this.switchId = decision.switchId;
  }
}

export function assertKillSwitchAllows(
  input: Parameters<typeof evaluateKillSwitches>[0],
): void {
  const decision = evaluateKillSwitches(input);
  if (!decision.allowed) throw new KillSwitchError(decision);
}

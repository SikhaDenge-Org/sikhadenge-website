import {
  supportsCapability,
  type ChannelConnection,
} from "@/modules/channels/core/contracts/channel";
import type { CustomerId } from "@/modules/customers/domain/customer";
import {
  assertPermission,
  type Permission,
  type WorkspaceMembership,
} from "@/modules/auth/domain/permissions";
import {
  assertWorkspaceAccess,
  type WorkspaceContext,
} from "@/modules/workspaces/domain/workspace";
import {
  assertOutboundConsent,
  type ConsentPurpose,
  type CustomerConsent,
  type CustomerSuppression,
} from "@/modules/policy/domain/consent";
import {
  assertKillSwitchAllows,
  type KillSwitch,
  type KillSwitchAction,
} from "@/modules/policy/domain/kill-switch";

export type OutboundSource = "MANUAL" | "AUTOMATION" | "AI" | "CAMPAIGN";
export type OutboundContentKind = "TEXT" | "MEDIA";
export type OutboundQueueState = "NEW" | "QUEUED";

export type OutboundSafetyInput = {
  context: WorkspaceContext;
  membership: WorkspaceMembership | null | undefined;
  connection: ChannelConnection;
  customerId: CustomerId;
  purpose: ConsentPurpose;
  source: OutboundSource;
  contentKind: OutboundContentKind;
  queueState: OutboundQueueState;
  automationId?: string;
  campaignId?: string;
  consents: readonly CustomerConsent[];
  suppressions: readonly CustomerSuppression[];
  killSwitches: readonly KillSwitch[];
  now?: Date;
};

function requiredPermission(source: OutboundSource): Permission {
  switch (source) {
    case "MANUAL":
      return "inbox.reply";
    case "AUTOMATION":
      return "automations.publish";
    case "AI":
      return "ai.use";
    case "CAMPAIGN":
      return "campaigns.launch";
  }
}

function assertSourceKillSwitches(input: OutboundSafetyInput): void {
  const common = {
    workspaceId: input.context.workspaceId,
    channel: input.connection.channel,
    connectionId: input.connection.id,
    automationId: input.automationId,
    campaignId: input.campaignId,
  };

  const actions: KillSwitchAction[] = [
    input.queueState === "NEW" ? "OUTBOUND_NEW" : "OUTBOUND_QUEUED",
  ];

  if (input.source === "AUTOMATION") actions.push("AUTOMATION_EXECUTION");
  if (input.source === "AI") actions.push("AI_GENERATION");
  if (input.source === "CAMPAIGN") actions.push("CAMPAIGN_EXECUTION");

  for (const action of actions) {
    assertKillSwitchAllows({
      context: { ...common, action },
      switches: input.killSwitches,
    });
  }
}

export class OutboundCapabilityError extends Error {
  readonly code = "CHANNEL_CAPABILITY_UNAVAILABLE";

  constructor(contentKind: OutboundContentKind) {
    super(`The channel connection cannot send ${contentKind.toLowerCase()} content.`);
    this.name = "OutboundCapabilityError";
  }
}

export function assertOutboundActionAllowed(input: OutboundSafetyInput): void {
  assertWorkspaceAccess(input.context, input.connection);
  assertPermission(
    input.context,
    input.membership,
    requiredPermission(input.source),
  );

  const capability =
    input.contentKind === "TEXT" ? "OUTBOUND_TEXT" : "OUTBOUND_MEDIA";

  if (!supportsCapability(input.connection, capability)) {
    throw new OutboundCapabilityError(input.contentKind);
  }

  assertOutboundConsent({
    context: {
      workspaceId: input.context.workspaceId,
      customerId: input.customerId,
      connectionId: input.connection.id,
      channel: input.connection.channel,
      purpose: input.purpose,
      now: input.now,
    },
    consents: input.consents,
    suppressions: input.suppressions,
  });

  assertSourceKillSwitches(input);
}

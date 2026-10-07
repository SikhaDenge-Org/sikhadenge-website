import {
  CHANNEL_CAPABILITIES,
  channelConnectionId,
  emptyChannelCapabilities,
  isChannelConnectionStatus,
  isChannelType,
  type ChannelCapabilities,
  type ChannelConnection,
  type ChannelType,
} from "@/modules/channels/core/contracts/channel";
import { customerId } from "@/modules/customers/domain/customer";
import type { PersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";
import { SECURITY_FEATURE_FLAGS } from "@/modules/auth/infrastructure/prisma-authorization";
import {
  assertOutboundActionAllowed,
  type OutboundContentKind,
  type OutboundQueueState,
} from "@/modules/policy/application/outbound-safety";
import type {
  ConsentPurpose,
  ConsentState,
  CustomerConsent,
  CustomerSuppression,
  SuppressionReason,
} from "@/modules/policy/domain/consent";
import type {
  KillSwitch,
  KillSwitchAction,
  KillSwitchScope,
} from "@/modules/policy/domain/kill-switch";
import { workspaceId } from "@/modules/workspaces/domain/workspace";
import { prisma } from "@/lib/db/prisma";

const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  "SERVICE",
  "TRANSACTIONAL",
  "MARKETING",
];
const CONSENT_STATES: readonly ConsentState[] = [
  "UNKNOWN",
  "GRANTED",
  "REVOKED",
];
const SUPPRESSION_REASONS: readonly SuppressionReason[] = [
  "CUSTOMER_OPT_OUT",
  "COMPLAINT",
  "LEGAL",
  "BOUNCE",
  "ABUSE",
  "ADMIN",
  "OTHER",
];
const KILL_SWITCH_ACTIONS: readonly KillSwitchAction[] = [
  "OUTBOUND_NEW",
  "OUTBOUND_QUEUED",
  "AUTOMATION_EXECUTION",
  "AI_GENERATION",
  "CAMPAIGN_EXECUTION",
];

export class PersistedOutboundPolicyError extends Error {
  readonly code = "PERSISTED_OUTBOUND_POLICY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "PersistedOutboundPolicyError";
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isConsentPurpose(value: string): value is ConsentPurpose {
  return CONSENT_PURPOSES.includes(value as ConsentPurpose);
}

function isConsentState(value: string): value is ConsentState {
  return CONSENT_STATES.includes(value as ConsentState);
}

function isSuppressionReason(value: string): value is SuppressionReason {
  return SUPPRESSION_REASONS.includes(value as SuppressionReason);
}

function isKillSwitchAction(value: string): value is KillSwitchAction {
  return KILL_SWITCH_ACTIONS.includes(value as KillSwitchAction);
}

export function channelFromConversationSource(
  source: string | null | undefined,
): ChannelType {
  const normalized = source?.trim().toLowerCase() || "whatsapp";
  switch (normalized) {
    case "whatsapp":
      return "WHATSAPP";
    case "instagram":
      return "INSTAGRAM";
    case "messenger":
      return "MESSENGER";
    case "facebook":
      return "FACEBOOK";
    default:
      throw new PersistedOutboundPolicyError(
        `Unsupported persisted conversation channel source: ${normalized}.`,
      );
  }
}

export function resolveManualOutboundPurpose(input: {
  kind: "text" | "media" | "template";
  templateCategory?: string | null;
}): ConsentPurpose {
  if (input.kind !== "template") return "SERVICE";

  const category = input.templateCategory?.trim().toUpperCase();
  return category === "MARKETING" ? "MARKETING" : "TRANSACTIONAL";
}

export function parsePersistedCapabilities(value: unknown): ChannelCapabilities {
  const record = asObject(value);
  const parsed = { ...emptyChannelCapabilities() };

  if (!record) return Object.freeze(parsed);
  for (const capability of CHANNEL_CAPABILITIES) {
    parsed[capability] = record[capability] === true;
  }
  return Object.freeze(parsed);
}

function mapConnection(record: {
  id: string;
  workspaceId: string;
  channel: string;
  externalAccountId: string;
  displayName: string | null;
  status: string;
  capabilities: unknown;
}): ChannelConnection {
  if (!isChannelType(record.channel)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported persisted channel: ${record.channel}.`,
    );
  }
  if (!isChannelConnectionStatus(record.status)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported persisted connection status: ${record.status}.`,
    );
  }

  return {
    id: channelConnectionId(record.id),
    workspaceId: workspaceId(record.workspaceId),
    channel: record.channel,
    externalAccountId: record.externalAccountId,
    ...(record.displayName ? { displayName: record.displayName } : {}),
    status: record.status,
    capabilities: parsePersistedCapabilities(record.capabilities),
  };
}

function mapConsent(record: {
  workspaceId: string;
  customerRef: string;
  channel: string;
  purpose: string;
  state: string;
  source: string;
  occurredAt: Date;
}): CustomerConsent {
  if (!isChannelType(record.channel)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported consent channel: ${record.channel}.`,
    );
  }
  if (!isConsentPurpose(record.purpose)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported consent purpose: ${record.purpose}.`,
    );
  }
  if (!isConsentState(record.state)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported consent state: ${record.state}.`,
    );
  }

  return {
    workspaceId: workspaceId(record.workspaceId),
    customerId: customerId(record.customerRef),
    channel: record.channel,
    purpose: record.purpose,
    state: record.state,
    source: record.source,
    changedAt: record.occurredAt,
  };
}

function mapSuppression(record: {
  id: string;
  workspaceId: string;
  customerRef: string | null;
  connectionId: string | null;
  channel: string | null;
  purposes: unknown;
  reason: string;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}): CustomerSuppression {
  const rawChannel = record.channel;
  if (rawChannel && !isChannelType(rawChannel)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported suppression channel: ${rawChannel}.`,
    );
  }
  const channel: ChannelType | undefined = rawChannel
    ? (rawChannel as ChannelType)
    : undefined;

  if (!isSuppressionReason(record.reason)) {
    throw new PersistedOutboundPolicyError(
      `Unsupported suppression reason: ${record.reason}.`,
    );
  }

  const purposes = asStringArray(record.purposes).filter(
    (purpose): purpose is ConsentPurpose | "ALL" =>
      purpose === "ALL" || isConsentPurpose(purpose),
  );
  if (purposes.length === 0) {
    throw new PersistedOutboundPolicyError(
      `Suppression ${record.id} has no valid purpose.`,
    );
  }

  return {
    id: record.id,
    workspaceId: workspaceId(record.workspaceId),
    ...(record.customerRef
      ? { customerId: customerId(record.customerRef) }
      : {}),
    ...(record.connectionId
      ? { connectionId: channelConnectionId(record.connectionId) }
      : {}),
    ...(channel ? { channel } : {}),
    purposes,
    reason: record.reason,
    startsAt: record.startsAt,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
  };
}

function mapKillSwitchScope(record: {
  id: string;
  scopeType: string;
  channel: string | null;
  connectionId: string | null;
  automationId: string | null;
  campaignId: string | null;
}): KillSwitchScope {
  switch (record.scopeType) {
    case "WORKSPACE":
      return { type: "WORKSPACE" };
    case "CHANNEL":
      if (record.channel && isChannelType(record.channel)) {
        return { type: "CHANNEL", channel: record.channel };
      }
      break;
    case "CONNECTION":
      if (record.connectionId) {
        return {
          type: "CONNECTION",
          connectionId: channelConnectionId(record.connectionId),
        };
      }
      break;
    case "AUTOMATION":
      if (record.automationId) {
        return { type: "AUTOMATION", automationId: record.automationId };
      }
      break;
    case "AI":
      return { type: "AI" };
    case "CAMPAIGN":
      if (record.campaignId) {
        return { type: "CAMPAIGN", campaignId: record.campaignId };
      }
      break;
  }

  throw new PersistedOutboundPolicyError(
    `Kill switch ${record.id} has an invalid persisted scope.`,
  );
}

function mapKillSwitch(record: {
  id: string;
  workspaceId: string;
  scopeType: string;
  channel: string | null;
  connectionId: string | null;
  automationId: string | null;
  campaignId: string | null;
  blockedActions: unknown;
  active: boolean;
  reason: string;
  activatedAt: Date;
  deactivatedAt: Date | null;
}): KillSwitch {
  const blockedActions = asStringArray(record.blockedActions).filter(
    isKillSwitchAction,
  );
  if (blockedActions.length === 0) {
    throw new PersistedOutboundPolicyError(
      `Kill switch ${record.id} has no valid blocked action.`,
    );
  }

  return {
    id: record.id,
    workspaceId: workspaceId(record.workspaceId),
    scope: mapKillSwitchScope(record),
    blockedActions,
    active: record.active,
    reason: record.reason,
    activatedAt: record.activatedAt,
    ...(record.deactivatedAt
      ? { deactivatedAt: record.deactivatedAt }
      : {}),
  };
}

function legacyMarketingConsent(input: {
  workspaceId: string;
  customerRef: string;
  channel: ChannelType;
  legacyConsentStatus?: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT" | null;
  changedAt: Date;
}): CustomerConsent | null {
  if (!input.legacyConsentStatus) return null;

  const state: ConsentState =
    input.legacyConsentStatus === "OPTED_IN"
      ? "GRANTED"
      : input.legacyConsentStatus === "OPTED_OUT"
        ? "REVOKED"
        : "UNKNOWN";

  return {
    workspaceId: workspaceId(input.workspaceId),
    customerId: customerId(input.customerRef),
    channel: input.channel,
    purpose: "MARKETING",
    state,
    source: "LEGACY_WHATSAPP_CONTACT",
    changedAt: input.changedAt,
  };
}

export async function assertPersistedManualOutboundAllowed(input: {
  securityContext: PersistedWorkspaceSecurityContext | null;
  customerRef: string;
  source: string | null | undefined;
  contentKind: OutboundContentKind;
  purpose: ConsentPurpose;
  queueState?: OutboundQueueState;
  legacyConsentStatus?: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT" | null;
  legacyConsentChangedAt?: Date;
  now?: Date;
}): Promise<{ enforced: boolean; connectionId?: string }> {
  const securityContext = input.securityContext;
  if (
    !securityContext ||
    !securityContext.featureFlags[SECURITY_FEATURE_FLAGS.outboundPolicy]
  ) {
    return { enforced: false };
  }

  const now = input.now ?? new Date();
  const channel = channelFromConversationSource(input.source);
  const connectionRecord = await prisma.engageChannelConnection.findFirst({
    where: {
      workspaceId: securityContext.workspace.id,
      channel,
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (!connectionRecord) {
    throw new PersistedOutboundPolicyError(
      `No active persisted ${channel} connection is configured for the workspace.`,
    );
  }

  const [consentRecords, suppressionRecords, killSwitchRecords] =
    await Promise.all([
      prisma.engageCustomerConsentEvent.findMany({
        where: {
          workspaceId: securityContext.workspace.id,
          customerRef: input.customerRef,
          channel,
          OR: [
            { connectionId: null },
            { connectionId: connectionRecord.id },
          ],
          occurredAt: { lte: now },
        },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.engageCustomerSuppression.findMany({
        where: {
          workspaceId: securityContext.workspace.id,
          AND: [
            {
              OR: [
                { customerRef: null },
                { customerRef: input.customerRef },
              ],
            },
            { OR: [{ channel: null }, { channel }] },
            {
              OR: [
                { connectionId: null },
                { connectionId: connectionRecord.id },
              ],
            },
            { startsAt: { lte: now } },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            { OR: [{ revokedAt: null }, { revokedAt: { gt: now } }] },
          ],
        },
      }),
      prisma.engageKillSwitch.findMany({
        where: {
          workspaceId: securityContext.workspace.id,
          active: true,
          deactivatedAt: null,
          OR: [
            { scopeType: "WORKSPACE" },
            { scopeType: "CHANNEL", channel },
            {
              scopeType: "CONNECTION",
              connectionId: connectionRecord.id,
            },
          ],
        },
      }),
    ]);

  const consents = consentRecords.map(mapConsent);
  if (!consents.some((consent) => consent.purpose === "MARKETING")) {
    const legacy = legacyMarketingConsent({
      workspaceId: securityContext.workspace.id,
      customerRef: input.customerRef,
      channel,
      legacyConsentStatus: input.legacyConsentStatus,
      changedAt: input.legacyConsentChangedAt ?? now,
    });
    if (legacy) consents.push(legacy);
  }

  const connection = mapConnection(connectionRecord);
  assertOutboundActionAllowed({
    context: securityContext.context,
    membership: securityContext.membership,
    connection,
    customerId: customerId(input.customerRef),
    purpose: input.purpose,
    source: "MANUAL",
    contentKind: input.contentKind,
    queueState: input.queueState ?? "NEW",
    consents,
    suppressions: suppressionRecords.map(mapSuppression),
    killSwitches: killSwitchRecords.map(mapKillSwitch),
    now,
  });

  return { enforced: true, connectionId: connectionRecord.id };
}

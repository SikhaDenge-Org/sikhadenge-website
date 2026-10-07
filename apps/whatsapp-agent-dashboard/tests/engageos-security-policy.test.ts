import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  AuthorizationError,
  assertPermission,
  type WorkspaceMembership,
} from "@/modules/auth/domain/permissions";
import {
  channelConnectionId,
  emptyChannelCapabilities,
  type ChannelConnection,
} from "@/modules/channels/core/contracts/channel";
import {
  containsUsableCredentialMaterial,
  toCredentialPublicView,
  type ConnectionCredentialRecord,
} from "@/modules/channels/core/security/credential-vault";
import {
  WebhookSecurityError,
  assertFreshWebhookTimestamp,
  verifyHmacSha256Signature,
  webhookReplayKey,
} from "@/modules/channels/core/security/webhook-security";
import { customerId } from "@/modules/customers/domain/customer";
import {
  ConsentPolicyError,
  assertOutboundConsent,
  evaluateOutboundConsent,
  type CustomerConsent,
  type CustomerSuppression,
} from "@/modules/policy/domain/consent";
import {
  KillSwitchError,
  assertKillSwitchAllows,
  type KillSwitch,
} from "@/modules/policy/domain/kill-switch";
import {
  OutboundCapabilityError,
  assertOutboundActionAllowed,
} from "@/modules/policy/application/outbound-safety";
import { createSecurityAuditEvent } from "@/modules/audit/domain/security-audit-event";
import {
  workspaceActorId,
  workspaceId,
  WorkspaceScopeError,
} from "@/modules/workspaces/domain/workspace";

const workspaceA = workspaceId("workspace-a");
const workspaceB = workspaceId("workspace-b");
const actorA = workspaceActorId("user-a");
const customerA = customerId("customer-a");
const connectionId = channelConnectionId("connection-a");

const counselor: WorkspaceMembership = {
  workspaceId: workspaceA,
  userId: actorA,
  role: "COUNSELOR",
  isActive: true,
};

const viewer: WorkspaceMembership = {
  ...counselor,
  role: "VIEWER",
};

const connection: ChannelConnection = {
  id: connectionId,
  workspaceId: workspaceA,
  channel: "WHATSAPP",
  externalAccountId: "phone-number-id",
  status: "CONNECTED",
  capabilities: {
    ...emptyChannelCapabilities(),
    OUTBOUND_TEXT: true,
  },
};

assert.doesNotThrow(() =>
  assertPermission(
    { workspaceId: workspaceA, actorId: actorA },
    counselor,
    "inbox.reply",
  ),
);

assert.throws(
  () =>
    assertPermission(
      { workspaceId: workspaceA, actorId: actorA },
      viewer,
      "inbox.reply",
    ),
  AuthorizationError,
);

assert.throws(
  () =>
    assertPermission(
      { workspaceId: workspaceB, actorId: actorA },
      counselor,
      "inbox.read",
    ),
  WorkspaceScopeError,
);

assert.throws(
  () =>
    assertPermission(
      { workspaceId: workspaceA, actorId: actorA },
      { ...counselor, isActive: false },
      "inbox.read",
    ),
  AuthorizationError,
);

const credential: ConnectionCredentialRecord = {
  id: "credential-a",
  workspaceId: workspaceA,
  connectionId,
  channel: "WHATSAPP",
  kind: "ACCESS_TOKEN",
  encrypted: {
    algorithm: "AES_256_GCM",
    keyVersion: "key-v1",
    initializationVector: "private-iv",
    authenticationTag: "private-tag",
    ciphertext: "private-ciphertext",
  },
  createdAt: new Date("2026-08-02T09:00:00.000Z"),
  updatedAt: new Date("2026-08-02T09:00:00.000Z"),
};
const publicCredential = toCredentialPublicView(credential);
assert.equal(publicCredential.configured, true);
assert.equal(publicCredential.keyVersion, "key-v1");
assert.equal(containsUsableCredentialMaterial(publicCredential), false);
assert.equal("encrypted" in publicCredential, false);

const rawBody = JSON.stringify({ event: "message" });
const secret = "test-webhook-secret";
const validSignature = `sha256=${createHmac("sha256", secret)
  .update(rawBody)
  .digest("hex")}`;
assert.doesNotThrow(() =>
  verifyHmacSha256Signature({ rawBody, secret, signature: validSignature }),
);
assert.throws(
  () =>
    verifyHmacSha256Signature({
      rawBody,
      secret,
      signature: `sha256=${"0".repeat(64)}`,
    }),
  WebhookSecurityError,
);
assert.doesNotThrow(() =>
  assertFreshWebhookTimestamp({
    timestamp: new Date("2026-08-02T10:00:00.000Z"),
    now: new Date("2026-08-02T10:04:59.000Z"),
  }),
);
assert.throws(
  () =>
    assertFreshWebhookTimestamp({
      timestamp: new Date("2026-08-02T09:54:00.000Z"),
      now: new Date("2026-08-02T10:00:00.000Z"),
    }),
  WebhookSecurityError,
);
assert.equal(
  webhookReplayKey({ connectionId, externalEventId: "evt-1" }),
  "connection-a:evt-1",
);

const marketingConsent: CustomerConsent = {
  workspaceId: workspaceA,
  customerId: customerA,
  channel: "WHATSAPP",
  purpose: "MARKETING",
  state: "GRANTED",
  source: "web-form",
  changedAt: new Date("2026-08-02T09:00:00.000Z"),
};
const consentContext = {
  workspaceId: workspaceA,
  customerId: customerA,
  connectionId,
  channel: "WHATSAPP" as const,
  purpose: "MARKETING" as const,
  now: new Date("2026-08-02T10:00:00.000Z"),
};
assert.equal(
  evaluateOutboundConsent({
    context: consentContext,
    consents: [],
    suppressions: [],
  }).allowed,
  false,
);
assert.doesNotThrow(() =>
  assertOutboundConsent({
    context: consentContext,
    consents: [marketingConsent],
    suppressions: [],
  }),
);
assert.throws(
  () =>
    assertOutboundConsent({
      context: consentContext,
      consents: [{ ...marketingConsent, state: "REVOKED" }],
      suppressions: [],
    }),
  ConsentPolicyError,
);

const suppression: CustomerSuppression = {
  id: "suppression-a",
  workspaceId: workspaceA,
  customerId: customerA,
  purposes: ["ALL"],
  reason: "CUSTOMER_OPT_OUT",
  startsAt: new Date("2026-08-02T08:00:00.000Z"),
};
assert.throws(
  () =>
    assertOutboundConsent({
      context: { ...consentContext, purpose: "SERVICE" },
      consents: [],
      suppressions: [suppression],
    }),
  ConsentPolicyError,
);

const workspaceKillSwitch: KillSwitch = {
  id: "switch-a",
  workspaceId: workspaceA,
  scope: { type: "WORKSPACE" },
  blockedActions: ["OUTBOUND_NEW", "OUTBOUND_QUEUED"],
  active: true,
  reason: "Emergency outbound pause",
  activatedAt: new Date("2026-08-02T09:00:00.000Z"),
};
assert.throws(
  () =>
    assertKillSwitchAllows({
      context: { workspaceId: workspaceA, action: "OUTBOUND_NEW" },
      switches: [workspaceKillSwitch],
    }),
  KillSwitchError,
);
assert.throws(
  () =>
    assertKillSwitchAllows({
      context: { workspaceId: workspaceA, action: "OUTBOUND_QUEUED" },
      switches: [workspaceKillSwitch],
    }),
  KillSwitchError,
);
assert.doesNotThrow(() =>
  assertKillSwitchAllows({
    context: { workspaceId: workspaceB, action: "OUTBOUND_NEW" },
    switches: [workspaceKillSwitch],
  }),
);

const baseOutboundInput = {
  context: { workspaceId: workspaceA, actorId: actorA },
  membership: counselor,
  connection,
  customerId: customerA,
  purpose: "SERVICE" as const,
  source: "MANUAL" as const,
  contentKind: "TEXT" as const,
  queueState: "NEW" as const,
  consents: [] as readonly CustomerConsent[],
  suppressions: [] as readonly CustomerSuppression[],
  killSwitches: [] as readonly KillSwitch[],
};
assert.doesNotThrow(() => assertOutboundActionAllowed(baseOutboundInput));
assert.throws(
  () =>
    assertOutboundActionAllowed({
      ...baseOutboundInput,
      membership: viewer,
    }),
  AuthorizationError,
);
assert.throws(
  () =>
    assertOutboundActionAllowed({
      ...baseOutboundInput,
      contentKind: "MEDIA",
    }),
  OutboundCapabilityError,
);
assert.throws(
  () =>
    assertOutboundActionAllowed({
      ...baseOutboundInput,
      purpose: "MARKETING",
    }),
  ConsentPolicyError,
);
assert.throws(
  () =>
    assertOutboundActionAllowed({
      ...baseOutboundInput,
      queueState: "QUEUED",
      killSwitches: [workspaceKillSwitch],
    }),
  KillSwitchError,
);

const audit = createSecurityAuditEvent({
  id: "audit-a",
  workspaceId: workspaceA,
  actorId: actorA,
  action: "OUTBOUND_BLOCKED",
  outcome: "DENIED",
  entityType: "OutboundAttempt",
  entityId: "attempt-a",
  reasonCode: "SUPPRESSED",
  metadata: { channel: "WHATSAPP" },
  occurredAt: new Date("2026-08-02T10:00:00.000Z"),
});
assert.equal(Object.isFrozen(audit), true);
assert.throws(() =>
  createSecurityAuditEvent({
    ...audit,
    id: "audit-b",
    metadata: { access_token: "must-not-be-recorded" },
  }),
);

console.log("EngageOS security and policy tests passed: 22 assertions.");

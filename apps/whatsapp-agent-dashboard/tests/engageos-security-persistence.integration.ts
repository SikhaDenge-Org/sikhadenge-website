import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
  loadPersistedWorkspaceSecurityContext,
  resolveDashboardAuthorization,
  SECURITY_FEATURE_FLAGS,
} from "@/modules/auth/infrastructure/prisma-authorization";
import {
  assertPersistedManualOutboundAllowed,
} from "@/modules/policy/infrastructure/prisma-outbound-policy";
import {
  releasePersistedWebhookReplay,
  reservePersistedWebhookReplay,
} from "@/modules/channels/core/security/prisma-webhook-replay";

const prisma = new PrismaClient();
const securityEnv = {
  ENGAGEOS_SECURITY_PERSISTENCE_ENABLED: "true",
} as const;

async function main() {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.invalid";
  const admin = await prisma.dashboardUser.findUnique({
    where: { email: adminEmail },
    select: { id: true, role: true },
  });
  assert.ok(admin, "Seeded dashboard administrator is required.");

  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: "sikhadenge-default" },
  });
  assert.ok(workspace, "Default EngageOS workspace must be backfilled.");

  const membership = await prisma.engageWorkspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: admin.id,
      },
    },
  });
  assert.ok(membership, "Existing dashboard user must receive a membership.");
  assert.equal(membership.role, admin.role);
  assert.equal(membership.isActive, true);

  const initialFlags = await prisma.engageFeatureFlag.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { key: "asc" },
  });
  assert.equal(initialFlags.length, 3);
  assert.equal(initialFlags.every((flag) => flag.enabled === false), true);

  const legacyResolution = await resolveDashboardAuthorization({
    userId: admin.id,
    permission: "inbox.reply",
    env: securityEnv,
  });
  assert.equal(legacyResolution.mode, "LEGACY");
  assert.ok(legacyResolution.securityContext);

  await prisma.engageFeatureFlag.updateMany({
    where: { workspaceId: workspace.id },
    data: { enabled: true },
  });

  const engageResolution = await resolveDashboardAuthorization({
    userId: admin.id,
    permission: "inbox.reply",
    env: securityEnv,
  });
  assert.equal(engageResolution.mode, "ENGAGEOS");
  assert.ok(engageResolution.securityContext);
  assert.equal(
    engageResolution.securityContext.featureFlags[
      SECURITY_FEATURE_FLAGS.outboundPolicy
    ],
    true,
  );

  const loadedContext = await loadPersistedWorkspaceSecurityContext(admin.id);
  assert.ok(loadedContext);
  assert.equal(loadedContext.workspace.id, workspace.id);

  await prisma.engageWebhookReplayRecord.deleteMany({
    where: { workspaceId: workspace.id },
  });
  await prisma.engageKillSwitch.deleteMany({
    where: { workspaceId: workspace.id },
  });
  await prisma.engageCustomerSuppression.deleteMany({
    where: { workspaceId: workspace.id },
  });
  await prisma.engageCustomerConsentEvent.deleteMany({
    where: { workspaceId: workspace.id },
  });
  await prisma.engageChannelConnection.deleteMany({
    where: {
      workspaceId: workspace.id,
      channel: "WHATSAPP",
    },
  });

  const rawBody = JSON.stringify({ object: "whatsapp_business_account", ci: 1 });
  await assert.rejects(
    () =>
      reservePersistedWebhookReplay({
        channel: "WHATSAPP",
        rawBody,
        signatureHeader: "sha256=ci",
        env: securityEnv,
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code ===
        "WEBHOOK_REPLAY_CONFIGURATION_ERROR",
  );

  const connection = await prisma.engageChannelConnection.create({
    data: {
      workspaceId: workspace.id,
      channel: "WHATSAPP",
      externalAccountId: "ci-security-whatsapp",
      displayName: "CI WhatsApp",
      status: "CONNECTED",
      capabilities: {
        WEBHOOK_VERIFY: true,
        INBOUND_MESSAGE: true,
        OUTBOUND_TEXT: true,
        OUTBOUND_MEDIA: true,
        DELIVERY_STATUS: true,
        READ_STATUS: true,
        COMMENT_EVENTS: false,
        PUBLIC_COMMENT_REPLY: false,
        PRIVATE_COMMENT_REPLY: false,
        STORY_REPLY: false,
        MENTION_EVENTS: false,
      },
    },
  });

  const customerRef = "ci-security-customer";
  const allowedService = await assertPersistedManualOutboundAllowed({
    securityContext: loadedContext,
    customerRef,
    source: "whatsapp",
    contentKind: "TEXT",
    purpose: "SERVICE",
    legacyConsentStatus: "UNKNOWN",
  });
  assert.equal(allowedService.enforced, true);
  assert.equal(allowedService.connectionId, connection.id);

  await assert.rejects(
    () =>
      assertPersistedManualOutboundAllowed({
        securityContext: loadedContext,
        customerRef,
        source: "whatsapp",
        contentKind: "TEXT",
        purpose: "MARKETING",
        legacyConsentStatus: "UNKNOWN",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "CONSENT_REQUIRED",
  );

  await prisma.engageCustomerConsentEvent.create({
    data: {
      workspaceId: workspace.id,
      customerRef,
      connectionId: connection.id,
      channel: "WHATSAPP",
      purpose: "MARKETING",
      state: "GRANTED",
      source: "CI_TEST",
      occurredAt: new Date(),
    },
  });

  const allowedMarketing = await assertPersistedManualOutboundAllowed({
    securityContext: loadedContext,
    customerRef,
    source: "whatsapp",
    contentKind: "TEXT",
    purpose: "MARKETING",
    legacyConsentStatus: "UNKNOWN",
  });
  assert.equal(allowedMarketing.enforced, true);

  const suppression = await prisma.engageCustomerSuppression.create({
    data: {
      workspaceId: workspace.id,
      customerRef,
      connectionId: connection.id,
      channel: "WHATSAPP",
      purposes: ["ALL"],
      reason: "ADMIN",
    },
  });

  await assert.rejects(
    () =>
      assertPersistedManualOutboundAllowed({
        securityContext: loadedContext,
        customerRef,
        source: "whatsapp",
        contentKind: "TEXT",
        purpose: "SERVICE",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SUPPRESSED",
  );

  await prisma.engageCustomerSuppression.update({
    where: { id: suppression.id },
    data: { revokedAt: new Date() },
  });

  const killSwitch = await prisma.engageKillSwitch.create({
    data: {
      workspaceId: workspace.id,
      scopeType: "WORKSPACE",
      blockedActions: ["OUTBOUND_NEW"],
      reason: "CI emergency stop",
      active: true,
    },
  });

  await assert.rejects(
    () =>
      assertPersistedManualOutboundAllowed({
        securityContext: loadedContext,
        customerRef,
        source: "whatsapp",
        contentKind: "TEXT",
        purpose: "SERVICE",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "KILL_SWITCH_ACTIVE",
  );

  await prisma.engageKillSwitch.update({
    where: { id: killSwitch.id },
    data: { active: false, deactivatedAt: new Date() },
  });

  const ambiguousConnection = await prisma.engageChannelConnection.create({
    data: {
      workspaceId: workspace.id,
      channel: "WHATSAPP",
      externalAccountId: "ci-security-whatsapp-secondary",
      displayName: "CI WhatsApp Secondary",
      status: "CONNECTED",
      capabilities: {
        WEBHOOK_VERIFY: true,
        INBOUND_MESSAGE: true,
        OUTBOUND_TEXT: false,
        OUTBOUND_MEDIA: false,
        DELIVERY_STATUS: false,
        READ_STATUS: false,
        COMMENT_EVENTS: false,
        PUBLIC_COMMENT_REPLY: false,
        PRIVATE_COMMENT_REPLY: false,
        STORY_REPLY: false,
        MENTION_EVENTS: false,
      },
    },
  });

  await assert.rejects(
    () =>
      reservePersistedWebhookReplay({
        channel: "WHATSAPP",
        rawBody,
        signatureHeader: "sha256=ci",
        env: securityEnv,
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code ===
        "WEBHOOK_REPLAY_CONFIGURATION_ERROR",
  );

  await prisma.engageChannelConnection.delete({
    where: { id: ambiguousConnection.id },
  });

  const firstReplay = await reservePersistedWebhookReplay({
    channel: "WHATSAPP",
    rawBody,
    signatureHeader: "sha256=ci",
    env: securityEnv,
  });
  assert.equal(firstReplay.enforced, true);
  assert.equal(firstReplay.duplicate, false);

  const duplicateReplay = await reservePersistedWebhookReplay({
    channel: "WHATSAPP",
    rawBody,
    signatureHeader: "sha256=ci",
    env: securityEnv,
  });
  assert.equal(duplicateReplay.enforced, true);
  assert.equal(duplicateReplay.duplicate, true);

  await releasePersistedWebhookReplay(firstReplay);
  const retriedReplay = await reservePersistedWebhookReplay({
    channel: "WHATSAPP",
    rawBody,
    signatureHeader: "sha256=ci",
    env: securityEnv,
  });
  assert.equal(retriedReplay.duplicate, false);
  await releasePersistedWebhookReplay(retriedReplay);

  console.log("EngageOS security persistence integration tests passed: 28 assertions.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

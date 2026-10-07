-- Phase 2 security persistence is intentionally additive.
-- Existing WhatsApp operational tables are not renamed, rewritten, or dropped.

CREATE TABLE "EngageWorkspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageWorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageWorkspaceMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngagePermissionGrant" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagePermissionGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageChannelConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "capabilities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageChannelConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageConnectionCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'AES_256_GCM',
    "keyVersion" TEXT NOT NULL,
    "initializationVector" TEXT NOT NULL,
    "authenticationTag" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageConnectionCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageCustomerConsentEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "connectionId" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageCustomerConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageCustomerSuppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerRef" TEXT,
    "connectionId" TEXT,
    "channel" TEXT,
    "purposes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageCustomerSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageKillSwitch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT,
    "scopeType" TEXT NOT NULL,
    "channel" TEXT,
    "automationId" TEXT,
    "campaignId" TEXT,
    "blockedActions" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageKillSwitch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageWebhookReplayRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "replayKey" TEXT NOT NULL,
    "signatureDigest" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngageWebhookReplayRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageSecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reasonCode" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageSecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageFeatureFlag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngageWorkspace_slug_key" ON "EngageWorkspace"("slug");
CREATE INDEX "EngageWorkspace_isActive_createdAt_idx" ON "EngageWorkspace"("isActive", "createdAt");

CREATE UNIQUE INDEX "EngageWorkspaceMembership_workspaceId_userId_key" ON "EngageWorkspaceMembership"("workspaceId", "userId");
CREATE INDEX "EngageWorkspaceMembership_userId_isActive_idx" ON "EngageWorkspaceMembership"("userId", "isActive");
CREATE INDEX "EngageWorkspaceMembership_workspaceId_role_isActive_idx" ON "EngageWorkspaceMembership"("workspaceId", "role", "isActive");

CREATE UNIQUE INDEX "EngagePermissionGrant_membershipId_permission_key" ON "EngagePermissionGrant"("membershipId", "permission");
CREATE INDEX "EngagePermissionGrant_permission_idx" ON "EngagePermissionGrant"("permission");

CREATE UNIQUE INDEX "EngageChannelConnection_workspaceId_channel_externalAccountId_key" ON "EngageChannelConnection"("workspaceId", "channel", "externalAccountId");
CREATE INDEX "EngageChannelConnection_workspaceId_channel_status_idx" ON "EngageChannelConnection"("workspaceId", "channel", "status");

CREATE UNIQUE INDEX "EngageConnectionCredential_connectionId_kind_key" ON "EngageConnectionCredential"("connectionId", "kind");
CREATE INDEX "EngageConnectionCredential_workspaceId_expiresAt_idx" ON "EngageConnectionCredential"("workspaceId", "expiresAt");

CREATE INDEX "EngageCustomerConsentEvent_workspaceId_customerRef_channel_purpose_occurredAt_idx" ON "EngageCustomerConsentEvent"("workspaceId", "customerRef", "channel", "purpose", "occurredAt");
CREATE INDEX "EngageCustomerConsentEvent_connectionId_occurredAt_idx" ON "EngageCustomerConsentEvent"("connectionId", "occurredAt");

CREATE INDEX "EngageCustomerSuppression_workspaceId_customerRef_startsAt_idx" ON "EngageCustomerSuppression"("workspaceId", "customerRef", "startsAt");
CREATE INDEX "EngageCustomerSuppression_workspaceId_channel_startsAt_idx" ON "EngageCustomerSuppression"("workspaceId", "channel", "startsAt");
CREATE INDEX "EngageCustomerSuppression_connectionId_startsAt_idx" ON "EngageCustomerSuppression"("connectionId", "startsAt");

CREATE INDEX "EngageKillSwitch_workspaceId_active_scopeType_idx" ON "EngageKillSwitch"("workspaceId", "active", "scopeType");
CREATE INDEX "EngageKillSwitch_connectionId_active_idx" ON "EngageKillSwitch"("connectionId", "active");
CREATE INDEX "EngageKillSwitch_channel_active_idx" ON "EngageKillSwitch"("channel", "active");

CREATE UNIQUE INDEX "EngageWebhookReplayRecord_replayKey_key" ON "EngageWebhookReplayRecord"("replayKey");
CREATE INDEX "EngageWebhookReplayRecord_workspaceId_expiresAt_idx" ON "EngageWebhookReplayRecord"("workspaceId", "expiresAt");
CREATE INDEX "EngageWebhookReplayRecord_connectionId_receivedAt_idx" ON "EngageWebhookReplayRecord"("connectionId", "receivedAt");

CREATE INDEX "EngageSecurityAuditEvent_workspaceId_occurredAt_idx" ON "EngageSecurityAuditEvent"("workspaceId", "occurredAt");
CREATE INDEX "EngageSecurityAuditEvent_workspaceId_action_outcome_occurredAt_idx" ON "EngageSecurityAuditEvent"("workspaceId", "action", "outcome", "occurredAt");
CREATE INDEX "EngageSecurityAuditEvent_actorId_occurredAt_idx" ON "EngageSecurityAuditEvent"("actorId", "occurredAt");
CREATE INDEX "EngageSecurityAuditEvent_entityType_entityId_occurredAt_idx" ON "EngageSecurityAuditEvent"("entityType", "entityId", "occurredAt");

CREATE UNIQUE INDEX "EngageFeatureFlag_workspaceId_key_key" ON "EngageFeatureFlag"("workspaceId", "key");
CREATE INDEX "EngageFeatureFlag_key_enabled_idx" ON "EngageFeatureFlag"("key", "enabled");

ALTER TABLE "EngageWorkspaceMembership" ADD CONSTRAINT "EngageWorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageWorkspaceMembership" ADD CONSTRAINT "EngageWorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DashboardUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagePermissionGrant" ADD CONSTRAINT "EngagePermissionGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "EngageWorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageChannelConnection" ADD CONSTRAINT "EngageChannelConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageConnectionCredential" ADD CONSTRAINT "EngageConnectionCredential_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageCustomerConsentEvent" ADD CONSTRAINT "EngageCustomerConsentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageCustomerConsentEvent" ADD CONSTRAINT "EngageCustomerConsentEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngageCustomerSuppression" ADD CONSTRAINT "EngageCustomerSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageCustomerSuppression" ADD CONSTRAINT "EngageCustomerSuppression_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngageKillSwitch" ADD CONSTRAINT "EngageKillSwitch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageKillSwitch" ADD CONSTRAINT "EngageKillSwitch_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngageWebhookReplayRecord" ADD CONSTRAINT "EngageWebhookReplayRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageWebhookReplayRecord" ADD CONSTRAINT "EngageWebhookReplayRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageSecurityAuditEvent" ADD CONSTRAINT "EngageSecurityAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageFeatureFlag" ADD CONSTRAINT "EngageFeatureFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create one truthful internal workspace. Channel connections remain absent until
-- their external account identifiers and capabilities are explicitly verified.
INSERT INTO "EngageWorkspace" ("id", "slug", "name", "timezone", "isActive", "createdAt", "updatedAt")
VALUES ('engagews_default', 'sikhadenge-default', 'SikhaDenge', 'Asia/Kolkata', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Preserve current dashboard access by mapping every existing user to the
-- default workspace with the same role. Runtime cutover remains feature-flagged.
INSERT INTO "EngageWorkspaceMembership" ("id", "workspaceId", "userId", "role", "isActive", "createdAt", "updatedAt")
SELECT
    'engagem_' || md5("id"),
    'engagews_default',
    "id",
    "role"::text,
    "isActive",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "DashboardUser"
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

-- All integration flags default to disabled. Enabling requires an explicit
-- repository change or controlled administrative action after deployment.
INSERT INTO "EngageFeatureFlag" ("id", "workspaceId", "key", "enabled", "createdAt", "updatedAt") VALUES
    ('engageflag_route_permissions', 'engagews_default', 'engageos.route_permissions', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('engageflag_outbound_policy', 'engagews_default', 'engageos.outbound_policy', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('engageflag_webhook_replay', 'engagews_default', 'engageos.webhook_replay', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("workspaceId", "key") DO NOTHING;

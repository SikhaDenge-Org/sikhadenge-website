-- Phase 16A — SaaS / enterprise tenant persistence foundation.
-- Purely additive: no existing table/column rename, drop, destructive rewrite or backfill.

CREATE TABLE "EngageAgencyWorkspaceLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agencyWorkspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageAgencyWorkspaceLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageAgencyWorkspaceLink_distinct_workspaces_check"
      CHECK ("agencyWorkspaceId" <> "workspaceId")
);

CREATE TABLE "EngageWorkspaceSaasState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'INTERNAL',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageWorkspaceSaasState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngagePublicApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagePublicApiKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngagePublicApiKey_sha256_check"
      CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "EngageWorkspaceUsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageWorkspaceUsageEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageWorkspaceUsageEvent_quantity_check"
      CHECK ("quantity" > 0)
);

CREATE TABLE "EngageWhiteLabelConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "supportEmail" TEXT,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageWhiteLabelConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngageCustomDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationDigest" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageCustomDomain_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageCustomDomain_lowercase_hostname_check"
      CHECK ("hostname" = lower("hostname"))
);

CREATE TABLE "EngageDeveloperRequestLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "apiKeyWorkspaceId" TEXT,
    "apiKeyId" TEXT,
    "requestId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "rateLimitDecision" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageDeveloperRequestLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageDeveloperRequestLog_duration_check"
      CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
    CONSTRAINT "EngageDeveloperRequestLog_api_key_workspace_check"
      CHECK (
        ("apiKeyId" IS NULL AND "apiKeyWorkspaceId" IS NULL)
        OR
        (
          "apiKeyId" IS NOT NULL
          AND "apiKeyWorkspaceId" = "workspaceId"
        )
      )
);

CREATE UNIQUE INDEX "EngageAgencyWorkspaceLink_agencyWorkspaceId_workspaceId_key"
ON "EngageAgencyWorkspaceLink"("agencyWorkspaceId", "workspaceId");

CREATE INDEX "EngageAgencyWorkspaceLink_workspaceId_status_idx"
ON "EngageAgencyWorkspaceLink"("workspaceId", "status");

CREATE INDEX "EngageAgencyWorkspaceLink_agencyWorkspaceId_status_idx"
ON "EngageAgencyWorkspaceLink"("agencyWorkspaceId", "status");

CREATE UNIQUE INDEX "EngageWorkspaceSaasState_workspaceId_key"
ON "EngageWorkspaceSaasState"("workspaceId");

CREATE INDEX "EngageWorkspaceSaasState_planKey_status_idx"
ON "EngageWorkspaceSaasState"("planKey", "status");

CREATE UNIQUE INDEX "EngagePublicApiKey_sha256_key"
ON "EngagePublicApiKey"("sha256");

CREATE UNIQUE INDEX "EngagePublicApiKey_workspaceId_id_key"
ON "EngagePublicApiKey"("workspaceId", "id");

CREATE UNIQUE INDEX "EngagePublicApiKey_workspaceId_prefix_key"
ON "EngagePublicApiKey"("workspaceId", "prefix");

CREATE INDEX "EngagePublicApiKey_workspaceId_revokedAt_expiresAt_idx"
ON "EngagePublicApiKey"("workspaceId", "revokedAt", "expiresAt");

CREATE UNIQUE INDEX "EngageWorkspaceUsageEvent_workspaceId_idempotencyKey_key"
ON "EngageWorkspaceUsageEvent"("workspaceId", "idempotencyKey");

CREATE INDEX "EngageWorkspaceUsageEvent_workspaceId_metric_occurredAt_idx"
ON "EngageWorkspaceUsageEvent"("workspaceId", "metric", "occurredAt");

CREATE UNIQUE INDEX "EngageWhiteLabelConfig_workspaceId_key"
ON "EngageWhiteLabelConfig"("workspaceId");

CREATE UNIQUE INDEX "EngageCustomDomain_hostname_key"
ON "EngageCustomDomain"("hostname");

CREATE INDEX "EngageCustomDomain_workspaceId_status_idx"
ON "EngageCustomDomain"("workspaceId", "status");

CREATE UNIQUE INDEX "EngageDeveloperRequestLog_workspaceId_requestId_key"
ON "EngageDeveloperRequestLog"("workspaceId", "requestId");

CREATE INDEX "EngageDeveloperRequestLog_workspaceId_occurredAt_idx"
ON "EngageDeveloperRequestLog"("workspaceId", "occurredAt");

CREATE INDEX "EngageDeveloperRequestLog_apiKeyWorkspaceId_apiKeyId_occurredAt_idx"
ON "EngageDeveloperRequestLog"("apiKeyWorkspaceId", "apiKeyId", "occurredAt");

ALTER TABLE "EngageAgencyWorkspaceLink"
ADD CONSTRAINT "EngageAgencyWorkspaceLink_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageAgencyWorkspaceLink"
ADD CONSTRAINT "EngageAgencyWorkspaceLink_agencyWorkspaceId_fkey"
FOREIGN KEY ("agencyWorkspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageWorkspaceSaasState"
ADD CONSTRAINT "EngageWorkspaceSaasState_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngagePublicApiKey"
ADD CONSTRAINT "EngagePublicApiKey_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageWorkspaceUsageEvent"
ADD CONSTRAINT "EngageWorkspaceUsageEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageWhiteLabelConfig"
ADD CONSTRAINT "EngageWhiteLabelConfig_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageCustomDomain"
ADD CONSTRAINT "EngageCustomDomain_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageDeveloperRequestLog"
ADD CONSTRAINT "EngageDeveloperRequestLog_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageDeveloperRequestLog"
ADD CONSTRAINT "EngageDeveloperRequestLog_apiKeyWorkspaceId_apiKeyId_fkey"
FOREIGN KEY ("apiKeyWorkspaceId", "apiKeyId")
REFERENCES "EngagePublicApiKey"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 16E — Enterprise outbound webhook control-plane persistence.
-- Additive only. This does not activate network delivery or provider writes.

CREATE TABLE "EngageOutboundWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "algorithm" TEXT NOT NULL DEFAULT 'AES_256_GCM',
    "keyVersion" TEXT NOT NULL,
    "initializationVector" TEXT NOT NULL,
    "authenticationTag" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngageOutboundWebhookEndpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageOutboundWebhookEndpoint_status_check"
      CHECK ("status" IN ('ACTIVE', 'PAUSED', 'REVOKED')),
    CONSTRAINT "EngageOutboundWebhookEndpoint_algorithm_check"
      CHECK ("algorithm" = 'AES_256_GCM'),
    CONSTRAINT "EngageOutboundWebhookEndpoint_secret_material_check"
      CHECK (
        length("keyVersion") BETWEEN 1 AND 64
        AND length("initializationVector") > 0
        AND length("authenticationTag") > 0
        AND length("ciphertext") > 0
      ),
    CONSTRAINT "EngageOutboundWebhookEndpoint_events_check"
      CHECK (
        jsonb_typeof("events") = 'array'
        AND jsonb_array_length("events") > 0
      )
);

CREATE UNIQUE INDEX "EngageOutboundWebhookEndpoint_workspaceId_id_key"
ON "EngageOutboundWebhookEndpoint"("workspaceId", "id");

CREATE UNIQUE INDEX "EngageOutboundWebhookEndpoint_workspaceId_name_key"
ON "EngageOutboundWebhookEndpoint"("workspaceId", "name");

CREATE INDEX "EngageOutboundWebhookEndpoint_workspaceId_status_createdAt_idx"
ON "EngageOutboundWebhookEndpoint"("workspaceId", "status", "createdAt");

ALTER TABLE "EngageOutboundWebhookEndpoint"
ADD CONSTRAINT "EngageOutboundWebhookEndpoint_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "EngageWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

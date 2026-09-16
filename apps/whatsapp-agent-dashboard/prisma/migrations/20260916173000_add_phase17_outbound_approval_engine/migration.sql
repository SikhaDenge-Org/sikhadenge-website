-- Phase17-G2 persisted human approval for one-time outbound WhatsApp writes.
-- Approval is bound to workspace, connection, queued message and controlled-launch state version.

CREATE TABLE "EngageControlledLaunchOutboundApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "controlledLaunchStateVersion" INTEGER NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngageControlledLaunchOutboundApproval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageControlledLaunchOutboundApproval_state_version_check"
        CHECK ("controlledLaunchStateVersion" >= 1),
    CONSTRAINT "EngageControlledLaunchOutboundApproval_expiry_check"
        CHECK ("expiresAt" > "approvedAt"),
    CONSTRAINT "EngageControlledLaunchOutboundApproval_terminal_state_check"
        CHECK (NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL))
);

CREATE INDEX "EngageControlledLaunchOutboundApproval_workspace_connection_expiry_idx"
    ON "EngageControlledLaunchOutboundApproval"("workspaceId", "connectionId", "expiresAt");
CREATE INDEX "EngageControlledLaunchOutboundApproval_message_created_idx"
    ON "EngageControlledLaunchOutboundApproval"("messageId", "createdAt");
CREATE INDEX "EngageControlledLaunchOutboundApproval_active_lookup_idx"
    ON "EngageControlledLaunchOutboundApproval"("workspaceId", "connectionId", "messageId", "controlledLaunchStateVersion")
    WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "EngageControlledLaunchOutboundApproval"
    ADD CONSTRAINT "EngageControlledLaunchOutboundApproval_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchOutboundApproval"
    ADD CONSTRAINT "EngageControlledLaunchOutboundApproval_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchOutboundApproval"
    ADD CONSTRAINT "EngageControlledLaunchOutboundApproval_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "WhatsAppMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchOutboundApproval"
    ADD CONSTRAINT "EngageControlledLaunchOutboundApproval_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "DashboardUser"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase17-G3 bounded-autopilot distinct-recipient exposure ledger.
CREATE TABLE "EngageControlledLaunchAutopilotRecipient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "controlledLaunchStateVersion" INTEGER NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "firstMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngageControlledLaunchAutopilotRecipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageControlledLaunchAutopilotRecipient_state_version_check"
        CHECK ("controlledLaunchStateVersion" >= 1),
    CONSTRAINT "EngageControlledLaunchAutopilotRecipient_recipient_check"
        CHECK (length(trim("recipientKey")) > 0)
);

CREATE UNIQUE INDEX "EngageControlledLaunchAutopilotRecipient_scope_recipient_key"
    ON "EngageControlledLaunchAutopilotRecipient"("workspaceId", "controlledLaunchStateVersion", "recipientKey");
CREATE INDEX "EngageControlledLaunchAutopilotRecipient_scope_count_idx"
    ON "EngageControlledLaunchAutopilotRecipient"("workspaceId", "controlledLaunchStateVersion", "createdAt");

ALTER TABLE "EngageControlledLaunchAutopilotRecipient"
    ADD CONSTRAINT "EngageControlledLaunchAutopilotRecipient_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchAutopilotRecipient"
    ADD CONSTRAINT "EngageControlledLaunchAutopilotRecipient_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchAutopilotRecipient"
    ADD CONSTRAINT "EngageControlledLaunchAutopilotRecipient_firstMessageId_fkey"
    FOREIGN KEY ("firstMessageId") REFERENCES "WhatsAppMessage"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

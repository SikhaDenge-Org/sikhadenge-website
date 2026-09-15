ALTER TABLE "EngageEmailAutomationEvent"
ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "EngageEmailAutomationEvent_workspaceId_status_availableAt_idx"
ON "EngageEmailAutomationEvent"("workspaceId", "status", "availableAt");

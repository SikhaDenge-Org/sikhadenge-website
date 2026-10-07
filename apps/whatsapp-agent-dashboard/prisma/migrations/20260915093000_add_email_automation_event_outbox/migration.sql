CREATE TABLE "EngageEmailAutomationEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "relatedTriggers" JSONB NOT NULL,
  "contactId" TEXT,
  "leadId" TEXT,
  "submissionId" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngageEmailAutomationEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngageEmailAutomationEvent_workspaceId_eventKey_key" ON "EngageEmailAutomationEvent"("workspaceId", "eventKey");
CREATE INDEX "EngageEmailAutomationEvent_workspaceId_status_createdAt_idx" ON "EngageEmailAutomationEvent"("workspaceId", "status", "createdAt");
CREATE INDEX "EngageEmailAutomationEvent_workspaceId_trigger_createdAt_idx" ON "EngageEmailAutomationEvent"("workspaceId", "trigger", "createdAt");
CREATE INDEX "EngageEmailAutomationEvent_contactId_createdAt_idx" ON "EngageEmailAutomationEvent"("contactId", "createdAt");
ALTER TABLE "EngageEmailAutomationEvent" ADD CONSTRAINT "EngageEmailAutomationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

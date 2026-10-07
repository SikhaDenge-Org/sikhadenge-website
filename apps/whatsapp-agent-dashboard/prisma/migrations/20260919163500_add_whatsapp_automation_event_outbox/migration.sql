CREATE TABLE "EngageWhatsAppAutomationEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "relatedTriggers" JSONB,
  "conversationId" TEXT,
  "contactId" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngageWhatsAppAutomationEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngageWhatsAppAutomationEvent_workspaceId_eventKey_key" ON "EngageWhatsAppAutomationEvent"("workspaceId", "eventKey");
CREATE INDEX "EngageWhatsAppAutomationEvent_workspaceId_status_availableAt_createdAt_idx" ON "EngageWhatsAppAutomationEvent"("workspaceId", "status", "availableAt", "createdAt");
CREATE INDEX "EngageWhatsAppAutomationEvent_conversationId_createdAt_idx" ON "EngageWhatsAppAutomationEvent"("conversationId", "createdAt");
CREATE INDEX "EngageWhatsAppAutomationEvent_contactId_createdAt_idx" ON "EngageWhatsAppAutomationEvent"("contactId", "createdAt");

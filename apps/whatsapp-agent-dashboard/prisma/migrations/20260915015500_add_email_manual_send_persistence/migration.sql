CREATE TABLE "EngageEmailMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateVersionId" TEXT,
  "connectionId" TEXT NOT NULL,
  "senderIdentityId" TEXT NOT NULL,
  "senderResolutionSource" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "runtimeMode" TEXT NOT NULL,
  "toRecipients" JSONB NOT NULL,
  "ccRecipients" JSONB NOT NULL,
  "bccRecipients" JSONB NOT NULL,
  "replyTo" JSONB,
  "subject" TEXT NOT NULL,
  "preheader" TEXT,
  "htmlBody" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "variables" JSONB NOT NULL,
  "attachments" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "externalRequestSent" BOOLEAN NOT NULL DEFAULT false,
  "lastError" TEXT,
  "createdById" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngageEmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngageEmailMessage_workspaceId_idempotencyKey_key" ON "EngageEmailMessage"("workspaceId", "idempotencyKey");
CREATE INDEX "EngageEmailMessage_workspaceId_status_createdAt_idx" ON "EngageEmailMessage"("workspaceId", "status", "createdAt");
CREATE INDEX "EngageEmailMessage_workspaceId_templateId_createdAt_idx" ON "EngageEmailMessage"("workspaceId", "templateId", "createdAt");
ALTER TABLE "EngageEmailMessage" ADD CONSTRAINT "EngageEmailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

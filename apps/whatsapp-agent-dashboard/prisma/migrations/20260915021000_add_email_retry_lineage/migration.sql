ALTER TABLE "EngageEmailMessage" ADD COLUMN "retryOfMessageId" TEXT;
CREATE INDEX "EngageEmailMessage_workspaceId_retryOfMessageId_createdAt_idx" ON "EngageEmailMessage"("workspaceId", "retryOfMessageId", "createdAt");

CREATE TABLE "EngageEmailInboundMessage" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "connectionId" TEXT, "provider" TEXT NOT NULL, "providerMessageId" TEXT NOT NULL, "providerThreadId" TEXT, "contactId" TEXT, "fromAddress" TEXT NOT NULL, "toRecipients" JSONB NOT NULL, "ccRecipients" JSONB NOT NULL, "replyTo" JSONB, "subject" TEXT NOT NULL, "snippet" TEXT, "bodyText" TEXT, "bodyHtml" TEXT, "attachments" JSONB NOT NULL, "classification" TEXT NOT NULL DEFAULT 'INBOUND', "receivedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailInboundMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailCampaign" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "purpose" TEXT NOT NULL DEFAULT 'MARKETING', "templateId" TEXT NOT NULL, "templateVersionId" TEXT NOT NULL, "senderIdentityId" TEXT, "senderPool" JSONB, "segment" JSONB NOT NULL, "throttlePerHour" INTEGER NOT NULL DEFAULT 100, "frequencyCapPerDay" INTEGER NOT NULL DEFAULT 1, "scheduledAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "pausedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailCampaign_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailCampaignRecipient" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "contactId" TEXT, "email" TEXT NOT NULL, "name" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "idempotencyKey" TEXT NOT NULL, "messageId" TEXT, "scheduledAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailSequence" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "purpose" TEXT NOT NULL DEFAULT 'TRANSACTIONAL', "steps" JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailSequence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailAnalyticsEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "messageId" TEXT, "campaignId" TEXT, "inboundMessageId" TEXT, "contactId" TEXT, "eventType" TEXT NOT NULL, "provider" TEXT, "eventKey" TEXT NOT NULL, "metadata" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EngageEmailAnalyticsEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EngageEmailInboundMessage" ADD CONSTRAINT "EngageEmailInboundMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailCampaign" ADD CONSTRAINT "EngageEmailCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailCampaignRecipient" ADD CONSTRAINT "EngageEmailCampaignRecipient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailCampaignRecipient" ADD CONSTRAINT "EngageEmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EngageEmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailSequence" ADD CONSTRAINT "EngageEmailSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailAnalyticsEvent" ADD CONSTRAINT "EngageEmailAnalyticsEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "EngageEmailInboundMessage_workspaceId_provider_providerMessageId_key" ON "EngageEmailInboundMessage"("workspaceId","provider","providerMessageId");
CREATE INDEX "EngageEmailInboundMessage_workspaceId_providerThreadId_receivedAt_idx" ON "EngageEmailInboundMessage"("workspaceId","providerThreadId","receivedAt");
CREATE INDEX "EngageEmailInboundMessage_workspaceId_contactId_receivedAt_idx" ON "EngageEmailInboundMessage"("workspaceId","contactId","receivedAt");
CREATE INDEX "EngageEmailCampaign_workspaceId_status_scheduledAt_idx" ON "EngageEmailCampaign"("workspaceId","status","scheduledAt");
CREATE UNIQUE INDEX "EngageEmailCampaignRecipient_campaignId_email_key" ON "EngageEmailCampaignRecipient"("campaignId","email");
CREATE UNIQUE INDEX "EngageEmailCampaignRecipient_workspaceId_idempotencyKey_key" ON "EngageEmailCampaignRecipient"("workspaceId","idempotencyKey");
CREATE INDEX "EngageEmailCampaignRecipient_workspaceId_campaignId_status_scheduledAt_idx" ON "EngageEmailCampaignRecipient"("workspaceId","campaignId","status","scheduledAt");
CREATE UNIQUE INDEX "EngageEmailSequence_workspaceId_name_key" ON "EngageEmailSequence"("workspaceId","name");
CREATE INDEX "EngageEmailSequence_workspaceId_status_updatedAt_idx" ON "EngageEmailSequence"("workspaceId","status","updatedAt");
CREATE UNIQUE INDEX "EngageEmailAnalyticsEvent_workspaceId_eventKey_key" ON "EngageEmailAnalyticsEvent"("workspaceId","eventKey");
CREATE INDEX "EngageEmailAnalyticsEvent_workspaceId_eventType_occurredAt_idx" ON "EngageEmailAnalyticsEvent"("workspaceId","eventType","occurredAt");
CREATE INDEX "EngageEmailAnalyticsEvent_workspaceId_campaignId_occurredAt_idx" ON "EngageEmailAnalyticsEvent"("workspaceId","campaignId","occurredAt");
CREATE INDEX "EngageEmailAnalyticsEvent_workspaceId_contactId_occurredAt_idx" ON "EngageEmailAnalyticsEvent"("workspaceId","contactId","occurredAt");

CREATE TABLE "EngageEmailSequenceEnrollment" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sequenceId" TEXT NOT NULL, "contactId" TEXT, "email" TEXT NOT NULL, "name" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "currentStep" INTEGER NOT NULL DEFAULT 0, "nextRunAt" TIMESTAMP(3) NOT NULL, "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailSequenceEnrollment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EngageEmailSequenceEnrollment" ADD CONSTRAINT "EngageEmailSequenceEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailSequenceEnrollment" ADD CONSTRAINT "EngageEmailSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EngageEmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "EngageEmailSequenceEnrollment_sequenceId_email_key" ON "EngageEmailSequenceEnrollment"("sequenceId","email");
CREATE INDEX "EngageEmailSequenceEnrollment_workspaceId_status_nextRunAt_idx" ON "EngageEmailSequenceEnrollment"("workspaceId","status","nextRunAt");

CREATE TABLE "EngageEmailAutomationTask" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "contactId" TEXT, "leadId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "dueAt" TIMESTAMP(3), "assignedToId" TEXT, "sourceFlowId" TEXT, "sourceEventId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EngageEmailAutomationTask_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EngageEmailAutomationTask" ADD CONSTRAINT "EngageEmailAutomationTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "EngageEmailAutomationTask_workspaceId_status_dueAt_idx" ON "EngageEmailAutomationTask"("workspaceId","status","dueAt");
CREATE INDEX "EngageEmailAutomationTask_workspaceId_contactId_createdAt_idx" ON "EngageEmailAutomationTask"("workspaceId","contactId","createdAt");

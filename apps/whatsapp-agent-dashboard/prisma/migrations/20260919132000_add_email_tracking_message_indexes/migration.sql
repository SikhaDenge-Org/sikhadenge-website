CREATE INDEX "EngageEmailCampaignRecipient_workspaceId_messageId_idx"
ON "EngageEmailCampaignRecipient"("workspaceId","messageId");

CREATE INDEX "EngageEmailAnalyticsEvent_workspaceId_messageId_idx"
ON "EngageEmailAnalyticsEvent"("workspaceId","messageId");

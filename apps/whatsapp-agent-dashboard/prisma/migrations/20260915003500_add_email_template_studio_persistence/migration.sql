-- E2 Email Template Studio persistence. Additive only; no existing data is rewritten.
CREATE TABLE "EngageEmailTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "defaultSenderIdentityId" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngageEmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailTemplateVersion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "preheader" TEXT,
  "document" JSONB NOT NULL,
  "variables" JSONB NOT NULL,
  "defaultSenderIdentityId" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngageEmailTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngageEmailTemplateAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngageEmailTemplateAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngageEmailTemplate_workspaceId_name_key" ON "EngageEmailTemplate"("workspaceId", "name");
CREATE INDEX "EngageEmailTemplate_workspaceId_status_category_updatedAt_idx" ON "EngageEmailTemplate"("workspaceId", "status", "category", "updatedAt");
CREATE UNIQUE INDEX "EngageEmailTemplateVersion_templateId_version_key" ON "EngageEmailTemplateVersion"("templateId", "version");
CREATE INDEX "EngageEmailTemplateVersion_workspaceId_templateId_createdAt_idx" ON "EngageEmailTemplateVersion"("workspaceId", "templateId", "createdAt");
CREATE UNIQUE INDEX "EngageEmailTemplateAsset_versionId_storageKey_key" ON "EngageEmailTemplateAsset"("versionId", "storageKey");
CREATE INDEX "EngageEmailTemplateAsset_workspaceId_templateId_createdAt_idx" ON "EngageEmailTemplateAsset"("workspaceId", "templateId", "createdAt");
ALTER TABLE "EngageEmailTemplate" ADD CONSTRAINT "EngageEmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailTemplateVersion" ADD CONSTRAINT "EngageEmailTemplateVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailTemplateVersion" ADD CONSTRAINT "EngageEmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EngageEmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailTemplateAsset" ADD CONSTRAINT "EngageEmailTemplateAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailTemplateAsset" ADD CONSTRAINT "EngageEmailTemplateAsset_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EngageEmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageEmailTemplateAsset" ADD CONSTRAINT "EngageEmailTemplateAsset_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EngageEmailTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

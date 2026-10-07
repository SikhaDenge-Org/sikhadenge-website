CREATE TABLE "EngageControlledLaunchApprovedFlow" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "controlledLaunchStateVersion" INTEGER NOT NULL,
  "flowType" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "flowVersion" INTEGER NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngageControlledLaunchApprovedFlow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngageControlledLaunchApprovedFlow_version_check" CHECK ("controlledLaunchStateVersion" >= 1 AND "flowVersion" >= 1)
);
CREATE UNIQUE INDEX "EngageControlledLaunchApprovedFlow_active_unique" ON "EngageControlledLaunchApprovedFlow"("workspaceId","connectionId","controlledLaunchStateVersion","flowType","flowId","flowVersion") WHERE "revokedAt" IS NULL;
CREATE INDEX "EngageControlledLaunchApprovedFlow_lookup_idx" ON "EngageControlledLaunchApprovedFlow"("workspaceId","connectionId","controlledLaunchStateVersion","flowType","flowId","flowVersion");
ALTER TABLE "EngageControlledLaunchApprovedFlow" ADD CONSTRAINT "EngageControlledLaunchApprovedFlow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchApprovedFlow" ADD CONSTRAINT "EngageControlledLaunchApprovedFlow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EngageChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngageControlledLaunchApprovedFlow" ADD CONSTRAINT "EngageControlledLaunchApprovedFlow_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "DashboardUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase17-G5 approved-flow operator revocation audit.
ALTER TABLE "EngageControlledLaunchApprovedFlow"
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "revokeReason" TEXT;

ALTER TABLE "EngageControlledLaunchApprovedFlow"
  ADD CONSTRAINT "EngageControlledLaunchApprovedFlow_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "DashboardUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "EngageControlledLaunchApprovedFlow_revocation_idx"
  ON "EngageControlledLaunchApprovedFlow"("workspaceId", "revokedAt", "approvedAt");

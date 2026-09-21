import { DashboardRole } from "@prisma/client";

import CampaignControlCenter from "../../components/campaigns/CampaignControlCenter";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Campaigns"
      eyebrow="Targeted student outreach"
      title="Campaigns & Targeting"
      description="Build consent-safe audiences, personalise approved templates, schedule controlled batches and monitor campaign delivery from the SikhaDenge dashboard."
      userName={user.name}
      userRole={user.role}
    >
      <CampaignControlCenter />
    </DashboardModuleShell>
  );
}

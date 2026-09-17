import { DashboardRole } from "@prisma/client";

import AnalyticsManager from "../../components/analytics/AnalyticsManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
    DashboardRole.ANALYST,
    DashboardRole.COUNSELOR,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Analytics"
      eyebrow="Performance and retargeting"
      title="Analytics & Retargeting"
      description="Review messaging, AI quality, lead outcomes, campaign delivery, automation performance and consent-safe retargeting audiences."
      userName={user.name}
      userRole={user.role}
    >
      <AnalyticsManager />
    </DashboardModuleShell>
  );
}

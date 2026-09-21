import { DashboardRole } from "@prisma/client";

import EngagementManager from "../../components/engagement/EngagementManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EngagementPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
    DashboardRole.COUNSELOR,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Engagement"
      eyebrow="Student conversion operations"
      title="Forms, Appointments & Payments"
      description="Capture structured lead information, schedule counselling and demo sessions, and maintain a controlled fee-payment ledger."
      userName={user.name}
      userRole={user.role}
    >
      <EngagementManager />
    </DashboardModuleShell>
  );
}

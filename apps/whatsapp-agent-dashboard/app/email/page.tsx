import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";
import EmailWorkspaceNav from "../../modules/email-automation/ui/EmailWorkspaceNav";
import EmailWorkspaceOverview from "../../modules/email-automation/ui/EmailWorkspaceOverview";
import "../dashboard-system.css";

export const dynamic = "force-dynamic";

export default async function EmailControlCenterPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email channel"
      title="Email Automation"
      description="A focused operating system for accounts, templates, delivery and automation."
      userName={user.name}
      userRole={user.role}
    >
      <EmailWorkspaceNav />
      <EmailWorkspaceOverview />
    </DashboardModuleShell>
  );
}

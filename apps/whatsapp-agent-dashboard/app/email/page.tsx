import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";
import EmailSenderManager from "../../modules/email-automation/ui/EmailSenderManager";
import EmailTemplateStudio from "../../modules/email-automation/ui/EmailTemplateStudio";
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
      title="Email Automation Control Center"
      description="Connect and verify Google Workspace sender accounts, manage aliases and choose the workspace default while outbound delivery remains locked behind the E3 gate."
      userName={user.name}
      userRole={user.role}
    >
      <EmailSenderManager />
      <EmailTemplateStudio />
    </DashboardModuleShell>
  );
}

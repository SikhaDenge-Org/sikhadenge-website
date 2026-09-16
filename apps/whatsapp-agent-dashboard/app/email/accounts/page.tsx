import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailSenderManager from "../../../modules/email-automation/ui/EmailSenderManager";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

export default async function EmailAccountsPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Accounts"
      title="Accounts & Senders"
      description="Connect Google Workspace, manage verified identities and choose the default sender."
      userName={user.name}
      userRole={user.role}
    >
      <EmailWorkspaceNav />
      <EmailSenderManager />
    </DashboardModuleShell>
  );
}

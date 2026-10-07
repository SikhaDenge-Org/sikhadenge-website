import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailSenderManager from "../../../modules/email-automation/ui/EmailSenderManager";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailAccountsPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Accounts"
      title="Email Accounts"
      description="Connect Google Workspace, manage verified identities and choose the default sender."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceNav />
        <EmailSenderManager />
      </div>
    </DashboardModuleShell>
  );
}

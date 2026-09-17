import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailInboxWorkspace from "../../../modules/email-automation/ui/EmailInboxWorkspace";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailInboxPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Inbox"
      title="Unified Email Inbox"
      description="Read Gmail threads, sync inbound history, inspect CRM context and send guarded replies from one workspace."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceNav />
        <EmailInboxWorkspace />
      </div>
    </DashboardModuleShell>
  );
}

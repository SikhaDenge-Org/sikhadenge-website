import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailManualComposer from "../../../modules/email-automation/ui/EmailManualComposer";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailSendPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Send"
      title="Manual Send"
      description="Run guarded dry-run and internal-recipient delivery from a dedicated sending workspace."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceNav />
        <EmailManualComposer />
      </div>
    </DashboardModuleShell>
  );
}

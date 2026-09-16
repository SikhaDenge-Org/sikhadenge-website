import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailAutomationQueue from "../../../modules/email-automation/ui/EmailAutomationQueue";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailAutomationPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Automation"
      title="Automation Runtime"
      description="Inspect queue state, process pending work and monitor guarded email automation."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceNav />
        <EmailAutomationQueue />
      </div>
    </DashboardModuleShell>
  );
}

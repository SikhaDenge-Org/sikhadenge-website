import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";
import EmailWorkspaceOverview from "../../modules/email-automation/ui/EmailWorkspaceOverview";
import "../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({
  subsets: ["latin"],
  display: "swap",
});

export default async function EmailControlCenterPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email channel"
      title="Email Command Center"
      description="Send smarter. Automate faster. Deliver everywhere."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceOverview />
      </div>
    </DashboardModuleShell>
  );
}

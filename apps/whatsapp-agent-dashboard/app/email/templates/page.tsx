import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailTemplateStudio from "../../../modules/email-automation/ui/EmailTemplateStudio";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailTemplatesPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN, DashboardRole.MANAGER]);
  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email · Templates"
      title="Template Studio"
      description="Build, preview and approve reusable branded email experiences."
      userName={user.name}
      userRole={user.role}
    >
      <div className={emailManrope.className}>
        <EmailWorkspaceNav />
        <EmailTemplateStudio />
      </div>
    </DashboardModuleShell>
  );
}

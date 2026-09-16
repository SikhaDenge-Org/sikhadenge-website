import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailTemplateStudio from "../../../modules/email-automation/ui/EmailTemplateStudio";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";

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
      <EmailWorkspaceNav />
      <EmailTemplateStudio />
    </DashboardModuleShell>
  );
}

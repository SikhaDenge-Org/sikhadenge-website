import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import TemplateManager from "../../components/templates/TemplateManager";
import { requireDashboardUser } from "../../lib/auth/session";
import "../dashboard-system.css";
import "./template-studio.css";
import "./template-studio-v3.css";
import "./templates-enterprise-polish.css";
import "./templates-enterprise-cascade.css";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Templates"
      eyebrow="WhatsApp Business Platform"
      title="Template Studio"
      description="Create, preview and submit WhatsApp message templates for Meta approval."
      userName={user.name}
      userRole={user.role}
    >
      <TemplateManager />
    </DashboardModuleShell>
  );
}

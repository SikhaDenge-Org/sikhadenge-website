import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import TemplateManager from "../../components/templates/TemplateManager";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Templates"
      eyebrow="Meta-approved outreach content"
      title="Template Centre"
      description="Create controlled WhatsApp template drafts, submit them to Meta for review, sync approval status and make approved templates available to Inbox and Campaigns."
      userName={user.name}
      userRole={user.role}
    >
      <TemplateManager />
    </DashboardModuleShell>
  );
}

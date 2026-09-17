import { DashboardRole } from "@prisma/client";

import IntegrationsManager from "../../components/integrations/IntegrationsManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Connected systems"
      title="Integrations & Developer API"
      description="Register provider metadata, verify environment readiness and perform safe dry-run validation without storing secrets or sending external requests."
      userName={user.name}
      userRole={user.role}
    >
      <IntegrationsManager />
    </DashboardModuleShell>
  );
}

import { DashboardRole } from "@prisma/client";

import CutoverReadinessManager from "../../components/cutover/CutoverReadinessManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CutoverPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN]);

  return (
    <DashboardModuleShell
      activeTitle="Cutover"
      eyebrow="Final migration control"
      title="Meta Cutover Readiness"
      description="Audit the production prerequisites for phone registration, webhook ownership, AiSensy removal, outbound activation and final login consolidation without executing external changes."
      userName={user.name}
      userRole={user.role}
    >
      <CutoverReadinessManager />
    </DashboardModuleShell>
  );
}

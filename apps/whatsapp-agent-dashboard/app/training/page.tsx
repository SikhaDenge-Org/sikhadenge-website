import AgentTrainingManager from "../../components/training/AgentTrainingManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AgentTrainingPage() {
  const user = await requireDashboardUser();
  const canManage = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <DashboardModuleShell
      activeTitle="Agent Training"
      eyebrow="Supervised answer control"
      title="Agent Training"
      description="View the active Question Bank, teach exact question-answer pairs, approve unknown questions, test replies safely and understand the complete student chat flow."
      userName={user.name}
      userRole={user.role}
    >
      <AgentTrainingManager canManage={canManage} />
    </DashboardModuleShell>
  );
}

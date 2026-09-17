import LiveAgentManager from "../../components/agent/LiveAgentManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireDashboardUser();

  return (
    <DashboardModuleShell
      activeTitle="Settings"
      eyebrow="System controls"
      title="Settings"
      description="Review AI runtime, webhook analysis, safety gates, human handoff and final-cutover readiness from the protected SikhaDenge dashboard."
      userName={user.name}
      userRole={user.role}
    >
      <LiveAgentManager />
    </DashboardModuleShell>
  );
}

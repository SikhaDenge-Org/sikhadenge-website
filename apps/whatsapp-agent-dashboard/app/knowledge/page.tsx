import KnowledgeManager from "../../components/knowledge/KnowledgeManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await requireDashboardUser();
  const canManage = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <DashboardModuleShell
      activeTitle="Knowledge"
      eyebrow="Approved answer source"
      title="Knowledge Base"
      description="Manually add course, fee, schedule, admission, policy and FAQ information. Every new version remains in review until an administrator or manager approves it for AI replies."
      userName={user.name}
      userRole={user.role}
    >
      <KnowledgeManager canManage={canManage} />
    </DashboardModuleShell>
  );
}

import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import TeamChatManager from "../../components/team/TeamChatManager";
import { requireDashboardUser } from "../../lib/auth/session";
import { listTeamOverview } from "../../lib/team/team-chat-service";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
    DashboardRole.COUNSELOR,
  ]);
  const overview = await listTeamOverview({ id: user.id, role: user.role });

  return (
    <DashboardModuleShell
      activeTitle="Team"
      eyebrow="Multi-agent operations"
      title="Team Live Chat"
      description="Shared queue, counselor presence, collision-safe ownership, supervised transfers and human takeover are controlled here."
      userName={user.name}
      userRole={user.role}
    >
      <TeamChatManager initialOverview={overview} />
    </DashboardModuleShell>
  );
}

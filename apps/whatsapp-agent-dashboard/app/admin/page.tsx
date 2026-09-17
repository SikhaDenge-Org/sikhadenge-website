import { DashboardRole } from "@prisma/client";

import AdminManager from "../../components/admin/AdminManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN]);

  return (
    <DashboardModuleShell
      activeTitle="Admin"
      eyebrow="Security and governance"
      title="Admin & Security"
      description="Manage role-protected access, revoke sessions, review login risk, inspect audit history and verify production safety controls."
      userName={user.name}
      userRole={user.role}
    >
      <AdminManager />
    </DashboardModuleShell>
  );
}

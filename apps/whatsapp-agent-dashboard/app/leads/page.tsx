import LeadManager from "../../components/leads/LeadManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const user = await requireDashboardUser();

  return (
    <DashboardModuleShell
      activeTitle="Leads"
      eyebrow="Admission pipeline"
      title="Leads & Counselor Operations"
      description="Qualify student enquiries, assign counselors, schedule follow-ups and move every admission through a controlled pipeline."
      userName={user.name}
      userRole={user.role}
    >
      <LeadManager userRole={user.role} />
    </DashboardModuleShell>
  );
}

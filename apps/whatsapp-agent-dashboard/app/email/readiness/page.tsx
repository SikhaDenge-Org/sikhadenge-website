import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";
import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import EmailReadinessDashboard from "../../../modules/email-automation/ui/EmailReadinessDashboard";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";
const emailManrope=Manrope({subsets:["latin"],display:"swap"});
export default async function EmailReadinessPage(){
  const user=await requireDashboardUser([DashboardRole.ADMIN,DashboardRole.MANAGER]);
  return <DashboardModuleShell activeTitle="Integrations" eyebrow="Email · Operations" title="Email Readiness" description="Monitor email delivery evidence and runtime safeguards without modifying sending." userName={user.name} userRole={user.role}>
    <div className={emailManrope.className}><EmailWorkspaceNav/><EmailReadinessDashboard/></div>
  </DashboardModuleShell>;
}

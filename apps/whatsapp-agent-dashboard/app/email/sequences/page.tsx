import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailSequencesWorkspace from "../../../modules/email-automation/ui/EmailSequencesWorkspace";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";
const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailSequencesPage(){
  const user=await requireDashboardUser([DashboardRole.ADMIN,DashboardRole.MANAGER]);
  return <DashboardModuleShell activeTitle="Integrations" eyebrow="Email · Sequences" title="Lifecycle Journey Studio" description="Create reusable multi-step email journeys with pinned templates, guarded enrollment and per-recipient progression." userName={user.name} userRole={user.role}><div className={emailManrope.className}><EmailWorkspaceNav/><EmailSequencesWorkspace/></div></DashboardModuleShell>;
}

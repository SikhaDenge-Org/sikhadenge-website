import { DashboardRole } from "@prisma/client";
import { Manrope } from "next/font/google";

import DashboardModuleShell from "../../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../../lib/auth/session";
import EmailCampaignsWorkspace from "../../../modules/email-automation/ui/EmailCampaignsWorkspace";
import EmailWorkspaceNav from "../../../modules/email-automation/ui/EmailWorkspaceNav";
import "../../dashboard-system.css";

export const dynamic = "force-dynamic";
const emailManrope = Manrope({ subsets: ["latin"], display: "swap" });

export default async function EmailCampaignsPage(){
  const user=await requireDashboardUser([DashboardRole.ADMIN,DashboardRole.MANAGER]);
  return <DashboardModuleShell activeTitle="Integrations" eyebrow="Email · Campaigns" title="Campaign Control Center" description="Build segmented, consent-aware campaigns with guarded scheduling, sender pools, throttling and per-recipient execution state." userName={user.name} userRole={user.role}><div className={emailManrope.className}><EmailWorkspaceNav/><EmailCampaignsWorkspace/></div></DashboardModuleShell>;
}

import { DashboardRole } from "@prisma/client";

import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";
import EmailAutomationQueue from "../../modules/email-automation/ui/EmailAutomationQueue";
import EmailPlatformOverview from "../../modules/email-automation/ui/EmailPlatformOverview";
import EmailManualComposer from "../../modules/email-automation/ui/EmailManualComposer";
import EmailSenderManager from "../../modules/email-automation/ui/EmailSenderManager";
import EmailTemplateStudio from "../../modules/email-automation/ui/EmailTemplateStudio";
import "../dashboard-system.css";

export const dynamic = "force-dynamic";

export default async function EmailControlCenterPage() {
  const user = await requireDashboardUser([
    DashboardRole.ADMIN,
    DashboardRole.MANAGER,
  ]);

  return (
    <DashboardModuleShell
      activeTitle="Integrations"
      eyebrow="Email channel"
      title="Email Automation Control Center"
      description="Operate the full E0�E8 email platform: senders, templates, transactional email, CRM automation, inbound, campaigns, analytics and provider readiness under guarded runtime controls."
      userName={user.name}
      userRole={user.role}
    >
      <EmailSenderManager />
      <EmailTemplateStudio />
      <EmailManualComposer />
      <EmailAutomationQueue />
    </DashboardModuleShell>
  );
}

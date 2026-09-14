import ContactManager from "../../components/contacts/ContactManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";
import "../dashboard-system.css";
import "../core-workflows-refinement.css";
import "./contacts-enterprise-polish.css";
import "./contacts-live-v20.css";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const user = await requireDashboardUser();

  return (
    <DashboardModuleShell
      activeTitle="Contacts"
      eyebrow="Customer Intelligence"
      title="Contacts"
      description="Unified customer intelligence across WhatsApp, lifecycle, ownership, consent and follow-up signals."
      userName={user.name}
      userRole={user.role}
    >
      <ContactManager userRole={user.role} />
    </DashboardModuleShell>
  );
}

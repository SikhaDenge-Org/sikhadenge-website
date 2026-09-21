import ContactManager from "../../components/contacts/ContactManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import { requireDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const user = await requireDashboardUser();

  return (
    <DashboardModuleShell
      activeTitle="Contacts"
      eyebrow="Student CRM"
      title="Contacts"
      description="Manage learner profiles, consent, ownership, tags, course interest, CSV import and conversation access from one protected directory."
      userName={user.name}
      userRole={user.role}
    >
      <ContactManager userRole={user.role} />
    </DashboardModuleShell>
  );
}

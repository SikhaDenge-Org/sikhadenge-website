import InboxDashboardV2 from "../../components/inbox/InboxDashboardV2";
import LogoutButton from "../../components/auth/LogoutButton";
import { requireDashboardUser } from "../../lib/auth/session";
import {
  getInboxConversation,
  listInboxConversations,
} from "../../lib/inbox/conversation-repository";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: { conversation?: string };
}) {
  const user = await requireDashboardUser();
  const conversations = await listInboxConversations();
  const requestedId = searchParams?.conversation?.trim() || null;
  const initialId =
    requestedId && conversations.some((item) => item.id === requestedId)
      ? requestedId
      : conversations[0]?.id ?? null;
  const initialConversation = initialId
    ? await getInboxConversation(initialId)
    : null;

  return (
    <>
      <div className="session-toolbar" aria-label="Signed-in account">
        <span>
          <strong>{user.name}</strong>
          <small>{user.role.toLowerCase()}</small>
        </span>
        <LogoutButton />
      </div>
      <InboxDashboardV2
        initialConversations={conversations}
        initialConversation={initialConversation}
      />
    </>
  );
}

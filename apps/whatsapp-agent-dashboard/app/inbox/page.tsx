import InboxDashboardV2 from "../../components/inbox/InboxDashboardV2";
import CoreWorkflowShortcuts from "../../components/navigation/CoreWorkflowShortcuts";
import { requireDashboardUser } from "../../lib/auth/session";
import {
  getInboxConversation,
  listInboxConversations,
} from "../../lib/inbox/conversation-repository";
import "../inbox-rebuild.css";
import "../core-workflows-refinement.css";
import "../inbox-enterprise-final.css";
import "../inbox-page02.css";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: { conversation?: string; conversationId?: string };
}) {
  const user = await requireDashboardUser();
  const conversations =
    await listInboxConversations(
      null,
      "RECENT",
    );
  const requestedId =
    searchParams?.conversation?.trim() ||
    searchParams?.conversationId?.trim() ||
    null;
  const initialId =
    requestedId && conversations.some((item) => item.id === requestedId)
      ? requestedId
      : conversations[0]?.id ?? null;
  const initialConversation = initialId
    ? await getInboxConversation(initialId)
    : null;

  return (
    <>
      <CoreWorkflowShortcuts />
      <InboxDashboardV2
        initialConversations={conversations}
        initialConversation={initialConversation}
        userName={user.name}
        userRole={user.role.toLowerCase()}
      />
    </>
  );
}

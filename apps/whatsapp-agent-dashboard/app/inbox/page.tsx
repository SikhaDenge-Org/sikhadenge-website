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
import "../page02-inbox-standard-v16.css";
import "../page02-inbox-future-v17.css";
import "../page02-right-intelligence-v18.css";
import "../page02-right-intelligence-v19.css";
import "../page02-inbox-futuristic-v20.css";
import "../page02-inbox-structural-v22.css";

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
      <style>{`
        .sx-inbox > .sx-list > .sx-channels-chips {
          display: none !important;
        }
      `}</style>
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
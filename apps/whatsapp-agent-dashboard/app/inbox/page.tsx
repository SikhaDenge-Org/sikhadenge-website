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
import "../page02-inbox-enforce-v21.css";
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

        /* Qualification score only — linear 1–100 progress UI. */
        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score {
          display: block !important;
          margin-top: 14px !important;
          padding: 16px !important;
          overflow: hidden !important;
          border: 1px solid #dbe7fb !important;
          border-radius: 18px !important;
          background:
            radial-gradient(circle at 92% 7%, rgba(59, 109, 246, .08), transparent 29%),
            linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
          box-shadow: 0 10px 28px rgba(54, 93, 170, .07) !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring {
          --sx-track-y: 58px;
          position: relative !important;
          display: flex !important;
          align-items: baseline !important;
          gap: 6px !important;
          width: 100% !important;
          height: 94px !important;
          min-width: 0 !important;
          padding: 0 !important;
          border-radius: 0 !important;
          counter-reset: sx-score-value var(--sx-score);
          background:
            linear-gradient(90deg, #3b6df6 0%, #22c9df 100%) 0 var(--sx-track-y) / calc(var(--sx-score) * 1%) 10px no-repeat,
            linear-gradient(90deg, #edf2f8 0%, #e8edf5 100%) 0 var(--sx-track-y) / 100% 10px no-repeat !important;
          box-shadow: none !important;
          filter: none !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring::before {
          content: "" !important;
          position: absolute !important;
          inset: auto !important;
          top: calc(var(--sx-track-y) - 4px) !important;
          left: clamp(9px, calc(var(--sx-score) * 1%), calc(100% - 9px)) !important;
          width: 18px !important;
          height: 18px !important;
          transform: translateX(-50%) !important;
          border: 4px solid #ffffff !important;
          border-radius: 50% !important;
          background: #2563eb !important;
          box-shadow: 0 3px 11px rgba(37, 99, 235, .34) !important;
          z-index: 3 !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring::after {
          content: counter(sx-score-value) "%" !important;
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          left: auto !important;
          bottom: auto !important;
          width: auto !important;
          height: auto !important;
          min-width: 52px !important;
          padding: 6px 10px !important;
          border: 1px solid #dce8ff !important;
          border-radius: 999px !important;
          background: #eef5ff !important;
          color: #2563eb !important;
          font-size: 12px !important;
          font-weight: 750 !important;
          line-height: 1 !important;
          text-align: center !important;
          box-shadow: none !important;
          transform: none !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > strong {
          position: static !important;
          display: inline !important;
          color: #13213d !important;
          font-size: 30px !important;
          font-weight: 750 !important;
          line-height: 1 !important;
          letter-spacing: -.035em !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span {
          position: static !important;
          display: inline !important;
          width: auto !important;
          color: #8796b2 !important;
          font-size: 18px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span::before,
        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span::after {
          position: absolute !important;
          top: 76px !important;
          color: #8d9bb5 !important;
          font-size: 10.5px !important;
          font-weight: 650 !important;
          line-height: 1 !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span::before {
          content: "1" !important;
          left: 0 !important;
          right: auto !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span::after {
          content: "100" !important;
          right: 0 !important;
          left: auto !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > div:last-child {
          width: 100% !important;
          min-width: 0 !important;
          padding-top: 2px !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > div:last-child > strong {
          display: block !important;
          color: #13213d !important;
          font-size: 15px !important;
          font-weight: 750 !important;
          line-height: 1.25 !important;
        }

        body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > div:last-child > p {
          margin-top: 6px !important;
          color: #7b8ba8 !important;
          font-size: 12px !important;
          line-height: 1.45 !important;
        }

        @media (max-width: 380px) {
          body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score {
            padding: 14px !important;
          }

          body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > strong {
            font-size: 28px !important;
          }

          body .sx-inbox .sx-workspace-v22 > .sx-details > .sx-score > .sx-score-ring > span {
            font-size: 17px !important;
          }
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
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
import "../page02-inbox-v22-root-fix.css";

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
        /*
         * PAGE 02 emergency structural authority.
         * InboxDashboardV2 contains the complete Inbox inside .sx-workspace-v22.
         * Keep the sidebar independent and make the workspace own every remaining
         * viewport pixel so list/chat/intelligence can never be clipped into the
         * legacy list grid track.
         */
        body .sx-inbox {
          grid-template-columns: minmax(232px, 264px) minmax(0, 1fr) !important;
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100dvh !important;
          overflow: hidden !important;
        }

        body .sx-inbox > .sx-side {
          position: relative !important;
          z-index: 40 !important;
        }

        body .sx-inbox > .sx-workspace-v22 {
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 264px !important;
          width: auto !important;
          max-width: none !important;
          min-width: 0 !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          margin: 0 !important;
          z-index: 10 !important;
          overflow: hidden !important;
        }

        /* Remove only the duplicate channel-card strip above conversation filters. */
        body .sx-workspace-v22 .sx-list > .sx-channels-chips {
          display: none !important;
        }

        /* Current dynamic linear Qualification Score presentation. */
        body .sx-workspace-v22 .sx-score {
          display: block !important;
          padding: 16px !important;
        }

        body .sx-workspace-v22 .sx-score-top {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          margin-bottom: 13px !important;
        }

        body .sx-workspace-v22 .sx-score-value {
          display: inline-flex !important;
          align-items: baseline !important;
          gap: 5px !important;
          color: #122342 !important;
        }

        body .sx-workspace-v22 .sx-score-value strong {
          font-size: 24px !important;
          line-height: 1 !important;
          font-weight: 850 !important;
          letter-spacing: -.035em !important;
        }

        body .sx-workspace-v22 .sx-score-value span {
          color: #8a99af !important;
          font-size: 11px !important;
          font-weight: 700 !important;
        }

        body .sx-workspace-v22 .sx-score-percent {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 45px !important;
          min-height: 26px !important;
          padding: 0 9px !important;
          border: 1px solid #cfe0fb !important;
          border-radius: 999px !important;
          background: #eef5ff !important;
          color: #1768ff !important;
          font-size: 10.5px !important;
          font-weight: 800 !important;
        }

        body .sx-workspace-v22 .sx-score-progress {
          position: relative !important;
          width: 100% !important;
          height: 8px !important;
          margin: 0 !important;
          overflow: visible !important;
          border-radius: 999px !important;
          background: #e6edf7 !important;
        }

        body .sx-workspace-v22 .sx-score-progress-fill {
          position: absolute !important;
          inset: 0 auto 0 0 !important;
          width: clamp(0%, calc(var(--sx-score, 0) * 1%), 100%) !important;
          border-radius: inherit !important;
          background: linear-gradient(90deg, #1768ff 0%, #13bff5 100%) !important;
        }

        body .sx-workspace-v22 .sx-score-progress-dot {
          position: absolute !important;
          top: 50% !important;
          left: clamp(0%, calc(var(--sx-score, 0) * 1%), 100%) !important;
          width: 14px !important;
          height: 14px !important;
          border: 3px solid #fff !important;
          border-radius: 50% !important;
          background: #1768ff !important;
          box-shadow: 0 2px 8px rgba(23,104,255,.28) !important;
          transform: translate(-50%, -50%) !important;
        }

        body .sx-workspace-v22 .sx-score-scale {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          margin-top: 7px !important;
          color: #98a6ba !important;
          font-size: 9.5px !important;
          font-weight: 700 !important;
        }

        body .sx-workspace-v22 .sx-score-copy {
          margin-top: 14px !important;
          padding-top: 12px !important;
          border-top: 1px solid #e7edf5 !important;
        }

        body .sx-workspace-v22 .sx-score-copy > strong {
          display: block !important;
          margin-bottom: 4px !important;
          color: #1d3152 !important;
          font-size: 12.5px !important;
          font-weight: 820 !important;
        }

        body .sx-workspace-v22 .sx-score-copy p {
          margin: 0 !important;
          color: #7888a2 !important;
          font-size: 10.8px !important;
          line-height: 1.5 !important;
        }

        @media (min-width: 768px) and (max-width: 1179px) {
          body .sx-inbox {
            grid-template-columns: 72px minmax(0, 1fr) !important;
          }

          body .sx-inbox > .sx-workspace-v22 {
            left: 72px !important;
          }
        }

        @media (max-width: 767px) {
          body .sx-inbox {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          body .sx-inbox > .sx-workspace-v22 {
            top: 0 !important;
            right: 0 !important;
            bottom: 64px !important;
            left: 0 !important;
            width: 100vw !important;
            height: calc(100dvh - 64px) !important;
            max-height: calc(100dvh - 64px) !important;
          }

          body .sx-inbox > .sx-side {
            z-index: 120 !important;
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

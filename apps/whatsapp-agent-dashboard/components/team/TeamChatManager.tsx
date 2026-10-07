"use client";

import { useEffect, useMemo, useState } from "react";

type TeamAgent = {
  id: string;
  name: string;
  email: string;
  role: string;
  online: boolean;
  lastSeenAt: string | null;
  assignedConversations: number;
  isCurrentUser: boolean;
};

type TeamQueueItem = {
  id: string;
  contactName: string;
  phone: string;
  city: string | null;
  status: string;
  agentMode: string;
  unreadCount: number;
  currentIntent: string | null;
  lastMessageAt: string | null;
  waitingMinutes: number | null;
  priority: number;
  mine: boolean;
  assignee: { id: string; name: string; role: string } | null;
  lead: {
    stage: string;
    temperature: string;
    score: number;
    interestedCourse: string | null;
    nextFollowUpAt: string | null;
    counselorRequested: boolean;
  } | null;
  lastMessage: {
    text: string | null;
    type: string;
    direction: string;
    status: string;
    messageTimestamp: string;
  } | null;
};

type TeamOverview = {
  generatedAt: string;
  currentUser: { id: string; role: string; canManageTeam: boolean };
  metrics: {
    totalActive: number;
    unassigned: number;
    unread: number;
    reviewRequired: number;
    mine: number;
    onlineAgents: number;
  };
  agents: TeamAgent[];
  queue: TeamQueueItem[];
};

type QueueFilter = "ALL" | "UNASSIGNED" | "MINE" | "UNREAD" | "REVIEW";

function readable(value: string | null | undefined): string {
  return value?.replaceAll("_", " ") || "Not captured";
}

function relativeTime(value: string | null): string {
  if (!value) return "No activity";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No activity";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function preview(item: TeamQueueItem): string {
  if (item.lastMessage?.text) return item.lastMessage.text;
  if (item.lastMessage?.type) return `[${readable(item.lastMessage.type)}]`;
  return "No message stored";
}

export default function TeamChatManager({ initialOverview }: { initialOverview: TeamOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch("/api/team/overview", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as TeamOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Team queue could not be loaded.");
      setOverview(payload);
      setError(null);
    } catch (refreshError) {
      if (!silent) {
        setError(refreshError instanceof Error ? refreshError.message : "Team queue could not be loaded.");
      }
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      void fetch("/api/team/heartbeat", { method: "POST" });
    }, 45_000);
    const polling = window.setInterval(() => {
      void refresh(true);
    }, 15_000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(polling);
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return overview.queue.filter((item) => {
      const matchesSearch =
        !query ||
        item.contactName.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.lead?.interestedCourse?.toLowerCase().includes(query) ||
        item.assignee?.name.toLowerCase().includes(query);
      const matchesFilter =
        filter === "ALL" ||
        (filter === "UNASSIGNED" && !item.assignee) ||
        (filter === "MINE" && item.mine) ||
        (filter === "UNREAD" && item.unreadCount > 0) ||
        (filter === "REVIEW" && item.agentMode === "REVIEW_REQUIRED");
      return Boolean(matchesSearch && matchesFilter);
    });
  }, [filter, overview.queue, search]);

  async function updateOwnership(
    conversationId: string,
    action: "claim" | "release" | "transfer",
  ) {
    const assigneeId = transferTargets[conversationId] || "";
    if (action === "transfer" && !assigneeId) {
      setError("Select an agent before transferring the conversation.");
      return;
    }

    setBusyId(conversationId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/team/conversations/${encodeURIComponent(conversationId)}/owner`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, assigneeId: action === "transfer" ? assigneeId : null }),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Conversation ownership could not be updated.");
      setNotice(
        action === "claim"
          ? "Conversation claimed. Human mode and collision protection are active."
          : action === "release"
            ? "Conversation released to the unassigned queue."
            : "Conversation transferred successfully.",
      );
      await refresh(true);
    } catch (ownershipError) {
      setError(
        ownershipError instanceof Error
          ? ownershipError.message
          : "Conversation ownership could not be updated.",
      );
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }

  const assignableAgents = overview.agents.filter((agent) =>
    ["ADMIN", "MANAGER", "COUNSELOR"].includes(agent.role),
  );

  return (
    <div className="team-chat-manager">
      <section className="team-metrics" aria-label="Team chat summary">
        <article><span>Active conversations</span><strong>{overview.metrics.totalActive}</strong><small>Open operational queue</small></article>
        <article><span>Unassigned</span><strong>{overview.metrics.unassigned}</strong><small>Ready to be claimed</small></article>
        <article><span>Unread messages</span><strong>{overview.metrics.unread}</strong><small>Across active chats</small></article>
        <article><span>Online agents</span><strong>{overview.metrics.onlineAgents}</strong><small>Seen in last 2 minutes</small></article>
        <article><span>My workload</span><strong>{overview.metrics.mine}</strong><small>Currently assigned to you</small></article>
        <article><span>Review required</span><strong>{overview.metrics.reviewRequired}</strong><small>Needs human judgement</small></article>
      </section>

      {error ? <div className="team-alert error">{error}</div> : null}
      {notice ? <div className="team-alert success">{notice}</div> : null}

      <section className="team-layout">
        <div className="team-queue-card">
          <header className="team-panel-header">
            <div><span>Shared live queue</span><h3>Conversation ownership</h3></div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </header>

          <div className="team-toolbar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learner, phone, course or owner"
            />
            <div className="team-filter-tabs">
              {(["ALL", "UNASSIGNED", "MINE", "UNREAD", "REVIEW"] as QueueFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? "active" : ""}
                  onClick={() => setFilter(item)}
                >
                  {readable(item)}
                </button>
              ))}
            </div>
          </div>

          <div className="team-queue-list">
            {filtered.length === 0 ? (
              <div className="team-empty"><strong>No conversations found</strong><p>Change the filter or wait for new WhatsApp activity.</p></div>
            ) : (
              filtered.map((item) => (
                <article className={`team-queue-item ${item.mine ? "mine" : ""}`} key={item.id}>
                  <div className="team-queue-main">
                    <div className="team-queue-title">
                      <div>
                        <h4>{item.contactName}</h4>
                        <p>{item.phone}{item.city ? ` · ${item.city}` : ""}</p>
                      </div>
                      <div className="team-queue-badges">
                        {item.unreadCount > 0 ? <span className="unread">{item.unreadCount} unread</span> : null}
                        <span className={`mode mode-${item.agentMode.toLowerCase()}`}>{readable(item.agentMode)}</span>
                        <span className={`temperature temperature-${(item.lead?.temperature || "cold").toLowerCase()}`}>{readable(item.lead?.temperature || "COLD")}</span>
                      </div>
                    </div>
                    <p className="team-message-preview">{preview(item)}</p>
                    <div className="team-queue-meta">
                      <span>Owner: <strong>{item.assignee?.name || "Unassigned"}</strong></span>
                      <span>Course: <strong>{item.lead?.interestedCourse || "Not captured"}</strong></span>
                      <span>Stage: <strong>{readable(item.lead?.stage)}</strong></span>
                      <span>Activity: <strong>{relativeTime(item.lastMessageAt)}</strong></span>
                      <span>Priority: <strong>{item.priority}</strong></span>
                    </div>
                  </div>

                  <div className="team-queue-actions">
                    <button type="button" className="ghost" onClick={() => window.location.assign(`/inbox?conversation=${encodeURIComponent(item.id)}`)}>Open inbox</button>
                    {!item.assignee ? (
                      <button type="button" disabled={busyId === item.id} onClick={() => void updateOwnership(item.id, "claim")}>
                        {busyId === item.id ? "Claiming..." : "Claim chat"}
                      </button>
                    ) : item.mine ? (
                      <button type="button" className="danger" disabled={busyId === item.id} onClick={() => void updateOwnership(item.id, "release")}>
                        {busyId === item.id ? "Releasing..." : "Release"}
                      </button>
                    ) : null}

                    {overview.currentUser.canManageTeam ? (
                      <div className="team-transfer">
                        <select
                          value={transferTargets[item.id] || ""}
                          onChange={(event) => setTransferTargets((current) => ({ ...current, [item.id]: event.target.value }))}
                        >
                          <option value="">Transfer to...</option>
                          {assignableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.online ? " · online" : ""}</option>)}
                        </select>
                        <button type="button" className="secondary" disabled={busyId === item.id} onClick={() => void updateOwnership(item.id, "transfer")}>Transfer</button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="team-agents-card">
          <header className="team-panel-header"><div><span>Presence monitor</span><h3>Support team</h3></div></header>
          <div className="team-agent-list">
            {overview.agents.map((agent) => (
              <article key={agent.id} className={agent.isCurrentUser ? "current" : ""}>
                <span className={`presence ${agent.online ? "online" : "offline"}`} />
                <div><strong>{agent.name}</strong><p>{readable(agent.role)}{agent.isCurrentUser ? " · You" : ""}</p></div>
                <div className="agent-load"><strong>{agent.assignedConversations}</strong><small>assigned</small></div>
              </article>
            ))}
          </div>
          <div className="team-safety-card">
            <strong>Collision protection active</strong>
            <p>Counselors can send only after claiming a chat. Admins and managers retain supervised override access.</p>
          </div>
          <div className="team-safety-card neutral">
            <strong>Live Meta sending remains disabled</strong>
            <p>Team operations are ready, but external WhatsApp delivery stays protected until the final cutover phase.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

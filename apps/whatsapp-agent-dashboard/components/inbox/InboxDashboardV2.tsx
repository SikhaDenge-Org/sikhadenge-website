"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  InboxConversationDetail,
  InboxConversationSummary,
  InboxMessage,
} from "../../lib/inbox/types";
import MetaConnectionStatus from "../navigation/MetaConnectionStatus";

type ConversationFilter = "ALL" | "UNREAD" | "HOT";
type UserSettableMode = "AI" | "HUMAN" | "PAUSED";
type UploadedMedia = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "document" | "video" | "audio";
  size: number;
  createdAt: string;
  previewUrl: string;
};

type InboxDashboardProps = {
  initialConversations: InboxConversationSummary[];
  initialConversation: InboxConversationDetail | null;
};

const NAV_ITEMS = [
  ["Inbox", "/inbox"],
  ["Contacts", "/contacts"],
  ["Leads", "/leads"],
  ["Team", "/team"],
  ["Engagement", "/engagement"],
  ["Analytics", "/analytics"],
  ["Knowledge", "/knowledge"],
  ["Campaigns", "/campaigns"],
  ["Automation", "/automation"],
  ["Templates", "/templates"],
  ["Integrations", "/integrations"],
  ["Admin", "/admin"],
  ["Cutover", "/cutover"],
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function temperatureClass(value?: string | null): string {
  const normalized = value?.toLowerCase();
  if (normalized === "hot" || normalized === "warm") return normalized;
  return "cold";
}

function temperatureLabel(value?: string | null): string {
  return value?.replaceAll("_", " ") || "COLD";
}

function readable(value?: string | null): string {
  return value?.replaceAll("_", " ") || "Not captured";
}

function formatListTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("en-IN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" }).format(date);
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function messagePreview(item: InboxConversationSummary): string {
  if (item.lastMessage?.text) return item.lastMessage.text;
  if (item.lastMessage?.type) return `[${readable(item.lastMessage.type)}]`;
  return "No messages yet";
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function suggestedReply(action: string): string {
  if (action.includes("occupation")) return "Aap abhi job, business ya study mein kya kar rahe hain?";
  if (action.includes("primary goal")) return "Aapka main career ya learning goal kya hai?";
  if (action.includes("suitable program")) return "Aap kis skill ya course mein sabse zyada interested hain?";
  if (action.includes("joining timeline")) return "Aap course kab tak start karna chahte hain?";
  if (action.includes("counselor")) return "Kya main aapke liye counselor call arrange kar doon?";
  return "Kripya apni requirement thodi detail mein share kijiye.";
}

function TemperatureBadge({ value }: { value?: string | null }) {
  return (
    <span className={`temperature temperature-${temperatureClass(value)}`}>
      {temperatureLabel(value)}
    </span>
  );
}

function MessageMedia({ message }: { message: InboxMessage }) {
  if (!message.mediaUrl) return null;
  if (message.type === "IMAGE") {
    return (
      <a className="message-media-link" href={message.mediaUrl} target="_blank" rel="noreferrer">
        <img className="message-media-image" src={message.mediaUrl} alt={message.filename || "Shared image"} />
      </a>
    );
  }
  if (message.type === "VIDEO") {
    return <video className="message-media-video" src={message.mediaUrl} controls preload="metadata" />;
  }
  if (message.type === "AUDIO") {
    return <audio className="message-media-audio" src={message.mediaUrl} controls preload="metadata" />;
  }
  return (
    <a className="message-document" href={message.mediaUrl} target="_blank" rel="noreferrer">
      <span aria-hidden="true">PDF</span>
      <strong>{message.filename || "Open document"}</strong>
    </a>
  );
}

export default function InboxDashboardV2({
  initialConversations,
  initialConversation,
}: InboxDashboardProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversation?.id ?? initialConversations[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<InboxConversationDetail | null>(initialConversation);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("ALL");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [modeUpdating, setModeUpdating] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef(selectedId);
  const pollingRef = useRef(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (pollingRef.current || document.visibilityState === "hidden") return;
      pollingRef.current = true;
      try {
        const response = await fetch("/api/conversations?limit=100", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const body = (await response.json()) as {
          conversations?: InboxConversationSummary[];
        };
        if (!response.ok || !body.conversations || cancelled) return;

        setConversations(body.conversations);
        const activeId = selectedIdRef.current ?? body.conversations[0]?.id ?? null;
        if (!selectedIdRef.current && activeId) {
          selectedIdRef.current = activeId;
          setSelectedId(activeId);
        }
        if (!activeId) {
          setSelected(null);
          return;
        }

        const detailResponse = await fetch(
          `/api/conversations/${encodeURIComponent(activeId)}`,
          { cache: "no-store" },
        );
        if (!detailResponse.ok || cancelled) return;
        const detailBody = (await detailResponse.json()) as {
          conversation?: InboxConversationDetail;
        };
        if (detailBody.conversation) setSelected(detailBody.conversation);
      } catch {
        // The next one-second poll retries without clearing the visible inbox.
      } finally {
        pollingRef.current = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1_000);
    const visibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    messageAreaRef.current?.scrollTo({
      top: messageAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [selected?.messages.length]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((item) => {
      const matchesQuery =
        !query ||
        item.contact.name.toLowerCase().includes(query) ||
        item.contact.phone.toLowerCase().includes(query) ||
        item.lead?.interestedCourse?.toLowerCase().includes(query);
      const matchesFilter =
        filter === "ALL" ||
        (filter === "UNREAD" && item.unreadCount > 0) ||
        (filter === "HOT" && item.lead?.temperature === "HOT");
      return Boolean(matchesQuery && matchesFilter);
    });
  }, [conversations, filter, search]);

  const metrics = useMemo(() => {
    const open = conversations.filter((item) => item.status !== "CLOSED").length;
    const aiManaged = conversations.filter((item) => item.agentMode === "AI").length;
    const qualified = conversations.filter((item) => (item.lead?.score ?? 0) >= 45).length;
    const unread = conversations.reduce((total, item) => total + item.unreadCount, 0);
    return { open, aiManaged, qualified, unread };
  }, [conversations]);

  const selectedSummary =
    selected ?? conversations.find((item) => item.id === selectedId) ?? null;

  async function markRead(conversationId: string) {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: "POST" },
    );
    if (response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (!response.ok) return;
    setConversations((current) =>
      current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item),
    );
    setSelected((current) => current?.id === conversationId ? { ...current, unreadCount: 0 } : current);
  }

  async function loadConversation(conversationId: string, force = false) {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setActionMenuOpen(false);
    if (!force && selected?.id === conversationId) {
      await markRead(conversationId);
      return;
    }

    setLoadingConversation(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        conversation?: InboxConversationDetail;
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation could not be loaded.");
      }
      setSelected(body.conversation);
      setConversations((current) =>
        current.map((item) => item.id === body.conversation?.id ? body.conversation : item),
      );
      await markRead(conversationId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Conversation could not be loaded.");
    } finally {
      setLoadingConversation(false);
    }
  }

  async function changeMode(mode: UserSettableMode) {
    if (!selectedId || modeUpdating) return;
    setModeUpdating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            reason: mode === "HUMAN"
              ? "Manual counselor takeover from inbox dashboard."
              : "Conversation mode changed from inbox dashboard.",
          }),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        conversation?: { agentMode: string };
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation mode could not be changed.");
      }
      const nextMode = body.conversation.agentMode;
      setSelected((current) => current ? { ...current, agentMode: nextMode } : current);
      setConversations((current) =>
        current.map((item) => item.id === selectedId ? { ...item, agentMode: nextMode } : item),
      );
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : "Conversation mode could not be changed.");
    } finally {
      setModeUpdating(false);
    }
  }

  async function updateStatus(status: "OPEN" | "RESOLVED") {
    if (!selectedId || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reason: "Updated from inbox action menu." }),
        },
      );
      const body = (await response.json()) as {
        conversation?: { status: string; unreadCount: number };
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation status could not be changed.");
      }
      setConversations((current) => current.map((item) =>
        item.id === selectedId
          ? { ...item, status: body.conversation!.status, unreadCount: body.conversation!.unreadCount }
          : item,
      ));
      setSelected((current) => current
        ? { ...current, status: body.conversation!.status, unreadCount: body.conversation!.unreadCount }
        : current,
      );
      setActionMenuOpen(false);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Conversation status could not be changed.");
    } finally {
      setOperationBusy(false);
    }
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    setError(null);
    setComposerNotice(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: formData });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as { asset?: UploadedMedia; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error || "Attachment upload failed.");
      setUploadedMedia(body.asset);
      setComposerNotice("Attachment verified and ready to send.");
    } catch (uploadError) {
      setUploadedMedia(null);
      setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage() {
    if (!selectedId || sending || (!draft.trim() && !uploadedMedia)) return;
    setSending(true);
    setError(null);
    setComposerNotice(null);
    try {
      const payload = uploadedMedia
        ? {
            kind: "media",
            assetId: uploadedMedia.id,
            mediaType: uploadedMedia.kind,
            caption: draft.trim() || null,
            filename: uploadedMedia.name,
            idempotencyKey: idempotencyKey(),
          }
        : { kind: "text", text: draft.trim(), idempotencyKey: idempotencyKey() };
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        queued?: boolean;
        outboundSent?: boolean;
        dispatchError?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Message could not be sent.");
      setDraft("");
      setUploadedMedia(null);
      setComposerNotice(
        body.outboundSent
          ? "Message sent through Meta WhatsApp Cloud API."
          : body.dispatchError
            ? `Message queued, but delivery failed: ${body.dispatchError}`
            : "Message queued. Open Cutover to activate live outbound delivery.",
      );
      await loadConversation(selectedId, true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const nextActions = useMemo(() => {
    if (!selected?.lead) return ["Capture lead goal and course requirement"];
    const actions: string[] = [];
    if (!selected.lead.occupation) actions.push("Confirm current occupation");
    if (!selected.lead.goal) actions.push("Understand the learner's primary goal");
    if (!selected.lead.interestedCourse) actions.push("Identify the suitable program");
    if (!selected.lead.joiningTimeline) actions.push("Ask joining timeline");
    if (selected.lead.score >= 70 && !selected.lead.counselorRequested) {
      actions.push("Offer a counselor call");
    }
    return actions.length > 0 ? actions : ["No pending qualification question"];
  }, [selected]);

  return (
    <main className="dashboard-shell">
      <aside className="rail" aria-label="Primary navigation">
        <Link className="brand-mark" href="/inbox" aria-label="Open inbox">S</Link>
        <nav>
          {NAV_ITEMS.map(([title, href]) => (
            <Link
              key={title}
              className={`rail-button ${title === "Inbox" ? "active" : ""}`}
              title={title}
              aria-label={title}
              aria-current={title === "Inbox" ? "page" : undefined}
              href={href}
            >
              {title}
            </Link>
          ))}
        </nav>
        <Link className="rail-button rail-bottom" title="Settings" aria-label="Settings" href="/settings">
          Settings
        </Link>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">SikhaDenge owned system</p>
            <h1>WhatsApp AI Agent</h1>
          </div>
          <div className="topbar-actions">
            <span className="inbox-live-indicator">Live inbox · 1 second</span>
            <div className="system-status"><span /> Database connected</div>
            <MetaConnectionStatus />
          </div>
        </header>

        <section className="metric-row" aria-label="Operational summary">
          <article className="metric-card"><span>Open conversations</span><strong>{metrics.open}</strong><small>Current database records</small></article>
          <article className="metric-card"><span>AI managed</span><strong>{metrics.aiManaged}</strong><small>Agent mode currently enabled</small></article>
          <article className="metric-card"><span>Qualified leads</span><strong>{metrics.qualified}</strong><small>Lead score 45 or higher</small></article>
          <article className="metric-card"><span>Unread messages</span><strong>{metrics.unread}</strong><small>Across all conversations</small></article>
        </section>

        <section className="inbox-grid">
          <aside className="conversation-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Unified inbox</p><h2>Conversations</h2></div>
              <button
                className="icon-button"
                type="button"
                aria-label="Reset conversation filters"
                title="Reset filters"
                onClick={() => { setSearch(""); setFilter("ALL"); }}
              >
                ↻
              </button>
            </div>
            <label className="search-box">
              <span>⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, number or course" />
            </label>
            <div className="filter-tabs">
              <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All</button>
              <button className={filter === "UNREAD" ? "active" : ""} onClick={() => setFilter("UNREAD")}>Unread</button>
              <button className={filter === "HOT" ? "active" : ""} onClick={() => setFilter("HOT")}>Hot leads</button>
            </div>
            <div className="conversation-list">
              {filteredConversations.length === 0 ? (
                <div className="panel-empty-state"><strong>No conversations found</strong><p>New WhatsApp messages appear here automatically.</p></div>
              ) : filteredConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-conversation-id={item.id}
                  className={`conversation-item ${selectedId === item.id ? "selected" : ""}`}
                  onClick={() => void loadConversation(item.id)}
                >
                  <span className="avatar">{initials(item.contact.name)}</span>
                  <span className="conversation-copy">
                    <span className="conversation-name-row"><strong>{item.contact.name}</strong><time>{formatListTime(item.lastMessageAt)}</time></span>
                    <span className="conversation-preview">{messagePreview(item)}</span>
                    <span className="conversation-meta"><TemperatureBadge value={item.lead?.temperature} /><span>{readable(item.lead?.stage || item.status)}</span></span>
                  </span>
                  {item.unreadCount > 0 ? <span className="unread-count">{item.unreadCount}</span> : null}
                </button>
              ))}
            </div>
          </aside>

          <section className="chat-panel">
            <header className="chat-header">
              {selectedSummary ? (
                <>
                  <div className="chat-person">
                    <span className="avatar large">{initials(selectedSummary.contact.name)}</span>
                    <div><h2>{selectedSummary.contact.name}</h2><p>{selectedSummary.contact.phone}</p></div>
                  </div>
                  <div className="chat-actions">
                    <label className="ai-switch">
                      <span>{modeUpdating ? "Updating..." : "AI Agent"}</span>
                      <input
                        type="checkbox"
                        checked={selectedSummary.agentMode === "AI"}
                        disabled={modeUpdating}
                        onChange={(event) => void changeMode(event.target.checked ? "AI" : "PAUSED")}
                      />
                      <i />
                    </label>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={modeUpdating}
                      onClick={() => void changeMode(selectedSummary.agentMode === "HUMAN" ? "AI" : "HUMAN")}
                    >
                      {selectedSummary.agentMode === "HUMAN" ? "Resume AI" : "Take over"}
                    </button>
                    <button className="icon-button" type="button" title="More actions" onClick={() => setActionMenuOpen((value) => !value)}>•••</button>
                    {actionMenuOpen ? (
                      <div className="chat-action-menu">
                        <button type="button" onClick={() => selectedId && void markRead(selectedId)}>Mark as read</button>
                        <Link href="/contacts">Open contact manager</Link>
                        <Link href="/leads">Open lead manager</Link>
                        <Link href="/team">Open team assignment</Link>
                        {selectedSummary.status === "RESOLVED" || selectedSummary.status === "CLOSED" ? (
                          <button type="button" disabled={operationBusy} onClick={() => void updateStatus("OPEN")}>Reopen conversation</button>
                        ) : (
                          <button className="danger" type="button" disabled={operationBusy} onClick={() => void updateStatus("RESOLVED")}>Resolve conversation</button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="chat-person"><div><h2>No conversation selected</h2><p>Incoming WhatsApp conversations will be listed on the left.</p></div></div>
              )}
            </header>

            <div className="context-strip">
              <span>Intent: {readable(selected?.currentIntent)}</span>
              <span>Language: {readable(selected?.detectedLanguage)}</span>
              <span>Agent confidence: {selected?.aiConfidence != null ? `${Math.round(selected.aiConfidence * 100)}%` : "Not calculated"}</span>
              <span className="knowledge-ok">Mode: {readable(selectedSummary?.agentMode)}</span>
            </div>

            {error ? <div className="inbox-operation-error">{error}</div> : null}

            <div className="message-area" ref={messageAreaRef}>
              {loadingConversation ? (
                <div className="center-state">Loading conversation...</div>
              ) : !selected ? (
                <div className="center-state"><strong>Inbox is ready</strong><p>Incoming messages will update automatically.</p></div>
              ) : selected.messages.length === 0 ? (
                <div className="center-state">No message has been stored in this conversation.</div>
              ) : (
                <>
                  <div className="day-divider"><span>Conversation history</span></div>
                  {selected.messages.map((message) => (
                    <div key={message.id} className={`message-row ${message.direction.toLowerCase()}`}>
                      <div className="message-bubble">
                        {message.direction === "OUTBOUND" ? <small>{message.actor === "AI" ? "AI Agent" : message.actor === "HUMAN" ? "Counselor" : readable(message.actor)}</small> : null}
                        <MessageMedia message={message} />
                        {message.text ? <p>{message.text}</p> : !message.mediaUrl ? <p>[{readable(message.type)} message]</p> : null}
                        <time>{formatMessageTime(message.messageTimestamp)} · {readable(message.status)}</time>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {selected?.aiSummary || selected?.currentIntent ? (
                <div className="agent-thinking">
                  <span className="thinking-dot" />
                  <div><strong>Agent context</strong><p>{selected.aiSummary || `Current detected intent: ${readable(selected.currentIntent)}.`}</p></div>
                  <button type="button" onClick={() => window.location.assign("/knowledge")}>Review</button>
                </div>
              ) : null}
            </div>

            <footer className="composer">
              <input
                ref={fileInputRef}
                className="media-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,video/mp4,audio/mpeg,audio/mp4,audio/ogg,audio/aac"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }}
              />
              {uploadedMedia ? (
                <div className="composer-media-preview">
                  {uploadedMedia.kind === "image" ? <img src={uploadedMedia.previewUrl} alt="Attachment preview" /> : <span className="composer-media-type">{uploadedMedia.kind.toUpperCase()}</span>}
                  <div><strong>{uploadedMedia.name}</strong><small>{formatBytes(uploadedMedia.size)} · {uploadedMedia.mimeType}</small></div>
                  <button type="button" onClick={() => setUploadedMedia(null)} aria-label="Remove attachment">×</button>
                </div>
              ) : null}
              {composerNotice ? <div className="composer-feedback">{composerNotice}</div> : null}
              <div className="composer-tools">
                <button type="button" disabled={!selected || uploading || sending} title="Attach image, PDF, document, video, or audio" onClick={() => fileInputRef.current?.click()}>{uploading ? "…" : "＋"}</button>
                <button type="button" title="Open templates and targeted campaigns">▤</button>
                <button type="button" title="Open Template Centre" onClick={() => window.location.assign("/templates")}>✦</button>
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={uploadedMedia ? "Add an optional caption..." : "Write a manual reply..."}
                rows={2}
                disabled={!selected || sending}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button
                className="send-button"
                type="button"
                disabled={!selected || sending || uploading || (!draft.trim() && !uploadedMedia)}
                title="Send through the current WhatsApp Cloud API runtime mode"
                onClick={() => void sendMessage()}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </footer>
          </section>

          <aside className="details-panel">
            {selectedSummary ? (
              <>
                <div className="lead-card-head"><div><p className="eyebrow">Lead intelligence</p><h2>{selectedSummary.contact.name}</h2></div><TemperatureBadge value={selectedSummary.lead?.temperature} /></div>
                <div className="score-block"><div className="score-ring"><strong>{selectedSummary.lead?.score ?? 0}</strong><span>/100</span></div><div><strong>Qualification score</strong><p>Calculated from captured profile and joining intent.</p></div></div>
                <section className="detail-section">
                  <h3>Lead profile</h3>
                  <dl>
                    <div><dt>Course</dt><dd>{readable(selectedSummary.lead?.interestedCourse)}</dd></div>
                    <div><dt>City</dt><dd>{readable(selectedSummary.contact.city)}</dd></div>
                    <div><dt>Occupation</dt><dd>{readable(selectedSummary.lead?.occupation)}</dd></div>
                    <div><dt>Experience</dt><dd>{readable(selectedSummary.lead?.experienceLevel)}</dd></div>
                    <div><dt>Joining</dt><dd>{readable(selectedSummary.lead?.joiningTimeline)}</dd></div>
                    <div><dt>Source</dt><dd>{readable(selected?.source)}</dd></div>
                    <div><dt>Stage</dt><dd>{readable(selectedSummary.lead?.stage || selectedSummary.status)}</dd></div>
                    <div><dt>Owner</dt><dd>{selectedSummary.assignee?.name || "Unassigned"}</dd></div>
                  </dl>
                </section>
                <section className="detail-section">
                  <div className="section-title-row"><h3>AI summary</h3><button type="button" onClick={() => window.location.assign("/leads")}>Edit</button></div>
                  <p className="summary-copy">{selected?.aiSummary || "No AI summary is available yet."}</p>
                </section>
                <section className="detail-section">
                  <h3>Next actions</h3>
                  {nextActions.map((action) => (
                    <label className="task-check actionable" key={action}>
                      <input
                        type="checkbox"
                        disabled={action === "No pending qualification question"}
                        onChange={() => setDraft(suggestedReply(action))}
                      /> {action}
                    </label>
                  ))}
                </section>
                <section className="learning-card">
                  <span>Controlled learning</span>
                  <strong>No raw chat is auto-trained</strong>
                  <p>Counselor corrections enter an approval queue before becoming reusable knowledge.</p>
                  <button type="button" onClick={() => window.location.assign("/knowledge")}>Open learning queue</button>
                </section>
              </>
            ) : (
              <div className="panel-empty-state"><strong>No lead selected</strong><p>Select a conversation to view qualification and agent context.</p></div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

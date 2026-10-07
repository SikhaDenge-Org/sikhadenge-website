"use client";

import { useMemo, useRef, useState } from "react";

import type {
  InboxConversationDetail,
  InboxConversationSummary,
  InboxMessage,
} from "../../lib/inbox/types";

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

function formatListTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
      }).format(date);
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

function readable(value?: string | null): string {
  return value?.replaceAll("_", " ") || "Not captured";
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

export default function InboxDashboard({
  initialConversations,
  initialConversation,
}: InboxDashboardProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversation?.id ?? initialConversations[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<InboxConversationDetail | null>(
    initialConversation,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("ALL");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [modeUpdating, setModeUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const qualified = conversations.filter(
      (item) => (item.lead?.score ?? 0) >= 45,
    ).length;
    const unread = conversations.reduce((total, item) => total + item.unreadCount, 0);
    return { open, aiManaged, qualified, unread };
  }, [conversations]);

  const selectedSummary =
    selected ?? conversations.find((item) => item.id === selectedId) ?? null;

  async function loadConversation(conversationId: string, force = false) {
    setSelectedId(conversationId);
    if (!force && selected?.id === conversationId) return;

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
        current.map((item) =>
          item.id === body.conversation?.id ? body.conversation : item,
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Conversation could not be loaded.",
      );
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
            reason:
              mode === "HUMAN"
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
        conversation?: { agentMode: string; assignedToId: string | null };
        error?: string;
      };

      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation mode could not be changed.");
      }

      const nextMode = body.conversation.agentMode;
      setSelected((current) =>
        current ? { ...current, agentMode: nextMode } : current,
      );
      setConversations((current) =>
        current.map((item) =>
          item.id === selectedId ? { ...item, agentMode: nextMode } : item,
        ),
      );
    } catch (modeError) {
      setError(
        modeError instanceof Error
          ? modeError.message
          : "Conversation mode could not be changed.",
      );
    } finally {
      setModeUpdating(false);
    }
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    setError(null);
    setComposerNotice(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as { asset?: UploadedMedia; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error || "Attachment upload failed.");
      setUploadedMedia(body.asset);
      setComposerNotice("Attachment verified and ready to queue.");
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
        : {
            kind: "text",
            text: draft.trim(),
            idempotencyKey: idempotencyKey(),
          };
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
        duplicate?: boolean;
        outboundSent?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Message could not be queued.");
      setDraft("");
      setUploadedMedia(null);
      setComposerNotice(
        body.outboundSent
          ? "Message sent."
          : "Message queued safely. Live Meta sending remains controlled by cutover settings.",
      );
      await loadConversation(selectedId, true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be queued.");
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
    if (
      selected.lead.score >= 70 &&
      !selected.lead.counselorRequested
    ) {
      actions.push("Offer a counselor call");
    }

    return actions.length > 0 ? actions : ["No pending qualification question"];
  }, [selected]);

  return (
    <main className="dashboard-shell">
      <aside className="rail" aria-label="Primary navigation">
        <div className="brand-mark">S</div>
        <nav>
          <button className="rail-button active" title="Inbox">⌁</button>
          <button className="rail-button" title="Contacts">◎</button>
          <button className="rail-button" title="Leads">◇</button>
          <button className="rail-button" title="Campaigns">✦</button>
          <button className="rail-button" title="Analytics">⌗</button>
          <button className="rail-button" title="Knowledge">▤</button>
        </nav>
        <button className="rail-button rail-bottom" title="Settings">⚙</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">SikhaDenge owned system</p>
            <h1>WhatsApp AI Agent</h1>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span /> Database connected</div>
            <button
              className="secondary-button"
              disabled
              title="Outbound is protected until the final Meta cutover."
            >
              Meta connection pending
            </button>
            <div className="profile-pill">SD</div>
          </div>
        </header>

        <section className="metric-row" aria-label="Operational summary">
          <article className="metric-card">
            <span>Open conversations</span>
            <strong>{metrics.open}</strong>
            <small>Current database records</small>
          </article>
          <article className="metric-card">
            <span>AI managed</span>
            <strong>{metrics.aiManaged}</strong>
            <small>Agent mode currently enabled</small>
          </article>
          <article className="metric-card">
            <span>Qualified leads</span>
            <strong>{metrics.qualified}</strong>
            <small>Lead score 45 or higher</small>
          </article>
          <article className="metric-card">
            <span>Unread messages</span>
            <strong>{metrics.unread}</strong>
            <small>Across all conversations</small>
          </article>
        </section>

        <section className="inbox-grid">
          <aside className="conversation-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Unified inbox</p>
                <h2>Conversations</h2>
              </div>
              <button className="icon-button" aria-label="Conversation filters">≡</button>
            </div>
            <label className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, number or course"
              />
            </label>
            <div className="filter-tabs">
              <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All</button>
              <button className={filter === "UNREAD" ? "active" : ""} onClick={() => setFilter("UNREAD")}>Unread</button>
              <button className={filter === "HOT" ? "active" : ""} onClick={() => setFilter("HOT")}>Hot leads</button>
            </div>
            <div className="conversation-list">
              {filteredConversations.length === 0 ? (
                <div className="panel-empty-state">
                  <strong>No conversations found</strong>
                  <p>New WhatsApp messages will appear here after Meta webhook activation.</p>
                </div>
              ) : (
                filteredConversations.map((item) => (
                  <button
                    key={item.id}
                    data-conversation-id={item.id}
                    className={`conversation-item ${selectedId === item.id ? "selected" : ""}`}
                    onClick={() => void loadConversation(item.id)}
                  >
                    <span className="avatar">{initials(item.contact.name)}</span>
                    <span className="conversation-copy">
                      <span className="conversation-name-row">
                        <strong>{item.contact.name}</strong>
                        <time>{formatListTime(item.lastMessageAt)}</time>
                      </span>
                      <span className="conversation-preview">{messagePreview(item)}</span>
                      <span className="conversation-meta">
                        <TemperatureBadge value={item.lead?.temperature} />
                        <span>{readable(item.lead?.stage || item.status)}</span>
                      </span>
                    </span>
                    {item.unreadCount > 0 ? <span className="unread-count">{item.unreadCount}</span> : null}
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="chat-panel">
            <header className="chat-header">
              {selectedSummary ? (
                <>
                  <div className="chat-person">
                    <span className="avatar large">{initials(selectedSummary.contact.name)}</span>
                    <div>
                      <h2>{selectedSummary.contact.name}</h2>
                      <p>{selectedSummary.contact.phone}</p>
                    </div>
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
                      disabled={modeUpdating}
                      onClick={() => void changeMode(selectedSummary.agentMode === "HUMAN" ? "AI" : "HUMAN")}
                    >
                      {selectedSummary.agentMode === "HUMAN" ? "Resume AI" : "Take over"}
                    </button>
                    <button className="icon-button" title="More actions">•••</button>
                  </div>
                </>
              ) : (
                <div className="chat-person">
                  <div>
                    <h2>No conversation selected</h2>
                    <p>Incoming WhatsApp conversations will be listed on the left.</p>
                  </div>
                </div>
              )}
            </header>

            <div className="context-strip">
              <span>Intent: {readable(selected?.currentIntent)}</span>
              <span>Language: {readable(selected?.detectedLanguage)}</span>
              <span>Agent confidence: {selected?.aiConfidence != null ? `${Math.round(selected.aiConfidence * 100)}%` : "Not calculated"}</span>
              <span className="knowledge-ok">Mode: {readable(selectedSummary?.agentMode)}</span>
            </div>

            <div className="message-area">
              {loadingConversation ? (
                <div className="center-state">Loading conversation...</div>
              ) : error ? (
                <div className="center-state error-state">{error}</div>
              ) : !selected ? (
                <div className="center-state">
                  <strong>Inbox is ready</strong>
                  <p>Connect the Meta webhook to start receiving real messages.</p>
                </div>
              ) : selected.messages.length === 0 ? (
                <div className="center-state">No message has been stored in this conversation.</div>
              ) : (
                <>
                  <div className="day-divider"><span>Conversation history</span></div>
                  {selected.messages.map((message) => (
                    <div key={message.id} className={`message-row ${message.direction.toLowerCase()}`}>
                      <div className="message-bubble">
                        {message.direction === "OUTBOUND" ? (
                          <small>{message.actor === "AI" ? "AI Agent" : message.actor === "HUMAN" ? "Counselor" : readable(message.actor)}</small>
                        ) : null}
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
                  <div>
                    <strong>Agent context</strong>
                    <p>{selected.aiSummary || `Current detected intent: ${readable(selected.currentIntent)}.`}</p>
                  </div>
                  <button title="Decision review will open in the learning phase">Review</button>
                </div>
              ) : null}
            </div>

            <footer className="composer">
              <input
                ref={fileInputRef}
                className="media-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,video/mp4,audio/mpeg,audio/mp4,audio/ogg,audio/aac"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAttachment(file);
                }}
              />
              {uploadedMedia ? (
                <div className="composer-media-preview">
                  {uploadedMedia.kind === "image" ? <img src={uploadedMedia.previewUrl} alt="Attachment preview" /> : <span className="composer-media-type">{uploadedMedia.kind.toUpperCase()}</span>}
                  <div>
                    <strong>{uploadedMedia.name}</strong>
                    <small>{formatBytes(uploadedMedia.size)} · {uploadedMedia.mimeType}</small>
                  </div>
                  <button type="button" onClick={() => setUploadedMedia(null)} aria-label="Remove attachment">×</button>
                </div>
              ) : null}
              {composerNotice ? <div className="composer-feedback">{composerNotice}</div> : null}
              <div className="composer-tools">
                <button
                  type="button"
                  disabled={!selected || uploading || sending}
                  title="Attach image, PDF, document, video, or audio"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "…" : "＋"}
                </button>
                <button type="button" title="Open templates and targeted campaigns" onClick={() => window.location.assign("/campaigns")}>▤</button>
                <button type="button" title="Approved replies">✦</button>
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
                disabled={!selected || sending || uploading || (!draft.trim() && !uploadedMedia)}
                title="Queue this message under the current outbound safety mode"
                onClick={() => void sendMessage()}
              >
                {sending ? "Queueing..." : "Send"}
              </button>
            </footer>
          </section>

          <aside className="details-panel">
            {selectedSummary ? (
              <>
                <div className="lead-card-head">
                  <div>
                    <p className="eyebrow">Lead intelligence</p>
                    <h2>{selectedSummary.contact.name}</h2>
                  </div>
                  <TemperatureBadge value={selectedSummary.lead?.temperature} />
                </div>

                <div className="score-block">
                  <div className="score-ring"><strong>{selectedSummary.lead?.score ?? 0}</strong><span>/100</span></div>
                  <div>
                    <strong>Qualification score</strong>
                    <p>Calculated from captured profile and joining intent.</p>
                  </div>
                </div>

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
                  <div className="section-title-row">
                    <h3>AI summary</h3>
                    <button title="Summary editing will be enabled with lead editor">Edit</button>
                  </div>
                  <p className="summary-copy">{selected?.aiSummary || "No AI summary is available. It will be generated after message processing is connected."}</p>
                </section>

                <section className="detail-section">
                  <h3>Next actions</h3>
                  {nextActions.map((action) => (
                    <label className="task-check" key={action}>
                      <input type="checkbox" disabled /> {action}
                    </label>
                  ))}
                </section>

                <section className="learning-card">
                  <span>Controlled learning</span>
                  <strong>No raw chat is auto-trained</strong>
                  <p>Counselor corrections enter an approval queue before becoming reusable knowledge.</p>
                  <button title="Learning review page is part of the next dashboard module">Open learning queue</button>
                </section>
              </>
            ) : (
              <div className="panel-empty-state">
                <strong>No lead selected</strong>
                <p>Select a conversation to view qualification and agent context.</p>
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

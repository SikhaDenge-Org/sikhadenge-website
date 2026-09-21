"use client";

import { useMemo, useState } from "react";
import {
  conversations,
  sampleMessages,
  type DashboardConversation,
} from "../lib/mock-data";

function TemperatureBadge({ value }: { value: DashboardConversation["temperature"] }) {
  return <span className={`temperature temperature-${value.toLowerCase()}`}>{value}</span>;
}

export default function DashboardShell() {
  const [selectedId, setSelectedId] = useState(conversations[0].id);
  const [aiEnabled, setAiEnabled] = useState(conversations[0].aiEnabled);
  const [draft, setDraft] = useState("");

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? conversations[0],
    [selectedId],
  );

  function selectConversation(item: DashboardConversation) {
    setSelectedId(item.id);
    setAiEnabled(item.aiEnabled);
  }

  return (
    <main className="dashboard-shell">
      <aside className="rail" aria-label="Primary navigation">
        <div className="brand-mark">S</div>
        <nav>
          <button className="rail-button active" title="Inbox">⌁</button>
          <button className="rail-button" title="Contacts">◎</button>
          <button className="rail-button" title="Leads">◇</button>
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
            <div className="system-status"><span /> Cloud API connected</div>
            <button className="secondary-button">+ New conversation</button>
            <div className="profile-pill">AS</div>
          </div>
        </header>

        <section className="metric-row" aria-label="Operational summary">
          <article className="metric-card">
            <span>Open conversations</span>
            <strong>28</strong>
            <small>6 need attention</small>
          </article>
          <article className="metric-card">
            <span>AI handled today</span>
            <strong>74</strong>
            <small>91% resolved without handoff</small>
          </article>
          <article className="metric-card">
            <span>Qualified leads</span>
            <strong>19</strong>
            <small>8 hot · 11 warm</small>
          </article>
          <article className="metric-card">
            <span>Average first reply</span>
            <strong>7s</strong>
            <small>Within target</small>
          </article>
        </section>

        <section className="inbox-grid">
          <aside className="conversation-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Unified inbox</p>
                <h2>Conversations</h2>
              </div>
              <button className="icon-button" aria-label="Filter conversations">≡</button>
            </div>
            <label className="search-box">
              <span>⌕</span>
              <input placeholder="Search name or number" />
            </label>
            <div className="filter-tabs">
              <button className="active">All</button>
              <button>Unread</button>
              <button>Hot leads</button>
            </div>
            <div className="conversation-list">
              {conversations.map((item) => (
                <button
                  key={item.id}
                  className={`conversation-item ${selectedId === item.id ? "selected" : ""}`}
                  onClick={() => selectConversation(item)}
                >
                  <span className="avatar">{item.initials}</span>
                  <span className="conversation-copy">
                    <span className="conversation-name-row">
                      <strong>{item.name}</strong>
                      <time>{item.time}</time>
                    </span>
                    <span className="conversation-preview">{item.lastMessage}</span>
                    <span className="conversation-meta">
                      <TemperatureBadge value={item.temperature} />
                      <span>{item.stage}</span>
                    </span>
                  </span>
                  {item.unread > 0 ? <span className="unread-count">{item.unread}</span> : null}
                </button>
              ))}
            </div>
          </aside>

          <section className="chat-panel">
            <header className="chat-header">
              <div className="chat-person">
                <span className="avatar large">{selected.initials}</span>
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.phone} · last active now</p>
                </div>
              </div>
              <div className="chat-actions">
                <label className="ai-switch">
                  <span>AI Agent</span>
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(event) => setAiEnabled(event.target.checked)}
                  />
                  <i />
                </label>
                <button className="secondary-button">Assign</button>
                <button className="icon-button">•••</button>
              </div>
            </header>

            <div className="context-strip">
              <span>Intent: Freelancing course</span>
              <span>Language: Hinglish</span>
              <span>Agent confidence: 94%</span>
              <span className="knowledge-ok">Approved knowledge used</span>
            </div>

            <div className="message-area">
              <div className="day-divider"><span>Today</span></div>
              {sampleMessages.map((message) => (
                <div key={message.id} className={`message-row ${message.direction}`}>
                  <div className="message-bubble">
                    {message.label ? <small>{message.label}</small> : null}
                    <p>{message.body}</p>
                    <time>{message.time}</time>
                  </div>
                </div>
              ))}
              <div className="agent-thinking">
                <span className="thinking-dot" />
                <div>
                  <strong>Agent decision preview</strong>
                  <p>Next best action: ask occupation and joining timeline before counselor handoff.</p>
                </div>
                <button>Review</button>
              </div>
            </div>

            <footer className="composer">
              <div className="composer-tools">
                <button title="Attach file">＋</button>
                <button title="Use approved template">▤</button>
                <button title="Insert saved reply">✦</button>
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={aiEnabled ? "Type a manual reply or let AI continue..." : "AI paused. Type a counselor reply..."}
                rows={2}
              />
              <button className="send-button" disabled={!draft.trim()}>Send</button>
            </footer>
          </section>

          <aside className="details-panel">
            <div className="lead-card-head">
              <div>
                <p className="eyebrow">Lead intelligence</p>
                <h2>{selected.name}</h2>
              </div>
              <TemperatureBadge value={selected.temperature} />
            </div>

            <div className="score-block">
              <div className="score-ring"><strong>{selected.score}</strong><span>/100</span></div>
              <div>
                <strong>Qualification score</strong>
                <p>Clear goal, correct course and near-term interest.</p>
              </div>
            </div>

            <section className="detail-section">
              <h3>Lead profile</h3>
              <dl>
                <div><dt>Course</dt><dd>{selected.course}</dd></div>
                <div><dt>City</dt><dd>{selected.city}</dd></div>
                <div><dt>Source</dt><dd>{selected.source}</dd></div>
                <div><dt>Stage</dt><dd>{selected.stage}</dd></div>
                <div><dt>Owner</dt><dd>Unassigned</dd></div>
              </dl>
            </section>

            <section className="detail-section">
              <div className="section-title-row">
                <h3>AI summary</h3>
                <button>Edit</button>
              </div>
              <p className="summary-copy">
                Beginner learner wants to start AI-based freelancing. Evening availability is not confirmed. Fee discussion has not started.
              </p>
            </section>

            <section className="detail-section">
              <h3>Next actions</h3>
              <label className="task-check"><input type="checkbox" /> Confirm current occupation</label>
              <label className="task-check"><input type="checkbox" /> Ask joining timeline</label>
              <label className="task-check"><input type="checkbox" /> Offer counselor call after qualification</label>
            </section>

            <section className="learning-card">
              <span>Controlled learning</span>
              <strong>No raw chat is auto-trained</strong>
              <p>Counselor corrections enter an approval queue before becoming reusable knowledge.</p>
              <button>Open learning queue</button>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

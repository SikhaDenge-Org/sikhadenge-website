"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ContactRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  language: string | null;
  consentStatus: string;
  marketingOptInSource: string | null;
  source: string | null;
  batch: string | null;
  createdAt: string;
  updatedAt: string;
  conversation: {
    id: string;
    status: string;
    agentMode: string;
    lastMessageAt: string | null;
    messageCount: number;
    assignee: { id: string; name: string } | null;
    tags: Array<{ id: string; name: string; color: string | null }>;
  } | null;
  lead: {
    id: string;
    stage: string;
    temperature: string;
    score: number;
    interestedCourse: string | null;
    nextFollowUpAt: string | null;
    assignedTo: { id: string; name: string } | null;
  } | null;
};

type Metrics = { total: number; optedIn: number; optedOut: number; withLead: number };
type Options = {
  users: Array<{ id: string; name: string; role: string }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  city: string;
  language: string;
  consentStatus: string;
  optInSource: string;
  source: string;
  batch: string;
  interestedCourse: string;
  stage: string;
  temperature: string;
  assignedToId: string;
  tags: string;
};

type SegmentId = "ALL" | "LEADS" | "CUSTOMERS" | "HOT" | "FOLLOW_UP" | "NO_REPLY";

const EMPTY_FORM: FormState = {
  name: "",
  phone: "+91",
  email: "",
  city: "",
  language: "hi",
  consentStatus: "UNKNOWN",
  optInSource: "",
  source: "CRM_MANUAL",
  batch: "",
  interestedCourse: "",
  stage: "NEW",
  temperature: "COLD",
  assignedToId: "",
  tags: "",
};

const STAGES = [
  "NEW",
  "DISCOVERY",
  "QUALIFIED",
  "COUNSELOR_ASSIGNED",
  "DEMO_BOOKED",
  "PAYMENT_PENDING",
  "ENROLLED",
  "NURTURE",
  "CLOSED",
];

const SEGMENTS: Array<{ id: SegmentId; label: string }> = [
  { id: "ALL", label: "All contacts" },
  { id: "LEADS", label: "Leads" },
  { id: "CUSTOMERS", label: "Customers" },
  { id: "HOT", label: "Hot leads" },
  { id: "FOLLOW_UP", label: "Needs follow-up" },
  { id: "NO_REPLY", label: "No conversation" },
];

function readable(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null): string {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "C";
}

function contactToForm(contact: ContactRecord): FormState {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email || "",
    city: contact.city || "",
    language: contact.language || "",
    consentStatus: contact.consentStatus,
    optInSource: contact.marketingOptInSource || "",
    source: contact.source || "",
    batch: contact.batch || "",
    interestedCourse: contact.lead?.interestedCourse || "",
    stage: contact.lead?.stage || "NEW",
    temperature: contact.lead?.temperature || "COLD",
    assignedToId:
      contact.conversation?.assignee?.id || contact.lead?.assignedTo?.id || "",
    tags: contact.conversation?.tags.map((tag) => tag.name).join(", ") || "",
  };
}

function scoreTone(score: number): string {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function nextAction(contact: ContactRecord): string {
  if (contact.lead?.nextFollowUpAt) return `Follow up ${shortDate(contact.lead.nextFollowUpAt)}`;
  if (contact.lead?.stage === "PAYMENT_PENDING") return "Resolve payment";
  if (contact.lead?.stage === "DEMO_BOOKED") return "Confirm demo";
  if (contact.lead?.temperature === "HOT") return "Priority outreach";
  if (!contact.conversation) return "Start conversation";
  if (contact.consentStatus === "UNKNOWN") return "Verify consent";
  return "Continue nurture";
}

function contactSummary(contact: ContactRecord): string {
  const course = contact.lead?.interestedCourse || "course interest not captured";
  const stage = readable(contact.lead?.stage || "NEW");
  const temperature = readable(contact.lead?.temperature || "COLD");
  const owner = contact.conversation?.assignee?.name || contact.lead?.assignedTo?.name || "unassigned";
  return `${temperature} contact in ${stage} stage with ${course}. Current owner: ${owner}. ${nextAction(contact)}.`;
}

export default function ContactManager({ userRole }: { userRole: string }) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, optedIn: 0, optedOut: 0, withLead: 0 });
  const [options, setOptions] = useState<Options>({ users: [], tags: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [segment, setSegment] = useState<SegmentId>("ALL");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const canBulkManage = userRole === "ADMIN" || userRole === "MANAGER";

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts?limit=500", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as {
        contacts?: ContactRecord[];
        metrics?: Metrics;
        options?: Options;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Contacts could not be loaded.");
      setContacts(payload.contacts ?? []);
      setMetrics(payload.metrics ?? { total: 0, optedIn: 0, optedOut: 0, withLead: 0 });
      setOptions(payload.options ?? { users: [], tags: [] });
      setSelectedId((current) =>
        current && (payload.contacts ?? []).some((contact) => contact.id === current) ? current : null,
      );
      setSelectedIds((current) => current.filter((id) => (payload.contacts ?? []).some((contact) => contact.id === id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Contacts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, []);

  const intelligence = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let active7d = 0;
    let hot = 0;
    let followUp = 0;
    let unassigned = 0;

    for (const contact of contacts) {
      const last = contact.conversation?.lastMessageAt ? new Date(contact.conversation.lastMessageAt).getTime() : 0;
      if (last && now - last <= sevenDays) active7d += 1;
      if (contact.lead?.temperature === "HOT" || (contact.lead?.score ?? 0) >= 75) hot += 1;
      const followUpTime = contact.lead?.nextFollowUpAt ? new Date(contact.lead.nextFollowUpAt).getTime() : 0;
      if ((followUpTime && followUpTime <= now) || contact.lead?.stage === "PAYMENT_PENDING") followUp += 1;
      if (!contact.conversation?.assignee && !contact.lead?.assignedTo) unassigned += 1;
    }

    return { active7d, hot, followUp, unassigned };
  }, [contacts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();

    return contacts.filter((contact) => {
      const matchesQuery =
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.lead?.interestedCourse?.toLowerCase().includes(query) ||
        contact.conversation?.tags.some((tag) => tag.name.toLowerCase().includes(query));

      const matchesConsent = consentFilter === "ALL" || contact.consentStatus === consentFilter;
      const matchesStage = stageFilter === "ALL" || contact.lead?.stage === stageFilter;
      const followUpTime = contact.lead?.nextFollowUpAt ? new Date(contact.lead.nextFollowUpAt).getTime() : 0;

      const matchesSegment =
        segment === "ALL" ||
        (segment === "LEADS" && Boolean(contact.lead)) ||
        (segment === "CUSTOMERS" && contact.lead?.stage === "ENROLLED") ||
        (segment === "HOT" && (contact.lead?.temperature === "HOT" || (contact.lead?.score ?? 0) >= 75)) ||
        (segment === "FOLLOW_UP" && ((followUpTime > 0 && followUpTime <= now) || contact.lead?.stage === "PAYMENT_PENDING")) ||
        (segment === "NO_REPLY" && !contact.conversation);

      return Boolean(matchesQuery && matchesConsent && matchesStage && matchesSegment);
    });
  }, [contacts, consentFilter, search, segment, stageFilter]);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const allVisibleSelected = filtered.length > 0 && filtered.every((contact) => selectedIds.includes(contact.id));

  function startCreate() {
    setSelectedId(null);
    setMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setNotice(null);
    setError(null);
  }

  function startEdit(contact: ContactRecord) {
    setSelectedId(contact.id);
    setMode("edit");
    setForm(contactToForm(contact));
    setEditorOpen(true);
    setNotice(null);
    setError(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setSelectedId(null);
    setMode("create");
    setForm(EMPTY_FORM);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const visible = new Set(filtered.map((contact) => contact.id));
      setSelectedIds((current) => current.filter((id) => !visible.has(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...filtered.map((contact) => contact.id)])));
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...form,
        assignedToId: form.assignedToId || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      const url = mode === "edit" && selectedId ? `/api/contacts/${selectedId}` : "/api/contacts";
      const response = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const result = (await response.json()) as { contact?: ContactRecord; error?: string };
      if (!response.ok || !result.contact) throw new Error(result.error || "Contact could not be saved.");
      setNotice(mode === "edit" ? "Contact updated." : "Contact created safely.");
      setMode("edit");
      setSelectedId(result.contact.id);
      setForm(contactToForm(result.contact));
      await loadContacts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function importCsv(file: File) {
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/contacts/import", { method: "POST", body: formData });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const result = (await response.json()) as { created?: number; skipped?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "CSV import failed.");
      setNotice(`Import complete: ${result.created ?? 0} created, ${result.skipped ?? 0} skipped, ${result.failed ?? 0} failed.`);
      await loadContacts();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSV import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setNotice("WhatsApp number copied.");
    } catch {
      setNotice("Copy unavailable in this browser.");
    }
  }

  return (
    <div className={`contact-manager contact-manager-v2 ${editorOpen ? "is-editor-open" : ""}`}>
      <section className="contact-intelligence-head">
        <div className="contact-intelligence-copy">
          <div className="contact-intelligence-kicker"><span className="contact-ai-orb" /> Customer intelligence</div>
          <h2>Know who needs attention before the next message.</h2>
          <p>Live CRM signals from WhatsApp conversations, admission stages, ownership, consent and follow-up data.</p>
        </div>
        <div className="contact-intelligence-signal">
          <span>Priority signal</span>
          <strong>{intelligence.followUp + intelligence.hot}</strong>
          <small>hot or follow-up contacts to review</small>
        </div>
      </section>

      <section className="contact-metrics contact-metrics-v2" aria-label="Contact intelligence summary">
        <article className="metric-primary"><div className="metric-icon">⌁</div><div><span>Total contacts</span><strong>{metrics.total}</strong><small>Unified CRM profiles</small></div></article>
        <article><div className="metric-icon">↗</div><div><span>Active · 7 days</span><strong>{intelligence.active7d}</strong><small>Recent WhatsApp activity</small></div></article>
        <article><div className="metric-icon">◆</div><div><span>Hot leads</span><strong>{intelligence.hot}</strong><small>High-priority opportunities</small></div></article>
        <article><div className="metric-icon">◷</div><div><span>Needs follow-up</span><strong>{intelligence.followUp}</strong><small>{intelligence.unassigned} currently unassigned</small></div></article>
      </section>

      {error ? <div className="contact-alert error">{error}</div> : null}
      {notice ? <div className="contact-alert success">{notice}</div> : null}

      <section className="contact-workspace">
        <div className="contact-workspace-main">
          <nav className="contact-segments" aria-label="Contact segments">
            {SEGMENTS.map((item) => (
              <button key={item.id} type="button" className={segment === item.id ? "is-active" : ""} onClick={() => setSegment(item.id)}>
                {item.label}
                {item.id === "HOT" && intelligence.hot > 0 ? <span>{intelligence.hot}</span> : null}
                {item.id === "FOLLOW_UP" && intelligence.followUp > 0 ? <span>{intelligence.followUp}</span> : null}
              </button>
            ))}
          </nav>

          <section className="contact-toolbar contact-toolbar-v2">
            <label className="contact-search-v2">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Search contacts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contact, phone, course, city or tag" />
              <kbd>⌘ K</kbd>
            </label>
            <div className="contact-filter-row">
              <select aria-label="Filter by stage" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="ALL">Lifecycle stage</option>
                {STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}
              </select>
              <select aria-label="Filter by consent" value={consentFilter} onChange={(event) => setConsentFilter(event.target.value)}>
                <option value="ALL">WhatsApp consent</option>
                <option value="OPTED_IN">Opted-in</option>
                <option value="UNKNOWN">Unknown</option>
                <option value="OPTED_OUT">Opted-out</option>
              </select>
              <button type="button" className="contact-icon-button" onClick={() => void loadContacts()} aria-label="Refresh contacts">↻</button>
            </div>
            <div className="contact-toolbar-actions contact-toolbar-actions-v2">
              {canBulkManage ? <>
                <input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
                <button type="button" className="secondary" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? "Importing…" : "Import"}</button>
                <a className="contact-export" href="/api/contacts/export">Export</a>
              </> : null}
              <button type="button" className="contact-add-button" onClick={startCreate}><span>＋</span> Add contact</button>
            </div>
          </section>

          {selectedIds.length > 0 ? (
            <div className="contact-selection-bar">
              <strong>{selectedIds.length} selected</strong>
              <span>Selection is ready for supported bulk workflows.</span>
              <button type="button" onClick={() => setSelectedIds([])}>Clear selection</button>
            </div>
          ) : null}

          <section className="contact-directory contact-directory-v2">
            <header>
              <div><span>Unified directory</span><h3>{filtered.length} contacts</h3></div>
              <div className="contact-directory-meta"><span className="live-dot" /> Live CRM data</div>
            </header>
            <div className="contact-table-wrap contact-table-wrap-v2">
              {loading ? (
                <div className="contact-empty contact-loading"><span className="contact-loader" /><strong>Loading customer intelligence…</strong></div>
              ) : filtered.length === 0 ? (
                <div className="contact-empty"><div className="empty-icon">⌕</div><strong>No contacts match this view</strong><p>Adjust search, lifecycle filters or saved segment.</p></div>
              ) : (
                <table className="contact-table contact-table-v2">
                  <thead>
                    <tr>
                      <th className="check-cell"><input type="checkbox" aria-label="Select all visible contacts" checked={allVisibleSelected} onChange={toggleAllVisible} /></th>
                      <th>Contact</th>
                      <th>Lifecycle</th>
                      <th>Lead score</th>
                      <th>Owner & tags</th>
                      <th>Last interaction</th>
                      <th>Next action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((contact) => {
                      const score = contact.lead?.score ?? 0;
                      const owner = contact.conversation?.assignee?.name || contact.lead?.assignedTo?.name || "Unassigned";
                      const tags = contact.conversation?.tags ?? [];
                      return (
                        <tr key={contact.id} className={selectedId === contact.id ? "selected" : ""} onClick={() => startEdit(contact)}>
                          <td className="check-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${contact.name}`} checked={selectedIds.includes(contact.id)} onChange={() => toggleSelected(contact.id)} /></td>
                          <td className="contact-person-cell">
                            <div className="contact-avatar">{initials(contact.name)}<span /></div>
                            <div><strong>{contact.name}</strong><span className="contact-phone"><i>WA</i>{contact.phone}</span><small>{contact.email || contact.city || "Profile enrichment pending"}</small></div>
                          </td>
                          <td><span className={`stage-chip stage-${(contact.lead?.stage || "NEW").toLowerCase()}`}>{readable(contact.lead?.stage || "NEW")}</span><small className="table-subline">{contact.lead?.interestedCourse || "Course not set"}</small></td>
                          <td><div className={`score-cell score-${scoreTone(score)}`}><strong>{score}</strong><span>/100</span><div><i style={{ width: `${Math.max(4, Math.min(100, score))}%` }} /></div></div></td>
                          <td><strong className="owner-name">{owner}</strong><div className="tag-row">{tags.slice(0, 2).map((tag) => <span key={tag.id}>{tag.name}</span>)}{tags.length > 2 ? <span>+{tags.length - 2}</span> : null}{tags.length === 0 ? <small>No tags</small> : null}</div></td>
                          <td><strong className="activity-time">{dateTime(contact.conversation?.lastMessageAt || null)}</strong><small className="table-subline">{contact.conversation?.messageCount ?? 0} messages</small></td>
                          <td><span className="next-action">{nextAction(contact)}</span></td>
                          <td><span className={`consent-dot consent-${contact.consentStatus.toLowerCase()}`}><i />{readable(contact.consentStatus)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <aside className={`contact-editor contact-editor-v2 ${editorOpen ? "is-open" : ""}`}>
          {!editorOpen ? (
            <div className="contact-editor-empty">
              <div className="contact-editor-visual"><span>◎</span></div>
              <span className="contact-editor-kicker">Contact intelligence</span>
              <h3>Select a contact</h3>
              <p>Open any row to inspect profile signals, ownership, lifecycle, tags and the next recommended CRM action.</p>
              <button type="button" onClick={startCreate}>＋ Add new contact</button>
            </div>
          ) : (
            <>
              <header className="contact-editor-head">
                <div>
                  <span>{mode === "edit" ? "Contact intelligence" : "New CRM profile"}</span>
                  <h3>{mode === "edit" ? selected?.name || "Edit contact" : "Add contact"}</h3>
                </div>
                <button type="button" className="contact-close" aria-label="Close contact panel" onClick={closeEditor}>×</button>
              </header>

              {mode === "edit" && selected ? (
                <section className="contact-profile-summary">
                  <div className="profile-main">
                    <div className="contact-avatar contact-avatar-large">{initials(selected.name)}<span /></div>
                    <div><strong>{selected.name}</strong><span>{selected.phone}</span><small>{selected.email || selected.city || "Profile data incomplete"}</small></div>
                  </div>
                  <div className="profile-score"><span>Lead score</span><strong>{selected.lead?.score ?? 0}<small>/100</small></strong></div>
                  <div className="profile-actions">
                    {selected.conversation ? <button type="button" onClick={() => window.location.assign(`/inbox?conversationId=${encodeURIComponent(selected.conversation!.id)}`)}>Message</button> : <button type="button" disabled>Message</button>}
                    <button type="button" className="secondary" onClick={() => void copyPhone(selected.phone)}>Copy number</button>
                  </div>
                </section>
              ) : null}

              {mode === "edit" && selected ? (
                <section className="contact-smart-summary">
                  <div className="smart-summary-title"><span className="contact-ai-orb" /> Smart summary</div>
                  <p>{contactSummary(selected)}</p>
                  <div className="smart-summary-grid">
                    <div><span>Stage</span><strong>{readable(selected.lead?.stage || "NEW")}</strong></div>
                    <div><span>Next follow-up</span><strong>{shortDate(selected.lead?.nextFollowUpAt || null)}</strong></div>
                    <div><span>Source</span><strong>{readable(selected.source)}</strong></div>
                    <div><span>Messages</span><strong>{selected.conversation?.messageCount ?? 0}</strong></div>
                  </div>
                </section>
              ) : null}

              <form onSubmit={saveContact} className="contact-editor-form">
                <div className="contact-form-section-title"><span>Profile & CRM fields</span><small>Changes are written to the existing Contacts API.</small></div>
                <div className="contact-form-grid contact-form-grid-v2">
                  <label><span>Name *</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                  <label><span>WhatsApp phone *</span><input required disabled={mode === "edit"} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91…" /></label>
                  <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
                  <label><span>City</span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                  <label><span>Language</span><select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option value="hi">Hindi</option><option value="en">English</option><option value="hinglish">Hinglish</option></select></label>
                  <label><span>WhatsApp consent</span><select value={form.consentStatus} onChange={(event) => setForm({ ...form, consentStatus: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="OPTED_IN">Opted-in</option><option value="OPTED_OUT">Opted-out</option></select></label>
                  <label><span>Lead stage</span><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}</select></label>
                  <label><span>Priority</span><select value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })}><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option><option value="UNQUALIFIED">Unqualified</option></select></label>
                  <label><span>Counselor / owner</span><select value={form.assignedToId} onChange={(event) => setForm({ ...form, assignedToId: event.target.value })}><option value="">Unassigned</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {readable(user.role)}</option>)}</select></label>
                  <label><span>Interested course</span><input value={form.interestedCourse} onChange={(event) => setForm({ ...form, interestedCourse: event.target.value })} /></label>
                  <label><span>Source</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
                  <label><span>Batch</span><input value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} /></label>
                  <label className="wide"><span>Tags</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="demo, ai-course, payment-pending" list="crm-tag-options" /><datalist id="crm-tag-options">{options.tags.map((tag) => <option key={tag.id} value={tag.name} />)}</datalist></label>
                  <label className="wide"><span>Opt-in source</span><input value={form.optInSource} onChange={(event) => setForm({ ...form, optInSource: event.target.value })} placeholder="Website form / workshop registration" /></label>
                </div>
                <div className="contact-consent-note"><strong>Consent protection</strong><p>Marketing outreach should only be sent to verified opted-in contacts. Opted-out contacts remain suppressed.</p></div>
                <div className="contact-form-actions contact-form-actions-v2"><button type="button" className="secondary" onClick={closeEditor}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create contact"}</button></div>
              </form>
            </>
          )}
        </aside>
      </section>

      <section className="contact-import-help contact-import-help-v2">
        <div><strong>CSV-ready CRM migration</strong><p>Supported columns: name, phone, email, city, language, consent_status, opt_in_source, source, batch, course, stage, temperature, counselor_id and tags.</p></div>
        <span>Country code required · Maximum 500 rows per import</span>
      </section>
    </div>
  );
}

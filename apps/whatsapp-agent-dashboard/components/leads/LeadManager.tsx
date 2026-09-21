"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Counselor = { id: string; name: string; role: string };
type LeadNote = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
};
type LeadMessage = {
  id: string;
  direction: string;
  actor: string;
  type: string;
  status: string;
  text: string | null;
  filename: string | null;
  messageTimestamp: string;
};
type LeadRecord = {
  id: string;
  contactId: string;
  conversationId: string;
  stage: string;
  temperature: string;
  score: number;
  occupation: string | null;
  experienceLevel: string | null;
  goal: string | null;
  interestedCourse: string | null;
  joiningTimeline: string | null;
  classAvailability: string | null;
  feeUnderstood: boolean;
  counselorRequested: boolean;
  nextFollowUpAt: string | null;
  qualifiedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slaState: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    email: string | null;
    language: string | null;
    consentStatus: string;
  };
  conversation: {
    id: string;
    status: string;
    agentMode: string;
    unreadCount: number;
    lastMessageAt: string | null;
    currentIntent: string | null;
    assignedTo: { id: string; name: string } | null;
    tags: Array<{ id: string; name: string; color: string | null }>;
    messages: LeadMessage[];
  };
  assignedTo: Counselor | null;
  notes: LeadNote[];
};

type Metrics = {
  total: number;
  hot: number;
  overdue: number;
  enrolled: number;
  paymentPending: number;
};
type Performance = Counselor & {
  assigned: number;
  enrolled: number;
  due: number;
  averageScore: number;
};

type LeadManagerProps = { userRole: string };

type ViewMode = "TABLE" | "KANBAN";

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
] as const;
const TEMPERATURES = ["HOT", "WARM", "COLD", "UNQUALIFIED"] as const;

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function readable(value: string | null | undefined): string {
  return value?.replaceAll("_", " ") || "Not captured";
}

function blankForm(lead: LeadRecord | null) {
  return {
    stage: lead?.stage ?? "NEW",
    temperature: lead?.temperature ?? "COLD",
    score: String(lead?.score ?? 0),
    occupation: lead?.occupation ?? "",
    experienceLevel: lead?.experienceLevel ?? "",
    goal: lead?.goal ?? "",
    interestedCourse: lead?.interestedCourse ?? "",
    joiningTimeline: lead?.joiningTimeline ?? "",
    classAvailability: lead?.classAvailability ?? "",
    feeUnderstood: lead?.feeUnderstood ?? false,
    counselorRequested: lead?.counselorRequested ?? false,
    nextFollowUpAt: dateInput(lead?.nextFollowUpAt ?? null),
    assignedToId: lead?.assignedTo?.id ?? "",
  };
}

export default function LeadManager({ userRole }: LeadManagerProps) {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    total: 0,
    hot: 0,
    overdue: 0,
    enrolled: 0,
    paymentPending: 0,
  });
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>("TABLE");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [temperatureFilter, setTemperatureFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [dueOnly, setDueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [bulkStage, setBulkStage] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");

  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const [form, setForm] = useState(() => blankForm(null));

  useEffect(() => {
    setForm(blankForm(selected));
    setNoteBody("");
  }, [selectedId, selected?.updatedAt]);

  async function loadLeads(preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "250" });
      if (search.trim()) params.set("search", search.trim());
      if (stageFilter !== "ALL") params.set("stage", stageFilter);
      if (temperatureFilter !== "ALL") params.set("temperature", temperatureFilter);
      if (assigneeFilter !== "ALL") params.set("assignedToId", assigneeFilter);
      if (dueOnly) params.set("due", "1");
      const response = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as {
        leads?: LeadRecord[];
        metrics?: Metrics;
        options?: { counselors?: Counselor[] };
        performance?: Performance[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Leads could not be loaded.");
      const nextLeads = payload.leads ?? [];
      setLeads(nextLeads);
      setMetrics(payload.metrics ?? metrics);
      setCounselors(payload.options?.counselors ?? []);
      setPerformance(payload.performance ?? []);
      const candidate = preferredId || selectedId;
      setSelectedId(
        candidate && nextLeads.some((lead) => lead.id === candidate)
          ? candidate
          : nextLeads[0]?.id ?? null,
      );
      setSelectedIds((current) => current.filter((id) => nextLeads.some((lead) => lead.id === id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Leads could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLeads(), 250);
    return () => window.clearTimeout(timer);
  }, [search, stageFilter, temperatureFilter, assigneeFilter, dueOnly]);

  const grouped = useMemo(
    () =>
      STAGES.map((stage) => ({
        stage,
        leads: leads.filter((lead) => lead.stage === stage),
      })),
    [leads],
  );

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          score: Number(form.score),
          nextFollowUpAt: form.nextFollowUpAt
            ? new Date(form.nextFollowUpAt).toISOString()
            : null,
          assignedToId: form.assignedToId || null,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as { lead?: LeadRecord; error?: string };
      if (!response.ok || !payload.lead) throw new Error(payload.error || "Lead update failed.");
      setNotice("Lead profile and follow-up updated.");
      await loadLeads(payload.lead.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lead update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!selected || !noteBody.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(selected.id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as { note?: LeadNote; error?: string };
      if (!response.ok || !payload.note) throw new Error(payload.error || "Note could not be added.");
      setNoteBody("");
      setNotice("Counselor note added.");
      await loadLeads(selected.id);
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "Note could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function applyBulk() {
    if (selectedIds.length === 0 || saving) return;
    const values: Record<string, unknown> = {};
    if (bulkStage) values.stage = bulkStage;
    if (bulkAssignee) values.assignedToId = bulkAssignee === "UNASSIGNED" ? null : bulkAssignee;
    if (Object.keys(values).length === 0) {
      setError("Choose a bulk stage or counselor.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/leads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedIds, values }),
      });
      const payload = (await response.json()) as { updated?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Bulk update failed.");
      setNotice(`${payload.updated ?? 0} leads updated.`);
      setSelectedIds([]);
      setBulkStage("");
      setBulkAssignee("");
      await loadLeads(selectedId);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk update failed.");
    } finally {
      setSaving(false);
    }
  }

  const canBulk = userRole === "ADMIN" || userRole === "MANAGER";

  return (
    <div className="lead-manager">
      <section className="lead-metrics">
        <article><span>Total leads</span><strong>{metrics.total}</strong><small>Admission pipeline</small></article>
        <article><span>Hot leads</span><strong>{metrics.hot}</strong><small>High-priority intent</small></article>
        <article><span>Follow-up overdue</span><strong>{metrics.overdue}</strong><small>Needs counselor action</small></article>
        <article><span>Payment pending</span><strong>{metrics.paymentPending}</strong><small>Conversion queue</small></article>
        <article><span>Enrolled</span><strong>{metrics.enrolled}</strong><small>Completed admissions</small></article>
      </section>

      {error ? <div className="lead-alert error">{error}</div> : null}
      {notice ? <div className="lead-alert success">{notice}</div> : null}

      <section className="lead-toolbar">
        <div className="lead-filter-group">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, city, course or goal" />
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="ALL">All stages</option>
            {STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}
          </select>
          <select value={temperatureFilter} onChange={(event) => setTemperatureFilter(event.target.value)}>
            <option value="ALL">All priorities</option>
            {TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{temperature}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
            <option value="ALL">All counselors</option>
            {counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}
          </select>
          <label className="lead-due-toggle"><input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} /> Due or overdue</label>
        </div>
        <div className="lead-view-toggle">
          <button className={view === "TABLE" ? "active" : ""} onClick={() => setView("TABLE")} type="button">Table</button>
          <button className={view === "KANBAN" ? "active" : ""} onClick={() => setView("KANBAN")} type="button">Pipeline</button>
          <button type="button" className="refresh" onClick={() => void loadLeads(selectedId)} disabled={loading}>Refresh</button>
        </div>
      </section>

      {canBulk && selectedIds.length > 0 ? (
        <section className="lead-bulk-bar">
          <strong>{selectedIds.length} selected</strong>
          <select value={bulkStage} onChange={(event) => setBulkStage(event.target.value)}>
            <option value="">Keep stage</option>
            {STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}
          </select>
          <select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}>
            <option value="">Keep counselor</option>
            <option value="UNASSIGNED">Unassigned</option>
            {counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}
          </select>
          <button type="button" onClick={() => void applyBulk()} disabled={saving}>Apply bulk update</button>
          <button type="button" className="ghost" onClick={() => setSelectedIds([])}>Clear</button>
        </section>
      ) : null}

      <section className="lead-workspace">
        <div className="lead-directory">
          {loading ? <div className="lead-empty">Loading admission pipeline...</div> : leads.length === 0 ? <div className="lead-empty"><strong>No leads found</strong><p>Change filters or capture a new student enquiry.</p></div> : view === "TABLE" ? (
            <div className="lead-table-wrap">
              <table className="lead-table">
                <thead><tr><th></th><th>Student</th><th>Stage</th><th>Priority</th><th>Score</th><th>Follow-up</th><th>Owner</th></tr></thead>
                <tbody>{leads.map((lead) => (
                  <tr key={lead.id} className={selectedId === lead.id ? "selected" : ""} onClick={() => setSelectedId(lead.id)}>
                    <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))} /></td>
                    <td><strong>{lead.contact.name}</strong><span>{lead.contact.phone}</span><small>{lead.interestedCourse || lead.contact.city || "Course not captured"}</small></td>
                    <td><span className={`lead-pill stage-${lead.stage.toLowerCase()}`}>{readable(lead.stage)}</span></td>
                    <td><span className={`lead-pill temp-${lead.temperature.toLowerCase()}`}>{lead.temperature}</span></td>
                    <td><strong>{lead.score}/100</strong><small>{lead.conversation.unreadCount} unread</small></td>
                    <td><strong className={`sla-${lead.slaState.toLowerCase()}`}>{readable(lead.slaState)}</strong><small>{formatDate(lead.nextFollowUpAt)}</small></td>
                    <td><strong>{lead.assignedTo?.name || "Unassigned"}</strong><small>{readable(lead.conversation.agentMode)}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="lead-kanban">
              {grouped.map((column) => (
                <section className="lead-kanban-column" key={column.stage}>
                  <header><strong>{readable(column.stage)}</strong><span>{column.leads.length}</span></header>
                  <div>{column.leads.map((lead) => (
                    <button key={lead.id} type="button" className={selectedId === lead.id ? "selected" : ""} onClick={() => setSelectedId(lead.id)}>
                      <strong>{lead.contact.name}</strong><span>{lead.interestedCourse || "Course not captured"}</span>
                      <small><b>{lead.temperature}</b> · {lead.score}/100</small>
                      <small className={`sla-${lead.slaState.toLowerCase()}`}>{formatDate(lead.nextFollowUpAt)}</small>
                    </button>
                  ))}</div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="lead-editor">
          {!selected ? <div className="lead-empty"><strong>Select a lead</strong><p>Qualification, follow-up and counselor controls will appear here.</p></div> : (
            <>
              <header>
                <div><span>Lead profile</span><h3>{selected.contact.name}</h3><p>{selected.contact.phone} · {selected.contact.city || "City not captured"}</p></div>
                <a href="/inbox">Open inbox</a>
              </header>
              <form onSubmit={saveLead}>
                <div className="lead-form-grid">
                  <label><span>Stage</span><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}</select></label>
                  <label><span>Priority</span><select value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })}>{TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{temperature}</option>)}</select></label>
                  <label><span>Lead score</span><input type="number" min="0" max="100" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} /></label>
                  <label><span>Counselor</span><select value={form.assignedToId} onChange={(event) => setForm({ ...form, assignedToId: event.target.value })}><option value="">Unassigned</option>{counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}</select></label>
                  <label className="wide"><span>Course interest</span><input value={form.interestedCourse} onChange={(event) => setForm({ ...form, interestedCourse: event.target.value })} /></label>
                  <label><span>Occupation</span><input value={form.occupation} onChange={(event) => setForm({ ...form, occupation: event.target.value })} /></label>
                  <label><span>Experience</span><input value={form.experienceLevel} onChange={(event) => setForm({ ...form, experienceLevel: event.target.value })} /></label>
                  <label><span>Joining timeline</span><input value={form.joiningTimeline} onChange={(event) => setForm({ ...form, joiningTimeline: event.target.value })} /></label>
                  <label><span>Class availability</span><input value={form.classAvailability} onChange={(event) => setForm({ ...form, classAvailability: event.target.value })} /></label>
                  <label className="wide"><span>Next follow-up</span><input type="datetime-local" value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} /></label>
                  <label className="wide"><span>Primary goal</span><textarea rows={3} value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} /></label>
                </div>
                <div className="lead-checks">
                  <label><input type="checkbox" checked={form.feeUnderstood} onChange={(event) => setForm({ ...form, feeUnderstood: event.target.checked })} /> Fee understood</label>
                  <label><input type="checkbox" checked={form.counselorRequested} onChange={(event) => setForm({ ...form, counselorRequested: event.target.checked })} /> Counselor requested</label>
                </div>
                <button className="lead-save" type="submit" disabled={saving}>{saving ? "Saving..." : "Save lead"}</button>
              </form>

              <section className="lead-detail-section">
                <header><strong>Counselor notes</strong><span>{selected.notes.length}</span></header>
                <div className="lead-note-composer"><textarea rows={2} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Add internal follow-up note" /><button type="button" onClick={() => void addNote()} disabled={!noteBody.trim() || saving}>Add note</button></div>
                <div className="lead-notes">{selected.notes.length === 0 ? <p>No counselor notes yet.</p> : selected.notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.author.name} · {formatDate(note.createdAt)}</small></article>)}</div>
              </section>

              <section className="lead-detail-section">
                <header><strong>Recent activity</strong><span>{selected.conversation.messages.length}</span></header>
                <div className="lead-activity">{selected.conversation.messages.length === 0 ? <p>No messages stored.</p> : selected.conversation.messages.map((message) => <article key={message.id}><strong>{message.direction === "INBOUND" ? selected.contact.name : readable(message.actor)}</strong><p>{message.text || message.filename || `[${readable(message.type)}]`}</p><small>{formatDate(message.messageTimestamp)} · {readable(message.status)}</small></article>)}</div>
              </section>
            </>
          )}
        </aside>
      </section>

      <section className="lead-performance">
        <header><div><span>Counselor performance</span><h3>Admission ownership</h3></div><small>Current assigned pipeline</small></header>
        <div>{performance.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.assigned} assigned</span><span>{item.enrolled} enrolled</span><span>{item.due} due</span><small>Average score {item.averageScore}</small></article>)}</div>
      </section>
    </div>
  );
}

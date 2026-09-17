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

function readable(value: string | null | undefined): string {
  return value?.replaceAll("_", " ") || "Not set";
}

function dateTime(value: string | null): string {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

export default function ContactManager({ userRole }: { userRole: string }) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, optedIn: 0, optedOut: 0, withLead: 0 });
  const [options, setOptions] = useState<Options>({ users: [], tags: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mode, setMode] = useState<"create" | "edit">("create");
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
      setSelectedId((current) => current ?? payload.contacts?.[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Contacts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesQuery =
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.city?.toLowerCase().includes(query) ||
        contact.lead?.interestedCourse?.toLowerCase().includes(query);
      const matchesConsent = consentFilter === "ALL" || contact.consentStatus === consentFilter;
      const matchesStage = stageFilter === "ALL" || contact.lead?.stage === stageFilter;
      return Boolean(matchesQuery && matchesConsent && matchesStage);
    });
  }, [contacts, consentFilter, search, stageFilter]);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;

  function startCreate() {
    setMode("create");
    setForm(EMPTY_FORM);
    setNotice(null);
    setError(null);
  }

  function startEdit(contact: ContactRecord) {
    setSelectedId(contact.id);
    setMode("edit");
    setForm(contactToForm(contact));
    setNotice(null);
    setError(null);
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
      if (!response.ok || !result.contact) {
        throw new Error(result.error || "Contact could not be saved.");
      }
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
      const result = (await response.json()) as {
        created?: number;
        skipped?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "CSV import failed.");
      setNotice(
        `Import complete: ${result.created ?? 0} created, ${result.skipped ?? 0} skipped, ${result.failed ?? 0} failed.`,
      );
      await loadContacts();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSV import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <div className="contact-manager">
      <section className="contact-metrics" aria-label="Contact summary">
        <article><span>Total contacts</span><strong>{metrics.total}</strong><small>WhatsApp CRM profiles</small></article>
        <article><span>Marketing opted-in</span><strong>{metrics.optedIn}</strong><small>Eligible for consent-safe targeting</small></article>
        <article><span>Opted-out</span><strong>{metrics.optedOut}</strong><small>Suppressed from outreach</small></article>
        <article><span>Lead profiles</span><strong>{metrics.withLead}</strong><small>Linked to admission pipeline</small></article>
      </section>

      {error ? <div className="contact-alert error">{error}</div> : null}
      {notice ? <div className="contact-alert success">{notice}</div> : null}

      <section className="contact-toolbar">
        <div className="contact-search-group">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, city or course" />
          <select value={consentFilter} onChange={(event) => setConsentFilter(event.target.value)}>
            <option value="ALL">All consent</option><option value="OPTED_IN">Opted-in</option><option value="UNKNOWN">Unknown</option><option value="OPTED_OUT">Opted-out</option>
          </select>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="ALL">All stages</option>{STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}
          </select>
        </div>
        <div className="contact-toolbar-actions">
          <button type="button" onClick={startCreate}>Add contact</button>
          {canBulkManage ? <>
            <input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
            <button type="button" className="secondary" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? "Importing..." : "Import CSV"}</button>
            <a className="contact-export" href="/api/contacts/export">Export CSV</a>
          </> : null}
        </div>
      </section>

      <section className="contact-grid">
        <div className="contact-directory">
          <header><div><span>Student directory</span><h3>{filtered.length} visible contacts</h3></div><button type="button" className="ghost" onClick={() => void loadContacts()}>Refresh</button></header>
          <div className="contact-table-wrap">
            {loading ? <div className="contact-empty">Loading contacts...</div> : filtered.length === 0 ? <div className="contact-empty"><strong>No contacts found</strong><p>Add a contact or adjust the filters.</p></div> : (
              <table className="contact-table">
                <thead><tr><th>Student</th><th>Consent</th><th>Lead</th><th>Owner</th><th>Activity</th></tr></thead>
                <tbody>{filtered.map((contact) => (
                  <tr key={contact.id} className={selectedId === contact.id ? "selected" : ""} onClick={() => { setSelectedId(contact.id); startEdit(contact); }}>
                    <td><strong>{contact.name}</strong><span>{contact.phone}</span><small>{contact.city || contact.email || "Profile incomplete"}</small></td>
                    <td><span className={`contact-pill consent-${contact.consentStatus.toLowerCase()}`}>{readable(contact.consentStatus)}</span></td>
                    <td><strong>{readable(contact.lead?.stage)}</strong><span>{contact.lead?.interestedCourse || "Course not set"}</span><small>{contact.lead?.score ?? 0}/100 · {readable(contact.lead?.temperature)}</small></td>
                    <td><strong>{contact.conversation?.assignee?.name || contact.lead?.assignedTo?.name || "Unassigned"}</strong><span>{contact.conversation?.tags.map((tag) => tag.name).join(", ") || "No tags"}</span></td>
                    <td><strong>{dateTime(contact.conversation?.lastMessageAt || null)}</strong><span>{contact.conversation?.messageCount ?? 0} messages</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="contact-editor">
          <header><div><span>{mode === "edit" ? "Profile editor" : "New learner"}</span><h3>{mode === "edit" ? selected?.name || "Edit contact" : "Add contact"}</h3></div>{selected?.conversation ? <button type="button" className="ghost" onClick={() => window.location.assign(`/inbox?conversationId=${encodeURIComponent(selected.conversation!.id)}`)}>Open inbox</button> : null}</header>
          <form onSubmit={saveContact}>
            <div className="contact-form-grid">
              <label><span>Name *</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label><span>WhatsApp phone *</span><input required disabled={mode === "edit"} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+918808505575" /></label>
              <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label><span>City</span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label><span>Language</span><select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option value="hi">Hindi</option><option value="en">English</option><option value="hinglish">Hinglish</option></select></label>
              <label><span>Consent</span><select value={form.consentStatus} onChange={(event) => setForm({ ...form, consentStatus: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="OPTED_IN">Opted-in</option><option value="OPTED_OUT">Opted-out</option></select></label>
              <label><span>Opt-in source</span><input value={form.optInSource} onChange={(event) => setForm({ ...form, optInSource: event.target.value })} placeholder="Website form / demo registration" /></label>
              <label><span>Source</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
              <label><span>Batch</span><input value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} /></label>
              <label><span>Interested course</span><input value={form.interestedCourse} onChange={(event) => setForm({ ...form, interestedCourse: event.target.value })} /></label>
              <label><span>Lead stage</span><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{STAGES.map((stage) => <option key={stage} value={stage}>{readable(stage)}</option>)}</select></label>
              <label><span>Priority</span><select value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })}><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option><option value="UNQUALIFIED">Unqualified</option></select></label>
              <label><span>Counselor</span><select value={form.assignedToId} onChange={(event) => setForm({ ...form, assignedToId: event.target.value })}><option value="">Unassigned</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {readable(user.role)}</option>)}</select></label>
              <label className="wide"><span>Tags</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="demo, ai-course, payment-pending" list="crm-tag-options" /><datalist id="crm-tag-options">{options.tags.map((tag) => <option key={tag.id} value={tag.name} />)}</datalist></label>
            </div>
            <div className="contact-consent-note"><strong>Consent protection</strong><p>Only verified opted-in contacts should receive marketing campaigns. Opted-out contacts stay suppressed automatically.</p></div>
            <div className="contact-form-actions"><button type="button" className="secondary" onClick={startCreate}>Clear</button><button type="submit" disabled={saving}>{saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create contact"}</button></div>
          </form>
        </aside>
      </section>

      <section className="contact-import-help">
        <strong>CSV columns</strong>
        <p>name, phone, email, city, language, consent_status, opt_in_source, source, batch, course, stage, temperature, counselor_id, tags. Country code is required in phone numbers. Maximum 500 rows per import.</p>
      </section>
    </div>
  );
}

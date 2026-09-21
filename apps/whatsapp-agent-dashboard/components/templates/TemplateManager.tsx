"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TemplateRecord = {
  id: string;
  metaTemplateId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
type ButtonType = "NONE" | "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

function jsonRequest(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: string): string {
  return `template-status template-status-${status.toLowerCase()}`;
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState("UTILITY");
  const [headerType, setHeaderType] = useState<HeaderType>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttonType, setButtonType] = useState<ButtonType>("NONE");
  const [buttonText, setButtonText] = useState("");
  const [buttonValue, setButtonValue] = useState("");

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/templates?limit=250", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as {
        templates?: TemplateRecord[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Templates could not be loaded.");
      setTemplates(payload.templates ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Templates could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesSearch =
        !query ||
        template.name.toLowerCase().includes(query) ||
        template.language.toLowerCase().includes(query) ||
        template.category.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "ALL" || template.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, templates]);

  const metrics = useMemo(() => {
    const count = (status: string) => templates.filter((item) => item.status === status).length;
    return {
      total: templates.length,
      approved: count("APPROVED"),
      pending: count("PENDING"),
      rejected: count("REJECTED"),
    };
  }, [templates]);

  function buildComponents() {
    const components: Array<Record<string, unknown>> = [];
    if (headerType === "TEXT") {
      if (!headerText.trim()) throw new Error("Header text is required.");
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    } else if (headerType !== "NONE") {
      components.push({
        type: "HEADER",
        format: headerType,
        example: { header_handle: ["REPLACE_WITH_META_SAMPLE_HANDLE_BEFORE_SUBMIT"] },
      });
    }

    if (!body.trim()) throw new Error("Template body is required.");
    components.push({ type: "BODY", text: body.trim() });
    if (footer.trim()) components.push({ type: "FOOTER", text: footer.trim() });

    if (buttonType !== "NONE") {
      if (!buttonText.trim()) throw new Error("Button text is required.");
      const button: Record<string, unknown> = { type: buttonType, text: buttonText.trim() };
      if (buttonType === "URL") {
        if (!buttonValue.trim()) throw new Error("Website URL is required.");
        button.url = buttonValue.trim();
      }
      if (buttonType === "PHONE_NUMBER") {
        if (!buttonValue.trim()) throw new Error("Phone number is required.");
        button.phone_number = buttonValue.trim();
      }
      components.push({ type: "BUTTONS", buttons: [button] });
    }
    return components;
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const components = buildComponents();
      const response = await jsonRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({ name, language, category, components }),
      });
      const payload = (await response.json()) as { template?: TemplateRecord; error?: string };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "Template draft could not be created.");
      }
      setTemplates((current) => [payload.template as TemplateRecord, ...current]);
      setName("");
      setHeaderText("");
      setBody("");
      setFooter("");
      setButtonText("");
      setButtonValue("");
      setHeaderType("NONE");
      setButtonType("NONE");
      setNotice("Template draft saved. Review it before submitting to Meta.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Template draft could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function submitTemplate(template: TemplateRecord) {
    if (!window.confirm(`Submit “${template.name}” to Meta for review?`)) return;
    setBusy(template.id);
    setError(null);
    setNotice(null);
    try {
      const response = await jsonRequest(`/api/templates/${encodeURIComponent(template.id)}/submit`, {
        method: "POST",
        body: "{}",
      });
      const payload = (await response.json()) as { template?: TemplateRecord; error?: string };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "Template submission failed.");
      }
      setTemplates((current) =>
        current.map((item) => (item.id === template.id ? (payload.template as TemplateRecord) : item)),
      );
      setNotice("Template submitted to Meta. Use Sync Status to refresh approval state.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Template submission failed.");
    } finally {
      setBusy(null);
    }
  }

  async function syncTemplates() {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const response = await jsonRequest("/api/templates/sync", { method: "POST", body: "{}" });
      const payload = (await response.json()) as {
        fetched?: number;
        created?: number;
        updated?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Template sync failed.");
      await loadTemplates();
      setNotice(`Meta sync complete: ${payload.fetched ?? 0} fetched, ${payload.created ?? 0} added, ${payload.updated ?? 0} updated.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Template sync failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="template-manager">
      <div className="template-metrics">
        <article><span>Total templates</span><strong>{metrics.total}</strong></article>
        <article><span>Approved</span><strong>{metrics.approved}</strong></article>
        <article><span>Pending review</span><strong>{metrics.pending}</strong></article>
        <article><span>Rejected</span><strong>{metrics.rejected}</strong></article>
      </div>

      {error ? <div className="template-alert template-alert-error">{error}</div> : null}
      {notice ? <div className="template-alert template-alert-success">{notice}</div> : null}

      <div className="template-layout">
        <form className="template-editor" onSubmit={createDraft}>
          <div className="template-section-heading">
            <div><span>Template builder</span><h3>Create message template</h3></div>
            <small>Saved locally first</small>
          </div>

          <div className="template-form-grid">
            <label><span>Template name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="become_ai_expert_followup" required /></label>
            <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en_US">English (US)</option><option value="en">English</option><option value="hi">Hindi</option><option value="hi_IN">Hindi (India)</option></select></label>
            <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Authentication</option></select></label>
            <label><span>Header type</span><select value={headerType} onChange={(event) => setHeaderType(event.target.value as HeaderType)}><option value="NONE">No header</option><option value="TEXT">Text</option><option value="IMAGE">Image</option><option value="VIDEO">Video</option><option value="DOCUMENT">Document</option></select></label>
          </div>

          {headerType === "TEXT" ? <label className="template-wide-field"><span>Header text</span><input value={headerText} onChange={(event) => setHeaderText(event.target.value)} maxLength={60} /></label> : null}
          {headerType !== "NONE" && headerType !== "TEXT" ? <div className="template-guidance">Media-header templates need a Meta sample media handle before submission. Draft creation remains safe; final sample upload will be handled in the template media step.</div> : null}

          <label className="template-wide-field"><span>Message body</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} maxLength={1024} placeholder="Hello {{1}}, your demo class is scheduled for {{2}}." required /><small>Use variables such as {"{{1}}"}, {"{{2}}"}. Add sample values before Meta submission where required.</small></label>
          <label className="template-wide-field"><span>Footer (optional)</span><input value={footer} onChange={(event) => setFooter(event.target.value)} maxLength={60} placeholder="SikhaDenge Support" /></label>

          <div className="template-form-grid template-button-grid">
            <label><span>Button type</span><select value={buttonType} onChange={(event) => setButtonType(event.target.value as ButtonType)}><option value="NONE">No button</option><option value="QUICK_REPLY">Quick reply</option><option value="URL">Website</option><option value="PHONE_NUMBER">Phone call</option></select></label>
            {buttonType !== "NONE" ? <label><span>Button text</span><input value={buttonText} onChange={(event) => setButtonText(event.target.value)} maxLength={25} placeholder="View course" /></label> : null}
            {buttonType === "URL" || buttonType === "PHONE_NUMBER" ? <label><span>{buttonType === "URL" ? "Website URL" : "Phone number"}</span><input value={buttonValue} onChange={(event) => setButtonValue(event.target.value)} placeholder={buttonType === "URL" ? "https://www.sikhadenge.in" : "+918808505575"} /></label> : null}
          </div>

          <div className="template-form-actions">
            <button type="submit" disabled={busy !== null}>{busy === "create" ? "Saving..." : "Save draft"}</button>
            <span>Nothing is sent to Meta until you press Submit to Meta on a saved draft.</span>
          </div>
        </form>

        <section className="template-preview-card">
          <div className="template-section-heading"><div><span>Live preview</span><h3>WhatsApp card</h3></div></div>
          <div className="template-phone-preview">
            {headerType !== "NONE" ? <div className="template-preview-header">{headerType === "TEXT" ? headerText || "Header text" : `${headerType.toLowerCase()} header`}</div> : null}
            <p>{body || "Your template message preview will appear here."}</p>
            {footer ? <small>{footer}</small> : null}
            {buttonType !== "NONE" ? <button type="button">{buttonText || "Button"}</button> : null}
          </div>
          <div className="template-policy-note"><strong>Approval rule</strong><p>Meta reviews submitted templates. Only APPROVED templates become selectable for campaigns outside the customer-service window.</p></div>
        </section>
      </div>

      <section className="template-library">
        <div className="template-library-toolbar">
          <div><span>Template library</span><h3>Drafts and Meta statuses</h3></div>
          <div className="template-library-actions">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="PAUSED">Paused</option><option value="DISABLED">Disabled</option></select>
            <button type="button" onClick={() => void syncTemplates()} disabled={busy !== null}>{busy === "sync" ? "Syncing..." : "Sync Meta status"}</button>
          </div>
        </div>

        {loading ? <div className="template-empty">Loading templates...</div> : filtered.length === 0 ? <div className="template-empty">No templates match the current filter.</div> : <div className="template-table-wrap"><table className="template-table"><thead><tr><th>Name</th><th>Language</th><th>Category</th><th>Status</th><th>Meta sync</th><th>Action</th></tr></thead><tbody>{filtered.map((template) => <tr key={template.id}><td><strong>{template.name}</strong><small>{template.metaTemplateId ? `Meta ID: ${template.metaTemplateId}` : "Local draft"}</small></td><td>{template.language}</td><td>{template.category}</td><td><span className={statusClass(template.status)}>{template.status}</span></td><td>{formatDate(template.lastSyncedAt)}</td><td>{template.status === "DRAFT" || template.status === "REJECTED" ? <button type="button" className="template-submit-button" disabled={busy !== null} onClick={() => void submitTemplate(template)}>{busy === template.id ? "Submitting..." : "Submit to Meta"}</button> : <span className="template-readonly">Managed by Meta</span>}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

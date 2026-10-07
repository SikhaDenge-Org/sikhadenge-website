"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TemplateOption = {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
};

type OptionsResponse = {
  mode: "disabled" | "dry_run" | "live";
  campaignsEnabled: boolean;
  batchLimit: number;
  cities: string[];
  languages: string[];
  courses: string[];
  tags: Array<{ id: string; name: string }>;
  counselors: Array<{ id: string; name: string; role: string }>;
  templates: TemplateOption[];
  stages: string[];
  temperatures: string[];
};

type Filters = {
  preset: string;
  city: string;
  language: string;
  course: string;
  stage: string;
  temperature: string;
  tag: string;
  assignedToId: string;
};

type Recipient = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  language: string | null;
  stage: string | null;
  temperature: string | null;
  course: string | null;
  assignedTo: string | null;
};

type PreviewResponse = {
  total: number;
  previewLimit: number;
  launchBatchLimit: number;
  recipients: Recipient[];
};

type CampaignPlan = {
  campaignId: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  scheduledAt: string | null;
  batchSize: number;
  sendRatePerMinute: number;
  frequencyCapDays: number;
  audienceTotal: number;
  queued: number;
  skipped: number;
  failed: number;
  batchesCompleted: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  delivery: {
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
};

const defaultFilters: Filters = {
  preset: "all_opted_in",
  city: "",
  language: "",
  course: "",
  stage: "",
  temperature: "",
  tag: "",
  assignedToId: "",
};

const presets = [
  ["all_opted_in", "All opted-in students"],
  ["enrolled", "Enrolled students"],
  ["hot_leads", "Hot leads"],
  ["payment_pending", "Payment pending"],
  ["demo_booked", "Demo booked"],
  ["nurture", "Nurture audience"],
  ["follow_up_due", "Follow-up due"],
] as const;

function humanise(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function bodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) return false;
    return String((component as Record<string, unknown>).type || "").toUpperCase() === "BODY";
  });
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  return typeof (body as Record<string, unknown>).text === "string"
    ? String((body as Record<string, unknown>).text)
    : "";
}

function variableCount(text: string): number {
  const numbers = Array.from(text.matchAll(/\{\{(\d+)\}\}/g)).map((match) => Number(match[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}

function formatDate(value: string | null): string {
  if (!value) return "Immediate / ready";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export default function CampaignControlCenter() {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignPlan[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [batchSize, setBatchSize] = useState(250);
  const [sendRatePerMinute, setSendRatePerMinute] = useState(60);
  const [frequencyCapDays, setFrequencyCapDays] = useState(0);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [testResult, setTestResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedTemplate = useMemo(
    () => options?.templates.find((template) => template.id === templateId) ?? null,
    [options, templateId],
  );
  const templateBody = selectedTemplate ? bodyText(selectedTemplate.components) : "";
  const requiredVariables = useMemo(() => variableCount(templateBody), [templateBody]);

  async function loadHistory() {
    const response = await fetch("/api/campaigns/history?limit=50", { cache: "no-store" });
    const payload = await readJson<{ campaigns: CampaignPlan[] }>(response);
    setCampaigns(payload.campaigns);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/campaigns/options", { cache: "no-store" }).then((response) => readJson<OptionsResponse>(response)),
      fetch("/api/campaigns/history?limit=50", { cache: "no-store" }).then((response) => readJson<{ campaigns: CampaignPlan[] }>(response)),
    ])
      .then(([optionPayload, historyPayload]) => {
        if (!active) return;
        setOptions(optionPayload);
        setCampaigns(historyPayload.campaigns);
        if (optionPayload.templates.length === 1) setTemplateId(optionPayload.templates[0].id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Campaign controls could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVariables(Array.from({ length: requiredVariables }, () => ""));
    setTestResult("");
  }, [requiredVariables, templateId]);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setTestResult("");
    setSuccess("");
  }

  async function previewAudience(event?: FormEvent) {
    event?.preventDefault();
    setBusy("preview");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, limit: 30 }),
      });
      setPreview(await readJson<PreviewResponse>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audience preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function validateTest() {
    setBusy("test");
    setError("");
    setSuccess("");
    setTestResult("");
    try {
      const response = await fetch("/api/campaigns/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, filters, variables }),
      });
      const result = await readJson<{
        recipient: Recipient;
        renderedBody: string;
        outboundSent: boolean;
      }>(response);
      setTestResult(`${result.recipient.name}: ${result.renderedBody || "Template validated."}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign test failed.");
    } finally {
      setBusy("");
    }
  }

  async function savePlan() {
    if (!preview || preview.total === 0) {
      setError("Preview the audience before saving the campaign plan.");
      return;
    }
    setBusy("save");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/campaigns/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateId,
          filters,
          variables,
          scheduledAt: scheduledAt || null,
          batchSize,
          sendRatePerMinute,
          frequencyCapDays,
        }),
      });
      const result = await readJson<{ campaign: CampaignPlan }>(response);
      setSuccess(`Campaign ${result.campaign.name} saved with ${result.campaign.audienceTotal} eligible recipients.`);
      setName("");
      setScheduledAt("");
      await loadHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign plan could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function control(campaignId: string, action: "pause" | "resume" | "cancel") {
    setBusy(`${action}:${campaignId}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/control`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await readJson(response);
      setSuccess(`Campaign ${action} completed.`);
      await loadHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign control failed.");
    } finally {
      setBusy("");
    }
  }

  async function dispatch(campaignId: string) {
    const confirmed = window.confirm("Queue the next controlled campaign batch now?");
    if (!confirmed) return;
    setBusy(`dispatch:${campaignId}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/dispatch`, {
        method: "POST",
      });
      const result = await readJson<{ campaign: { batchQueued: number; batchSkipped: number; batchFailed: number } }>(response);
      setSuccess(`Batch queued: ${result.campaign.batchQueued}; skipped: ${result.campaign.batchSkipped}; failed: ${result.campaign.batchFailed}.`);
      await loadHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign dispatch failed.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="campaign-control-loading">Loading complete campaign controls…</div>;

  const canDispatch = options?.campaignsEnabled && options.mode === "live";
  const formReady = Boolean(
    name.trim().length >= 3 &&
      templateId &&
      preview &&
      preview.total > 0 &&
      variables.length === requiredVariables &&
      variables.every((value) => value.trim()),
  );

  return (
    <div className="campaign-control-center">
      <section className="campaign-control-metrics">
        <article><span>Outbound mode</span><strong>{options?.mode || "disabled"}</strong><small>Live dispatch remains locked until final cutover.</small></article>
        <article><span>Approved templates</span><strong>{options?.templates.length || 0}</strong><small>Only Meta-approved templates are selectable.</small></article>
        <article><span>Saved campaigns</span><strong>{campaigns.length}</strong><small>Ready, scheduled, paused and completed plans.</small></article>
        <article><span>Maximum audience</span><strong>{options?.batchLimit || 1_000}</strong><small>Consent-safe recipient cap per campaign.</small></article>
      </section>

      {error ? <div className="campaign-control-alert error">{error}</div> : null}
      {success ? <div className="campaign-control-alert success">{success}</div> : null}

      <form className="campaign-control-card" onSubmit={previewAudience}>
        <header><div><span>Audience targeting</span><h3>Build the exact student segment</h3><p>Opted-out and unknown-consent contacts are excluded automatically.</p></div><button type="button" className="secondary" onClick={() => { setFilters(defaultFilters); setPreview(null); }}>Reset</button></header>
        <div className="campaign-control-grid four">
          <label><span>Preset</span><select value={filters.preset} onChange={(event) => updateFilter("preset", event.target.value)}>{presets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Course</span><select value={filters.course} onChange={(event) => updateFilter("course", event.target.value)}><option value="">All courses</option>{options?.courses.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Stage</span><select value={filters.stage} onChange={(event) => updateFilter("stage", event.target.value)}><option value="">All stages</option>{options?.stages.map((value) => <option key={value} value={value}>{humanise(value)}</option>)}</select></label>
          <label><span>Priority</span><select value={filters.temperature} onChange={(event) => updateFilter("temperature", event.target.value)}><option value="">All priorities</option>{options?.temperatures.map((value) => <option key={value} value={value}>{humanise(value)}</option>)}</select></label>
          <label><span>City</span><select value={filters.city} onChange={(event) => updateFilter("city", event.target.value)}><option value="">All cities</option>{options?.cities.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Language</span><select value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}><option value="">All languages</option>{options?.languages.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Tag</span><select value={filters.tag} onChange={(event) => updateFilter("tag", event.target.value)}><option value="">All tags</option>{options?.tags.map((value) => <option key={value.id} value={value.name}>{value.name}</option>)}</select></label>
          <label><span>Counselor</span><select value={filters.assignedToId} onChange={(event) => updateFilter("assignedToId", event.target.value)}><option value="">All counselors</option>{options?.counselors.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
        </div>
        <footer><button type="submit" disabled={busy === "preview"}>{busy === "preview" ? "Checking…" : "Preview audience"}</button><strong>{preview ? `${preview.total} eligible recipients` : "Preview required"}</strong></footer>
      </form>

      <section className="campaign-control-card">
        <header><div><span>Campaign setup</span><h3>Personalise, schedule and control delivery</h3><p>Save now; actual WhatsApp dispatch unlocks only during final Meta cutover.</p></div></header>
        <div className="campaign-control-grid three">
          <label><span>Campaign name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Demo reminder - July" /></label>
          <label><span>Approved template</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Select template</option>{options?.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}</select></label>
          <label><span>Schedule</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
          <label><span>Queue batch size</span><input type="number" min={1} max={options?.batchLimit || 1_000} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))} /></label>
          <label><span>Rate per minute</span><input type="number" min={1} max={500} value={sendRatePerMinute} onChange={(event) => setSendRatePerMinute(Number(event.target.value))} /></label>
          <label><span>Frequency cap days</span><input type="number" min={0} max={90} value={frequencyCapDays} onChange={(event) => setFrequencyCapDays(Number(event.target.value))} /></label>
        </div>
        {selectedTemplate ? <div className="campaign-template-preview"><span>{selectedTemplate.category} · {selectedTemplate.language}</span><p>{templateBody || "Template body preview unavailable."}</p></div> : null}
        {variables.length ? <div className="campaign-variable-grid">{variables.map((value, index) => <label key={index}><span>Value for {`{{${index + 1}}}`}</span><input value={value} onChange={(event) => setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}</div> : null}
        {testResult ? <div className="campaign-test-result"><strong>Validated preview</strong><p>{testResult}</p></div> : null}
        <footer><button type="button" className="secondary" disabled={!templateId || busy === "test"} onClick={() => void validateTest()}>{busy === "test" ? "Validating…" : "Validate test preview"}</button><button type="button" disabled={!formReady || busy === "save"} onClick={() => void savePlan()}>{busy === "save" ? "Saving…" : "Save campaign plan"}</button></footer>
      </section>

      <section className="campaign-control-card">
        <header><div><span>Recipient preview</span><h3>{preview ? `${preview.total} eligible contacts` : "Audience not previewed"}</h3><p>Review sample recipients before saving the campaign.</p></div></header>
        {!preview || preview.recipients.length === 0 ? <div className="campaign-control-empty">No eligible recipient preview available.</div> : <div className="campaign-control-table-wrap"><table><thead><tr><th>Student</th><th>Course</th><th>Stage</th><th>Location</th><th>Counselor</th></tr></thead><tbody>{preview.recipients.map((recipient) => <tr key={recipient.id}><td><strong>{recipient.name}</strong><small>{recipient.phone}</small></td><td>{recipient.course || "—"}</td><td>{recipient.stage ? humanise(recipient.stage) : "—"}</td><td>{recipient.city || "—"}<small>{recipient.language || "Unknown"}</small></td><td>{recipient.assignedTo || "Unassigned"}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="campaign-control-card">
        <header><div><span>Campaign operations</span><h3>History, scheduling and delivery controls</h3><p>Pause, resume, cancel or dispatch the next controlled batch.</p></div><button type="button" className="secondary" onClick={() => void loadHistory()}>Refresh</button></header>
        {campaigns.length === 0 ? <div className="campaign-control-empty">No campaign plan has been saved yet.</div> : <div className="campaign-history-list">{campaigns.map((campaign) => <article key={campaign.campaignId} className="campaign-history-card"><div className="campaign-history-main"><div><span className={`campaign-status status-${campaign.status.toLowerCase()}`}>{humanise(campaign.status)}</span><h4>{campaign.name}</h4><p>{campaign.templateName} · {campaign.templateLanguage} · {formatDate(campaign.scheduledAt)}</p></div><div className="campaign-history-metrics"><span><strong>{campaign.audienceTotal}</strong> audience</span><span><strong>{campaign.queued}</strong> queued</span><span><strong>{campaign.delivery.delivered}</strong> delivered</span><span><strong>{campaign.delivery.read}</strong> read</span><span><strong>{campaign.delivery.failed + campaign.failed}</strong> failed</span></div></div>{campaign.lastError ? <div className="campaign-inline-error">{campaign.lastError}</div> : null}<footer><small>Batch {campaign.batchSize} · {campaign.sendRatePerMinute}/min · frequency cap {campaign.frequencyCapDays} days</small><div>{campaign.status !== "COMPLETED" && campaign.status !== "CANCELLED" ? <>{campaign.status === "PAUSED" ? <button type="button" className="secondary" disabled={busy === `resume:${campaign.campaignId}`} onClick={() => void control(campaign.campaignId, "resume")}>Resume</button> : <button type="button" className="secondary" disabled={busy === `pause:${campaign.campaignId}`} onClick={() => void control(campaign.campaignId, "pause")}>Pause</button>}<button type="button" className="danger" disabled={busy === `cancel:${campaign.campaignId}`} onClick={() => void control(campaign.campaignId, "cancel")}>Cancel</button><button type="button" disabled={!canDispatch || busy === `dispatch:${campaign.campaignId}`} title={canDispatch ? "Queue next batch" : "Locked until final cutover"} onClick={() => void dispatch(campaign.campaignId)}>Dispatch batch</button></> : null}</div></footer></article>)}</div>}
      </section>
    </div>
  );
}

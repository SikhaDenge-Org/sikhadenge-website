"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type RecipientPreview = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  language: string | null;
  stage: string | null;
  temperature: string | null;
  course: string | null;
  assignedTo: string | null;
  conversationId: string | null;
  serviceWindowExpiresAt: string | null;
};

type PreviewResponse = {
  total: number;
  previewLimit: number;
  launchBatchLimit: number;
  recipients: RecipientPreview[];
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

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

export default function TargetingManager() {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [campaignName, setCampaignName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/campaigns/options", { cache: "no-store" })
      .then((response) => readJson<OptionsResponse>(response))
      .then((payload) => {
        if (!active) return;
        setOptions(payload);
        if (payload.templates.length === 1) setTemplateId(payload.templates[0].id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Options failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setSuccess("");
  }, []);

  const selectedTemplate = useMemo(
    () => options?.templates.find((template) => template.id === templateId) ?? null,
    [options, templateId],
  );

  const launchReady = Boolean(
    options?.campaignsEnabled &&
      options.mode === "live" &&
      campaignName.trim().length >= 3 &&
      templateId &&
      preview &&
      preview.total > 0 &&
      preview.total <= preview.launchBatchLimit,
  );

  async function handlePreview(event?: FormEvent) {
    event?.preventDefault();
    setPreviewing(true);
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
      setPreviewing(false);
    }
  }

  async function handleLaunch() {
    if (!launchReady) return;
    const confirmed = window.confirm(
      `Queue this approved template for ${preview?.total ?? 0} opted-in recipients?`,
    );
    if (!confirmed) return;

    setLaunching(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          templateId,
          filters,
          components: [],
        }),
      });
      const result = await readJson<{
        campaignId: string;
        queued: number;
        skipped: number;
      }>(response);
      setSuccess(
        `Campaign ${result.campaignId.slice(0, 8)} queued: ${result.queued} recipients, ${result.skipped} skipped.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign launch failed.");
    } finally {
      setLaunching(false);
    }
  }

  if (loading) {
    return <div className="targeting-loading">Loading targeting controls…</div>;
  }

  return (
    <div className="targeting-manager">
      <section className="targeting-status-grid" aria-label="Campaign safeguards">
        <article className="targeting-status-card" data-icon="audience">
          <span>Eligible audience</span>
          <strong>Opted-in only</strong>
          <small>Opted-out and unknown-consent contacts are excluded automatically.</small>
        </article>
        <article className="targeting-status-card" data-icon="template">
          <span>Message rule</span>
          <strong>Approved templates</strong>
          <small>Bulk outreach cannot use an unapproved free-form message.</small>
        </article>
        <article className="targeting-status-card" data-icon="batch">
          <span>Safe batch</span>
          <strong>{options?.batchLimit ?? 1_000} recipients</strong>
          <small>Large audiences must be segmented into controlled batches.</small>
        </article>
        <article className="targeting-status-card" data-icon="lock">
          <span>Live campaign mode</span>
          <strong>{options?.campaignsEnabled && options.mode === "live" ? "Ready" : "Cutover locked"}</strong>
          <small>Preview is available now; launch unlocks only after final Meta cutover.</small>
        </article>
      </section>

      <form className="targeting-builder" onSubmit={handlePreview}>
        <header className="targeting-section-head">
          <div>
            <span className="targeting-kicker">Audience builder</span>
            <h3>Create a targeted student segment</h3>
            <p>Select the exact learners or leads who should receive the campaign.</p>
          </div>
          <button className="targeting-secondary-button" type="button" onClick={() => {
            setFilters(defaultFilters);
            setPreview(null);
            setError("");
            setSuccess("");
          }}>
            Reset filters
          </button>
        </header>

        <div className="targeting-form-grid">
          <label>
            <span>Audience preset</span>
            <select value={filters.preset} onChange={(event) => updateFilter("preset", event.target.value)}>
              {presets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Interested course</span>
            <select value={filters.course} onChange={(event) => updateFilter("course", event.target.value)}>
              <option value="">All courses</option>
              {options?.courses.map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
          </label>
          <label>
            <span>Lead stage</span>
            <select value={filters.stage} onChange={(event) => updateFilter("stage", event.target.value)}>
              <option value="">All stages</option>
              {options?.stages.map((stage) => <option key={stage} value={stage}>{humanise(stage)}</option>)}
            </select>
          </label>
          <label>
            <span>Temperature</span>
            <select value={filters.temperature} onChange={(event) => updateFilter("temperature", event.target.value)}>
              <option value="">All temperatures</option>
              {options?.temperatures.map((temperature) => <option key={temperature} value={temperature}>{humanise(temperature)}</option>)}
            </select>
          </label>
          <label>
            <span>City</span>
            <select value={filters.city} onChange={(event) => updateFilter("city", event.target.value)}>
              <option value="">All cities</option>
              {options?.cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label>
            <span>Language</span>
            <select value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}>
              <option value="">All languages</option>
              {options?.languages.map((language) => <option key={language} value={language}>{language}</option>)}
            </select>
          </label>
          <label>
            <span>Conversation tag</span>
            <select value={filters.tag} onChange={(event) => updateFilter("tag", event.target.value)}>
              <option value="">All tags</option>
              {options?.tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
            </select>
          </label>
          <label>
            <span>Assigned counselor</span>
            <select value={filters.assignedToId} onChange={(event) => updateFilter("assignedToId", event.target.value)}>
              <option value="">All counselors</option>
              {options?.counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}
            </select>
          </label>
        </div>

        <div className="targeting-builder-actions">
          <button className="targeting-primary-button" type="submit" disabled={previewing}>
            {previewing ? "Checking audience…" : "Preview audience"}
          </button>
          <p>Only contacts with recorded WhatsApp marketing opt-in are counted.</p>
        </div>
      </form>

      <section className="targeting-compose">
        <header className="targeting-section-head">
          <div>
            <span className="targeting-kicker">Campaign message</span>
            <h3>Choose the approved message template</h3>
            <p>Name the campaign and select a Meta-approved template for this audience.</p>
          </div>
        </header>

        <div className="targeting-compose-grid">
          <label>
            <span>Campaign name</span>
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              maxLength={120}
              placeholder="Example: Become AI Expert demo reminder"
            />
          </label>
          <label>
            <span>Approved WhatsApp template</span>
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Select approved template</option>
              {options?.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.language} · {humanise(template.category)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="targeting-template-summary">
          <div className="targeting-template-icon" aria-hidden="true" />
          <div>
            <span>Selected template</span>
            <strong>{selectedTemplate?.name ?? "No template selected"}</strong>
            <small>
              {selectedTemplate
                ? `${selectedTemplate.language} · ${humanise(selectedTemplate.category)}`
                : "Approved templates will appear after Meta template sync."}
            </small>
          </div>
        </div>
      </section>

      <section className="targeting-preview-section">
        <header className="targeting-section-head">
          <div>
            <span className="targeting-kicker">Audience preview</span>
            <h3>{preview ? `${preview.total} eligible recipients` : "Preview not generated"}</h3>
            <p>Review sample recipients before any campaign is queued.</p>
          </div>
          <button
            className="targeting-launch-button"
            type="button"
            disabled={!launchReady || launching}
            onClick={handleLaunch}
            title={launchReady ? "Queue targeted campaign" : "Campaign launch remains locked until final Meta cutover"}
          >
            {launching ? "Queuing…" : "Launch campaign"}
          </button>
        </header>

        {error ? <div className="targeting-message targeting-error">{error}</div> : null}
        {success ? <div className="targeting-message targeting-success">{success}</div> : null}

        {!preview ? (
          <div className="targeting-empty-state">
            <div className="targeting-empty-icon" aria-hidden="true" />
            <strong>Build and preview an audience first</strong>
            <p>The dashboard will show matched students, courses, lead stages and counselors here.</p>
          </div>
        ) : preview.recipients.length === 0 ? (
          <div className="targeting-empty-state">
            <strong>No eligible recipients found</strong>
            <p>Change the filters or record the required WhatsApp opt-in for the intended students.</p>
          </div>
        ) : (
          <div className="targeting-table-wrap">
            <table className="targeting-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Stage</th>
                  <th>Location</th>
                  <th>Counselor</th>
                  <th>Consent</th>
                </tr>
              </thead>
              <tbody>
                {preview.recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td><strong>{recipient.name}</strong><small>{recipient.phone}</small></td>
                    <td>{recipient.course || "—"}</td>
                    <td><span className="targeting-stage-chip">{recipient.stage ? humanise(recipient.stage) : "Unqualified"}</span></td>
                    <td>{recipient.city || "—"}<small>{recipient.language || "Language unknown"}</small></td>
                    <td>{recipient.assignedTo || "Unassigned"}</td>
                    <td><span className="targeting-consent-chip">Opted in</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="targeting-footer-note">
          Bulk WhatsApp outreach is intentionally restricted to opted-in recipients and approved templates. Opt-out handling remains active for every campaign.
        </footer>
      </section>
    </div>
  );
}

"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

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
type ActionButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

type ActionButton = {
  id: string;
  type: ActionButtonType;
  text: string;
  value: string;
};

type UploadedSample = {
  headerHandle: string;
  fileName: string;
  mimeType: string;
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  size: number;
};

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

function newButton(type: ActionButtonType = "QUICK_REPLY"): ActionButton {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    type,
    text: "",
    value: "",
  };
}

function extractVariables(text: string): string[] {
  const variables = new Set<string>();
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    variables.add(match[1]);
  }
  return [...variables].sort((a, b) => Number(a) - Number(b));
}

function renderExampleText(
  text: string,
  examples: Record<string, string>,
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_whole, key: string) => {
    return examples[key]?.trim() || `{{${key}}}`;
  });
}

function templateBody(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find((component) => {
    return (
      component &&
      typeof component === "object" &&
      !Array.isArray(component) &&
      String((component as Record<string, unknown>).type ?? "").toUpperCase() ===
        "BODY"
    );
  });
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const text = (body as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function acceptedFileTypes(headerType: HeaderType): string {
  if (headerType === "IMAGE") return "image/jpeg,image/png,image/webp";
  if (headerType === "VIDEO") return "video/mp4";
  if (headerType === "DOCUMENT") return "application/pdf";
  return "";
}

function maximumMediaSize(headerType: HeaderType): string {
  if (headerType === "IMAGE") return "JPG, PNG or WEBP · maximum 5 MB";
  if (headerType === "VIDEO") return "MP4 · maximum 16 MB";
  if (headerType === "DOCUMENT") return "PDF · maximum 20 MB";
  return "";
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState("MARKETING");
  const [headerType, setHeaderType] = useState<HeaderType>("IMAGE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [uploadedSample, setUploadedSample] =
    useState<UploadedSample | null>(null);
  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState("SikhaDenge Institute");
  const [buttons, setButtons] = useState<ActionButton[]>([
    {
      ...newButton("URL"),
      text: "Join Community",
      value: "https://chat.whatsapp.com/",
    },
  ]);

  const bodyVariables = useMemo(() => extractVariables(body), [body]);
  const headerVariables = useMemo(
    () => extractVariables(headerText),
    [headerText],
  );

  useEffect(() => {
    setBodyExamples((current) => {
      const next: Record<string, string> = {};
      for (const variable of bodyVariables) next[variable] = current[variable] ?? "";
      return next;
    });
  }, [bodyVariables.join("|")]);

  useEffect(() => {
    return () => {
      if (headerPreview) URL.revokeObjectURL(headerPreview);
    };
  }, [headerPreview]);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/templates?limit=250", {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as {
        templates?: TemplateRecord[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Templates could not be loaded.");
      }
      setTemplates(payload.templates ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Templates could not be loaded.",
      );
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
        template.category.toLowerCase().includes(query) ||
        templateBody(template.components).toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "ALL" || template.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, templates]);

  const metrics = useMemo(() => {
    const count = (status: string) =>
      templates.filter((item) => item.status === status).length;
    return {
      total: templates.length,
      approved: count("APPROVED"),
      pending: count("PENDING"),
      rejected: count("REJECTED"),
    };
  }, [templates]);

  function clearMedia() {
    setHeaderFile(null);
    setUploadedSample(null);
    setHeaderPreview(null);
  }

  function handleHeaderTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    setHeaderType(event.target.value as HeaderType);
    clearMedia();
    setHeaderText("");
    setHeaderExample("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadedSample(null);
    setHeaderFile(file);
    setHeaderPreview(file ? URL.createObjectURL(file) : null);
  }

  function addButton() {
    if (buttons.length >= 3) {
      setError("A maximum of three template buttons can be configured here.");
      return;
    }
    setButtons((current) => [...current, newButton()]);
  }

  function updateButton(
    id: string,
    field: keyof Omit<ActionButton, "id">,
    value: string,
  ) {
    setButtons((current) =>
      current.map((button) =>
        button.id === id ? { ...button, [field]: value } : button,
      ),
    );
  }

  function removeButton(id: string) {
    setButtons((current) => current.filter((button) => button.id !== id));
  }

  async function uploadMediaSample(options?: {
    silent?: boolean;
  }): Promise<UploadedSample> {
    if (!headerFile) throw new Error("Select a sample media file first.");
    if (!(["IMAGE", "VIDEO", "DOCUMENT"] as HeaderType[]).includes(headerType)) {
      throw new Error("A media header type is required.");
    }
    if (uploadedSample) return uploadedSample;

    setMediaBusy(true);
    if (!options?.silent) {
      setError(null);
      setNotice(null);
    }
    try {
      const formData = new FormData();
      formData.append("file", headerFile);
      formData.append("headerType", headerType);
      const response = await fetch("/api/templates/media/sample", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        sample?: UploadedSample;
        error?: string;
      };
      if (!response.ok || !payload.sample) {
        throw new Error(payload.error || "Sample media upload failed.");
      }
      setUploadedSample(payload.sample);
      if (!options?.silent) {
        setNotice(
          "Sample media uploaded to Meta. The approval-ready header handle is attached.",
        );
      }
      return payload.sample;
    } finally {
      setMediaBusy(false);
    }
  }

  function buildComponents(mediaSample: UploadedSample | null) {
    const components: Array<Record<string, unknown>> = [];

    if (headerType === "TEXT") {
      if (!headerText.trim()) throw new Error("Header text is required.");
      const header: Record<string, unknown> = {
        type: "HEADER",
        format: "TEXT",
        text: headerText.trim(),
      };
      if (headerVariables.length > 0) {
        if (headerVariables.length > 1) {
          throw new Error("A text header can contain only one variable.");
        }
        if (!headerExample.trim()) {
          throw new Error("Add a sample value for the header variable.");
        }
        header.example = { header_text: [headerExample.trim()] };
      }
      components.push(header);
    } else if (headerType !== "NONE") {
      if (!mediaSample?.headerHandle) {
        throw new Error("Upload a sample media file before saving this draft.");
      }
      components.push({
        type: "HEADER",
        format: headerType,
        example: { header_handle: [mediaSample.headerHandle] },
      });
    }

    if (!body.trim()) throw new Error("Template body is required.");
    const bodyComponent: Record<string, unknown> = {
      type: "BODY",
      text: body.trim(),
    };
    if (bodyVariables.length > 0) {
      const sampleValues = bodyVariables.map((variable) => {
        const sample = bodyExamples[variable]?.trim();
        if (!sample) {
          throw new Error(`Add a sample value for {{${variable}}}.`);
        }
        return sample;
      });
      bodyComponent.example = { body_text: [sampleValues] };
    }
    components.push(bodyComponent);

    if (footer.trim()) {
      components.push({ type: "FOOTER", text: footer.trim() });
    }

    if (buttons.length > 0) {
      const normalizedButtons = buttons.map((button, index) => {
        const text = button.text.trim();
        if (!text) throw new Error(`Button ${index + 1} text is required.`);
        if (text.length > 25) {
          throw new Error(`Button ${index + 1} text is too long.`);
        }
        if (button.type === "URL") {
          const url = button.value.trim();
          if (!/^https:\/\//i.test(url)) {
            throw new Error(`Button ${index + 1} requires an HTTPS URL.`);
          }
          return { type: "URL", text, url };
        }
        if (button.type === "PHONE_NUMBER") {
          const phoneNumber = button.value.trim();
          if (!/^\+\d{8,15}$/.test(phoneNumber)) {
            throw new Error(
              `Button ${index + 1} requires a phone number such as +918808505575.`,
            );
          }
          return { type: "PHONE_NUMBER", text, phone_number: phoneNumber };
        }
        return { type: "QUICK_REPLY", text };
      });
      components.push({ type: "BUTTONS", buttons: normalizedButtons });
    }

    return components;
  }

  function resetForm() {
    setName("");
    setHeaderText("");
    setHeaderExample("");
    clearMedia();
    setBody("");
    setBodyExamples({});
    setFooter("SikhaDenge Institute");
    setButtons([
      {
        ...newButton("URL"),
        text: "Join Community",
        value: "https://chat.whatsapp.com/",
      },
    ]);
  }

  async function submitTemplate(
    template: TemplateRecord,
    options?: { skipConfirmation?: boolean },
  ) {
    if (
      !options?.skipConfirmation &&
      !window.confirm(`Submit “${template.name}” to Meta for review?`)
    ) {
      return;
    }
    setBusy(template.id);
    setError(null);
    setNotice(null);
    try {
      const response = await jsonRequest(
        `/api/templates/${encodeURIComponent(template.id)}/submit`,
        { method: "POST", body: "{}" },
      );
      const payload = (await response.json()) as {
        template?: TemplateRecord;
        error?: string;
      };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "Template submission failed.");
      }
      setTemplates((current) =>
        current.map((item) =>
          item.id === template.id ? (payload.template as TemplateRecord) : item,
        ),
      );
      setNotice(
        "Template submitted to Meta. Its status is now pending review; use Sync Meta status to refresh it.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Template submission failed.",
      );
      throw submitError;
    } finally {
      setBusy(null);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const submitAfterSave = submitter?.value === "save-and-submit";

    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      let mediaSample = uploadedSample;
      if (
        (["IMAGE", "VIDEO", "DOCUMENT"] as HeaderType[]).includes(headerType) &&
        !mediaSample
      ) {
        mediaSample = await uploadMediaSample({ silent: true });
      }
      const components = buildComponents(mediaSample);
      const response = await jsonRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({ name, language, category, components }),
      });
      const payload = (await response.json()) as {
        template?: TemplateRecord;
        error?: string;
      };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "Template draft could not be created.");
      }

      const created = payload.template;
      setTemplates((current) => [created, ...current]);
      resetForm();
      setNotice("Template draft saved locally.");

      if (submitAfterSave) {
        await submitTemplate(created, { skipConfirmation: true });
      }
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Template draft could not be created.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function syncTemplates() {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const response = await jsonRequest("/api/templates/sync", {
        method: "POST",
        body: "{}",
      });
      const payload = (await response.json()) as {
        fetched?: number;
        created?: number;
        updated?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Template sync failed.");
      }
      await loadTemplates();
      setNotice(
        `Meta sync complete: ${payload.fetched ?? 0} fetched, ${payload.created ?? 0} added, ${payload.updated ?? 0} updated.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Template sync failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  const previewBody = renderExampleText(body, bodyExamples);
  const previewHeader = renderExampleText(headerText, {
    "1": headerExample,
  });

  return (
    <div className="template-studio">
      <div className="template-metrics">
        <article>
          <span>Total templates</span>
          <strong>{metrics.total}</strong>
        </article>
        <article>
          <span>Approved</span>
          <strong>{metrics.approved}</strong>
        </article>
        <article>
          <span>Pending review</span>
          <strong>{metrics.pending}</strong>
        </article>
        <article>
          <span>Rejected</span>
          <strong>{metrics.rejected}</strong>
        </article>
      </div>

      {error ? (
        <div className="template-alert template-alert-error">{error}</div>
      ) : null}
      {notice ? (
        <div className="template-alert template-alert-success">{notice}</div>
      ) : null}

      <div className="template-studio-layout">
        <form className="template-editor" onSubmit={createDraft}>
          <div className="template-section-heading">
            <div>
              <span>Template builder</span>
              <h3>Create approval-ready template</h3>
            </div>
            <small>Draft → Meta review → Approved</small>
          </div>

          <div className="template-form-grid">
            <label>
              <span>Template name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="become_ai_expert_masterclass_invite"
                required
              />
              <small>Lowercase name; spaces automatically become underscores.</small>
            </label>
            <label>
              <span>Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en_US">English (US)</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="hi_IN">Hindi (India)</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utility</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
              <small>
                Invitations/promotions use Marketing. Transactional registration
                updates use Utility.
              </small>
            </label>
            <label>
              <span>Header type</span>
              <select value={headerType} onChange={handleHeaderTypeChange}>
                <option value="NONE">No header</option>
                <option value="TEXT">Text</option>
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
                <option value="DOCUMENT">Document</option>
              </select>
            </label>
          </div>

          {headerType === "TEXT" ? (
            <div className="template-inline-fields">
              <label>
                <span>Header text</span>
                <input
                  value={headerText}
                  onChange={(event) => setHeaderText(event.target.value)}
                  maxLength={60}
                  placeholder="Free AI Masterclass"
                />
              </label>
              {headerVariables.length > 0 ? (
                <label>
                  <span>Header variable sample</span>
                  <input
                    value={headerExample}
                    onChange={(event) => setHeaderExample(event.target.value)}
                    placeholder="Ankit"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {(["IMAGE", "VIDEO", "DOCUMENT"] as HeaderType[]).includes(
            headerType,
          ) ? (
            <section className="template-media-uploader">
              <div className="template-media-copy">
                <strong>Upload approval sample</strong>
                <p>
                  Select the actual poster or media sample that Meta should inspect
                  with this template.
                </p>
                <small>{maximumMediaSize(headerType)}</small>
              </div>
              <label className="template-file-picker">
                <input
                  type="file"
                  accept={acceptedFileTypes(headerType)}
                  onChange={handleFileChange}
                />
                <span>{headerFile ? headerFile.name : "Choose media file"}</span>
              </label>
              <button
                type="button"
                className="template-secondary-button"
                disabled={!headerFile || mediaBusy || uploadedSample !== null}
                onClick={() => {
                  setError(null);
                  void uploadMediaSample().catch((uploadError) => {
                    setError(
                      uploadError instanceof Error
                        ? uploadError.message
                        : "Sample media upload failed.",
                    );
                  });
                }}
              >
                {mediaBusy
                  ? "Uploading to Meta..."
                  : uploadedSample
                    ? "Meta sample ready ✓"
                    : "Upload sample to Meta"}
              </button>
            </section>
          ) : null}

          <label className="template-wide-field">
            <span>Message body</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={9}
              maxLength={1024}
              placeholder={
                "Hi {{1}} 👋\n\nAapne recently SikhaDenge se AI learning ke liye connect kiya tha.\n\nWhatsApp Community join karein."
              }
              required
            />
            <small>
              Variables sequentially use {"{{1}}"}, {"{{2}}"}, {"{{3}}"}.
            </small>
          </label>

          {bodyVariables.length > 0 ? (
            <section className="template-variable-panel">
              <div>
                <strong>Variable samples for Meta review</strong>
                <p>Realistic sample values are required for approval.</p>
              </div>
              <div className="template-variable-grid">
                {bodyVariables.map((variable) => (
                  <label key={variable}>
                    <span>{`{{${variable}}}`}</span>
                    <input
                      value={bodyExamples[variable] ?? ""}
                      onChange={(event) =>
                        setBodyExamples((current) => ({
                          ...current,
                          [variable]: event.target.value,
                        }))
                      }
                      placeholder={variable === "1" ? "Ankit" : "Sample value"}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          <label className="template-wide-field">
            <span>Footer (optional)</span>
            <input
              value={footer}
              onChange={(event) => setFooter(event.target.value)}
              maxLength={60}
              placeholder="SikhaDenge Institute"
            />
          </label>

          <section className="template-button-builder">
            <div className="template-button-builder-heading">
              <div>
                <strong>Action buttons</strong>
                <p>Add up to three quick-reply, website or phone buttons.</p>
              </div>
              <button
                type="button"
                className="template-secondary-button"
                onClick={addButton}
                disabled={buttons.length >= 3}
              >
                + Add button
              </button>
            </div>

            {buttons.length === 0 ? (
              <div className="template-empty-inline">No buttons added.</div>
            ) : (
              <div className="template-button-list">
                {buttons.map((button, index) => (
                  <div className="template-button-row" key={button.id}>
                    <span className="template-button-number">{index + 1}</span>
                    <select
                      value={button.type}
                      onChange={(event) =>
                        updateButton(
                          button.id,
                          "type",
                          event.target.value as ActionButtonType,
                        )
                      }
                    >
                      <option value="QUICK_REPLY">Quick reply</option>
                      <option value="URL">Website URL</option>
                      <option value="PHONE_NUMBER">Phone call</option>
                    </select>
                    <input
                      value={button.text}
                      onChange={(event) =>
                        updateButton(button.id, "text", event.target.value)
                      }
                      maxLength={25}
                      placeholder="Button text"
                    />
                    {button.type !== "QUICK_REPLY" ? (
                      <input
                        value={button.value}
                        onChange={(event) =>
                          updateButton(button.id, "value", event.target.value)
                        }
                        placeholder={
                          button.type === "URL"
                            ? "https://chat.whatsapp.com/..."
                            : "+918808505575"
                        }
                      />
                    ) : (
                      <span className="template-button-helper">
                        Customer sends this reply
                      </span>
                    )}
                    <button
                      type="button"
                      className="template-remove-button"
                      onClick={() => removeButton(button.id)}
                      aria-label={`Remove button ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="template-form-actions">
            <div>
              <strong>Safe publishing workflow</strong>
              <span>
                Saving does not send messages. Meta approval is required before a
                template can be used in campaigns.
              </span>
            </div>
            <div className="template-form-buttons">
              <button
                type="submit"
                value="save-draft"
                disabled={busy !== null || mediaBusy}
                className="template-secondary-button"
              >
                {busy === "create" ? "Saving..." : "Save draft"}
              </button>
              <button
                type="submit"
                value="save-and-submit"
                disabled={busy !== null || mediaBusy}
              >
                {busy === "create" ? "Preparing..." : "Save & submit to Meta"}
              </button>
            </div>
          </div>
        </form>

        <aside className="template-preview-card">
          <div className="template-section-heading">
            <div>
              <span>Live preview</span>
              <h3>WhatsApp message</h3>
            </div>
            <small>{category}</small>
          </div>

          <div className="template-phone-shell">
            <div className="template-phone-topbar">
              <span className="template-avatar">S</span>
              <div>
                <strong>SikhaDenge Institute</strong>
                <small>Business account</small>
              </div>
            </div>
            <div className="template-phone-canvas">
              <div className="template-message-bubble">
                {headerType === "TEXT" ? (
                  <strong className="template-preview-text-header">
                    {previewHeader || "Header text"}
                  </strong>
                ) : null}
                {headerType === "IMAGE" ? (
                  headerPreview ? (
                    <img
                      className="template-preview-media"
                      src={headerPreview}
                      alt="Template image sample preview"
                    />
                  ) : (
                    <div className="template-preview-placeholder">
                      Image preview
                    </div>
                  )
                ) : null}
                {headerType === "VIDEO" ? (
                  headerPreview ? (
                    <video
                      className="template-preview-media"
                      src={headerPreview}
                      controls
                    />
                  ) : (
                    <div className="template-preview-placeholder">
                      Video preview
                    </div>
                  )
                ) : null}
                {headerType === "DOCUMENT" ? (
                  <div className="template-document-preview">
                    <span>PDF</span>
                    <strong>{headerFile?.name || "Document sample"}</strong>
                  </div>
                ) : null}
                <p className="template-preview-body">
                  {previewBody || "Your message preview will appear here."}
                </p>
                {footer ? (
                  <small className="template-preview-footer">{footer}</small>
                ) : null}
                <span className="template-preview-time">8:00 PM</span>
                {buttons.map((button) => (
                  <button type="button" key={button.id}>
                    {button.text || "Button"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="template-approval-guide">
            <strong>Approval checklist</strong>
            <ul>
              <li>Correct Marketing or Utility category selected</li>
              <li>Poster sample uploaded for image header</li>
              <li>Every variable has a realistic sample value</li>
              <li>CTA URL and message wording match</li>
              <li>No misleading urgency or unsupported claims</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="template-library">
        <div className="template-library-toolbar">
          <div>
            <span>Template library</span>
            <h3>Drafts and Meta approval statuses</h3>
          </div>
          <div className="template-library-actions">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAUSED">Paused</option>
              <option value="DISABLED">Disabled</option>
            </select>
            <button
              type="button"
              onClick={() => void syncTemplates()}
              disabled={busy !== null}
            >
              {busy === "sync" ? "Syncing..." : "Sync Meta status"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="template-empty">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="template-empty">
            No templates match the current filter.
          </div>
        ) : (
          <div className="template-table-wrap">
            <table className="template-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Language</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Meta sync</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <strong>{template.name}</strong>
                      <small>
                        {templateBody(template.components).slice(0, 90) ||
                          "No body preview"}
                      </small>
                      <small>
                        {template.metaTemplateId
                          ? `Meta ID: ${template.metaTemplateId}`
                          : "Local draft"}
                      </small>
                    </td>
                    <td>{template.language}</td>
                    <td>{template.category}</td>
                    <td>
                      <span className={statusClass(template.status)}>
                        {template.status}
                      </span>
                    </td>
                    <td>{formatDate(template.lastSyncedAt)}</td>
                    <td>
                      {template.status === "DRAFT" ||
                      template.status === "REJECTED" ? (
                        <button
                          type="button"
                          className="template-submit-button"
                          disabled={busy !== null}
                          onClick={() => void submitTemplate(template)}
                        >
                          {busy === template.id
                            ? "Submitting..."
                            : "Submit to Meta"}
                        </button>
                      ) : (
                        <span className="template-readonly">
                          {template.status === "APPROVED"
                            ? "Ready for campaigns"
                            : "Managed by Meta"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TemplateSummary = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
} | null;

type ImageAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
} | null;

type MasterclassOverview = {
  config: {
    enabled: boolean;
    classTime: string;
    classDate: string;
    classDay: string;
    communityLink: string;
    delayMinutes: number;
    version: number;
    updatedAt: string;
  };
  templates: {
    instant: TemplateSummary;
    reminder: TemplateSummary;
  };
  imageFlow: {
    config: {
      message1ImageAssetId: string | null;
      useSameImageForMessage2: boolean;
      message2ImageAssetId: string | null;
      version: number;
      updatedAt: string;
    };
    assets: {
      message1: ImageAsset;
      message2: ImageAsset;
    };
    templates: {
      instant: TemplateSummary;
      reminder: TemplateSummary;
    };
    active: boolean;
  };
  metrics: {
    totalEnrollments: number;
    pendingReminders: number;
    completed: number;
    skipped: number;
    failed: number;
    nextDue: string | null;
  };
  previews: {
    instant: string;
    reminder: string;
  };
  runtime: {
    registrationWebhookConfigured: boolean;
    workerIntervalSeconds: number;
    outboundMode: string;
  };
  generatedAt: string;
};

type FormState = {
  enabled: boolean;
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
  delayMinutes: string;
  message1Image: ImageAsset;
  useSameImageForMessage2: boolean;
  message2Image: ImageAsset;
};

function formFromOverview(overview: MasterclassOverview): FormState {
  return {
    enabled: overview.config.enabled,
    classTime: overview.config.classTime,
    classDate: overview.config.classDate,
    classDay: overview.config.classDay,
    communityLink: overview.config.communityLink,
    delayMinutes: String(overview.config.delayMinutes),
    message1Image: overview.imageFlow.assets.message1,
    useSameImageForMessage2:
      overview.imageFlow.config.useSameImageForMessage2,
    message2Image: overview.imageFlow.config.useSameImageForMessage2
      ? null
      : overview.imageFlow.assets.message2,
  };
}

function templateClass(status?: string): string {
  const value = status?.trim().toLowerCase() || "missing";
  return `mc-status mc-status-${value}`;
}

function formatDate(value: string | null): string {
  if (!value) return "No reminder pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MasterclassAutomationPanel() {
  const [overview, setOverview] = useState<MasterclassOverview | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automation/masterclass", {
        cache: "no-store",
      });
      const body = (await response.json()) as MasterclassOverview & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Flow could not be loaded.");
      }
      setOverview(body);
      setForm(formFromOverview(body));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Flow could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previews = useMemo(() => {
    if (!form) return null;
    const instant = `Hi Learner 👋\n\nAapka registration *Free AI Expert Masterclass* ke liye *successfully receive ho gaya hai.* 🚀\n\n🔴 *Live Class | ${form.classTime}*\n🗓 *${form.classDate} | ${form.classDay}*\n\n📌 *Masterclass ki joining link aur complete details* aapko hamari *WhatsApp Community* mein share ki jayengi.\n\n👉 Updates miss na karne aur apni seat confirm karne ke liye abhi *WhatsApp Community join karein:*\n\n🟢 ${form.communityLink}\n\n⚠️ *Seats limited hain — abhi community join karein.* ⏳\n\n*Thank You for Registering!*\n*Team SikhaDenge* 🎓`;
    const reminder = `Hi Learner 👋\n\n⏰ Just a Quick Reminder\n\n*AI Expert Masterclass* ki joining link aur final class instructions hamari *WhatsApp Community* mein hi share ki jayengi.\n\n🔴 *Live Class | ${form.classTime}*\n🗓 *${form.classDate} | ${form.classDay}*\n\n👉 Agar aapne abhi tak WhatsApp Community join nahi ki hai, to neeche diye gaye link se abhi join karein:\n\n🟢 ${form.communityLink}\n\n✅ Community pehle hi join kar chuke hain?\nPerfect! Aapko kuch aur karne ki zarurat nahi hai. Class ki details community mein mil jayengi.\n\n⚠️ Class start hone se pehle WhatsApp Community check karna na bhoolein.\n\n*See You in the 🔴Live Masterclass!*\n*Team SikhaDenge* 🎓`;
    return { instant, reminder };
  }, [form]);

  async function uploadImage(
    slot: "message1" | "message2",
    file: File,
  ): Promise<void> {
    if (!form) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG or WEBP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be 5 MB or less.");
      return;
    }

    setBusy(`upload-${slot}`);
    setError(null);
    setNotice(null);
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as {
        asset?: {
          id: string;
          name: string;
          mimeType: string;
          kind: string;
          size: number;
          previewUrl: string;
        };
        error?: string;
      };
      if (!response.ok || !body.asset) {
        throw new Error(body.error || "Image upload failed.");
      }
      if (body.asset.kind !== "image") {
        throw new Error("Uploaded file is not an image.");
      }
      const asset: NonNullable<ImageAsset> = {
        id: body.asset.id,
        name: body.asset.name,
        mimeType: body.asset.mimeType,
        size: body.asset.size,
        previewUrl: body.asset.previewUrl,
      };
      setForm((current) => {
        if (!current) return current;
        return slot === "message1"
          ? { ...current, message1Image: asset }
          : { ...current, message2Image: asset };
      });
      setNotice(
        `${slot === "message1" ? "Message 1" : "Message 2"} image uploaded. Save flow to activate it.`,
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    if (!form) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automation/masterclass", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          classTime: form.classTime,
          classDate: form.classDate,
          classDay: form.classDay,
          communityLink: form.communityLink,
          delayMinutes: Number(form.delayMinutes),
          message1ImageAssetId: form.message1Image?.id ?? null,
          useSameImageForMessage2: form.useSameImageForMessage2,
          message2ImageAssetId: form.message2Image?.id ?? null,
        }),
      });
      const body = (await response.json()) as MasterclassOverview & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Configuration save failed.");
      }
      setOverview(body);
      setForm(formFromOverview(body));
      setNotice(
        body.config.enabled
          ? "Masterclass flow saved and enabled for new registrations."
          : "Masterclass flow saved. Sending remains disabled.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Configuration save failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: string, success: string): Promise<void> {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automation/masterclass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as {
        overview?: MasterclassOverview;
        error?: string;
      };
      if (!response.ok || !body.overview) {
        throw new Error(body.error || "Automation action failed.");
      }
      setOverview(body.overview);
      setForm(formFromOverview(body.overview));
      setNotice(success);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Automation action failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="mc-panel mc-loading">Loading masterclass flow…</section>
    );
  }
  if (!overview || !form || !previews) {
    return (
      <section className="mc-panel mc-error-card">
        <strong>Masterclass flow could not be loaded</strong>
        <p>{error || "Unknown error."}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  }

  const textApproved =
    overview.templates.instant?.status === "APPROVED" &&
    overview.templates.reminder?.status === "APPROVED";
  const effectiveMessage2Image = form.useSameImageForMessage2
    ? form.message1Image
    : form.message2Image;
  const image1Ready =
    !form.message1Image ||
    overview.imageFlow.templates.instant?.status === "APPROVED";
  const image2Ready =
    !effectiveMessage2Image ||
    overview.imageFlow.templates.reminder?.status === "APPROVED";
  const allReady = textApproved && image1Ready && image2Ready;

  return (
    <section className="mc-panel" aria-labelledby="masterclass-flow-heading">
      <header className="mc-panel-head">
        <div>
          <span>LIVE REGISTRATION AUTOMATION</span>
          <h2 id="masterclass-flow-heading">Free AI Expert Masterclass Flow</h2>
          <p>
            Registration par instant confirmation aur exactly{" "}
            {form.delayMinutes || "135"} minutes baad community reminder.
          </p>
        </div>
        <label className="mc-flow-switch">
          <span>{form.enabled ? "Enabled" : "Disabled"}</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((current) =>
                current
                  ? { ...current, enabled: event.target.checked }
                  : current,
              )
            }
          />
          <i />
        </label>
      </header>

      {error ? <div className="mc-alert error">{error}</div> : null}
      {notice ? <div className="mc-alert success">{notice}</div> : null}

      <div className="mc-metrics">
        <article>
          <span>Total enrolled</span>
          <strong>{overview.metrics.totalEnrollments}</strong>
        </article>
        <article>
          <span>Pending reminder</span>
          <strong>{overview.metrics.pendingReminders}</strong>
        </article>
        <article>
          <span>Completed</span>
          <strong>{overview.metrics.completed}</strong>
        </article>
        <article>
          <span>Skipped / failed</span>
          <strong>{overview.metrics.skipped + overview.metrics.failed}</strong>
        </article>
      </div>

      <div className="mc-runtime-strip">
        <span>
          Outbound: <strong>{overview.runtime.outboundMode}</strong>
        </span>
        <span>
          Webhook:{" "}
          <strong>
            {overview.runtime.registrationWebhookConfigured
              ? "configured"
              : "missing secret"}
          </strong>
        </span>
        <span>
          Worker: <strong>every {overview.runtime.workerIntervalSeconds}s</strong>
        </span>
        <span>
          Next due: <strong>{formatDate(overview.metrics.nextDue)}</strong>
        </span>
      </div>

      <div className="mc-grid">
        <div className="mc-editor-card">
          <div className="mc-card-heading">
            <div>
              <span>REUSABLE VARIABLES</span>
              <h3>Next masterclass details</h3>
            </div>
            <small>Version {overview.config.version}</small>
          </div>
          <div className="mc-form-grid">
            <label>
              <span>Live class time</span>
              <input
                value={form.classTime}
                onChange={(event) =>
                  setForm({ ...form, classTime: event.target.value })
                }
                placeholder="08:00 PM"
              />
            </label>
            <label>
              <span>Class date</span>
              <input
                value={form.classDate}
                onChange={(event) =>
                  setForm({ ...form, classDate: event.target.value })
                }
                placeholder="07 August"
              />
            </label>
            <label>
              <span>Class day</span>
              <input
                value={form.classDay}
                onChange={(event) =>
                  setForm({ ...form, classDay: event.target.value })
                }
                placeholder="Friday"
              />
            </label>
            <label>
              <span>Reminder delay (minutes)</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={form.delayMinutes}
                onChange={(event) =>
                  setForm({ ...form, delayMinutes: event.target.value })
                }
              />
            </label>
            <label className="wide">
              <span>WhatsApp Community link</span>
              <input
                value={form.communityLink}
                onChange={(event) =>
                  setForm({ ...form, communityLink: event.target.value })
                }
                placeholder="https://chat.whatsapp.com/..."
              />
            </label>
          </div>

          <div className="mc-image-editor">
            <div className="mc-image-editor-head">
              <div>
                <span>MESSAGE MEDIA</span>
                <h3>Masterclass banner images</h3>
              </div>
              <small>JPG, PNG or WEBP · max 5 MB</small>
            </div>

            <div className="mc-image-grid">
              <ImagePicker
                title="Message 1 image"
                subtitle="Registration ke turant baad image + caption"
                asset={form.message1Image}
                busy={busy === "upload-message1"}
                disabled={Boolean(busy)}
                onFile={(file) => void uploadImage("message1", file)}
                onRemove={() =>
                  setForm({ ...form, message1Image: null })
                }
              />

              <div className="mc-image-second">
                <label className="mc-same-image-toggle">
                  <input
                    type="checkbox"
                    checked={form.useSameImageForMessage2}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        useSameImageForMessage2: event.target.checked,
                      })
                    }
                  />
                  <span>Message 2 mein same image use karein</span>
                </label>
                {form.useSameImageForMessage2 ? (
                  <div className="mc-same-image-preview">
                    <strong>Message 2 image</strong>
                    <p>
                      Message 1 ka banner automatically reminder ke saath
                      use hoga.
                    </p>
                    {form.message1Image ? (
                      <img
                        src={form.message1Image.previewUrl}
                        alt="Message 2 uses the Message 1 banner"
                      />
                    ) : (
                      <span className="mc-image-empty">No image selected</span>
                    )}
                  </div>
                ) : (
                  <ImagePicker
                    title="Message 2 image"
                    subtitle="Optional separate reminder banner"
                    asset={form.message2Image}
                    busy={busy === "upload-message2"}
                    disabled={Boolean(busy)}
                    onFile={(file) => void uploadImage("message2", file)}
                    onRemove={() =>
                      setForm({ ...form, message2Image: null })
                    }
                  />
                )}
              </div>
            </div>
          </div>

          <div className="mc-save-row">
            <p>
              Save ke baad sirf new registrations updated date, link aur image
              use karengi. Existing pending leads ka snapshot change nahi hoga.
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void save()}
            >
              {busy === "save" ? "Saving…" : "Save flow"}
            </button>
          </div>
        </div>

        <aside className="mc-template-card">
          <div className="mc-card-heading">
            <div>
              <span>META APPROVAL</span>
              <h3>WhatsApp templates</h3>
            </div>
          </div>
          <div className="mc-template-list">
            <TemplateRow
              title="Instant text fallback"
              template={overview.templates.instant}
            />
            <TemplateRow
              title="Reminder text fallback"
              template={overview.templates.reminder}
            />
            <TemplateRow
              title="Instant image template"
              template={overview.imageFlow.templates.instant}
            />
            <TemplateRow
              title="Reminder image template"
              template={overview.imageFlow.templates.reminder}
            />
          </div>
          <div className="mc-template-actions">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void runAction(
                  "prepare_templates",
                  "Text and image template drafts are ready.",
                )
              }
            >
              Prepare drafts
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void runAction(
                  "submit_templates",
                  "Templates submitted to Meta.",
                )
              }
            >
              Submit to Meta
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void runAction(
                  "sync_templates",
                  "Template statuses synced from Meta.",
                )
              }
            >
              Sync status
            </button>
          </div>
          <p className={allReady ? "mc-ready" : "mc-not-ready"}>
            {allReady
              ? "Required templates approved. Flow can be enabled."
              : "Active text/image templates APPROVED hone ke baad flow enable hoga."}
          </p>
          <button
            className="mc-run-due"
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void runAction(
                "dispatch_due",
                "Due reminders and queued outbound messages processed.",
              )
            }
          >
            Run due queue now
          </button>
        </aside>
      </div>

      <div className="mc-preview-grid mc-preview-with-media">
        <article>
          <header>
            <span>MESSAGE 1</span>
            <strong>Instant after registration</strong>
          </header>
          {form.message1Image ? (
            <img src={form.message1Image.previewUrl} alt="Message 1 banner" />
          ) : null}
          <pre>{previews.instant}</pre>
        </article>
        <article>
          <header>
            <span>MESSAGE 2</span>
            <strong>{form.delayMinutes || "135"} minutes after registration</strong>
          </header>
          {effectiveMessage2Image ? (
            <img
              src={effectiveMessage2Image.previewUrl}
              alt="Message 2 banner"
            />
          ) : null}
          <pre>{previews.reminder}</pre>
        </article>
      </div>

      <footer className="mc-webhook-note">
        <strong>Registration endpoint</strong>
        <code>POST /api/webhooks/masterclass-registration</code>
        <p>
          Required JSON: registrationId, name, phone, consent=true.
          Authorization uses the server-side webhook secret.
        </p>
      </footer>
    </section>
  );
}

function ImagePicker(props: {
  title: string;
  subtitle: string;
  asset: ImageAsset;
  busy: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mc-image-picker">
      <div className="mc-image-copy">
        <strong>{props.title}</strong>
        <p>{props.subtitle}</p>
      </div>
      {props.asset ? (
        <div className="mc-image-current">
          <img src={props.asset.previewUrl} alt={props.title} />
          <div>
            <strong>{props.asset.name}</strong>
            <small>{formatBytes(props.asset.size)}</small>
          </div>
        </div>
      ) : (
        <span className="mc-image-empty">No image selected</span>
      )}
      <div className="mc-image-actions">
        <label className={props.disabled ? "disabled" : ""}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={props.disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) props.onFile(file);
            }}
          />
          {props.busy
            ? "Uploading…"
            : props.asset
              ? "Replace image"
              : "Upload image"}
        </label>
        {props.asset ? (
          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TemplateRow(props: {
  title: string;
  template: TemplateSummary;
}) {
  return (
    <article>
      <div>
        <strong>{props.title}</strong>
        <small>{props.template?.name || "Not created"}</small>
      </div>
      <span className={templateClass(props.template?.status)}>
        {props.template?.status || "MISSING"}
      </span>
    </article>
  );
}

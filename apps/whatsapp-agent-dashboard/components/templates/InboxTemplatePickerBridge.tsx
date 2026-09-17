"use client";

import { useEffect, useMemo, useState } from "react";

type TemplateRecord = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
};

function bodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) return false;
    return String((component as Record<string, unknown>).type || "").toUpperCase() === "BODY";
  });
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  return typeof (body as Record<string, unknown>).text === "string"
    ? ((body as Record<string, unknown>).text as string)
    : "";
}

function variableCount(text: string): number {
  const values = Array.from(text.matchAll(/\{\{(\d+)\}\}/g)).map((match) => Number(match[1]));
  return values.length > 0 ? Math.max(...values) : 0;
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function InboxTemplatePickerBridge() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const selectedBody = selected ? bodyText(selected.components) : "";
  const count = useMemo(() => variableCount(selectedBody), [selectedBody]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(
        'button[title="Open templates and targeted campaigns"]',
      );
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const selectedConversation = document.querySelector<HTMLElement>(
        ".conversation-item.selected[data-conversation-id]",
      );
      const nextConversationId = selectedConversation?.dataset.conversationId ?? null;
      setConversationId(nextConversationId);
      setError(nextConversationId ? null : "Select a conversation before sending a template.");
      setNotice(null);
      setOpen(true);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    if (!open || loaded || loading) return;
    setLoading(true);
    void fetch("/api/templates?limit=250", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return { templates: [] as TemplateRecord[] };
        }
        const payload = (await response.json()) as {
          templates?: TemplateRecord[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Templates could not be loaded.");
        return {
          templates: (payload.templates ?? []).filter((item) => item.status === "APPROVED"),
        };
      })
      .then((payload) => {
        setTemplates(payload.templates);
        setSelectedId(payload.templates[0]?.id ?? "");
        setLoaded(true);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Templates could not be loaded.");
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  }, [loaded, loading, open]);

  useEffect(() => {
    setValues(Array.from({ length: count }, () => ""));
  }, [count, selectedId]);

  async function sendTemplate() {
    if (!conversationId || !selected || sending) return;
    if (values.some((value) => !value.trim())) {
      setError("Complete every template variable before sending.");
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const components =
        values.length > 0
          ? [
              {
                type: "body",
                parameters: values.map((value) => ({ type: "text", text: value.trim() })),
              },
            ]
          : [];
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "template",
            templateId: selected.id,
            components,
            idempotencyKey: idempotencyKey(),
          }),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = (await response.json()) as {
        queued?: boolean;
        outboundSent?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Template could not be queued.");
      setNotice(
        payload.outboundSent
          ? "Template sent."
          : "Template queued safely. Live sending remains controlled until final cutover.",
      );
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Template could not be queued.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="inbox-template-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="inbox-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Send approved template"
      >
        <header>
          <div><span>Approved message</span><h2>Send WhatsApp template</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>

        {error ? <div className="inbox-template-alert error">{error}</div> : null}
        {notice ? <div className="inbox-template-alert success">{notice}</div> : null}

        {loading ? (
          <div className="inbox-template-empty">Loading approved templates...</div>
        ) : templates.length === 0 ? (
          <div className="inbox-template-empty">
            <strong>No approved template available</strong>
            <p>Create or sync an approved template from Template Centre.</p>
            <button type="button" onClick={() => window.location.assign("/templates")}>Open Template Centre</button>
          </div>
        ) : (
          <>
            <label className="inbox-template-field">
              <span>Approved template</span>
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.language}
                  </option>
                ))}
              </select>
            </label>
            <div className="inbox-template-message">
              <span>{selected?.category}</span>
              <p>{selectedBody || "Template body preview unavailable."}</p>
            </div>
            {values.map((value, index) => (
              <label className="inbox-template-field" key={index}>
                <span>Value for {`{{${index + 1}}}`}</span>
                <input
                  value={value}
                  onChange={(event) =>
                    setValues((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <div className="inbox-template-actions">
              <button type="button" className="secondary" onClick={() => window.location.assign("/templates")}>Manage templates</button>
              <button type="button" onClick={() => void sendTemplate()} disabled={!conversationId || sending}>
                {sending ? "Queueing..." : "Queue template"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

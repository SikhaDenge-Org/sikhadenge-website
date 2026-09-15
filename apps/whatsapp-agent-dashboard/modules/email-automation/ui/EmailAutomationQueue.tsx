"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./email-automation-queue.module.css";

type AutomationEvent = {
  id: string;
  trigger: string;
  status: string;
  attemptCount: number;
  contactId: string | null;
  leadId: string | null;
  submissionId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type QueuePayload = {
  events: AutomationEvent[];
  automationEnabled: boolean;
  runtimeMode: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export default function EmailAutomationQueue() {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState("DISABLED");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/email/automation/events?take=100", { cache: "no-store" });
    const payload = await readJson<QueuePayload>(response);
    setEvents(payload.events);
    setAutomationEnabled(payload.automationEnabled);
    setRuntimeMode(payload.runtimeMode);
  }, []);

  useEffect(() => {
    let active = true;
    void load()
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Automation queue could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]);

  const counts = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    }, {});
  }, [events]);

  async function processPending() {
    setBusy("process"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/email/automation/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const result = await readJson<{ processed: number; failed: number; skipped: number; recovered: number; paused: boolean; reason: string | null }>(response);
      setNotice(result.paused ? (result.reason || "Automation processing is paused.") : `Processed ${result.processed}; failed ${result.failed}; recovered ${result.recovered}; skipped ${result.skipped}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Automation queue processing failed.");
    } finally { setBusy(""); }
  }

  async function requeue(eventId: string) {
    setBusy(`requeue:${eventId}`); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/email/automation/events/${encodeURIComponent(eventId)}/requeue`, { method: "POST" }));
      setNotice("Failed automation event returned to the pending queue.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Event requeue failed.");
    } finally { setBusy(""); }
  }

  if (loading) return <section className={styles.panel}><p>Loading automation queue...</p></section>;

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>E4 automation runtime</span><h2>Automation Queue</h2><p>Inspect durable CRM email events, process pending work and safely requeue failed attempts.</p></div>
        <button type="button" onClick={() => void processPending()} disabled={busy !== "" || !counts.PENDING}>{busy === "process" ? "Processing..." : "Process pending"}</button>
      </header>
      <div className={styles.stats}>
        <article><strong>{counts.PENDING || 0}</strong><span>Pending</span></article>
        <article><strong>{counts.PROCESSING || 0}</strong><span>Processing</span></article>
        <article><strong>{counts.PROCESSED || 0}</strong><span>Processed</span></article>
        <article><strong>{counts.FAILED || 0}</strong><span>Failed</span></article>
        <article><strong>{runtimeMode}</strong><span>Runtime mode</span></article>
        <article><strong>{automationEnabled ? "ON" : "OFF"}</strong><span>Automation gate</span></article>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      <div className={styles.list}>
        {!events.length ? <div className={styles.empty}>No automation events yet.</div> : events.map((event) => (
          <article key={event.id} className={styles.row}>
            <div><span className={styles.status} data-status={event.status.toLowerCase()}>{event.status}</span><strong>{event.trigger}</strong><small>{event.contactId ? `Contact ${event.contactId}` : event.submissionId ? `Submission ${event.submissionId}` : event.id}</small></div>
            <div><span>Attempts {event.attemptCount}/5</span><small>{new Date(event.createdAt).toLocaleString()}</small>{event.lastError ? <em>{event.lastError}</em> : null}</div>
            <div>{event.status === "FAILED" ? <button type="button" className={styles.secondary} disabled={busy !== "" || event.attemptCount >= 5} onClick={() => void requeue(event.id)}>{busy === `requeue:${event.id}` ? "Requeueing..." : event.attemptCount >= 5 ? "Retry limit reached" : "Requeue"}</button> : null}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
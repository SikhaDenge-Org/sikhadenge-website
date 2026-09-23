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
  manualRetryMaxAttempts: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function ageLabel(value:string){
  const ms=Date.now()-new Date(value).getTime();
  if(ms<60000)return "just now";
  if(ms<3600000)return `${Math.max(1,Math.floor(ms/60000))}m ago`;
  if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;
  return `${Math.floor(ms/86400000)}d ago`;
}

export default function EmailAutomationQueue() {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState("DISABLED");
  const [manualRetryMaxAttempts, setManualRetryMaxAttempts] = useState(20);
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
    setManualRetryMaxAttempts(payload.manualRetryMaxAttempts);
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Automation queue could not load.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const counts = useMemo(() => events.reduce<Record<string, number>>((acc, event) => {
    acc[event.status] = (acc[event.status] || 0) + 1;
    return acc;
  }, {}), [events]);

  const last24h=useMemo(()=>events.filter(e=>Date.now()-new Date(e.createdAt).getTime()<86400000),[events]);
  const throughput=last24h.filter(e=>e.status==="PROCESSED").length;
  const recovered=events.filter(e=>e.status==="PROCESSED"&&e.attemptCount>1).length;
  const retried=events.filter(e=>e.attemptCount>1).length;
  const distinctTriggers=useMemo(()=>Array.from(new Set(events.map(e=>e.trigger))).slice(0,4),[events]);
  const bars=useMemo(()=>{
    const now=Date.now();
    return Array.from({length:12},(_,i)=>{
      const end=now-(11-i)*3600000;
      const start=end-3600000;
      const bucket=events.filter(e=>{const t=new Date(e.createdAt).getTime();return t>start&&t<=end;});
      return {processed:bucket.filter(e=>e.status==="PROCESSED").length,queued:bucket.filter(e=>e.status==="PENDING"||e.status==="PROCESSING").length};
    });
  },[events]);
  const maxBar=Math.max(1,...bars.flatMap(b=>[b.processed,b.queued]));

  async function processPending() {
    setBusy("process"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/email/automation/process", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }),
      });
      const result = await readJson<{ processed: number; failed: number; retried: number; deadLettered: number; skipped: number; recovered: number; paused: boolean; reason: string | null }>(response);
      setNotice(result.paused ? (result.reason || "Automation processing is paused.") : `Processed ${result.processed}; retries scheduled ${result.retried}; dead-lettered ${result.deadLettered}; failed ${result.failed}; recovered ${result.recovered}; skipped ${result.skipped}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Automation queue processing failed."); }
    finally { setBusy(""); }
  }

  async function requeue(eventId: string) {
    setBusy(`requeue:${eventId}`); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/email/automation/events/${encodeURIComponent(eventId)}/requeue`, { method: "POST" }));
      setNotice("Failed automation event returned to the pending queue.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Event requeue failed."); }
    finally { setBusy(""); }
  }

  if (loading) return <section className={styles.loadingCard}>Loading automation runtime…</section>;

  return <section className={styles.root} aria-label="Email automation runtime">
    <div className={styles.runtimeBar}>
      <span className={automationEnabled?styles.running:styles.paused}>● {automationEnabled?"Engine Running":"Engine Paused"}</span>
      <span className={styles.modeChip}>{runtimeMode}</span>
      <button onClick={()=>void load()}>↻ Refresh state</button>
    </div>

    <div className={styles.kpiGrid}>
      <article><span className={styles.orangeIcon}>◷</span><div><small>Pending</small><strong>{counts.PENDING||0}</strong><p>In queue to process</p></div></article>
      <article><span className={styles.blueIcon}>⚙</span><div><small>Processing</small><strong>{counts.PROCESSING||0}</strong><p>Currently running</p></div></article>
      <article><span className={styles.greenIcon}>✓</span><div><small>Processed</small><strong>{counts.PROCESSED||0}</strong><p>Loaded event window</p></div></article>
      <article><span className={styles.redIcon}>!</span><div><small>Failed</small><strong>{counts.FAILED||0}</strong><p>Needs attention</p></div></article>
      <article><span className={styles.purpleIcon}>ϟ</span><div><small>Runtime mode</small><strong className={styles.modeValue}>{runtimeMode}</strong><p>{automationEnabled?"Automation gate on":"Automation gate off"}</p></div></article>
    </div>

    {error ? <div className={styles.error}>{error}</div> : null}
    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <div className={styles.topGrid}>
      <section className={styles.workflowsCard}>
        <div className={styles.cardHead}><div><h3>Automation Workflows</h3><p>Real event triggers observed in the queue</p></div><button onClick={()=>void processPending()} disabled={busy!==""||!counts.PENDING}>{busy==="process"?"Processing…":"Process pending"}</button></div>
        <div className={styles.workflowTable}>
          <div className={styles.tableHeader}><span>WORKFLOW / TRIGGER</span><span>STATUS</span><span>EVENTS</span><span>LAST EVENT</span></div>
          {distinctTriggers.length?distinctTriggers.map(trigger=>{
            const rows=events.filter(e=>e.trigger===trigger);const active=rows.some(e=>e.status==="PENDING"||e.status==="PROCESSING");
            return <div className={styles.workflowRow} key={trigger}><span><i>✉</i><b>{trigger}</b><small>{rows[0]?.contactId?`Contact ${rows[0].contactId}`:rows[0]?.submissionId?`Submission ${rows[0].submissionId}`:"CRM automation"}</small></span><em data-active={active}>{active?"Active":"Observed"}</em><strong>{rows.length}</strong><small>{rows[0]?ageLabel(rows[0].createdAt):"—"}</small></div>;
          }):<div className={styles.empty}>No automation triggers observed yet.</div>}
        </div>
      </section>

      <section className={styles.chartCard}>
        <div className={styles.cardHead}><div><h3>Queue & Throughput</h3><p>Real events grouped by hour</p></div><span>Last 12 hours</span></div>
        <div className={styles.chartSummary}><div><b>{counts.PENDING||0}</b><span>Pending</span></div><div><b>{counts.PROCESSING||0}</b><span>Processing</span></div><div><b>{throughput}</b><span>Processed 24h</span></div></div>
        <div className={styles.barChart}>{bars.map((b,i)=><span className={styles.barGroup} key={i}><i style={{height:`${Math.max(5,(b.queued/maxBar)*100)}%`}}/><b style={{height:`${Math.max(5,(b.processed/maxBar)*100)}%`}}/></span>)}</div>
        <div className={styles.legend}><span><i/>Queued</span><span><b/>Processed</span></div>
      </section>

      <aside className={styles.controlsCard}>
        <div className={styles.cardHead}><div><h3>Runtime Controls</h3><p>Current protected runtime state</p></div></div>
        <div className={styles.controlRow}><span><b>Automation Engine</b><small>Process CRM email events</small></span><em data-on={automationEnabled}>{automationEnabled?"ON":"OFF"}</em></div>
        <div className={styles.controlRow}><span><b>Runtime Mode</b><small>Delivery policy</small></span><strong>{runtimeMode}</strong></div>
        <div className={styles.controlRow}><span><b>Retry Failed Emails</b><small>Manual safe requeue up to {manualRetryMaxAttempts} attempts</small></span><em data-on>ON</em></div>
      </aside>
    </div>

    <div className={styles.middleGrid}>
      <section className={styles.eventsCard}>
        <div className={styles.cardHead}><div><h3>Recent Events</h3><p>Live event history from automation engine</p></div></div>
        <div className={styles.eventList}>{events.slice(0,7).map(event=><article key={event.id}><span className={styles.eventIcon} data-status={event.status.toLowerCase()}>{event.status==="FAILED"?"!":event.status==="PROCESSED"?"✓":"↻"}</span><div><b>{event.trigger}</b><small>{event.contactId?`Contact ${event.contactId}`:event.submissionId?`Submission ${event.submissionId}`:event.status}</small></div><time>{ageLabel(event.createdAt)}</time>{event.status==="FAILED"?<button disabled={busy!==""||event.attemptCount>=manualRetryMaxAttempts} onClick={()=>void requeue(event.id)}>Retry</button>:null}</article>)}{!events.length?<p className={styles.empty}>No automation events yet.</p>:null}</div>
      </section>

      <section className={styles.recoveryCard}>
        <div className={styles.cardHead}><div><h3>Failure Recovery</h3><p>Retry and recovery state from real attempts</p></div></div>
        <div className={styles.recoveryBody}><div className={styles.donut} style={{background:`conic-gradient(#22c18b 0 ${retried?Math.round((recovered/retried)*100):100}%,#eaf0f7 0)`}}><span><b>{retried?Math.round((recovered/retried)*100):100}%</b><small>Recovery</small></span></div><div><p><i className={styles.greenDot}/>Recovered <b>{recovered}</b></p><p><i className={styles.blueDot}/>Retried <b>{retried}</b></p><p><i className={styles.redDot}/>Still failed <b>{counts.FAILED||0}</b></p></div></div>
      </section>

      <section className={styles.processorCard}>
        <div className={styles.cardHead}><div><h3>Processor Status</h3><p>Automation service readiness</p></div><span className={automationEnabled?styles.healthy:styles.warning}>{automationEnabled?"Healthy":"Paused"}</span></div>
        <dl><div><dt>Automation gate</dt><dd>{automationEnabled?"Enabled":"Disabled"}</dd></div><div><dt>Runtime mode</dt><dd>{runtimeMode}</dd></div><div><dt>Loaded events</dt><dd>{events.length}</dd></div><div><dt>Last event</dt><dd>{events[0]?ageLabel(events[0].createdAt):"None"}</dd></div></dl>
      </section>
    </div>

    <div className={styles.bottomGrid}>
      <section className={styles.sourcesCard}><div className={styles.cardHead}><div><h3>Event Sources</h3><p>Triggers currently represented in queue data</p></div></div><div className={styles.sources}>{distinctTriggers.map(t=><span key={t}><i>◇</i><b>{t}</b><small>{events.filter(e=>e.trigger===t).length} events</small></span>)}{!distinctTriggers.length?<p className={styles.empty}>No event sources discovered yet.</p>:null}</div></section>
      <section className={styles.logCard}><div className={styles.cardHead}><div><h3>Log Stream</h3><p>Recent automation event log</p></div><span className={styles.live}>● Live data</span></div><pre>{events.slice(0,8).map(e=>`[${new Date(e.createdAt).toLocaleTimeString()}] ${e.status.padEnd(10)} ${e.trigger}${e.lastError?` — ${e.lastError}`:""}`).join("\n")||"No automation log events yet."}</pre></section>
    </div>
  </section>;
}

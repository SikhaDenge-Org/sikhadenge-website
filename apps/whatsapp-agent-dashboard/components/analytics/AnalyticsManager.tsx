"use client";

import { useEffect, useState } from "react";

type AnalyticsPayload = {
  generatedAt: string;
  periodDays: number;
  totals: {
    contacts: number;
    optedIn: number;
    optedOut: number;
    conversations: number;
    openConversations: number;
    unread: number;
    unassigned: number;
    leads: number;
    averageLeadScore: number;
    inboundMessages: number;
    outboundMessages: number;
  };
  leadStages: Record<string, number>;
  leadTemperatures: Record<string, number>;
  conversationModes: Record<string, number>;
  messageStatuses: Record<string, number>;
  delivery: { deliveredRate: number; readRate: number; failureRate: number };
  campaigns: { plans: number; completed: number; scheduled: number; paused: number; audience: number; queued: number; failed: number };
  automation: { flows: number; active: number; paused: number; runs: number; failures: number };
  engagement: { forms: number; submissions: number; appointments: number; completedAppointments: number; payments: number; paidCount: number; paidMinor: number };
  agent: { analyzed: number; queued: number; sent: number; handoffs: number; failed: number };
  retargeting: {
    hotLeads: number;
    demoNotEnrolled: number;
    paymentPending: number;
    followUpDue: number;
    noReplySevenDays: number;
    inactiveThirtyDays: number;
    suppressed: number;
  };
  daily: Array<{ date: string; inbound: number; outbound: number; leads: number }>;
};

function humanise(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Analytics request failed.");
  return payload;
}

export default function AnalyticsManager() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/overview", { cache: "no-store" });
      setData(await readJson<AnalyticsPayload>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analytics could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) return <div className="suite-loading">Loading analytics and retargeting…</div>;
  if (!data) return <div className="suite-alert error">{error || "Analytics unavailable."}</div>;

  const maxDaily = Math.max(1, ...data.daily.map((item) => item.inbound + item.outbound));

  return (
    <div className="suite-stack">
      {error ? <div className="suite-alert error">{error}</div> : null}
      <section className="suite-metrics">
        <article><span>Contacts</span><strong>{data.totals.contacts}</strong><small>{data.totals.optedIn} opted in · {data.totals.optedOut} opted out</small></article>
        <article><span>Open conversations</span><strong>{data.totals.openConversations}</strong><small>{data.totals.unread} unread · {data.totals.unassigned} unassigned</small></article>
        <article><span>Leads</span><strong>{data.totals.leads}</strong><small>Average score {data.totals.averageLeadScore}/100</small></article>
        <article><span>Revenue recorded</span><strong>{money(data.engagement.paidMinor)}</strong><small>{data.engagement.paidCount} paid records</small></article>
      </section>

      <section className="suite-grid two">
        <div className="suite-card">
          <header><div><span>30-day activity</span><h3>Inbound and outbound message volume</h3></div><button type="button" className="secondary" onClick={() => void load()}>Refresh</button></header>
          <div className="analytics-bars">
            {data.daily.map((item) => (
              <div key={item.date} className="analytics-bar-day" title={`${item.date}: ${item.inbound} inbound, ${item.outbound} outbound`}>
                <span style={{ height: `${Math.max(2, ((item.inbound + item.outbound) / maxDaily) * 100)}%` }} />
                <small>{item.date.slice(8)}</small>
              </div>
            ))}
          </div>
          <footer><strong>{data.totals.inboundMessages} inbound</strong><strong>{data.totals.outboundMessages} outbound</strong></footer>
        </div>

        <div className="suite-card">
          <header><div><span>Delivery quality</span><h3>Outbound delivery and read rates</h3></div></header>
          <div className="analytics-rate-grid">
            <article><strong>{data.delivery.deliveredRate}%</strong><span>Delivered</span></article>
            <article><strong>{data.delivery.readRate}%</strong><span>Read</span></article>
            <article><strong>{data.delivery.failureRate}%</strong><span>Failed</span></article>
          </div>
          <div className="suite-list compact">
            {Object.entries(data.messageStatuses).map(([status, count]) => <article key={status}><span>{humanise(status)}</span><strong>{count}</strong></article>)}
          </div>
        </div>
      </section>

      <section className="suite-grid three">
        <div className="suite-card"><header><div><span>Lead funnel</span><h3>Stages</h3></div></header><div className="suite-list compact">{Object.entries(data.leadStages).map(([stage, count]) => <article key={stage}><span>{humanise(stage)}</span><strong>{count}</strong></article>)}</div></div>
        <div className="suite-card"><header><div><span>Lead quality</span><h3>Temperature</h3></div></header><div className="suite-list compact">{Object.entries(data.leadTemperatures).map(([stage, count]) => <article key={stage}><span>{humanise(stage)}</span><strong>{count}</strong></article>)}</div></div>
        <div className="suite-card"><header><div><span>Agent operations</span><h3>AI lifecycle</h3></div></header><div className="suite-list compact"><article><span>Analysed</span><strong>{data.agent.analyzed}</strong></article><article><span>Queued</span><strong>{data.agent.queued}</strong></article><article><span>Sent</span><strong>{data.agent.sent}</strong></article><article><span>Handoffs</span><strong>{data.agent.handoffs}</strong></article><article><span>Failures</span><strong>{data.agent.failed}</strong></article></div></div>
      </section>

      <section className="suite-card">
        <header><div><span>Retargeting intelligence</span><h3>Consent-safe audiences ready for campaign preview</h3><p>These are counts only. Exact recipients must still pass Campaigns preview, consent and frequency-cap checks.</p></div></header>
        <div className="retargeting-grid">
          <article><span>Hot leads</span><strong>{data.retargeting.hotLeads}</strong></article>
          <article><span>Demo not enrolled</span><strong>{data.retargeting.demoNotEnrolled}</strong></article>
          <article><span>Payment pending</span><strong>{data.retargeting.paymentPending}</strong></article>
          <article><span>Follow-up due</span><strong>{data.retargeting.followUpDue}</strong></article>
          <article><span>No reply 7 days</span><strong>{data.retargeting.noReplySevenDays}</strong></article>
          <article><span>Inactive 30 days</span><strong>{data.retargeting.inactiveThirtyDays}</strong></article>
          <article><span>Suppressed</span><strong>{data.retargeting.suppressed}</strong><small>Unknown/opted-out excluded</small></article>
        </div>
      </section>

      <section className="suite-grid three">
        <div className="suite-card"><header><div><span>Campaigns</span><h3>Controlled outreach</h3></div></header><div className="suite-list compact"><article><span>Plans</span><strong>{data.campaigns.plans}</strong></article><article><span>Completed</span><strong>{data.campaigns.completed}</strong></article><article><span>Queued</span><strong>{data.campaigns.queued}</strong></article><article><span>Failures</span><strong>{data.campaigns.failed}</strong></article></div></div>
        <div className="suite-card"><header><div><span>Automation</span><h3>Flow performance</h3></div></header><div className="suite-list compact"><article><span>Flows</span><strong>{data.automation.flows}</strong></article><article><span>Active</span><strong>{data.automation.active}</strong></article><article><span>Runs</span><strong>{data.automation.runs}</strong></article><article><span>Failures</span><strong>{data.automation.failures}</strong></article></div></div>
        <div className="suite-card"><header><div><span>Engagement</span><h3>Conversion operations</h3></div></header><div className="suite-list compact"><article><span>Forms</span><strong>{data.engagement.forms}</strong></article><article><span>Submissions</span><strong>{data.engagement.submissions}</strong></article><article><span>Appointments</span><strong>{data.engagement.appointments}</strong></article><article><span>Payments</span><strong>{data.engagement.payments}</strong></article></div></div>
      </section>
    </div>
  );
}

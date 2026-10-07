"use client";

import { useEffect, useState } from "react";

type LiveAgentStatus = {
  policy: {
    webhookAnalysisEnabled: boolean;
    autoReplyEnabled: boolean;
    immediateDispatchEnabled: boolean;
    runtimeEnabled: boolean;
    killSwitchActive: boolean;
    modelCallsEnabled: boolean;
    outboundMode: "disabled" | "dry_run" | "live";
    liveAutoReplyReady: boolean;
  };
  conversations: {
    aiMode: number;
    pendingReview: number;
  };
  recent: {
    analyzed: number;
    queued: number;
    sent: number;
    handoffs: number;
    failed: number;
  };
  sampleSize: number;
  generatedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function stateLabel(value: boolean): string {
  return value ? "Enabled" : "Disabled";
}

export default function LiveAgentManager() {
  const [status, setStatus] = useState<LiveAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/agent/live/status", {
        cache: "no-store",
      });
      setStatus(await readJson<LiveAgentStatus>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Agent status failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !status) {
    return <div className="live-agent-loading">Loading guarded AI runtime…</div>;
  }

  return (
    <div className="live-agent-manager">
      {error ? <div className="live-agent-alert">{error}</div> : null}

      <section className="live-agent-summary">
        <article>
          <span>Webhook analysis</span>
          <strong>{stateLabel(Boolean(status?.policy.webhookAnalysisEnabled))}</strong>
          <small>Inbound text can be analysed and persisted after verified webhook storage.</small>
        </article>
        <article>
          <span>AI auto-reply</span>
          <strong>{stateLabel(Boolean(status?.policy.autoReplyEnabled))}</strong>
          <small>Auto-replies remain locked until explicit final cutover configuration.</small>
        </article>
        <article>
          <span>Immediate dispatch</span>
          <strong>{stateLabel(Boolean(status?.policy.immediateDispatchEnabled))}</strong>
          <small>Queue-to-Meta delivery requires its own independent confirmation gate.</small>
        </article>
        <article>
          <span>Outbound mode</span>
          <strong>{status?.policy.outboundMode || "disabled"}</strong>
          <small>Current sender mode from the protected Meta outbound configuration.</small>
        </article>
      </section>

      <section className="live-agent-card">
        <header>
          <div>
            <span>AI lifecycle</span>
            <h3>Inbound analysis, memory and human handoff</h3>
            <p>Verified inbound messages now enter the guarded AI lifecycle without enabling live WhatsApp sending.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </header>

        <div className="live-agent-gates">
          <div data-state={status?.policy.runtimeEnabled ? "ready" : "locked"}>
            <span>Agent runtime</span>
            <strong>{status?.policy.runtimeEnabled ? "Ready" : "Locked"}</strong>
          </div>
          <div data-state={status?.policy.modelCallsEnabled ? "ready" : "locked"}>
            <span>Model calls</span>
            <strong>{status?.policy.modelCallsEnabled ? "Allowed" : "Disabled"}</strong>
          </div>
          <div data-state={status?.policy.killSwitchActive ? "locked" : "ready"}>
            <span>Kill switch</span>
            <strong>{status?.policy.killSwitchActive ? "Active" : "Clear"}</strong>
          </div>
          <div data-state={status?.policy.liveAutoReplyReady ? "ready" : "locked"}>
            <span>Live auto-reply</span>
            <strong>{status?.policy.liveAutoReplyReady ? "Ready" : "Cutover locked"}</strong>
          </div>
        </div>
      </section>

      <section className="live-agent-card">
        <header>
          <div>
            <span>Operational view</span>
            <h3>AI conversations and review queue</h3>
            <p>Recent lifecycle metrics are based on the latest {status?.sampleSize ?? 0} inbound agent events.</p>
          </div>
        </header>
        <div className="live-agent-metrics">
          <article><span>AI mode</span><strong>{status?.conversations.aiMode ?? 0}</strong></article>
          <article><span>Review required</span><strong>{status?.conversations.pendingReview ?? 0}</strong></article>
          <article><span>Analysed</span><strong>{status?.recent.analyzed ?? 0}</strong></article>
          <article><span>Queued</span><strong>{status?.recent.queued ?? 0}</strong></article>
          <article><span>Sent</span><strong>{status?.recent.sent ?? 0}</strong></article>
          <article><span>Handoffs</span><strong>{status?.recent.handoffs ?? 0}</strong></article>
          <article><span>Failed safely</span><strong>{status?.recent.failed ?? 0}</strong></article>
        </div>
        <footer>
          Unsupported media, low-confidence answers, payment/refund cases, prompt injection and missing approved knowledge move to human review instead of unsafe auto-send.
        </footer>
      </section>
    </div>
  );
}

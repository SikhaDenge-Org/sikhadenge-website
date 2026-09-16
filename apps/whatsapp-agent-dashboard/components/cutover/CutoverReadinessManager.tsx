"use client";

import { useEffect, useState } from "react";

type ApprovalCandidate = {
  messageId: string;
  type: string;
  actor: string;
  preview: string;
  recipient: string;
  waId: string;
  workspaceId: string;
  connectionId: string;
  queuedAt: string;
};

type ApprovalResponse = {
  success: boolean;
  message?: string;
  approval?: {
    id: string;
    messageId: string;
    approvedAt: string;
    expiresAt: string;
    controlledLaunchStateVersion: number;
  };
};
type ApprovalHistory = {
  id: string;
  messageId: string;
  reason: string;
  approvedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
  status: "ACTIVE" | "CONSUMED" | "REVOKED" | "EXPIRED";
};

type Readiness = {
  readyForSupervisedCutover: boolean;
  readyForAutomaticCutover: boolean;
  cutoverExecuted: boolean;
  metaConnected?: boolean;
  outboundMode?: "disabled" | "dry_run" | "live";
  checks: Array<{
    id: string;
    group: string;
    label: string;
    status: "PASS" | "PENDING" | "MANUAL" | "BLOCKED";
    detail: string;
  }>;
  summary: { passed: number; pending: number; manual: number; blocked: number };
  inventory: Record<string, number>;
  constraints: Record<string, boolean>;
  generatedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || "Cutover readiness request failed.");
  return payload;
}

function humanise(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CutoverReadinessManager() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ApprovalCandidate[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [ttlMs, setTtlMs] = useState(10 * 60 * 1_000);
  const [approving, setApproving] = useState(false);
  const [approvalResult, setApprovalResult] = useState("");
  const [approvals, setApprovals] = useState<ApprovalHistory[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [response, approvalResponse] = await Promise.all([
        fetch("/api/cutover/readiness", { cache: "no-store" }),
        fetch("/api/cutover/outbound-approvals", { cache: "no-store" }),
      ]);
      setData(await readJson<Readiness>(response));
      const approvalData = await readJson<{ success: boolean; candidates: ApprovalCandidate[]; approvals: ApprovalHistory[] }>(approvalResponse);
      setCandidates(approvalData.candidates);
      setApprovals(approvalData.approvals);
      setSelectedMessageId((current) => current || approvalData.candidates[0]?.messageId || "");
      setSelectedApprovalId((current) => {
        const active = approvalData.approvals.filter((approval) => approval.status === "ACTIVE");
        return active.some((approval) => approval.id === current) ? current : active[0]?.id || "";
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cutover readiness could not load.");
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!selectedMessageId || !approvalReason.trim()) {
      setError("Select a queued message and enter an approval reason.");
      return;
    }
    setApproving(true);
    setError("");
    setApprovalResult("");
    try {
      const response = await fetch("/api/cutover/outbound-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: selectedMessageId, reason: approvalReason.trim(), ttlMs }),
      });
      const result = await readJson<ApprovalResponse>(response);
      if (!result.approval) throw new Error("Approval response is missing persisted approval details.");
      setApprovalResult("Approved " + result.approval.messageId + " until " + new Date(result.approval.expiresAt).toLocaleString() + ".");
      setApprovalReason("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Outbound approval failed.");
    } finally {
      setApproving(false);
    }
  }

  async function revokeSelected() {
    if (!selectedApprovalId || !revokeReason.trim()) {
      setError("Select an active approval and enter a revocation reason.");
      return;
    }
    setRevoking(true);
    setError("");
    setApprovalResult("");
    try {
      const response = await fetch("/api/cutover/outbound-approvals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: selectedApprovalId, reason: revokeReason.trim() }),
      });
      const result = await readJson<{ success: boolean; approval: { id: string; messageId: string } }>(response);
      setApprovalResult("Revoked approval " + result.approval.id + " for message " + result.approval.messageId + ".");
      setRevokeReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Outbound approval revocation failed.");
    } finally {
      setRevoking(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) return <div className="suite-loading">Running production readiness audit…</div>;
  if (!data) return <div className="suite-alert error">{error || "Cutover readiness unavailable."}</div>;

  const groups = Array.from(new Set(data.checks.map((check) => check.group)));
  const headline = data.cutoverExecuted
    ? data.outboundMode === "live"
      ? "Cloud API migration and live outbound delivery are active"
      : "Cloud API migration is complete; outbound activation is pending"
    : data.readyForSupervisedCutover
      ? "Technical prerequisites can proceed to supervised review"
      : "Cutover remains blocked";

  return (
    <div className="suite-stack">
      <section className="cutover-banner">
        <div>
          <span>Production connection control</span>
          <h3>{headline}</h3>
          <p>
            Incoming ownership is determined from configured Meta credentials and stored production webhook evidence.
            Manual, AI, campaign and automation sending remain independently controlled.
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Running…" : "Run audit again"}
        </button>
      </section>

      {error ? <div className="suite-alert error">{error}</div> : null}

      <section className="suite-metrics">
        <article><span>Passed</span><strong>{data.summary.passed}</strong></article>
        <article><span>Pending</span><strong>{data.summary.pending}</strong></article>
        <article><span>Manual checks</span><strong>{data.summary.manual}</strong></article>
        <article><span>Blocked</span><strong>{data.summary.blocked}</strong></article>
      </section>

      <section className="suite-grid two">
        {groups.map((group) => (
          <div className="suite-card" key={group}>
            <header><div><span>Readiness group</span><h3>{group}</h3></div></header>
            <div className="cutover-check-list">
              {data.checks.filter((check) => check.group === group).map((check) => (
                <article key={check.id}>
                  <span className={`cutover-status ${check.status.toLowerCase()}`}>{check.status}</span>
                  <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="suite-grid two">
        <div className="suite-card">
          <header><div><span>Production inventory</span><h3>Current system state</h3></div></header>
          <div className="suite-list compact">
            {Object.entries(data.inventory).map(([name, value]) => <article key={name}><span>{humanise(name)}</span><strong>{value}</strong></article>)}
          </div>
        </div>
        <div className="suite-card">
          <header><div><span>Operational controls</span><h3>Current constraints</h3></div></header>
          <div className="suite-list compact">
            {Object.entries(data.constraints).map(([name, value]) => <article key={name}><span>{humanise(name)}</span><strong>{value ? "Yes" : "No"}</strong></article>)}
          </div>
        </div>
      </section>

      <section className="suite-card">
        <header><div><span>Controlled outbound</span><h3>One-time human approval</h3></div></header>
        <p>Approvals are persisted, message-specific, content-fingerprinted, state-version-bound and consumed exactly once at the Meta provider boundary.</p>
        <div className="suite-stack">
          <label>Queued outbound message</label>
          <select value={selectedMessageId} onChange={(event) => setSelectedMessageId(event.target.value)}>
            {candidates.length === 0 ? <option value="">No eligible queued messages</option> : null}
            {candidates.map((candidate) => (
              <option key={candidate.messageId} value={candidate.messageId}>
                {candidate.recipient} · {candidate.type} · {candidate.preview}
              </option>
            ))}
          </select>
          <label>Approval reason</label>
          <textarea value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} rows={3} placeholder="Why is this exact outbound message approved for controlled launch?" />
          <label>Approval validity</label>
          <select value={ttlMs} onChange={(event) => setTtlMs(Number(event.target.value))}>
            <option value={5 * 60 * 1_000}>5 minutes</option>
            <option value={10 * 60 * 1_000}>10 minutes</option>
            <option value={15 * 60 * 1_000}>15 minutes</option>
            <option value={30 * 60 * 1_000}>30 minutes</option>
          </select>
          <button type="button" className="primary" onClick={() => void approveSelected()} disabled={approving || !selectedMessageId || !approvalReason.trim()}>
            {approving ? "Persisting approval…" : "Approve exactly once"}
          </button>          {approvalResult ? <div className="suite-alert success">{approvalResult}</div> : null}

          <div className="suite-list compact">
            {approvals.slice(0, 10).map((approval) => (
              <article key={approval.id}>
                <span>{approval.status} · {approval.messageId}</span>
                <strong>{new Date(approval.approvedAt).toLocaleString()}</strong>
                <p>{approval.status === "REVOKED" ? approval.revokeReason : approval.reason}</p>
              </article>
            ))}
          </div>

          <label>Active approval to revoke</label>
          <select value={selectedApprovalId} onChange={(event) => setSelectedApprovalId(event.target.value)}>
            {approvals.filter((approval) => approval.status === "ACTIVE").length === 0 ? <option value="">No active approvals</option> : null}
            {approvals.filter((approval) => approval.status === "ACTIVE").map((approval) => (
              <option key={approval.id} value={approval.id}>{approval.messageId} · expires {new Date(approval.expiresAt).toLocaleTimeString()}</option>
            ))}
          </select>
          <label>Revocation reason</label>
          <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} rows={2} placeholder="Why should this persisted approval be cancelled?" />
          <button type="button" className="secondary" onClick={() => void revokeSelected()} disabled={revoking || !selectedApprovalId || !revokeReason.trim()}>
            {revoking ? "Revoking approval…" : "Revoke active approval"}
          </button>
        </div>
      </section>

      <div className={`suite-alert ${data.cutoverExecuted ? "success" : "warning"}`}>
        {data.cutoverExecuted
          ? `The SikhaDenge-owned webhook is receiving production traffic. Effective outbound mode: ${data.outboundMode || "disabled"}.`
          : "Complete phone registration and store a real inbound webhook event before retiring the previous provider."}
      </div>
    </div>
  );
}

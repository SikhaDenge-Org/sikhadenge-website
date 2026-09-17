"use client";

import { useEffect, useState } from "react";

type Candidate = {
  messageId: string;
  workspaceId: string;
  connectionId: string;
  recipient: string;
  waId: string;
  queuedAt: string;
  flowType: "AUTOMATION" | "CAMPAIGN";
  flowId: string;
  flowVersion: number;
};

type Approval = {
  id: string;
  controlledLaunchStateVersion: number;
  flowType: string;
  flowId: string;
  flowVersion: number;
  reason: string;
  approvedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  status: "ACTIVE" | "REVOKED";
};
async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Approved-flow governance request failed.");
  return payload;
}

export default function ApprovedFlowGovernancePanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [reason, setReason] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/cutover/approved-flows", { cache: "no-store" });
    const data = await readJson<{ success: boolean; candidates: Candidate[]; approvals: Approval[] }>(response);
    setCandidates(data.candidates);
    setApprovals(data.approvals);
    setSelectedMessageId((current) => data.candidates.some((item) => item.messageId === current) ? current : data.candidates[0]?.messageId || "");
    setSelectedApprovalId((current) => {
      const active = data.approvals.filter((item) => item.status === "ACTIVE");
      return active.some((item) => item.id === current) ? current : active[0]?.id || "";
    });
  }
  async function approve() {
    if (!selectedMessageId || !reason.trim()) return setError("Select a queued flow and enter an approval reason.");
    setBusy(true); setError(""); setResult("");
    try {
      const response = await fetch("/api/cutover/approved-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: selectedMessageId, reason: reason.trim() }),
      });
      const data = await readJson<{ approval: { flowType: string; flowId: string; flowVersion: number; controlledLaunchStateVersion: number } }>(response);
      setResult(`Approved ${data.approval.flowType} ${data.approval.flowId} v${data.approval.flowVersion} for launch state v${data.approval.controlledLaunchStateVersion}.`);
      setReason("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approved-flow approval failed."); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!selectedApprovalId || !revokeReason.trim()) return setError("Select an active approved flow and enter a revocation reason.");
    setBusy(true); setError(""); setResult("");
    try {
      const response = await fetch("/api/cutover/approved-flows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: selectedApprovalId, reason: revokeReason.trim() }),
      });
      await readJson(response);
      setResult(`Revoked approved-flow authority ${selectedApprovalId}.`);
      setRevokeReason("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approved-flow revocation failed."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Approved-flow governance could not load.")); }, []);

  return (
    <section className="suite-card">
      <header><div><span>Approved-flow governance</span><h3>Automation & campaign authority</h3></div></header>
      <p>Operator approvals are bound to the persisted workspace, WhatsApp connection, launch-state version and exact flow provenance derived from a queued message.</p>
      {error ? <div className="suite-alert error">{error}</div> : null}
      {result ? <div className="suite-alert success">{result}</div> : null}
      <div className="suite-stack">
        <label>Queued flow candidate</label>
        <select value={selectedMessageId} onChange={(event) => setSelectedMessageId(event.target.value)}>
          {candidates.length === 0 ? <option value="">No approved-flow candidates</option> : null}
          {candidates.map((candidate) => (
            <option key={candidate.messageId} value={candidate.messageId}>
              {candidate.flowType} · {candidate.flowId} v{candidate.flowVersion} · {candidate.recipient}
            </option>
          ))}
        </select>
        <label>Approval reason</label>
        <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why may this exact automation/campaign run during the current controlled-launch state?" />
        <button type="button" className="primary" disabled={busy || !selectedMessageId || !reason.trim()} onClick={() => void approve()}>
          {busy ? "Persisting…" : "Approve flow for current state"}
        </button>
      </div>
      <div className="suite-list compact">
        {approvals.slice(0, 12).map((approval) => (
          <article key={approval.id}>
            <span>{approval.status} · {approval.flowType} · {approval.flowId} v{approval.flowVersion}</span>
            <strong>Launch v{approval.controlledLaunchStateVersion} · {new Date(approval.approvedAt).toLocaleString()}</strong>
            <p>{approval.status === "REVOKED" ? approval.revokeReason : approval.reason}</p>
          </article>
        ))}
      </div>
      <div className="suite-stack">
        <label>Active flow authority to revoke</label>
        <select value={selectedApprovalId} onChange={(event) => setSelectedApprovalId(event.target.value)}>
          {approvals.filter((item) => item.status === "ACTIVE").length === 0 ? <option value="">No active flow approvals</option> : null}
          {approvals.filter((item) => item.status === "ACTIVE").map((approval) => (
            <option key={approval.id} value={approval.id}>{approval.flowType} · {approval.flowId} v{approval.flowVersion}</option>
          ))}
        </select>
        <label>Revocation reason</label>
        <textarea rows={2} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Why should this approved-flow authority be revoked?" />
        <button type="button" className="secondary" disabled={busy || !selectedApprovalId || !revokeReason.trim()} onClick={() => void revoke()}>
          {busy ? "Persisting…" : "Revoke active flow approval"}
        </button>
      </div>
    </section>
  );
}

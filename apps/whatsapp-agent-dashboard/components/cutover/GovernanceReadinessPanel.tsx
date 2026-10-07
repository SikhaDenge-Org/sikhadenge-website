"use client";

import { useEffect, useState } from "react";

type WorkspaceGovernance = {
  workspaceId: string;
  stage: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  version: number;
  internallyConsistent: boolean;
  migrationReady: boolean;
  missingTables: string[];
  scope: null | {
    connectedAccountIds: string[];
    enabledChannels: string[];
    maxRealLeads: number;
    externalWritesRequested: boolean;
  };
  humanApproval: null | { active: number; consumed: number; revoked: number; expired: number };
  boundedAutopilot: null | { limit: number; used: number; remaining: number; exhausted: boolean; withinCap: boolean };
  approvedFlows: null | { active: number; revoked: number };
};

type GovernanceReadiness = {
  success: boolean;
  readyForGovernedExecution: boolean;
  providerMode: "disabled" | "dry_run" | "live";
  providerWriteKillSwitchActive: boolean;
  workspaceCount: number;
  controlledWorkspaceCount: number;
  missingStateWorkspaces: string[];
  checks: {
    everyWorkspaceHasControlledState: boolean;
    governanceTablesPresent: boolean;
    persistedStateConsistent: boolean;
    boundedAutopilotWithinCap: boolean;
  };
  workspaces: WorkspaceGovernance[];
  generatedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Governance readiness request failed.");
  return payload;
}

export default function GovernanceReadinessPanel() {
  const [data, setData] = useState<GovernanceReadiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cutover/governance-readiness", { cache: "no-store" });
      setData(await readJson<GovernanceReadiness>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Governance readiness could not load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  if (loading && !data) return <div className="suite-loading">Loading governance readiness…</div>;
  if (!data) return <div className="suite-alert error">{error || "Governance readiness unavailable."}</div>;

  return (
    <section className="suite-card">
      <header>
        <div>
          <span>Phase17 governance</span>
          <h3>Execution readiness & observability</h3>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh governance"}
        </button>
      </header>
      {error ? <div className="suite-alert error">{error}</div> : null}
      <div className={`suite-alert ${data.readyForGovernedExecution ? "success" : "warning"}`}>
        {data.readyForGovernedExecution
          ? "Persisted governance controls are internally consistent and migration-ready."
          : "Governed execution is not yet release-ready; review the failed checks below."}
      </div>
      <div className="suite-metrics">
        <article><span>Provider mode</span><strong>{data.providerMode}</strong></article>
        <article><span>Provider kill switch</span><strong>{data.providerWriteKillSwitchActive ? "ACTIVE" : "OFF"}</strong></article>
        <article><span>Controlled workspaces</span><strong>{data.controlledWorkspaceCount}/{data.workspaceCount}</strong></article>
        <article><span>Generated</span><strong>{new Date(data.generatedAt).toLocaleTimeString()}</strong></article>
      </div>
      <div className="suite-list compact">
        {Object.entries(data.checks).map(([name, value]) => (
          <article key={name}>
            <span>{name.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
            <strong>{value ? "PASS" : "BLOCKED"}</strong>
          </article>
        ))}
      </div>
      {data.missingStateWorkspaces.length > 0 ? (
        <div className="suite-alert warning">
          Missing controlled-launch state: {data.missingStateWorkspaces.join(", ")}
        </div>
      ) : null}
      <div className="suite-stack">
        {data.workspaces.map((workspace) => (
          <article className="suite-card" key={workspace.workspaceId}>
            <header>
              <div><span>Workspace</span><h3>{workspace.workspaceId}</h3></div>
              <strong>v{workspace.version}</strong>
            </header>
            <p>{workspace.stage} · {workspace.mode} · {workspace.writePolicy}</p>
            <div className="suite-list compact">
              <article><span>Persisted state</span><strong>{workspace.internallyConsistent ? "CONSISTENT" : "BLOCKED"}</strong></article>
              <article><span>Governance migrations</span><strong>{workspace.migrationReady ? "READY" : "MISSING"}</strong></article>
              <article><span>External writes</span><strong>{workspace.externalWritesAllowed ? "ALLOWED" : "DENIED"}</strong></article>
              <article><span>Human approvals</span><strong>{workspace.humanApproval ? `${workspace.humanApproval.active} active / ${workspace.humanApproval.consumed} consumed` : "NOT MIGRATED"}</strong></article>
              <article><span>Bounded recipients</span><strong>{workspace.boundedAutopilot ? `${workspace.boundedAutopilot.used}/${workspace.boundedAutopilot.limit}` : "NOT MIGRATED"}</strong></article>
              <article><span>Approved flows</span><strong>{workspace.approvedFlows ? `${workspace.approvedFlows.active} active / ${workspace.approvedFlows.revoked} revoked` : "NOT MIGRATED"}</strong></article>
            </div>
            {workspace.missingTables.length > 0 ? <p>Missing: {workspace.missingTables.join(", ")}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

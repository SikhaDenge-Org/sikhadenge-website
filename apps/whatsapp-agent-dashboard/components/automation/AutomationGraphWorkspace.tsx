"use client";

import { useEffect, useMemo, useState } from "react";

type Flow = { flowId: string; name: string; version: number; status: string };
type GraphNode = { id: string; type: string; config: Record<string, unknown> };
type GraphEdge = { id: string; from: string; to: string; label?: string };
type Workspace = {
  flowId: string;
  sourceFlowVersion: number;
  draft: {
    flowId: string;
    sourceFlowVersion: number;
    graph: { nodes: GraphNode[]; edges: GraphEdge[] };
    updatedAt: string;
  };
  draftPersisted: boolean;
  draftStale: boolean;
  publishedVersions: Array<{ sourceFlowVersion: number; publishedAt: string; publishedBy: string }>;
};
type Trace = { index: number; nodeId: string; nodeType: string; result: string; nextNodeId: string | null };

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function title(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function AutomationGraphWorkspace() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => flows.find((flow) => flow.flowId === flowId) ?? null, [flows, flowId]);

  async function loadGraph(id: string) {
    if (!id) {
      setWorkspace(null);
      return;
    }
    const response = await fetch(`/api/automation/flows/${encodeURIComponent(id)}/graph`, { cache: "no-store" });
    setWorkspace(await json<Workspace>(response));
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/automation/flows", { cache: "no-store" })
      .then((response) => json<{ flows: Flow[] }>(response))
      .then(async (payload) => {
        if (!active) return;
        setFlows(payload.flows);
        const first = payload.flows[0]?.flowId ?? "";
        setFlowId(first);
        if (first) await loadGraph(first);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Graph workspace could not load."));
    return () => { active = false; };
  }, []);

  async function choose(id: string) {
    setFlowId(id);
    setTrace([]);
    setError("");
    setNotice("");
    try { await loadGraph(id); } catch (reason) { setError(reason instanceof Error ? reason.message : "Graph could not load."); }
  }

  async function sync() {
    if (!flowId) return;
    setBusy("sync"); setError(""); setNotice("");
    try {
      await json(await fetch(`/api/automation/flows/${encodeURIComponent(flowId)}/graph`, { method: "POST" }));
      await loadGraph(flowId);
      setNotice("Graph draft synced from the current linear flow version.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Graph sync failed."); }
    finally { setBusy(""); }
  }

  async function simulate() {
    if (!flowId) return;
    setBusy("simulate"); setError(""); setNotice("");
    try {
      const result = await json<{ steps: Trace[]; outboundSent: false; draftStale: boolean }>(await fetch(`/api/automation/flows/${encodeURIComponent(flowId)}/graph/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: { message: "Demo class details", lead: { stage: "NEW" }, tag: "Website Lead" } }),
      }));
      setTrace(result.steps);
      setNotice(result.draftStale ? "Simulation completed on a stale draft; sync before publishing." : "Graph simulation completed. No external message was sent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Graph simulation failed."); }
    finally { setBusy(""); }
  }

  async function publish() {
    if (!flowId) return;
    setBusy("publish"); setError(""); setNotice("");
    try {
      const result = await json<{ published: { sourceFlowVersion: number } }>(await fetch(`/api/automation/flows/${encodeURIComponent(flowId)}/graph/publish`, { method: "POST" }));
      await loadGraph(flowId);
      setNotice(`Immutable graph source version v${result.published.sourceFlowVersion} published. Runtime execution remains separately locked.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Graph publish failed."); }
    finally { setBusy(""); }
  }

  return (
    <section className="graph-workspace-card">
      <header className="graph-workspace-header">
        <div>
          <span>Phase 9 · versioned graph workspace</span>
          <h3>Automation graph publish & simulator</h3>
          <p>Keep the current visual sequence editor while validating its channel-neutral graph, immutable versions and dry-run path before runtime activation.</p>
        </div>
        <label>
          <span>Flow</span>
          <select value={flowId} onChange={(event) => void choose(event.target.value)}>
            <option value="">Select flow</option>
            {flows.map((flow) => <option key={flow.flowId} value={flow.flowId}>{flow.name} · v{flow.version}</option>)}
          </select>
        </label>
      </header>

      {error ? <div className="automation-alert error">{error}</div> : null}
      {notice ? <div className="automation-alert success">{notice}</div> : null}

      {selected && workspace ? <>
        <div className="graph-workspace-metrics">
          <article><span>Source</span><strong>v{workspace.sourceFlowVersion}</strong><small>{selected.name}</small></article>
          <article><span>Draft</span><strong>{workspace.draftPersisted ? "Persisted" : "Derived"}</strong><small>{workspace.draftStale ? "Stale — sync required" : "Matches current flow"}</small></article>
          <article><span>Nodes</span><strong>{workspace.draft.graph.nodes.length}</strong><small>{workspace.draft.graph.edges.length} directed edges</small></article>
          <article><span>Published</span><strong>{workspace.publishedVersions.length}</strong><small>Immutable snapshots</small></article>
        </div>

        <div className="graph-node-strip">
          {workspace.draft.graph.nodes.map((node, index) => (
            <div className="graph-node-tile" key={node.id}>
              <span>{index + 1}</span><strong>{title(node.type)}</strong><small>{node.id}</small>
              {index < workspace.draft.graph.nodes.length - 1 ? <b aria-hidden="true">→</b> : null}
            </div>
          ))}
        </div>

        <div className="graph-workspace-actions">
          <button type="button" className="secondary" disabled={busy !== ""} onClick={() => void sync()}>{busy === "sync" ? "Syncing…" : "Sync graph draft"}</button>
          <button type="button" className="secondary" disabled={busy !== ""} onClick={() => void simulate()}>{busy === "simulate" ? "Simulating…" : "Dry-run graph"}</button>
          <button type="button" disabled={busy !== "" || workspace.draftStale} onClick={() => void publish()}>{busy === "publish" ? "Publishing…" : "Publish immutable version"}</button>
        </div>

        {trace.length ? <div className="graph-trace"><strong>Simulation trace</strong>{trace.map((step) => <p key={`${step.index}-${step.nodeId}`}>{step.index}. {title(step.nodeType)} · {title(step.result)}{step.nextNodeId ? ` → ${step.nextNodeId}` : ""}</p>)}</div> : null}
        {workspace.publishedVersions.length ? <div className="graph-published-list"><strong>Published graph history</strong>{workspace.publishedVersions.map((version) => <p key={`${version.sourceFlowVersion}-${version.publishedAt}`}>Source v{version.sourceFlowVersion} · {version.publishedAt ? new Date(version.publishedAt).toLocaleString() : "timestamp unavailable"}</p>)}</div> : null}
      </> : <p className="graph-empty">Create or select an automation flow to open its graph workspace.</p>}
    </section>
  );
}

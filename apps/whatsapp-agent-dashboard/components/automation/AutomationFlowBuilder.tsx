"use client";

import { useEffect, useMemo, useState } from "react";

type FlowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type NodeKind = "TRIGGER" | "ACTION";

type FlowNode = {
  id: string;
  kind: NodeKind;
  type: string;
  label: string;
  config: Record<string, unknown>;
};

type Flow = {
  flowId: string;
  name: string;
  description: string;
  status: FlowStatus;
  version: number;
  nodes: FlowNode[];
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
  lastSimulationAt: string | null;
};

type Runtime = {
  runtimeEnabled: boolean;
  actionExecutionEnabled: boolean;
  outboundMode: string;
  externalActionsReady: boolean;
};

type Validation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  triggerCount: number;
  actionCount: number;
};

const triggerTypes = [
  "INCOMING_KEYWORD",
  "NEW_LEAD",
  "TAG_ADDED",
  "STAGE_CHANGED",
  "FOLLOW_UP_DUE",
  "NO_REPLY",
  "SCHEDULE",
  "WEBHOOK",
];

const actionTypes = [
  "SEND_TEXT",
  "SEND_TEMPLATE",
  "SEND_MEDIA",
  "ASK_QUESTION",
  "ADD_TAG",
  "REMOVE_TAG",
  "UPDATE_STAGE",
  "ASSIGN_COUNSELOR",
  "WAIT",
  "CONDITION",
  "HUMAN_HANDOFF",
  "END",
];

function uid() {
  return `node-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function humanise(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyNode(kind: NodeKind): FlowNode {
  const type = kind === "TRIGGER" ? "INCOMING_KEYWORD" : "SEND_TEXT";
  return {
    id: uid(),
    kind,
    type,
    label: humanise(type),
    config: {},
  };
}

function configField(type: string) {
  if (type === "INCOMING_KEYWORD") return { key: "keyword", label: "Keyword", placeholder: "demo class" };
  if (type === "SCHEDULE") return { key: "schedule", label: "Schedule", placeholder: "Every day 09:00 IST" };
  if (type === "WEBHOOK") return { key: "secretLabel", label: "Webhook label", placeholder: "Website lead form" };
  if (type === "TAG_ADDED" || type === "ADD_TAG" || type === "REMOVE_TAG") return { key: "tag", label: "Tag", placeholder: "Hot Lead" };
  if (type === "STAGE_CHANGED" || type === "UPDATE_STAGE") return { key: "stage", label: "Lead stage", placeholder: "QUALIFIED" };
  if (type === "SEND_TEXT" || type === "ASK_QUESTION") return { key: "text", label: "Message text", placeholder: "Type the approved message…" };
  if (type === "SEND_TEMPLATE") return { key: "templateId", label: "Approved template ID", placeholder: "Template record ID" };
  if (type === "SEND_MEDIA") return { key: "assetId", label: "Media asset ID", placeholder: "Uploaded asset ID" };
  if (type === "ASSIGN_COUNSELOR") return { key: "counselorId", label: "Counselor ID", placeholder: "Dashboard user ID" };
  if (type === "WAIT") return { key: "minutes", label: "Wait minutes", placeholder: "60" };
  if (type === "CONDITION") return { key: "field", label: "Condition field", placeholder: "lead.stage = QUALIFIED" };
  if (type === "NO_REPLY") return { key: "minutes", label: "No reply minutes", placeholder: "1440" };
  return null;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export default function AutomationFlowBuilder() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [simulation, setSimulation] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => flows.find((flow) => flow.flowId === selectedId) ?? null,
    [flows, selectedId],
  );

  async function loadFlows(preferredId?: string) {
    const response = await fetch("/api/automation/flows", { cache: "no-store" });
    const payload = await readJson<{ flows: Flow[]; runtime: Runtime }>(response);
    setFlows(payload.flows);
    setRuntime(payload.runtime);
    const nextId = preferredId || selectedId || payload.flows[0]?.flowId || "";
    setSelectedId(nextId);
    const next = payload.flows.find((flow) => flow.flowId === nextId);
    if (next) {
      setName(next.name);
      setDescription(next.description);
      setNodes(next.nodes);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/automation/flows", { cache: "no-store" })
      .then((response) => readJson<{ flows: Flow[]; runtime: Runtime }>(response))
      .then((payload) => {
        if (!active) return;
        setFlows(payload.flows);
        setRuntime(payload.runtime);
        const first = payload.flows[0];
        if (first) {
          setSelectedId(first.flowId);
          setName(first.name);
          setDescription(first.description);
          setNodes(first.nodes);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Automation flows could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectFlow(flow: Flow) {
    setSelectedId(flow.flowId);
    setName(flow.name);
    setDescription(flow.description);
    setNodes(flow.nodes);
    setValidation(null);
    setSimulation([]);
    setError("");
    setSuccess("");
  }

  function newDraft() {
    setSelectedId("");
    setName("");
    setDescription("");
    setNodes([emptyNode("TRIGGER"), { ...emptyNode("ACTION"), type: "END", label: "End" }]);
    setValidation(null);
    setSimulation([]);
    setError("");
    setSuccess("");
  }

  function updateNode(index: number, patch: Partial<FlowNode>) {
    setNodes((current) => current.map((node, itemIndex) => (itemIndex === index ? { ...node, ...patch } : node)));
    setValidation(null);
    setSimulation([]);
  }

  function updateConfig(index: number, key: string, value: string) {
    setNodes((current) => current.map((node, itemIndex) => itemIndex === index
      ? { ...node, config: { ...node.config, [key]: key === "minutes" ? Number(value) : value } }
      : node));
    setValidation(null);
  }

  function moveNode(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= nodes.length) return;
    const copy = [...nodes];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    setNodes(copy);
  }

  async function saveFlow() {
    setBusy("save");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(selectedId ? `/api/automation/flows/${encodeURIComponent(selectedId)}` : "/api/automation/flows", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, nodes }),
      });
      const result = await readJson<{ flow: Flow; validation: Validation }>(response);
      setValidation(result.validation);
      setSuccess(selectedId ? "Automation flow saved. Active flows are paused automatically after edits." : "Automation draft created.");
      await loadFlows(result.flow.flowId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Automation flow could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(status: FlowStatus) {
    if (!selectedId) return;
    setBusy(`status:${status}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/automation/flows/${encodeURIComponent(selectedId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await readJson<{ flow: Flow; validation: Validation }>(response);
      setValidation(result.validation);
      setSuccess(`Flow status changed to ${humanise(status)}.`);
      await loadFlows(selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Flow status update failed.");
    } finally {
      setBusy("");
    }
  }

  async function simulate() {
    if (!selectedId) {
      setError("Save the draft before simulation.");
      return;
    }
    setBusy("simulate");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/automation/flows/${encodeURIComponent(selectedId)}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: { message: "Demo class details", stage: "NEW", tag: "Website Lead" } }),
      });
      const result = await readJson<{ steps: Array<{ index: number; label: string; result: string }>; outboundSent: boolean }>(response);
      setSimulation(result.steps.map((step) => `${step.index}. ${step.label}: ${humanise(step.result)}`));
      setSuccess("Dry-run simulation completed. No WhatsApp message was sent.");
      await loadFlows(selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Flow simulation failed.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="automation-loading">Loading automation workspace…</div>;

  return (
    <div className="automation-builder">
      <section className="automation-metrics">
        <article><span>Flows</span><strong>{flows.length}</strong><small>Draft, active, paused and archived.</small></article>
        <article><span>Active</span><strong>{flows.filter((flow) => flow.status === "ACTIVE").length}</strong><small>Definitions can be active while execution stays locked.</small></article>
        <article><span>Runtime</span><strong>{runtime?.runtimeEnabled ? "Enabled" : "Locked"}</strong><small>Trigger execution remains disabled until approved.</small></article>
        <article><span>External actions</span><strong>{runtime?.externalActionsReady ? "Ready" : "Locked"}</strong><small>WhatsApp sends require final Meta cutover.</small></article>
      </section>

      {error ? <div className="automation-alert error">{error}</div> : null}
      {success ? <div className="automation-alert success">{success}</div> : null}

      <div className="automation-workspace">
        <aside className="automation-library">
          <header><div><span>Flow library</span><h3>Saved automations</h3></div><button type="button" onClick={newDraft}>New flow</button></header>
          <div className="automation-flow-list">
            {flows.length === 0 ? <p>No flow saved yet.</p> : flows.map((flow) => (
              <button key={flow.flowId} type="button" className={selectedId === flow.flowId ? "active" : ""} onClick={() => selectFlow(flow)}>
                <span className={`automation-status status-${flow.status.toLowerCase()}`}>{humanise(flow.status)}</span>
                <strong>{flow.name}</strong>
                <small>{flow.nodes.length} nodes · v{flow.version}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="automation-editor">
          <header><div><span>Visual sequence builder</span><h3>{selected ? selected.name : "New automation flow"}</h3><p>Arrange one trigger followed by actions. Simulation is always dry-run in this phase.</p></div></header>
          <div className="automation-details-grid">
            <label><span>Flow name</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Demo class follow-up" /></label>
            <label><span>Description</span><input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="Qualify and route demo enquiries" /></label>
          </div>

          <div className="automation-node-toolbar">
            <button type="button" className="secondary" onClick={() => setNodes((current) => [...current, emptyNode("TRIGGER")])}>Add trigger</button>
            <button type="button" className="secondary" onClick={() => setNodes((current) => [...current, emptyNode("ACTION")])}>Add action</button>
            <small>Maximum 40 nodes. Exactly one trigger is allowed.</small>
          </div>

          <div className="automation-canvas">
            {nodes.map((node, index) => {
              const field = configField(node.type);
              return (
                <article key={node.id} className="automation-node" data-kind={node.kind.toLowerCase()}>
                  <div className="automation-node-number">{index + 1}</div>
                  <div className="automation-node-body">
                    <div className="automation-node-title"><span>{node.kind}</span><strong>{node.label}</strong></div>
                    <div className="automation-node-grid">
                      <label><span>Node type</span><select value={node.type} onChange={(event) => updateNode(index, { type: event.target.value, label: humanise(event.target.value), config: {} })}>{(node.kind === "TRIGGER" ? triggerTypes : actionTypes).map((type) => <option key={type} value={type}>{humanise(type)}</option>)}</select></label>
                      <label><span>Label</span><input value={node.label} onChange={(event) => updateNode(index, { label: event.target.value })} /></label>
                      {field ? <label className="wide"><span>{field.label}</span><input value={String(node.config[field.key] ?? "")} placeholder={field.placeholder} onChange={(event) => updateConfig(index, field.key, event.target.value)} /></label> : <div className="automation-node-note">No additional configuration required.</div>}
                    </div>
                  </div>
                  <div className="automation-node-actions">
                    <button type="button" title="Move up" disabled={index === 0} onClick={() => moveNode(index, -1)}>↑</button>
                    <button type="button" title="Move down" disabled={index === nodes.length - 1} onClick={() => moveNode(index, 1)}>↓</button>
                    <button type="button" className="danger" title="Remove" onClick={() => setNodes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                  </div>
                </article>
              );
            })}
          </div>

          {validation ? <div className={`automation-validation ${validation.valid ? "valid" : "invalid"}`}><strong>{validation.valid ? "Flow structure valid" : "Flow needs correction"}</strong>{validation.errors.map((item) => <p key={item}>Error: {item}</p>)}{validation.warnings.map((item) => <p key={item}>Warning: {item}</p>)}</div> : null}
          {simulation.length ? <div className="automation-simulation"><strong>Simulation trace</strong>{simulation.map((step) => <p key={step}>{step}</p>)}</div> : null}

          <footer>
            <div>{selected ? <><button type="button" className="secondary" disabled={busy !== ""} onClick={() => void changeStatus(selected.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}>{selected.status === "ACTIVE" ? "Pause" : "Activate"}</button><button type="button" className="danger" disabled={busy !== ""} onClick={() => void changeStatus("ARCHIVED")}>Archive</button></> : null}</div>
            <div><button type="button" className="secondary" disabled={!selectedId || busy !== ""} onClick={() => void simulate()}>{busy === "simulate" ? "Simulating…" : "Dry-run simulation"}</button><button type="button" disabled={busy !== ""} onClick={() => void saveFlow()}>{busy === "save" ? "Saving…" : selectedId ? "Save changes" : "Create draft"}</button></div>
          </footer>
        </section>
      </div>
    </div>
  );
}

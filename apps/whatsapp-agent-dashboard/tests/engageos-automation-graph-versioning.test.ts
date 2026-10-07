import assert from "node:assert/strict";

import { legacyLinearFlowToGraph } from "../modules/automations/application/legacy-flow-bridge";
import { simulateAutomationGraph } from "../modules/automations/application/graph-simulator";
import { publishAutomationVersion, validateAutomationGraph } from "../modules/automations/domain/automation-graph";

function main() {
  const graph = legacyLinearFlowToGraph([
    { id: "trigger", kind: "TRIGGER", type: "INCOMING_KEYWORD", config: { keyword: "demo" } },
    { id: "send", kind: "ACTION", type: "SEND_TEXT", config: { text: "Hello" } },
    { id: "end", kind: "ACTION", type: "END", config: {} },
  ]);
  assert.deepEqual(validateAutomationGraph(graph, { maxNodes: 100, maxEdges: 200 }), []);
  const simulation = simulateAutomationGraph({ graph, sample: { message: "demo" } });
  assert.equal(simulation.outboundSent, false);
  assert.equal(simulation.steps.length, 3);
  assert.equal(simulation.steps[0]?.result, "TRIGGER_MATCHED");
  assert.equal(simulation.steps[1]?.result, "WOULD_EXECUTE");
  assert.equal(simulation.steps[2]?.result, "STOPPED");

  const branchGraph = {
    nodes: [
      { id: "t", type: "TRIGGER" as const, config: {} },
      { id: "c", type: "CONDITION" as const, config: { field: "lead.stage", operator: "equals", value: "QUALIFIED" } },
      { id: "yes", type: "GOAL" as const, config: {} },
      { id: "no", type: "STOP" as const, config: {} },
    ],
    edges: [
      { id: "e1", from: "t", to: "c" },
      { id: "e2", from: "c", to: "yes", label: "true" },
      { id: "e3", from: "c", to: "no", label: "false" },
    ],
  };
  const yes = simulateAutomationGraph({ graph: branchGraph, sample: { lead: { stage: "QUALIFIED" } } });
  assert.equal(yes.steps.at(-1)?.nodeId, "yes");
  const no = simulateAutomationGraph({ graph: branchGraph, sample: { lead: { stage: "NEW" } } });
  assert.equal(no.steps.at(-1)?.nodeId, "no");

  const published = publishAutomationVersion({
    automationId: "flow-1",
    version: 4,
    graph,
    limits: { maxNodes: 100, maxEdges: 200 },
    publishedAt: new Date("2026-09-09T16:00:00Z"),
  });
  assert.equal(published.version, 4);
  assert.equal(Object.isFrozen(published), true);

  assert.throws(() => simulateAutomationGraph({
    graph: {
      nodes: [{ id: "a", type: "ACTION", config: {} }],
      edges: [],
    },
  }), /MISSING_TRIGGER/);
}

main();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { simulateAutomationGraph } from "../modules/automations/application/graph-simulator";
import { insideQuietHours } from "../modules/journeys/domain/journey-policy";

const runtime = readFileSync("modules/automations/application/runtime-executor.ts", "utf8");
const route = readFileSync("app/api/automation/flows/[flowId]/runtime/route.ts", "utf8");

assert.match(runtime, /automation_runtime_run/);
assert.match(runtime, /automation_runtime_action/);
assert.match(runtime, /Current automation version is not published/);
assert.match(runtime, /Automation flow is not ACTIVE/);
assert.match(runtime, /Automation runtime is disabled/);
assert.match(runtime, /Automation action execution is disabled/);
assert.match(runtime, /Automation runtime is disabled/);
assert.match(runtime, /Automation action execution is disabled/);
assert.match(runtime, /queueOutboundMessage/);
assert.doesNotMatch(runtime, /dispatchOutboundMessage\(/);
assert.match(runtime, /flowType:\s*"AUTOMATION"/);
assert.match(runtime, /Customer opted out/);
assert.match(runtime, /Customer is suppressed for WhatsApp/);
assert.match(runtime, /Customer response cancels obsolete automation/);
assert.match(runtime, /Lead-stage change cancels obsolete automation/);
assert.match(runtime, /insideQuietHours/);
assert.match(runtime, /DEFAULT_FREQUENCY_CAP/);
assert.match(runtime, /RETRYABLE/);
assert.match(runtime, /MAX_ATTEMPTS/);
assert.match(runtime, /HANDOFF_REQUIRED/);
assert.match(runtime, /AgentMode\.REVIEW_REQUIRED/);
assert.match(runtime, /idempotencyKey:\s*actionKey/);
assert.match(route, /DashboardRole\.ADMIN/);
assert.match(route, /DashboardRole\.MANAGER/);
assert.match(route, /assertAutomationFlowWorkspaceAccess/);
assert.match(route, /executePublishedAutomation/);

assert.equal(insideQuietHours(23 * 60, { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 }), true);
assert.equal(insideQuietHours(7 * 60 + 30, { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 }), true);
assert.equal(insideQuietHours(12 * 60, { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 }), false);

const result = simulateAutomationGraph({
  graph: {
    nodes: [
      { id: "trigger", type: "TRIGGER", config: {} },
      { id: "condition", type: "CONDITION", config: { field: "lead.stage", operator: "equals", value: "QUALIFIED" } },
      { id: "wait", type: "DELAY", config: { minutes: 30 } },
      { id: "handoff", type: "APPROVAL", config: {} },
      { id: "stop", type: "STOP", config: {} },
    ],
    edges: [
      { id: "e1", from: "trigger", to: "condition" },
      { id: "e2", from: "condition", to: "wait", label: "true" },
      { id: "e3", from: "condition", to: "stop", label: "false" },
      { id: "e4", from: "wait", to: "handoff" },
    ],
  },
  sample: { lead: { stage: "QUALIFIED" } },
});

assert.deepEqual(
  result.steps.map((step) => step.result),
  ["TRIGGER_MATCHED", "CONDITION_TRUE", "WOULD_WAIT", "REQUIRES_APPROVAL"],
);
assert.equal(result.outboundSent, false);
console.log("Phase8 automation runtime certification: PASS");


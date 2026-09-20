import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluatePublishedGraphShadow } from "@/modules/automations/application/whatsapp-automation-shadow-evaluator";

const graph = {
  nodes: [
    { id: "t", type: "TRIGGER" as const, config: {} },
    { id: "c", type: "CONDITION" as const, config: { field: "lead.stage", operator: "equals", value: "NEW" } },
    { id: "a", type: "ACTION" as const, config: { legacyType: "SEND_TEXT", text: "hidden" } },
    { id: "d", type: "DELAY" as const, config: { minutes: 5 } },
    { id: "s", type: "STOP" as const, config: {} },
  ],
  edges: [
    { id: "e1", from: "t", to: "c" },
    { id: "e2", from: "c", to: "a", label: "true" },
    { id: "e3", from: "c", to: "s", label: "false" },
    { id: "e4", from: "a", to: "d" },
  ],
};

const matched = evaluatePublishedGraphShadow(graph, { lead: { stage: "NEW" } });
assert.deepEqual(matched.plannedActionTypes, ["SEND_TEXT"]);
assert.equal(matched.terminalOutcome, "WAITING");

const skipped = evaluatePublishedGraphShadow(graph, { lead: { stage: "WON" } });
assert.deepEqual(skipped.plannedActionTypes, []);
assert.equal(skipped.terminalOutcome, "COMPLETED");

const source = readFileSync("modules/automations/application/whatsapp-automation-shadow-evaluator.ts", "utf8");
for (const forbidden of [
  "queueOutboundMessage",
  "executePublishedAutomation",
  "dispatchQueuedOutboundBatch",
  "dispatchDueCampaigns",
  "processDueJourneys",
  ".create(",
  ".update(",
  ".updateMany(",
  ".upsert(",
  ".delete(",
  ".deleteMany(",
  "$transaction(",
]) {
  assert.equal(source.includes(forbidden), false, `shadow evaluator must not contain mutating primitive: ${forbidden}`);
}
assert.match(source, /databaseMutationsAttempted: false/);
assert.match(source, /externalWritesAttempted: false/);
assert.match(source, /outboundMessagesQueued: false/);
assert.match(source, /id: event\.id/);
assert.match(source, /sourceEventId: event\.sourceEventId/);
assert.match(source, /trigger: event\.trigger/);
assert.match(source, /workspaceId: event\.workspaceId/);
assert.equal(source.includes("workspacePresent"), false);
assert.equal(source.includes("conversationPresent"), false);

console.log("Phase21C WhatsApp shadow runtime certification: PASS");

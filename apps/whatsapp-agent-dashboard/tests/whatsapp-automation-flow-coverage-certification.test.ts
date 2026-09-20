import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/whatsapp-automation-flow-coverage-audit.ts", "utf8");
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
  assert.equal(source.includes(forbidden), false, `coverage audit must not contain mutating primitive: ${forbidden}`);
}
assert.match(source, /READ_ONLY_FLOW_COVERAGE/);
assert.match(source, /activeExecutableFlows/);
assert.match(source, /uncoveredDueTriggers/);
assert.match(source, /databaseMutationsAttempted: false/);
assert.match(source, /externalWritesAttempted: false/);
assert.match(source, /outboundMessagesQueued: false/);
console.log("Phase21D WhatsApp automation flow coverage certification: PASS");

import assert from "node:assert/strict";

import {
  computeAutopilotCapUsage,
  governanceStateIsInternallyConsistent,
  parseGovernanceScope,
} from "../modules/release/application/controlled-launch-governance-observability";

const scope = parseGovernanceScope({
  workspaceId: "ws-1",
  connectedAccountIds: ["conn-1"],
  enabledChannels: ["whatsapp"],
  maxRealLeads: 3,
  externalWritesRequested: true,
});

assert.deepEqual(scope, {
  workspaceId: "ws-1",
  connectedAccountIds: ["conn-1"],
  enabledChannels: ["WHATSAPP"],
  maxRealLeads: 3,
  externalWritesRequested: true,
});

assert.equal(parseGovernanceScope({ workspaceId: "ws-1" }), null);
assert.equal(governanceStateIsInternallyConsistent({
  workspaceId: "ws-1",
  mode: "LIMITED_AUTOPILOT",
  writePolicy: "BOUNDED_AUTOPILOT",
  externalWritesAllowed: true,
  scope,
}), true);
assert.equal(governanceStateIsInternallyConsistent({
  workspaceId: "ws-1",
  mode: "SHADOW",
  writePolicy: "NO_EXTERNAL_WRITES",
  externalWritesAllowed: false,
  scope: scope ? { ...scope, externalWritesRequested: false } : null,
}), true);
assert.equal(governanceStateIsInternallyConsistent({
  workspaceId: "ws-2",
  mode: "LIMITED_AUTOPILOT",
  writePolicy: "BOUNDED_AUTOPILOT",
  externalWritesAllowed: true,
  scope,
}), false);

assert.deepEqual(computeAutopilotCapUsage(3, 2), {
  limit: 3,
  used: 2,
  remaining: 1,
  exhausted: false,
  withinCap: true,
});
assert.deepEqual(computeAutopilotCapUsage(3, 4), {
  limit: 3,
  used: 4,
  remaining: 0,
  exhausted: true,
  withinCap: false,
});

console.log("EngageOS Phase17-G6 governance observability: PASS");

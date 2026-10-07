import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messengerPolicyEnforcementEnabled } from "../lib/messenger/outbound-policy-gate";

const instagram = readFileSync("lib/instagram/outbound-service.ts", "utf8");
const igGate = readFileSync("lib/instagram/outbound-policy-gate.ts", "utf8");
const messenger = readFileSync("lib/messenger/outbound-service.ts", "utf8");
const igWebhook = readFileSync("lib/instagram/webhook-processor.ts", "utf8");
const msWebhook = readFileSync("lib/messenger/webhook-processor.ts", "utf8");

assert.match(instagram, /assertInstagramControlledOutboundAllowed/);
assert.match(igGate, /META_INSTAGRAM/);
assert.match(igGate, /status === "CONNECTED"/);
assert.match(igGate, /conversation account does not match/);
assert.match(instagram, /outbound:instagram:/);
assert.match(messenger, /assertMessengerControlledOutboundAllowed/);
assert.equal(messengerPolicyEnforcementEnabled({ MESSENGER_OUTBOUND_MODE: "live", MESSENGER_OUTBOUND_KILL_SWITCH: "off" }), true);
assert.match(igWebhook, /instagram:\$\{sha256Hex\(rawBody\)\}/);
assert.match(msWebhook, /messenger:\$\{sha256Hex\(rawBody\)\}/);
assert.match(igWebhook, /P2002/);
assert.match(msWebhook, /P2002/);
console.log("Phase16 social controlled production certification: PASS");

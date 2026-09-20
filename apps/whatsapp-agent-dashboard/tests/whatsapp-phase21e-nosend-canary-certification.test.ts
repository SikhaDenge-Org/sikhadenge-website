import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/whatsapp-phase21e-nosend-canary-provision.ts", "utf8");

assert.match(source, /__sikhadenge_canary_21e_20260920__/);
assert.match(source, /type: "INCOMING_KEYWORD"/);
assert.match(source, /type: "END"/);
assert.match(source, /externalWriteCapableActionCount: 0/);
assert.match(source, /outboundMessagesQueued: false/);
assert.match(source, /externalWhatsAppWriteSent: false/);

for (const forbidden of [
  "SEND_TEXT",
  "SEND_TEMPLATE",
  "SEND_MEDIA",
  "ASK_QUESTION",
  "queueOutboundMessage",
  "dispatchQueuedOutboundBatch",
  "WHATSAPP_OUTBOUND_MODE=live",
  "WHATSAPP_OUTBOUND_KILL_SWITCH=off",
]) {
  assert.equal(source.includes(forbidden), false, `no-send canary must not contain: ${forbidden}`);
}

console.log("Phase21E WhatsApp no-send canary certification: PASS");

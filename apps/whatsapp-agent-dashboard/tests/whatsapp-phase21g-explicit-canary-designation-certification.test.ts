import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/whatsapp-phase21g-designate-internal-canary.ts", "utf8");

assert.match(source, /DESIGNATE_INTERNAL_CANARY/);
assert.match(source, /PHASE21G_CANARY_WA_ID/);
assert.match(source, /PHASE21G_VERIFIED_CANARY_WA_ID/);
assert.match(source, /waId !== verifiedWaId/);
assert.match(source, /role: \{ in: \["ADMIN", "MANAGER", "COUNSELOR"\] \}/);
assert.match(source, /user: \{ isActive: true \}/);
assert.equal(source.includes("operator email binding"), false);
assert.match(source, /CANARY_INTERNAL_TEST/);
assert.match(source, /whatsAppConversation\.create/);
assert.match(source, /source: "whatsapp"/);
assert.match(source, /conversationCreated/);
assert.match(source, /serviceWindowProvisioned: false/);
assert.match(source, /Provisioned canary conversation must not contain any messages/);
assert.match(source, /workspaceId !== WORKSPACE_ID/);
assert.match(source, /connection\.channel !== "WHATSAPP"/);
assert.match(source, /externalWhatsAppWriteSent: false/);
assert.match(source, /outboundMessagesQueued: false/);
assert.match(source, /runtimeFlagsMutated: false/);

for (const forbidden of [
  "queueOutboundMessage",
  "whatsAppMessage.create",
  "dispatchQueuedOutboundBatch",
  "SEND_TEXT",
  "SEND_TEMPLATE",
  "WHATSAPP_OUTBOUND_MODE=live",
  "WHATSAPP_OUTBOUND_KILL_SWITCH=off",
]) {
  assert.equal(source.includes(forbidden), false, `designation must not contain outbound primitive: ${forbidden}`);
}

console.log("Phase21G explicit WhatsApp canary designation certification: PASS");

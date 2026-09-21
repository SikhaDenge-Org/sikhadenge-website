import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../scripts/whatsapp-phase22d-canary-message-provision.ts", import.meta.url)),
  "utf8",
);

assert.match(source, /PHASE22D_VERIFIED_CANARY_WA_ID/);
assert.match(source, /CANARY_INTERNAL_TEST/);
assert.match(source, /canary\.designated !== true/);
assert.match(source, /TemplateStatus\.APPROVED/);
assert.match(source, /hasTemplateVariables/);
assert.match(source, /queueOutboundMessage/);
assert.match(source, /phase22d-internal-canary:/);
assert.match(source, /externalWhatsAppWriteSent: false/);
assert.match(source, /PROVISION_ONE_INTERNAL_CANARY_MESSAGE/);

for (const forbidden of [
  "dispatchOutboundMessage",
  "dispatchWhatsAppOutboundViaCore",
  "sendMetaWhatsAppMessage",
  "WHATSAPP_OUTBOUND_MODE=live",
  "WHATSAPP_OUTBOUND_KILL_SWITCH=off",
]) {
  assert.equal(source.includes(forbidden), false, `Provisioner must not contain provider-send path: ${forbidden}`);
}

console.log("Phase22D canary message provision certification: PASS");

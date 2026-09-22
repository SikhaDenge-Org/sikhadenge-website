import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../scripts/whatsapp-phase22d-refresh-canary-message.ts", import.meta.url)),
  "utf8",
);

for (const required of [
  "PHASE22D_VERIFIED_CANARY_WA_ID",
  "PHASE22D_STALE_MESSAGE_ID",
  "REFRESH_ONE_STALE_INTERNAL_CANARY_MESSAGE",
  "CANARY_INTERNAL_TEST",
  "ONE_CONNECTED_ACCOUNT",
  "SHADOW",
  "NO_EXTERNAL_WRITES",
  "CANARY_SUPERSEDED",
  "hello_world",
  "TemplateStatus.APPROVED",
  "phase22d-internal-canary:",
  "queueOutboundMessage",
  "externalWhatsAppWriteSent: false",
  "prisma.engageControlledLaunchOutboundApproval.count",
  "prisma.whatsAppMessageStatusEvent.create",
  "prisma.auditLog.create",
  "failureCode: SUPERSEDE_CODE",
]) {
  assert.equal(source.includes(required), true, `Missing refresh safety contract: ${required}`);
}

for (const forbidden of [
  "dispatchOutboundMessage",
  "dispatchQueuedOutboundBatch",
  "dispatchWhatsAppOutboundViaCore",
  "sendMetaWhatsAppMessage",
  "WHATSAPP_OUTBOUND_MODE=live",
  "WHATSAPP_OUTBOUND_KILL_SWITCH=off",
]) {
  assert.equal(source.includes(forbidden), false, `Refresh operator must not contain provider-send path: ${forbidden}`);
}

console.log("Phase22D stale-canary refresh certification: PASS");

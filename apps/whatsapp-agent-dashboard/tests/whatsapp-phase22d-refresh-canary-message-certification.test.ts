import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  "prisma.$queryRaw",
  "EngageControlledLaunchOutboundApproval",
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

const singleCanaryWorkflowSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../.github/workflows/whatsapp-agent-phase17-single-message-canary.yml",
      import.meta.url,
    ),
  ),
  "utf8",
);

for (const required of [
  "REVIEWED_EMAIL_DRIFT_SHA256",
  "allowed_dirty_line",
  "email-inbound-production-readiness.ts",
  "sha256sum scripts/email-inbound-production-readiness.ts",
  "REVIEWED_EMAIL_DRIFT_PRESENT=true",
  "FINAL_REVIEWED_EMAIL_DRIFT_PRESENT=true",
  'test "$tracked_dirty" = "$allowed_dirty_line"',
  'test "$live_email_drift_sha" = "$REVIEWED_EMAIL_DRIFT_SHA256"',
  "PHASE17_CANARY_MODE=RESTORE",
  "NO_EXTERNAL_WRITES",
  "ACTIVE_MESSAGE_APPROVALS",
  "BASE_PROVIDER_RESTORED_FAIL_CLOSED=true",
  "PASS: PHASE17_SINGLE_MESSAGE_CANARY_FINAL_SAFETY",
]) {
  assert.equal(
    singleCanaryWorkflowSource.includes(required),
    true,
    `Missing single-canary safety contract: ${required}`,
  );
}

for (const forbidden of [
  "git reset --hard",
  "git restore apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts",
  "git checkout -- apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts",
]) {
  assert.equal(
    singleCanaryWorkflowSource.includes(forbidden),
    false,
    `Single-canary operator must not mutate unrelated email source: ${forbidden}`,
  );
}

const retiredWorkflowPaths = [
  "../../../.github/workflows/whatsapp-agent-phase22d-live-dispatch-once.yml",
  "../../../.github/workflows/whatsapp-agent-phase22d-refresh-stale-canary-dryrun.yml",
];

for (const retiredPath of retiredWorkflowPaths) {
  const absolutePath = fileURLToPath(new URL(retiredPath, import.meta.url));
  assert.equal(
    existsSync(absolutePath),
    false,
    `One-time Phase22D auto-trigger workflow must remain retired: ${retiredPath}`,
  );
}

console.log("Phase22D canary retirement certification: PASS");

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const refreshScriptPath = fileURLToPath(
  new URL("../scripts/whatsapp-phase22d-refresh-canary-message.ts", import.meta.url),
);
const singleCanaryWorkflowPath = fileURLToPath(
  new URL(
    "../../../.github/workflows/whatsapp-agent-phase17-single-message-canary.yml",
    import.meta.url,
  ),
);
const retiredRefreshWorkflowPath = fileURLToPath(
  new URL(
    "../../../.github/workflows/whatsapp-agent-phase22d-refresh-stale-canary-dryrun.yml",
    import.meta.url,
  ),
);
const retiredLiveDispatcherPath = fileURLToPath(
  new URL(
    "../../../.github/workflows/whatsapp-agent-phase22d-live-dispatch-once.yml",
    import.meta.url,
  ),
);

assert.equal(
  existsSync(retiredRefreshWorkflowPath),
  false,
  "Completed Phase22D push-triggered refresh workflow must stay retired.",
);
assert.equal(
  existsSync(retiredLiveDispatcherPath),
  false,
  "Completed Phase22D push-triggered live dispatcher must stay retired.",
);
assert.equal(
  existsSync(singleCanaryWorkflowPath),
  true,
  "Guarded manual Phase17 single-message canary operator must remain available.",
);

const refreshSource = readFileSync(refreshScriptPath, "utf8");
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
  "EngageControlledLaunchOutboundApproval",
]) {
  assert.equal(
    refreshSource.includes(required),
    true,
    `Missing retained refresh-script safety contract: ${required}`,
  );
}

for (const forbidden of [
  "dispatchOutboundMessage",
  "dispatchQueuedOutboundBatch",
  "dispatchWhatsAppOutboundViaCore",
  "sendMetaWhatsAppMessage",
  "WHATSAPP_OUTBOUND_MODE=live",
  "WHATSAPP_OUTBOUND_KILL_SWITCH=off",
]) {
  assert.equal(
    refreshSource.includes(forbidden),
    false,
    `Retained refresh script must not contain a provider-send path: ${forbidden}`,
  );
}

const singleCanarySource = readFileSync(singleCanaryWorkflowPath, "utf8");
for (const required of [
  "workflow_dispatch:",
  "approved_by_user_id:",
  "approval_reason:",
  "execute:",
  "REVIEWED_EMAIL_DRIFT_SHA256",
  "WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED",
  "PHASE17_CANARY_MODE=EXECUTE",
  "PHASE17_CANARY_MODE=RESTORE",
  "FINAL_REVIEWED_EMAIL_DRIFT_PRESENT=true",
  "ACTIVE_MESSAGE_APPROVALS",
  "NO_EXTERNAL_WRITES",
  "BASE_PROVIDER_RESTORED_FAIL_CLOSED=true",
  "PASS: PHASE17_SINGLE_MESSAGE_CANARY_FINAL_SAFETY",
]) {
  assert.equal(
    singleCanarySource.includes(required),
    true,
    `Missing retained manual canary safety contract: ${required}`,
  );
}

for (const forbidden of [
  "push:",
  "schedule:",
  "dispatchQueuedOutboundBatch",
  "WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED=true",
  "git reset --hard",
]) {
  assert.equal(
    singleCanarySource.includes(forbidden),
    false,
    `Manual canary operator must remain non-automatic/fail-closed: ${forbidden}`,
  );
}

console.log("Phase22D post-qualification retirement certification: PASS");

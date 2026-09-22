import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../scripts/whatsapp-phase22d-refresh-canary-message.ts", import.meta.url)),
  "utf8",
);
const workflowSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../.github/workflows/whatsapp-agent-phase22d-refresh-stale-canary-dryrun.yml",
      import.meta.url,
    ),
  ),
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

console.log("Phase22D stale-canary refresh certification: PASS");


for (const required of [
  "Verify fail-closed runtime before fresh queue",
  "WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED",
  "SCHEDULER_OUTBOUND_ISOLATION_VERIFIED=true",
  "Run exact fresh canary DRY_RUN",
  "PHASE17_CANARY_MODE=DRY_RUN",
  "EXTERNAL_WHATSAPP_WRITE_SENT=false",
  "Final fail-closed production verification",
  "FRESH_CANARY_MESSAGE_STATE",
]) {
  assert.equal(
    workflowSource.includes(required),
    true,
    `Missing refresh workflow safety contract: ${required}`,
  );
}

for (const forbidden of [
  "gh workflow run",
  "-f execute=true",
  "WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED=true",
]) {
  assert.equal(
    workflowSource.includes(forbidden),
    false,
    `Refresh workflow must not contain unsafe dispatch contract: ${forbidden}`,
  );
}


for (const required of [
  "REVIEWED_EMAIL_DRIFT_SHA256",
  "email-inbound-production-readiness.ts",
  "PRE_REFRESH_REVIEWED_EMAIL_DRIFT=true",
  "test \"$tracked_dirty_count\" = \"1\"",
  "test \"$tracked_dirty\" = \"$allowed_dirty_line\"",
  "test \"$live_email_drift_sha\" = \"$REVIEWED_EMAIL_DRIFT_SHA256\"",
]) {
  assert.equal(
    workflowSource.includes(required),
    true,
    `Missing exact reviewed checkout-drift isolation contract: ${required}`,
  );
}

for (const forbidden of [
  "git checkout -- apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts",
  "git restore apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts",
  "git reset --hard",
]) {
  assert.equal(
    workflowSource.includes(forbidden),
    false,
    `WhatsApp workflow must not mutate unrelated email source: ${forbidden}`,
  );
}


assert.equal(
  workflowSource.includes('test "$REVIEWED_EMAIL_DRIFT_SHA256" =~'),
  false,
  "Broken test-regex syntax must stay absent",
);
assert.equal(
  workflowSource.includes('[[ "$REVIEWED_EMAIL_DRIFT_SHA256" =~ ^[0-9a-f]{64}$ ]]'),
  true,
  "Reviewed drift SHA must use Bash regex syntax",
);


assert.equal(
  workflowSource.includes("sha256sum scripts/email-inbound-production-readiness.ts"),
  true,
  "Reviewed live drift hash must use app-relative path",
);
assert.equal(
  workflowSource.includes("sha256sum apps/whatsapp-agent-dashboard/scripts/email-inbound-production-readiness.ts"),
  false,
  "Reviewed live drift hash must not duplicate the app path from inside APP",
);


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
]) {
  assert.equal(
    singleCanaryWorkflowSource.includes(required),
    true,
    `Missing single-canary reviewed-drift isolation contract: ${required}`,
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


const liveDispatcherWorkflowSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../.github/workflows/whatsapp-agent-phase22d-live-dispatch-once.yml",
      import.meta.url,
    ),
  ),
  "utf8",
);

assert.equal(
  workflowSource.includes("STALE_MESSAGE_ID: cmuccwo4y0005kw7qu3800ogx"),
  true,
  "Refresh workflow must supersede the previously qualified canary once it becomes stale.",
);

for (const required of [
  "REFRESH_WORKFLOW: whatsapp-agent-phase22d-refresh-stale-canary-dryrun.yml",
  '--commit "$GITHUB_SHA"',
  'gh run watch "$refresh_run_id"',
  'gh run view "$refresh_run_id"',
  "--log",
  "FRESH_MESSAGE_ID=",
  "for attempt in $(seq 1 20)",
  'echo "CANARY_MESSAGE_ID=$fresh_message_id"',
  "-f execute=true",
]) {
  assert.equal(
    liveDispatcherWorkflowSource.includes(required),
    true,
    `Missing refresh-then-live dispatcher contract: ${required}`,
  );
}
assert.equal(
  liveDispatcherWorkflowSource.includes("CANARY_MESSAGE_ID: cmucaz4wy0005kwqb99jodzqx"),
  false,
  "Live dispatcher must consume the same-push fresh canary instead of a stale hard-coded message.",
);
assert.equal(
  liveDispatcherWorkflowSource.includes("issues/65/comments"),
  false,
  "Live dispatcher must not depend on eventually consistent issue-comment propagation for the fresh message ID.",
);

for (const required of [
  "FINAL_REVIEWED_EMAIL_DRIFT_PRESENT=true",
  'test "$tracked_dirty" = "$allowed_dirty_line"',
  'test "$live_email_drift_sha" = "$REVIEWED_EMAIL_DRIFT_SHA256"',
]) {
  assert.equal(
    singleCanaryWorkflowSource.includes(required),
    true,
    `Missing final reviewed-drift safety contract: ${required}`,
  );
}

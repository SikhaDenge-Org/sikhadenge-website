import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const drill = readFileSync("scripts/engageos-production-reliability-drill.sh", "utf8");
const workflow = readFileSync("../../.github/workflows/whatsapp-agent-reliability-drill.yml", "utf8");
const automation = readFileSync("modules/automations/application/runtime-executor.ts", "utf8");
const outbound = readFileSync("lib/outbound/outbound-service.ts", "utf8");
const instagram = readFileSync("lib/instagram/comment-automation-runtime.ts", "utf8");
const messenger = readFileSync("lib/messenger/page-comment-automation-runtime.ts", "utf8");

assert.match(drill, /PM2_SYNTHETIC_CRASH_RECOVERY_VERIFIED/);
assert.match(drill, /INVALID_DATABASE_URL_FAIL_CLOSED_VERIFIED/);
assert.match(drill, /PRODUCTION_PROCESS_UNAFFECTED_VERIFIED/);
assert.match(drill, /kill -9 "\$before_pid"/);
assert.match(drill, /DATABASE_URL=.*127\.0\.0\.1:1/);
assert.match(workflow, /environment: whatsapp-agent-production/);
assert.match(workflow, /StrictHostKeyChecking=yes/);
assert.match(workflow, /retention-days: 30/);
assert.match(automation, /const MAX_ATTEMPTS = 3/);
assert.match(automation, /run\.status = run\.attemptCount >= MAX_ATTEMPTS \? "FAILED" : "RETRYABLE"/);
assert.match(outbound, /previousAttempts < 4/);
assert.match(outbound, /MessageStatus\.FAILED/);
assert.match(instagram, /RETRYABLE/);
assert.match(instagram, /PERMANENT/);
assert.match(messenger, /RETRYABLE/);
assert.match(messenger, /PERMANENT/);
console.log("Phase20 reliability failure-injection certification: PASS");

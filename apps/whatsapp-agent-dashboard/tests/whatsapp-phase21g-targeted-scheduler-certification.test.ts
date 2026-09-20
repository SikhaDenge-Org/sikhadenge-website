import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scheduler = readFileSync("modules/automations/application/whatsapp-automation-scheduler.ts", "utf8");
const enqueue = readFileSync("scripts/whatsapp-phase21g-targeted-canary-enqueue.ts", "utf8");
const verify = readFileSync("scripts/whatsapp-phase21g-targeted-canary-verify.ts", "utf8");
const workflow = readFileSync("../../.github/workflows/whatsapp-agent-phase21g-targeted-scheduler-canary.yml", "utf8");

assert.match(scheduler, /WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX/);
assert.match(scheduler, /sourceEventId: \{ startsWith: sourceEventPrefix \}/);
assert.match(scheduler, /TARGETED_EVENT_COHORT/);
assert.match(enqueue, /phase21g-canary:/);
assert.match(enqueue, /targetFlowId: flow\.flowId/);
assert.match(enqueue, /targetFlowVersion: flow\.version/);
assert.match(enqueue, /terminal\.type !== "END"/);
assert.match(verify, /nonCanaryMutations/);
assert.match(verify, /queued\.length !== 0/);
assert.match(verify, /externalWhatsAppWriteSent: false/);
assert.match(workflow, /restore_fail_closed/);
assert.match(workflow, /trap on_exit EXIT/);
assert.match(workflow, /cleanup_armed=true/);
assert.match(workflow, /cleanup_armed=false/);
assert.match(workflow, /AUTOMATION_RUNTIME_ENABLED=false/);
assert.match(workflow, /WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX=/);

console.log("Phase21G targeted scheduler canary certification: PASS");

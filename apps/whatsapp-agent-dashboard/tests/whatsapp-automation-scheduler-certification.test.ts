import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const outbox = readFileSync("modules/automations/application/whatsapp-automation-event-outbox.ts", "utf8");
const scheduler = readFileSync("modules/automations/application/whatsapp-automation-scheduler.ts", "utf8");
const worker = readFileSync("scripts/whatsapp-automation-scheduler.ts", "utf8");
const ecosystem = readFileSync("ecosystem.automation-scheduler.cjs", "utf8");
const webhook = readFileSync("lib/meta/webhook-processor.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

assert.match(schema, /model EngageWhatsAppAutomationEvent/);
assert.match(outbox, /whatsapp:event:/);
assert.match(outbox, /INCOMING_KEYWORD/);
assert.match(scheduler, /executePublishedAutomation/);
assert.match(scheduler, /automation_runtime_run/);
assert.match(scheduler, /processDueJourneys/);
assert.match(scheduler, /dispatchDueCampaigns/);
assert.match(scheduler, /WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED/);
assert.match(scheduler, /WHATSAPP_OUTBOUND_MODE=live/);
assert.match(scheduler, /MAX_EVENT_ATTEMPTS = 3/);
assert.match(worker, /WHATSAPP_AUTOMATION_SCHEDULER_ENABLED=true is required/);
assert.match(ecosystem, /WHATSAPP_AUTOMATION_SCHEDULER_ENABLED: "true"/);
assert.match(ecosystem, /AUTOMATION_RUNTIME_ENABLED: "false"/);
assert.match(ecosystem, /AUTOMATION_ACTIONS_ENABLED: "false"/);
assert.match(ecosystem, /WHATSAPP_OUTBOUND_MODE: "disabled"/);
assert.match(webhook, /enqueueWhatsAppAutomationEvent/);
assert.match(webhook, /trigger: "INCOMING_KEYWORD"/);
console.log("Phase21 WhatsApp automation scheduler certification: PASS");

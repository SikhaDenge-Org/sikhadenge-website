import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const contacts = source("lib/contacts/contact-service.ts");
const leads = source("lib/leads/lead-service.ts");
const conversations = source("lib/operations/conversation-operations.ts");
const engagement = source("lib/engagement/engagement-service.ts");
const outbox = source("modules/automations/application/whatsapp-automation-event-outbox.ts");
const runtimeScheduler = source("modules/automations/application/whatsapp-automation-scheduler.ts");
const timeMaterializer = source("modules/automations/application/whatsapp-time-trigger-materializer.ts");
const webhookRoute = source("app/api/v1/automation/webhook/route.ts");
const automationService = source("lib/automation/automation-service.ts");
const apiKeyService = source("modules/saas/application/public-api-key-service.ts");
const tenantPlan = source("modules/saas/domain/tenant-plan.ts");
const scheduler = source("ecosystem.automation-scheduler.cjs");

assert.match(contacts, /findActorWhatsAppWorkspaceId/);
assert.match(contacts, /trigger: "NEW_LEAD"/);
assert.match(contacts, /relatedTriggers: \["CONTACT_CREATED"\]/);
assert.match(contacts, /whatsappWorkspaceId = stageChanged \|\| addedTagNames\.length/);
assert.match(contacts, /crm-contact-tags:/);
assert.match(contacts, /conversationId: conversation\.id/);

assert.match(leads, /trigger: "STAGE_CHANGED"/);
assert.match(leads, /trigger: "FOLLOW_UP_DUE"/);
assert.match(leads, /supersedePendingWhatsAppAutomationEvents/);
assert.match(leads, /availableAt: nextFollowUpAt/);
assert.match(leads, /whatsappWorkspaceId = stageChanges\.length \|\| followUpChanges\.length/);
assert.match(leads, /bulk: true/);

assert.match(conversations, /trigger: "FOLLOW_UP_DUE"/);
assert.match(conversations, /trigger: "TAG_ADDED"/);
assert.match(conversations, /supersedePendingWhatsAppAutomationEvents/);

for (const trigger of [
  "FORM_STARTED",
  "FORM_ABANDONED",
  "FORM_SUBMITTED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_REMINDER",
  "CHECKOUT_STARTED",
  "PAYMENT_PENDING",
  "PAYMENT_ABANDONED",
  "PAYMENT_PAID",
]) {
  assert.ok(engagement.includes(`"${trigger}"`), `missing engagement trigger ${trigger}`);
}

assert.match(engagement, /findActorWhatsAppWorkspaceId/);
assert.match(engagement, /supersedePendingWhatsAppAutomationEvents/);
assert.match(engagement, /engagement-appointment-reminder:/);
assert.match(engagement, /sourceEventIdPrefix:\s*`engagement-appointment-reminder:/);
assert.match(engagement, /sourceEventIdPrefix:\s*`engagement-payment-abandon:\$\{payment\.id\}/);
assert.match(outbox, /@@unique|whatsapp:event:/);
for (const trigger of ["INCOMING_KEYWORD","NEW_LEAD","CONTACT_CREATED","FORM_STARTED","FORM_ABANDONED","FORM_SUBMITTED","CHECKOUT_STARTED","PAYMENT_PENDING","PAYMENT_ABANDONED","PAYMENT_PAID","APPOINTMENT_CREATED","APPOINTMENT_REMINDER","TAG_ADDED","STAGE_CHANGED","FOLLOW_UP_DUE","NO_REPLY","SCHEDULE","WEBHOOK"]) {
  assert.ok(outbox.includes(`"${trigger}"`), `outbox trigger catalogue missing ${trigger}`);
}

assert.match(runtimeScheduler, /targetFlowId/);
assert.match(runtimeScheduler, /flow\.flowId !== targetFlowId/);
assert.match(runtimeScheduler, /flow\.version !== targetFlowVersion/);
assert.match(runtimeScheduler, /flowTrigger === "STAGE_CHANGED"/);
assert.match(runtimeScheduler, /input\.flowConfig\.stage/);
assert.match(runtimeScheduler, /input\.payload\.stage/);
assert.match(runtimeScheduler, /flowTrigger === "TAG_ADDED"/);
assert.match(runtimeScheduler, /input\.flowConfig\.tag/);
assert.match(runtimeScheduler, /input\.payload\.tagName/);

assert.match(timeMaterializer, /trigger: "NO_REPLY"/);
assert.match(timeMaterializer, /latest\.direction !== "OUTBOUND"/);
assert.match(timeMaterializer, /trigger: "SCHEDULE"/);
assert.match(timeMaterializer, /SCHEDULE_MAX_AUDIENCE = 100/);
assert.match(timeMaterializer, /listAutomationFlowsForRuntime/);
assert.match(timeMaterializer, /automation-no-reply-cursor/);
assert.match(timeMaterializer, /cursorId/);
assert.match(timeMaterializer, /id: \{ gt: cursorId \}/);
assert.match(timeMaterializer, /targetFlowId/);
assert.match(timeMaterializer, /scheduleBucket/);

assert.match(automationService, /Schedule trigger requires a bounded audience tag/);
assert.match(automationService, /Webhook trigger requires an event label/);

assert.match(tenantPlan, /"automations\.trigger"/);
assert.match(apiKeyService, /"automations\.trigger"/);
assert.match(webhookRoute, /requiredScope: "automations\.trigger"/);
assert.match(webhookRoute, /x-idempotency-key/);
assert.match(webhookRoute, /Target flow is not an active WEBHOOK automation/);
assert.match(webhookRoute, /Webhook event label mismatch/);
assert.match(webhookRoute, /trigger: "WEBHOOK"/);
assert.match(webhookRoute, /targetFlowVersion: flow\.version/);

assert.match(scheduler, /AUTOMATION_RUNTIME_ENABLED: "false"/);
assert.match(scheduler, /AUTOMATION_ACTIONS_ENABLED: "false"/);
assert.match(scheduler, /JOURNEY_RUNTIME_ENABLED: "false"/);
assert.match(scheduler, /JOURNEY_ACTIONS_ENABLED: "false"/);
assert.match(scheduler, /WHATSAPP_CAMPAIGNS_ENABLED: "false"/);
assert.match(scheduler, /WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED: "false"/);
assert.match(scheduler, /WHATSAPP_OUTBOUND_MODE: "disabled"/);
assert.match(scheduler, /WHATSAPP_OUTBOUND_KILL_SWITCH: "on"/);

console.log("Phase21B WhatsApp business trigger outbox certification: PASS");

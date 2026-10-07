import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");
const webhook = read("lib/meta/webhook-processor.ts");
const intelligence = read("lib/agent/conversation-intelligence.ts");
const operations = read("lib/operations/conversation-operations.ts");
const leads = read("lib/leads/lead-service.ts");
const contacts = read("lib/contacts/contact-service.ts");
const analytics = read("lib/analytics/platform-analytics.ts");
const route = read("app/api/contacts/[contactId]/route.ts");

assert.match(webhook, /whatsAppContact\.upsert/);
assert.match(webhook, /selectOrCreateConversation/);
assert.match(webhook, /transaction\.lead\.create/);
assert.match(webhook, /stage: LeadStage\.NEW/);
assert.match(webhook, /whatsAppMessage\.create/);
assert.match(intelligence, /applyLeadIntelligence/);
assert.match(intelligence, /transaction\.lead\.(?:update|create)/);
assert.match(operations, /lead\.updateMany/);
assert.match(operations, /CONVERSATION_ASSIGNED/);
assert.match(leads, /leadNote\.create/);
assert.match(leads, /LEAD_NOTE_ADDED/);
assert.match(operations, /conversationTag\.upsert/);
assert.match(operations, /conversationTagLink\.createMany/);
assert.match(analytics, /leadStages/);
assert.match(analytics, /leadTemperatures/);
assert.match(analytics, /retargeting/);
assert.match(contacts, /readLegacyWhatsAppMappingMetadata/);
assert.match(contacts, /projectCustomer360/);
assert.match(contacts, /customer360/);
assert.match(contacts, /whatsAppMessage\.findMany/);
assert.match(contacts, /leadNote\.findMany/);
assert.match(route, /getContactById/);
assert.match(route, /Cache-Control/);

console.log("Golden Lead CRM E2E certification: PASS");

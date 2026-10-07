import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("lib/campaigns/campaign-service.ts", "utf8");
const dispatchRoute = readFileSync("app/api/campaigns/[campaignId]/dispatch/route.ts", "utf8");
const dueRoute = readFileSync("app/api/campaigns/dispatch-due/route.ts", "utf8");

assert.match(service, /TemplateStatus\.APPROVED/);
assert.match(service, /consentStatus:\s*ConsentStatus\.OPTED_IN/);
assert.match(service, /queueOutboundMessage/);
assert.doesNotMatch(service, /dispatchOutboundMessage\(/);
assert.match(service, /readLegacyWhatsAppMappingMetadata/);
assert.match(service, /engageCustomerSuppression\.findFirst/);
assert.match(service, /channel:\s*"WHATSAPP"/);
assert.match(service, /take:\s*Math\.min\(payload\.batchSize, payload\.sendRatePerMinute\)/);
assert.match(service, /frequencyCapDays/);
assert.match(service, /CAMPAIGN_BATCH_QUEUED/);
assert.match(service, /delivery:\s*\{/);
assert.match(service, /delivered:\s*count\(MessageStatus\.DELIVERED\)/);
assert.match(service, /read:\s*count\(MessageStatus\.READ\)/);
assert.match(service, /failed:\s*count\(MessageStatus\.FAILED\)/);
assert.match(service, /WHATSAPP_CAMPAIGNS_ENABLED/);
assert.match(service, /getOutboundMode\(\) !== "live"/);

const loopStart = service.indexOf("for (const recipient of recipients)");
const queueStart = service.indexOf("const result = await queueOutboundMessage", loopStart);
const processedAfterQueue = service.indexOf("processedContactIds.push(recipient.id);", queueStart);
const catchStart = service.indexOf("} catch {", queueStart);
assert.ok(loopStart >= 0 && queueStart > loopStart);
assert.ok(processedAfterQueue > queueStart && processedAfterQueue < catchStart);
assert.equal(service.slice(loopStart, queueStart).includes("processedContactIds.push(recipient.id);\n      const conversation"), false);
assert.match(dispatchRoute, /DashboardRole\.ADMIN/);
assert.match(dispatchRoute, /DashboardRole\.MANAGER/);
assert.match(dueRoute, /dispatchDueCampaigns/);
console.log("Phase10 campaign production certification: PASS");

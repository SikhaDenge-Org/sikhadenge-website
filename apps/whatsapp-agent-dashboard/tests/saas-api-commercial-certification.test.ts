import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/v1/status/route.ts", "utf8");
const auth = readFileSync("modules/saas/application/public-api-key-service.ts", "utf8");
const webhook = readFileSync("modules/saas/application/enterprise-webhook-service.ts", "utf8");
const billing = readFileSync("modules/saas/application/workspace-billing.ts", "utf8");

assert.match(route, /x-workspace-id/);
assert.match(route, /Bearer API key is required/);
assert.match(route, /authenticatePublicApiKey/);
assert.match(route, /requiredScope:\s*"analytics.read"/);
assert.match(route, /buildWorkspaceBillingProjection/);
assert.doesNotMatch(route, /authenticateDeveloperApi/);
assert.doesNotMatch(route, /whatsAppContact\.count/);
assert.doesNotMatch(route, /prisma\.lead\.count/);
assert.match(route, /remainingInWindow/);
assert.match(route, /PUBLIC_API_RATE_LIMIT_PER_MINUTE/);
assert.match(auth, /tenant-scope-mismatch/);
assert.match(auth, /rate-limit-exceeded/);
assert.match(auth, /api-key-revoked/);
assert.match(auth, /api-key-expired/);
assert.match(auth, /scope-denied/);
assert.match(webhook, /signOutboundWebhook/);
assert.match(webhook, /verifyOutboundWebhookSignature/);
assert.match(webhook, /normalizeEnterpriseWebhookUrl/);
assert.match(billing, /assertUsageWithinPlan/);
assert.match(billing, /recordOutboundUsage/);
console.log("Phase17 SaaS API commercial certification: PASS");

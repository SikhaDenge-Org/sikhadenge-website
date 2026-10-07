import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  analyticsServiceTokensFromEnv,
  isAnalyticsServiceAuthorized,
} from "../lib/analytics/service-bearer-auth";
import {
  inboxConversationTimeFilter,
  normalizeInboxConversationScope,
  parseInboxConversationLimit,
  renderWhatsAppTemplateText,
} from "../lib/inbox/conversation-read-policy";

assert.equal(normalizeInboxConversationScope(" recent "), "RECENT");
assert.equal(normalizeInboxConversationScope("history"), "HISTORY");
assert.equal(normalizeInboxConversationScope("unexpected"), "ALL");
assert.equal(normalizeInboxConversationScope(null), "ALL");

assert.equal(parseInboxConversationLimit("all"), null);
assert.equal(parseInboxConversationLimit(" ALL "), null);
assert.equal(parseInboxConversationLimit("125"), 125);
assert.equal(parseInboxConversationLimit("invalid"), 50);
assert.equal(parseInboxConversationLimit(null), 50);

const now = Date.UTC(2026, 8, 10, 0, 0, 0);
const cutoff = new Date(now - 24 * 60 * 60 * 1000);
assert.deepEqual(inboxConversationTimeFilter("RECENT", now), { gte: cutoff });
assert.deepEqual(inboxConversationTimeFilter("HISTORY", now), { lt: cutoff });
assert.equal(inboxConversationTimeFilter("ALL", now), undefined);

assert.equal(
  renderWhatsAppTemplateText(
    "Hi {{1}}, your {{2}} class starts at {{3}}.",
    ["Ankit", "AI", "8 PM"],
  ),
  "Hi Ankit, your AI class starts at 8 PM.",
);
assert.equal(
  renderWhatsAppTemplateText("Hi {{1}} {{2}}", ["Ankit"]),
  "Hi Ankit {{2}}",
);
assert.equal(renderWhatsAppTemplateText("", ["ignored"]), "");

const tokens = analyticsServiceTokensFromEnv({
  WHATSAPP_ANALYTICS_TOKEN: " primary-token ",
  WHATSAPP_AGENT_ANALYTICS_TOKEN: "secondary-token",
});
assert.deepEqual(tokens, ["primary-token", "secondary-token"]);
assert.equal(isAnalyticsServiceAuthorized("Bearer primary-token", tokens), true);
assert.equal(isAnalyticsServiceAuthorized("bearer secondary-token", tokens), true);
assert.equal(isAnalyticsServiceAuthorized("Bearer wrong-token", tokens), false);
assert.equal(isAnalyticsServiceAuthorized("Bearer ", tokens), false);
assert.equal(isAnalyticsServiceAuthorized(null, tokens), false);
assert.deepEqual(
  analyticsServiceTokensFromEnv({
    WHATSAPP_ANALYTICS_TOKEN: "same-token",
    WHATSAPP_AGENT_ANALYTICS_TOKEN: "same-token",
  }),
  ["same-token"],
);

const root = process.cwd();
const layoutSource = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
const fontLockSource = readFileSync(resolve(root, "app/font-hard-lock-v15.css"), "utf8");
const inboxSource = readFileSync(
  resolve(root, "components/inbox/InboxDashboardV2.tsx"),
  "utf8",
);
const repositorySource = readFileSync(
  resolve(root, "lib/inbox/conversation-repository.ts"),
  "utf8",
);

assert.doesNotMatch(layoutSource, /next\/font\/google/u);
assert.match(layoutSource, /const MANROPE_STYLESHEET = "https:\/\/fonts\.googleapis\.com\/css2\?family=Manrope:wght@400;500;600;700;800&display=swap";/u);
assert.match(layoutSource, /<link rel="stylesheet" href=\{MANROPE_STYLESHEET\} \/>/u);
assert.match(fontLockSource, /--font-manrope: "Manrope";/u);
assert.match(fontLockSource, /--engageos-font: var\(--font-manrope\), "Manrope", sans-serif;/u);
assert.match(layoutSource, /data-ui-foundation="manrope-v15-hard-lock"/u);
assert.match(layoutSource, /import "\.\/font-hard-lock-v15\.css";/u);
assert.match(layoutSource, /ServiceWorkerRegistration/u);
assert.doesNotMatch(layoutSource, /import \{ Inter \} from "next\/font\/google";/u);
assert.match(layoutSource, /import "\.\/enterprise-ui-v2\.css";/u);
assert.match(layoutSource, /import "\.\/enterprise-ui-v2-hardening\.css";/u);
assert.match(layoutSource, /import "\.\/enterprise-product-polish\.css";/u);
assert.match(inboxSource, /Last 24 Hours/u);
assert.match(inboxSource, /"RECENT" \| "HISTORY"/u);
assert.match(inboxSource, /startsWith\("image\/"\)/u);
assert.match(inboxSource, /startsWith\("video\/"\)/u);
assert.match(inboxSource, /startsWith\("audio\/"\)/u);
assert.match(repositorySource, /inboxConversationTimeFilter/u);
assert.match(repositorySource, /renderWhatsAppTemplateText/u);
assert.doesNotMatch(repositorySource, /function renderTemplateText\(/u);

console.log("Production-local reconciliation policy tests passed.");

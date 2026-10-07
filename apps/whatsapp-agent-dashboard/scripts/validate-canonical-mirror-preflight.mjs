const enabled = (value) => ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
const disabledMode = (value) => ["", "disabled", "off", "false", "0"].includes(String(value || "").trim().toLowerCase());

const expectation = String(process.env.WHATSAPP_CANONICAL_MIRROR_EXPECT || "disabled").trim().toLowerCase();
if (!["disabled", "enabled"].includes(expectation)) {
  console.error("PRECHECK_FAIL: WHATSAPP_CANONICAL_MIRROR_EXPECT must be disabled or enabled");
  process.exit(1);
}

const mirrorEnabled = enabled(process.env.WHATSAPP_CANONICAL_MIRROR_ENABLED);
const mirrorUrlValue = process.env.WHATSAPP_CANONICAL_MIRROR_URL?.trim() || "";
let mirrorUrl = null;
try {
  mirrorUrl = mirrorUrlValue ? new URL(mirrorUrlValue) : null;
} catch {
  mirrorUrl = null;
}

const failures = [];
if (!mirrorUrl || mirrorUrl.protocol !== "https:") {
  failures.push("WHATSAPP_CANONICAL_MIRROR_URL must be a valid HTTPS URL");
} else if (mirrorUrl.pathname !== "/api/integrations/whatsapp/webhook") {
  failures.push("WHATSAPP_CANONICAL_MIRROR_URL must target /api/integrations/whatsapp/webhook");
}

if (expectation === "disabled" && mirrorEnabled) {
  failures.push("mirror must remain disabled for the initial deployment gate");
}
if (expectation === "enabled" && !mirrorEnabled) {
  failures.push("mirror must be enabled for the controlled canary gate");
}

if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
  failures.push("WHATSAPP_APP_SECRET must remain configured for primary Meta HMAC verification");
}
if (!disabledMode(process.env.WHATSAPP_OUTBOUND_MODE)) {
  failures.push("WHATSAPP_OUTBOUND_MODE must remain disabled");
}
if (enabled(process.env.WHATSAPP_CUTOVER_APPROVED)) {
  failures.push("WHATSAPP_CUTOVER_APPROVED must remain false");
}
if (enabled(process.env.AGENT_AUTO_REPLY_ENABLED)) {
  failures.push("AGENT_AUTO_REPLY_ENABLED must remain false");
}
if (enabled(process.env.AGENT_IMMEDIATE_DISPATCH_ENABLED)) {
  failures.push("AGENT_IMMEDIATE_DISPATCH_ENABLED must remain false");
}
if (enabled(process.env.WHATSAPP_CAMPAIGNS_ENABLED)) {
  failures.push("WHATSAPP_CAMPAIGNS_ENABLED must remain false");
}
if (enabled(process.env.AUTOMATION_ACTIONS_ENABLED)) {
  failures.push("AUTOMATION_ACTIONS_ENABLED must remain false");
}
if (enabled(process.env.INTEGRATION_EXTERNAL_WRITES_ENABLED)) {
  failures.push("INTEGRATION_EXTERNAL_WRITES_ENABLED must remain false");
}

console.log(JSON.stringify({
  mode: "SA1_CANONICAL_MIRROR_PREFLIGHT",
  expectation,
  safe: failures.length === 0,
  mirror: {
    enabled: mirrorEnabled,
    configured: Boolean(mirrorUrl),
    targetHost: mirrorUrl?.host || null,
    targetPath: mirrorUrl?.pathname || null,
  },
  primaryWebhook: {
    appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
  },
  consequentialActionsDisabled: failures.filter((item) => item.includes("must remain")).length === 0,
}, null, 2));

if (failures.length) {
  for (const failure of failures) console.error(`PRECHECK_FAIL: ${failure}`);
  process.exit(1);
}

console.log(`SA1 canonical mirror ${expectation} preflight PASS`);

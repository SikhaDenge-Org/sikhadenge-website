import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = process.cwd();
const WORKER = resolve(ROOT, "scripts/masterclass-flow-worker.ts");
const PM2_CONFIG = resolve(ROOT, "ecosystem.masterclass-worker.cjs");

const workerSource = readFileSync(WORKER, "utf8");

assert.match(
  workerSource,
  /timer\s*=\s*setInterval\(\(\)\s*=>\s*void runCycle\(\),\s*INTERVAL_MS\);/u,
  "The standalone worker must own a recurring interval.",
);
assert.doesNotMatch(
  workerSource,
  /\.unref\s*\(/u,
  "The recurring interval must stay referenced so PM2 does not see a clean early exit.",
);

const gateIndex = workerSource.indexOf("if (!automationActionsEnabled())");
const reminderImportIndex = workerSource.indexOf(
  'import("../lib/automation/masterclass-registration-flow")',
);
const outboundImportIndex = workerSource.indexOf(
  'import("../lib/outbound/outbound-service")',
);

assert.ok(gateIndex >= 0, "AUTOMATION_ACTIONS_ENABLED gate must exist.");
assert.ok(
  reminderImportIndex > gateIndex && outboundImportIndex > gateIndex,
  "Dispatch modules must only be loaded after the automation action gate.",
);
assert.match(
  workerSource,
  /idempotencyPrefix:\s*"masterclass:"/u,
  "The worker must remain scoped to masterclass outbound records only.",
);

const require = createRequire(import.meta.url);
const ecosystem = require(PM2_CONFIG) as {
  apps?: Array<Record<string, unknown>>;
};

assert.ok(Array.isArray(ecosystem.apps), "PM2 config must export an apps array.");
const app = ecosystem.apps?.find(
  (candidate) => candidate.name === "sikhadenge-masterclass-flow-worker",
);
assert.ok(app, "PM2 config must define the masterclass worker target.");

assert.equal(app?.cwd, ROOT);
assert.equal(
  app?.script,
  resolve(ROOT, "node_modules/tsx/dist/cli.mjs"),
  "PM2 must execute the real TSX Node CLI, not the shell wrapper in node_modules/.bin.",
);
assert.equal(app?.args, "scripts/masterclass-flow-worker.ts");
assert.equal(app?.interpreter, "/usr/bin/node");
assert.equal(app?.autorestart, true);

const env = (app?.env || {}) as Record<string, unknown>;
const requiredPausedEnvironment = {
  AUTOMATION_ACTIONS_ENABLED: "false",
  AUTOMATION_RUNTIME_ENABLED: "false",
  WHATSAPP_OUTBOUND_MODE: "disabled",
  WHATSAPP_CUTOVER_APPROVED: "false",
  WHATSAPP_OUTBOUND_LIVE_ACK: "REPO_DEFAULT_PAUSED",
  WHATSAPP_OUTBOUND_KILL_SWITCH: "on",
  INTEGRATION_EXTERNAL_WRITES_ENABLED: "false",
  WHATSAPP_CAMPAIGNS_ENABLED: "false",
  AGENT_AUTO_REPLY_ENABLED: "false",
  AGENT_IMMEDIATE_DISPATCH_ENABLED: "false",
};

for (const [key, expected] of Object.entries(requiredPausedEnvironment)) {
  assert.equal(
    env[key],
    expected,
    `Repository PM2 defaults must remain fail-closed for ${key}.`,
  );
}

console.log("Masterclass worker runtime policy tests passed.");

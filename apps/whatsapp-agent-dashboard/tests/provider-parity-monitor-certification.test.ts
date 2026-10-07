import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monitor = readFileSync("scripts/engageos-whatsapp-provider-parity-monitor.ts", "utf8");
const workflow = readFileSync("../../.github/workflows/whatsapp-agent-provider-parity-monitor.yml", "utf8");

assert.match(monitor, /externalAccountId:\s*phoneId/);
assert.match(monitor, /status === "CONNECTED"/);
assert.match(monitor, /status === "DEGRADED"/);
assert.match(monitor, /connectionMismatch/);
assert.match(monitor, /externalUserMismatch/);
assert.match(monitor, /canonicalRefMismatch/);
assert.match(monitor, /buildLegacyWhatsAppIdentityMapping/);
assert.match(monitor, /mutationPerformed:\s*false/);
assert.match(monitor, /externalWhatsAppWriteSent:\s*false/);
assert.match(monitor, /if \(!parityPassed\) process\.exitCode = 2/);
assert.match(workflow, /schedule:/);
assert.match(workflow, /cron: "17 \* \* \* \*"/);
assert.match(workflow, /whatsapp-agent-production/);
assert.match(workflow, /StrictHostKeyChecking=yes/);
assert.match(workflow, /npm run whatsapp:provider-parity-monitor/);
console.log("Phase15 provider parity monitor certification: PASS");

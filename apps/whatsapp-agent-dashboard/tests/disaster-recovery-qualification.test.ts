import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/engageos-production-dr-verify.sh", "utf8");
const runbook = readFileSync("docs/engageos/PRODUCTION_DISASTER_RECOVERY_RUNBOOK.md", "utf8");
const workflow = readFileSync("../../.github/workflows/whatsapp-agent-dr-readiness.yml", "utf8");

assert.match(script, /database\.dump\.sha256/);
assert.match(script, /sha256sum --check/);
assert.match(script, /pg_restore --list/);
assert.match(script, /pg_restore --schema-only/);
assert.match(script, /DR_RTO_TARGET_MINUTES/);
assert.match(script, /DR_RPO_MODE=PRE_DEPLOY_BACKUP_ONLY/);
assert.match(script, /DR_CLOCK_BASED_RPO_GUARANTEE=NONE/);
assert.match(script, /PASS: PRODUCTION_DR_READINESS_VERIFIED/);
assert.match(workflow, /schedule:/);
assert.match(workflow, /environment: whatsapp-agent-production/);
assert.match(workflow, /StrictHostKeyChecking=yes/);
assert.match(workflow, /retention-days: 30/);
assert.match(runbook, /Target application recovery time: \*\*30 minutes\*\*/);
assert.match(runbook, /CLOCK_BASED_RPO_GUARANTEE=NONE/);
assert.match(runbook, /Secret rotation SOP/);
assert.match(runbook, /SEV-0/);
assert.match(runbook, /full data restore into a disposable PostgreSQL instance/);
console.log("Phase19 disaster recovery qualification: PASS");

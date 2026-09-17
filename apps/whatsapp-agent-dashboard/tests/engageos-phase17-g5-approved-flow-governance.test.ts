import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app/api/cutover/approved-flows/route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "prisma/migrations/20260916223000_add_phase17_g5_approved_flow_revocation_audit/migration.sql"), "utf8");

function testClientCannotSupplyAuthorityScope() {
  assert.match(route, /!\["messageId", "reason"\]\.includes\(key\)/);
  assert.doesNotMatch(route, /\["workspaceId", "connectionId", "flowId"/);
  assert.match(route, /resolveCandidate\(messageId\)/);
  assert.match(route, /requireEligibleState\(candidate\.mapping\.workspaceId, candidate\.mapping\.connectionId\)/);
}

function testRevocationIsAuditable() {
  assert.match(migration, /"revokedByUserId" TEXT/);
  assert.match(migration, /"revokeReason" TEXT/);
  assert.match(route, /"revokedByUserId" = \$\{user\.id\}/);
  assert.match(route, /"revokeReason" = \$\{reason\}/);
  assert.match(route, /"revokedAt" IS NULL/);
}

function main() {
  testClientCannotSupplyAuthorityScope();
  testRevocationIsAuditable();
  console.log("EngageOS Phase17-G5 approved-flow operator governance: PASS");
}

main();

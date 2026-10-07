import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const schema = fs.readFileSync(
  path.join(root, "prisma/schema.prisma"),
  "utf8",
);

const migration = fs.readFileSync(
  path.join(
    root,
    "prisma/migrations/20260911150000_add_phase16a_saas_persistence/migration.sql",
  ),
  "utf8",
);

function modelBlock(name: string): string {
  const marker = `model ${name} {`;
  const start = schema.indexOf(marker);

  assert.notEqual(
    start,
    -1,
    `Missing Prisma model ${name}`,
  );

  const end = schema.indexOf("\n}", start);

  assert.notEqual(
    end,
    -1,
    `Unterminated Prisma model ${name}`,
  );

  return schema.slice(start, end + 2);
}

const tenantModels = [
  "EngageAgencyWorkspaceLink",
  "EngageWorkspaceSaasState",
  "EngagePublicApiKey",
  "EngageWorkspaceUsageEvent",
  "EngageWhiteLabelConfig",
  "EngageCustomDomain",
  "EngageDeveloperRequestLog",
] as const;

for (const name of tenantModels) {
  assert.match(
    modelBlock(name),
    /\bworkspaceId\s+String\b/,
    `${name} must carry workspaceId`,
  );
}

const apiKey = modelBlock("EngagePublicApiKey");

assert.match(
  apiKey,
  /\bsha256\s+String\s+@unique\b/,
);

assert.match(
  apiKey,
  /\bprefix\s+String\b/,
);

assert.match(
  apiKey,
  /@@unique\(\[workspaceId,\s*id\]\)/,
);

assert.doesNotMatch(
  apiKey,
  /\b(rawSecret|plaintextSecret|secret|rawToken|token)\s+String\b/i,
  "Raw API-key secret must never be persisted",
);

const usage =
  modelBlock("EngageWorkspaceUsageEvent");

assert.match(
  usage,
  /@@unique\(\[workspaceId,\s*idempotencyKey\]\)/,
);

const domain =
  modelBlock("EngageCustomDomain");

assert.match(
  domain,
  /\bhostname\s+String\s+@unique\b/,
);

const whiteLabel =
  modelBlock("EngageWhiteLabelConfig");

assert.match(
  whiteLabel,
  /\bworkspaceId\s+String\s+@unique\b/,
);

const developerLog =
  modelBlock("EngageDeveloperRequestLog");

assert.match(
  developerLog,
  /\bapiKeyWorkspaceId\s+String\?/,
);

assert.match(
  developerLog,
  /fields:\s*\[apiKeyWorkspaceId,\s*apiKeyId\]/,
);

assert.match(
  developerLog,
  /references:\s*\[workspaceId,\s*id\]/,
);

assert.doesNotMatch(
  developerLog,
  /\b(headers|authorization|requestBody|responseBody|rawPayload)\b/,
);

const forbiddenMigrationPatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\s+"?(Dashboard|WhatsApp|Engage)/i,
  /\bINSERT\s+INTO\b/i,
];

for (const pattern of forbiddenMigrationPatterns) {
  assert.doesNotMatch(
    migration,
    pattern,
    `Phase16A migration must remain additive: ${pattern}`,
  );
}

for (const table of tenantModels) {
  assert.match(
    migration,
    new RegExp(`CREATE TABLE "${table}"`),
  );
}

assert.match(
  migration,
  /EngageAgencyWorkspaceLink_distinct_workspaces_check/,
);

assert.match(
  migration,
  /EngageWorkspaceUsageEvent_workspaceId_idempotencyKey_key/,
);

assert.match(
  migration,
  /EngageCustomDomain_lowercase_hostname_check/,
);

assert.match(
  migration,
  /EngageDeveloperRequestLog_api_key_workspace_check/,
);

assert.match(
  migration,
  /EngageDeveloperRequestLog_apiKeyWorkspaceId_apiKeyId_fkey/,
);

console.log(
  "EngageOS Phase 16A persistence policy: PASS",
);

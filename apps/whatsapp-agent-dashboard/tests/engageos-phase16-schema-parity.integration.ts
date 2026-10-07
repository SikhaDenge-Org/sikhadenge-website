import assert from "node:assert/strict";

import { prisma } from "../lib/db/prisma";

async function main() {
  const count = await prisma.engageOutboundWebhookEndpoint.count();
  assert.ok(Number.isInteger(count));
  assert.ok(count >= 0);

  const columns = await prisma.$queryRaw<
    Array<{ column_name: string }>
  >`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'EngageOutboundWebhookEndpoint'
    ORDER BY column_name
  `;

  const names = new Set(columns.map((row) => row.column_name));
  for (const required of [
    "workspaceId",
    "events",
    "status",
    "algorithm",
    "keyVersion",
    "initializationVector",
    "authenticationTag",
    "ciphertext",
  ]) {
    assert.equal(names.has(required), true, `Missing webhook column: ${required}`);
  }

  assert.equal(names.has("plaintext"), false);
  assert.equal(names.has("signingSecret"), false);

  console.log("EngageOS Phase 16 schema/migration parity: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

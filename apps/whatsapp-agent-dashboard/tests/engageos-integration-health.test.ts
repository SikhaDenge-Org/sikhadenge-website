import assert from "node:assert/strict";

import {
  capabilityUsable,
  deriveIntegrationStatus,
} from "../modules/integrations/domain/integration-health";

function main() {
  const now = new Date("2026-09-09T15:00:00Z");
  assert.equal(
    deriveIntegrationStatus({ webhookRequired: true, permissionsVerified: false }, now),
    "CONNECTING",
  );
  assert.equal(
    deriveIntegrationStatus({
      apiVerifiedAt: new Date("2026-09-09T14:00:00Z"),
      webhookRequired: true,
      permissionsVerified: false,
    }, now),
    "DEGRADED",
  );
  assert.equal(
    deriveIntegrationStatus({
      apiVerifiedAt: new Date("2026-09-09T14:00:00Z"),
      webhookRequired: true,
      webhookVerifiedAt: new Date("2026-09-09T14:01:00Z"),
      permissionsVerified: true,
    }, now),
    "CONNECTED",
  );
  assert.equal(capabilityUsable("DEGRADED", { supported: true, verified: true }), false);
  assert.equal(capabilityUsable("CONNECTED", { supported: true, verified: true }), true);
  console.log("EngageOS integration health tests passed.");
}

main();

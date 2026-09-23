import assert from "node:assert/strict";

import { emailProviderE8ReadinessFromEnv } from "../providers/readiness";

const base: NodeJS.ProcessEnv = {
  EMAIL_RUNTIME_ENABLED: "true",
  EMAIL_RUNTIME_MODE: "DRY_RUN",
  EMAIL_EXTERNAL_WRITES_ENABLED: "false",
  GOOGLE_GMAIL_CLIENT_ID: "gmail-client",
  GOOGLE_GMAIL_CLIENT_SECRET: "gmail-secret",
  GOOGLE_GMAIL_OAUTH_STATE_SECRET: "0123456789abcdef0123456789abcdef",
};

function main() {
  const gmailOnly = emailProviderE8ReadinessFromEnv(base);
  assert.equal(gmailOnly.ready, true);
  assert.equal(gmailOnly.gmailConfigured, true);
  assert.equal(gmailOnly.microsoftConfigured, false);
  assert.equal(gmailOnly.externalWritesEnabled, false);

  const microsoftReady = emailProviderE8ReadinessFromEnv({
    ...base,
    MICROSOFT_EMAIL_CLIENT_ID: "ms-client",
    MICROSOFT_EMAIL_CLIENT_SECRET: "ms-secret",
    MICROSOFT_EMAIL_TENANT_ID: "tenant-1",
    MICROSOFT_EMAIL_OAUTH_STATE_SECRET: "abcdef0123456789abcdef0123456789",
    EMAIL_PROVIDER_FAILOVER_ENABLED: "true",
    EMAIL_PROVIDER_FAILOVER_ORDER: "MICROSOFT_365,GOOGLE_GMAIL",
  });
  assert.equal(microsoftReady.ready, true);
  assert.deepEqual(microsoftReady.configuredProviders, ["GOOGLE_GMAIL", "MICROSOFT_365"]);

  const unsafeWrites = emailProviderE8ReadinessFromEnv({
    ...base,
    EMAIL_EXTERNAL_WRITES_ENABLED: "true",
  });
  assert.equal(unsafeWrites.ready, false);
  assert.match(unsafeWrites.reasons.join(" "), /external_writes_enabled/i);

  const missingFallback = emailProviderE8ReadinessFromEnv({
    ...base,
    EMAIL_PROVIDER_FAILOVER_ENABLED: "true",
    EMAIL_PROVIDER_FAILOVER_ORDER: "MICROSOFT_365",
  });
  assert.equal(missingFallback.ready, false);
  assert.match(missingFallback.reasons.join(" "), /MICROSOFT_365/);

  const wrongMode = emailProviderE8ReadinessFromEnv({
    ...base,
    EMAIL_RUNTIME_MODE: "LIVE",
  });
  assert.equal(wrongMode.ready, false);
  assert.match(wrongMode.reasons.join(" "), /Expected DRY_RUN/);

  console.log("Email E8 secret-free provider readiness contract: PASS");
}

main();

import { emailProviderE8ReadinessFromEnv } from "../modules/email-automation/providers/readiness";

const readiness = emailProviderE8ReadinessFromEnv(process.env);

console.log(`E8_RUNTIME_ENABLED=${readiness.runtimeEnabled}`);
console.log(`E8_RUNTIME_MODE=${readiness.runtimeMode}`);
console.log(`E8_EXTERNAL_WRITES_ENABLED=${readiness.externalWritesEnabled}`);
console.log(`E8_GMAIL_CONFIGURED=${readiness.gmailConfigured}`);
console.log(`E8_MICROSOFT_CONFIGURED=${readiness.microsoftConfigured}`);
console.log(`E8_CONFIGURED_PROVIDERS=${readiness.configuredProviders.join(",") || "none"}`);
console.log(`E8_FAILOVER_ENABLED=${readiness.failoverPolicy.enabled}`);
console.log(`E8_FAILOVER_ORDER=${readiness.failoverPolicy.orderedProviders.join(",") || "none"}`);
console.log(`E8_EXTERNAL_EMAIL_SENT=false`);

if (!readiness.ready) {
  for (const reason of readiness.reasons) console.error(`E8_READINESS_REASON=${reason}`);
  console.error("E8_PROVIDER_READINESS=FAIL");
  process.exitCode = 1;
} else {
  console.log("E8_PROVIDER_READINESS=PASS");
}

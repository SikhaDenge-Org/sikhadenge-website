import type { EmailProvider, EmailRuntimeMode } from "../domain/contracts";
import {
  emailProviderFailoverPolicyFromEnv,
  type EmailProviderFailoverPolicy,
} from "./routing/failover-policy";

export type EmailProviderE8Readiness = {
  runtimeEnabled: boolean;
  runtimeMode: EmailRuntimeMode;
  externalWritesEnabled: boolean;
  gmailConfigured: boolean;
  microsoftConfigured: boolean;
  configuredProviders: readonly EmailProvider[];
  failoverPolicy: EmailProviderFailoverPolicy;
  ready: boolean;
  reasons: readonly string[];
};

function enabled(env: NodeJS.ProcessEnv, name: string): boolean {
  return env[name]?.trim().toLowerCase() === "true";
}

function runtimeMode(value: string | undefined): EmailRuntimeMode {
  const normalized = value?.trim().toUpperCase();
  return normalized === "DRY_RUN" ||
    normalized === "INTERNAL_RECIPIENTS" ||
    normalized === "LIMITED_COHORT" ||
    normalized === "LIVE"
    ? normalized
    : "DISABLED";
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function secretConfigured(value: string | undefined): boolean {
  return (value?.trim().length ?? 0) >= 32;
}

export function emailProviderE8ReadinessFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmailProviderE8Readiness {
  const gmailConfigured =
    configured(env.GOOGLE_GMAIL_CLIENT_ID) &&
    configured(env.GOOGLE_GMAIL_CLIENT_SECRET) &&
    secretConfigured(env.GOOGLE_GMAIL_OAUTH_STATE_SECRET);
  const microsoftConfigured =
    configured(env.MICROSOFT_EMAIL_CLIENT_ID) &&
    configured(env.MICROSOFT_EMAIL_CLIENT_SECRET) &&
    configured(env.MICROSOFT_EMAIL_TENANT_ID) &&
    secretConfigured(env.MICROSOFT_EMAIL_OAUTH_STATE_SECRET);
  const configuredProviders: EmailProvider[] = [];
  if (gmailConfigured) configuredProviders.push("GOOGLE_GMAIL");
  if (microsoftConfigured) configuredProviders.push("MICROSOFT_365");

  const failoverPolicy = emailProviderFailoverPolicyFromEnv(env);
  const mode = runtimeMode(env.EMAIL_RUNTIME_MODE);
  const runtimeEnabled = enabled(env, "EMAIL_RUNTIME_ENABLED");
  const externalWritesEnabled = enabled(env, "EMAIL_EXTERNAL_WRITES_ENABLED");
  const reasons: string[] = [];

  if (!runtimeEnabled) reasons.push("EMAIL_RUNTIME_ENABLED is not true.");
  if (mode !== "DRY_RUN") reasons.push(`Expected DRY_RUN for E8 readiness, found ${mode}.`);
  if (externalWritesEnabled) reasons.push("EMAIL_EXTERNAL_WRITES_ENABLED must remain false during E8 readiness.");
  if (!gmailConfigured) reasons.push("Google Gmail provider configuration is incomplete.");

  if (failoverPolicy.enabled) {
    if (failoverPolicy.orderedProviders.length === 0) {
      reasons.push("Provider failover is enabled without an ordered provider list.");
    }
    for (const provider of failoverPolicy.orderedProviders) {
      if (!configuredProviders.includes(provider)) {
        reasons.push(`Failover provider ${provider} is not configured for this runtime.`);
      }
    }
  }

  return {
    runtimeEnabled,
    runtimeMode: mode,
    externalWritesEnabled,
    gmailConfigured,
    microsoftConfigured,
    configuredProviders: Object.freeze(configuredProviders),
    failoverPolicy,
    ready: reasons.length === 0,
    reasons: Object.freeze(reasons),
  };
}

import type { EmailRuntimeMode } from "../domain/contracts";

export type EmailRuntimePolicy = {
  runtimeEnabled: boolean;
  externalWritesEnabled: boolean;
  automationEnabled: boolean;
  inboundSyncEnabled: boolean;
  trackingEnabled: boolean;
  mode: EmailRuntimeMode;
};

function envBoolean(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function runtimeMode(value: string | undefined): EmailRuntimeMode {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "DRY_RUN" ||
    normalized === "INTERNAL_RECIPIENTS" ||
    normalized === "LIMITED_COHORT" ||
    normalized === "LIVE"
  ) {
    return normalized;
  }
  return "DISABLED";
}

export function getEmailRuntimePolicy(): EmailRuntimePolicy {
  return {
    runtimeEnabled: envBoolean("EMAIL_RUNTIME_ENABLED"),
    externalWritesEnabled: envBoolean("EMAIL_EXTERNAL_WRITES_ENABLED"),
    automationEnabled: envBoolean("EMAIL_AUTOMATION_ENABLED"),
    inboundSyncEnabled: envBoolean("EMAIL_INBOUND_SYNC_ENABLED"),
    trackingEnabled: envBoolean("EMAIL_TRACKING_ENABLED"),
    mode: runtimeMode(process.env.EMAIL_RUNTIME_MODE),
  };
}

export function assertEmailExternalDeliveryAllowed(policy: EmailRuntimePolicy): void {
  if (!policy.runtimeEnabled) throw new Error("Email runtime is disabled.");
  if (!policy.externalWritesEnabled) throw new Error("Email external writes are disabled.");
  if (policy.mode === "DISABLED" || policy.mode === "DRY_RUN") {
    throw new Error(`Email runtime mode ${policy.mode} does not allow external delivery.`);
  }
}

export function assertEmailAutomationAllowed(policy: EmailRuntimePolicy): void {
  assertEmailExternalDeliveryAllowed(policy);
  if (!policy.automationEnabled) throw new Error("Email automation is disabled.");
}

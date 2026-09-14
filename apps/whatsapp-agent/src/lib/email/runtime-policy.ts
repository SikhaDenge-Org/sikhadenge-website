import type { EmailRuntimeMode } from "./types";

function booleanEnvironment(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled", "live"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function runtimeMode(): EmailRuntimeMode {
  const value = process.env.EMAIL_RUNTIME_MODE?.trim().toLowerCase();
  if (
    value === "disabled" ||
    value === "dry_run" ||
    value === "internal_recipients" ||
    value === "limited_cohort" ||
    value === "live"
  ) {
    return value;
  }
  return "disabled";
}

export type EmailRuntimePolicy = {
  mode: EmailRuntimeMode;
  runtimeEnabled: boolean;
  externalWritesEnabled: boolean;
  automationEnabled: boolean;
  inboundSyncEnabled: boolean;
  trackingEnabled: boolean;
  liveReady: boolean;
};

export function getEmailRuntimePolicy(): EmailRuntimePolicy {
  const mode = runtimeMode();
  const runtimeEnabled = booleanEnvironment("EMAIL_RUNTIME_ENABLED", false);
  const externalWritesEnabled = booleanEnvironment("EMAIL_EXTERNAL_WRITES_ENABLED", false);
  const automationEnabled = booleanEnvironment("EMAIL_AUTOMATION_ENABLED", false);
  const inboundSyncEnabled = booleanEnvironment("EMAIL_INBOUND_SYNC_ENABLED", false);
  const trackingEnabled = booleanEnvironment("EMAIL_TRACKING_ENABLED", false);

  return {
    mode,
    runtimeEnabled,
    externalWritesEnabled,
    automationEnabled,
    inboundSyncEnabled,
    trackingEnabled,
    liveReady:
      runtimeEnabled &&
      externalWritesEnabled &&
      automationEnabled &&
      mode === "live",
  };
}

export function assertEmailExternalWriteAllowed(): void {
  const policy = getEmailRuntimePolicy();
  if (!policy.runtimeEnabled) throw new Error("Email runtime is disabled.");
  if (!policy.externalWritesEnabled) throw new Error("Email external writes are disabled.");
  if (policy.mode === "disabled" || policy.mode === "dry_run") {
    throw new Error(`Email runtime mode ${policy.mode} does not allow external delivery.`);
  }
}

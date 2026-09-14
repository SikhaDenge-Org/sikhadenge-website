import { isAllowedInternalEmailRecipient } from "./internal-recipient-policy";
import { getEmailRuntimePolicy } from "./runtime-policy";

export function assertEmailSendPolicy(recipients: string[]): void {
  const policy = getEmailRuntimePolicy();
  if (!policy.runtimeEnabled) throw new Error("Email runtime is disabled.");

  if (policy.mode === "disabled") throw new Error("Email runtime is disabled.");
  if (policy.mode === "dry_run") throw new Error("Dry-run mode does not allow external email delivery.");
  if (!policy.externalWritesEnabled) throw new Error("Email external writes are disabled.");

  if (policy.mode === "internal_recipients") {
    const blocked = recipients.filter((email) => !isAllowedInternalEmailRecipient(email));
    if (blocked.length > 0) throw new Error("Email recipient is outside the internal allowlist.");
  }
}

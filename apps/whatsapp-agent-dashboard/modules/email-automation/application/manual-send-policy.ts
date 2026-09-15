import type { EmailAddress, EmailRuntimeMode } from "../domain/contracts";
import type { EmailRuntimePolicy } from "./runtime-policy";

function email(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error(`Invalid email address: ${value}.`);
  return normalized;
}

export function internalRecipientAllowlist(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  return new Set((env.EMAIL_INTERNAL_RECIPIENT_ALLOWLIST ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export function assertManualEmailDispatchPolicy(input: {
  policy: EmailRuntimePolicy;
  recipients: readonly EmailAddress[];
  allowlist: ReadonlySet<string>;
}): { mode: EmailRuntimeMode; externalRequestAllowed: boolean } {
  if (!input.policy.runtimeEnabled) throw new Error("Email runtime is disabled.");
  if (input.policy.mode === "DISABLED") throw new Error("Email runtime mode DISABLED does not allow manual dispatch.");
  if (input.policy.mode === "DRY_RUN") return { mode: "DRY_RUN", externalRequestAllowed: false };
  if (input.policy.mode !== "INTERNAL_RECIPIENTS") {
    throw new Error(`Email runtime mode ${input.policy.mode} is not enabled for E3 manual sending.`);
  }
  if (!input.policy.externalWritesEnabled) throw new Error("Email external writes are disabled.");
  if (input.allowlist.size === 0) throw new Error("Email internal recipient allowlist is empty.");
  for (const recipient of input.recipients) {
    if (!input.allowlist.has(email(recipient.email))) throw new Error(`Recipient ${recipient.email} is not in the internal email allowlist.`);
  }
  return { mode: "INTERNAL_RECIPIENTS", externalRequestAllowed: true };
}

export function assertManualEmailRetryAllowed(status: string): void {
  if (status !== "FAILED") throw new Error("Only FAILED manual email messages can be retried.");
}

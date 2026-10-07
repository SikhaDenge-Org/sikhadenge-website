import type { EmailAddress, EmailRuntimeMode } from "../domain/contracts";
import type { EmailRuntimePolicy } from "./runtime-policy";
import {
  assertEmailDeliverabilityGuardrails,
  type EmailDeliverabilitySnapshot,
} from "./deliverability-guardrails";

function email(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`Invalid email address: ${value}.`);
  }
  return normalized;
}

export function automationRecipientCohortAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  return new Set(
    (env.EMAIL_AUTOMATION_COHORT_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function assertAutomationEmailDispatchPolicy(input: {
  policy: EmailRuntimePolicy;
  recipients: readonly EmailAddress[];
  internalAllowlist: ReadonlySet<string>;
  cohortAllowlist: ReadonlySet<string>;
  deliverabilitySnapshot?: EmailDeliverabilitySnapshot | null;
}): { mode: EmailRuntimeMode; externalRequestAllowed: boolean } {
  if (!input.policy.runtimeEnabled) throw new Error("Email runtime is disabled.");
  if (!input.policy.automationEnabled) throw new Error("Email automation is disabled.");
  if (input.policy.mode === "DISABLED") {
    throw new Error("Email runtime mode DISABLED does not allow automation dispatch.");
  }
  if (input.policy.mode === "DRY_RUN") {
    return { mode: "DRY_RUN", externalRequestAllowed: false };
  }
  if (!input.policy.externalWritesEnabled) throw new Error("Email external writes are disabled.");

  assertEmailDeliverabilityGuardrails({
    mode: input.policy.mode,
    snapshot: input.deliverabilitySnapshot,
  });

  if (input.policy.mode === "LIVE") {
    return { mode: "LIVE", externalRequestAllowed: true };
  }

  const allowlist =
    input.policy.mode === "INTERNAL_RECIPIENTS"
      ? input.internalAllowlist
      : input.cohortAllowlist;
  const label =
    input.policy.mode === "INTERNAL_RECIPIENTS"
      ? "internal recipient"
      : "automation cohort";

  if (allowlist.size === 0) throw new Error(`Email ${label} allowlist is empty.`);
  for (const recipient of input.recipients) {
    if (!allowlist.has(email(recipient.email))) {
      throw new Error(`Recipient ${recipient.email} is not in the email ${label} allowlist.`);
    }
  }

  return { mode: input.policy.mode, externalRequestAllowed: true };
}

import type { EmailRuntimeMode } from "../modules/email-automation/domain/contracts";
import { evaluateEmailDeliverabilityGuardrails } from "../modules/email-automation/application/deliverability-guardrails";

function parseMode(value: string | undefined): EmailRuntimeMode {
  const mode = value?.trim().toUpperCase();
  if (mode === "DRY_RUN" || mode === "LIMITED_COHORT" || mode === "LIVE") return mode;
  throw new Error("Expected DRY_RUN, LIMITED_COHORT, or LIVE for Email production deliverability preflight.");
}

const mode = parseMode(process.argv[2] ?? process.env.EMAIL_PREFLIGHT_EXPECTED_MODE);
const decision = evaluateEmailDeliverabilityGuardrails({ mode, env: process.env });

console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_MODE=${mode}`);
console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_ENFORCED=${decision.enforced}`);
console.log(`EMAIL_DELIVERABILITY_SPF_QUALIFIED=${decision.snapshot.spfAligned === true}`);
console.log(`EMAIL_DELIVERABILITY_DKIM_QUALIFIED=${decision.snapshot.dkimAligned === true}`);
console.log(`EMAIL_DELIVERABILITY_DMARC_QUALIFIED=${decision.snapshot.dmarcAligned === true}`);
console.log(`EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=${decision.snapshot.hardBounceRatePct ?? "missing"}`);
console.log(`EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=${decision.snapshot.complaintRatePct ?? "missing"}`);

if (!decision.allowed) {
  for (const reason of decision.reasons) console.error(`EMAIL_DELIVERABILITY_BLOCK_REASON=${reason}`);
  console.error("EMAIL_DELIVERABILITY_PREFLIGHT=FAIL");
  process.exitCode = 1;
} else {
  console.log("EMAIL_DELIVERABILITY_PREFLIGHT=PASS");
}

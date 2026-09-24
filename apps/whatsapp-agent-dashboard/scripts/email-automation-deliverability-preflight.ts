import type { EmailRuntimeMode } from "../modules/email-automation/domain/contracts";
import { buildEmailE1Runtime } from "../modules/email-automation/infrastructure/runtime";
import { evaluateEmailDeliverabilityGuardrails } from "../modules/email-automation/application/deliverability-guardrails";
import { loadPersistedEmailDeliverabilitySnapshot } from "../modules/email-automation/application/deliverability-evidence-service";

function parseMode(value: string | undefined): EmailRuntimeMode {
  const mode = value?.trim().toUpperCase();
  if (mode === "DRY_RUN" || mode === "LIMITED_COHORT" || mode === "LIVE") return mode;
  throw new Error("Expected DRY_RUN, LIMITED_COHORT, or LIVE for Email production deliverability preflight.");
}

async function main() {
  const mode = parseMode(process.argv[2] ?? process.env.EMAIL_PREFLIGHT_EXPECTED_MODE);
  if (mode === "DRY_RUN") {
    const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot: null });
    console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_MODE=${mode}`);
    console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_ENFORCED=${decision.enforced}`);
    console.log("EMAIL_DELIVERABILITY_PREFLIGHT=PASS");
    return;
  }

  const workspaceId = process.env.EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID?.trim() || "";
  const senderEmail = process.env.EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL?.trim().toLowerCase() || "";
  if (!workspaceId) throw new Error("EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID is required for scaled-delivery preflight.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    throw new Error("EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL must be a valid email address for scaled-delivery preflight.");
  }

  const runtime = buildEmailE1Runtime();
  const senders = await runtime.senders.listByWorkspace(workspaceId);
  const sender = senders.find((item) => item.fromEmail.trim().toLowerCase() === senderEmail && item.isActive && item.verificationStatus === "VERIFIED");
  if (!sender) throw new Error("Scaled-delivery preflight sender is not a verified active sender in the selected workspace.");
  const connection = await runtime.connections.getById({ workspaceId, connectionId: sender.connectionId });
  if (!connection || connection.status !== "CONNECTED") throw new Error("Scaled-delivery preflight sender connection is not connected.");

  const snapshot = await loadPersistedEmailDeliverabilitySnapshot({
    workspaceId,
    connectionId: connection.id,
    senderEmail: sender.fromEmail,
    provider: connection.provider,
  });
  const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot });

  console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_MODE=${mode}`);
  console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_ENFORCED=${decision.enforced}`);
  console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID=${workspaceId}`);
  console.log(`EMAIL_DELIVERABILITY_PREFLIGHT_SENDER_EMAIL=${sender.fromEmail}`);
  console.log(`EMAIL_DELIVERABILITY_EVIDENCE_CHECKED_AT=${decision.snapshot.checkedAt ?? "missing"}`);
  console.log(`EMAIL_DELIVERABILITY_SPF_QUALIFIED=${decision.snapshot.spfAligned === true}`);
  console.log(`EMAIL_DELIVERABILITY_DKIM_QUALIFIED=${decision.snapshot.dkimAligned === true}`);
  console.log(`EMAIL_DELIVERABILITY_DMARC_QUALIFIED=${decision.snapshot.dmarcAligned === true}`);
  console.log(`EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT=${decision.snapshot.hardBounceRatePct ?? "missing"}`);
  console.log(`EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT=${decision.snapshot.complaintRatePct ?? "missing"}`);
  console.log(`EMAIL_DELIVERABILITY_COMPLAINT_SOURCE_QUALIFIED=${decision.snapshot.complaintTelemetryQualified === true}`);

  if (!decision.allowed) {
    for (const reason of decision.reasons) console.error(`EMAIL_DELIVERABILITY_BLOCK_REASON=${reason}`);
    console.error("EMAIL_DELIVERABILITY_PREFLIGHT=FAIL");
    process.exitCode = 1;
  } else {
    console.log("EMAIL_DELIVERABILITY_PREFLIGHT=PASS");
  }
}

main().catch((error) => {
  console.error(`EMAIL_DELIVERABILITY_PREFLIGHT_ERROR=${error instanceof Error ? error.message : "unknown"}`);
  console.error("EMAIL_DELIVERABILITY_PREFLIGHT=FAIL");
  process.exitCode = 1;
});

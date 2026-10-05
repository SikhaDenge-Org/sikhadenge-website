import {
  listEmailDeliverabilityEvidence,
  refreshEmailDeliverabilityEvidence,
} from "../modules/email-automation/application/deliverability-evidence-service";

async function main() {
  const workspaceId = (process.argv[2] ?? process.env.EMAIL_DELIVERABILITY_PREFLIGHT_WORKSPACE_ID ?? "").trim();
  const refresh = await refreshEmailDeliverabilityEvidence({
    ...(workspaceId ? { workspaceId } : {}),
    force: true,
  });
  const evidence = workspaceId ? await listEmailDeliverabilityEvidence(workspaceId) : null;
  console.log("EMAIL_DELIVERABILITY_REFRESH=PASS");
  console.log(`EMAIL_DELIVERABILITY_CONNECTIONS_SCANNED=${refresh.connectionsScanned}`);
  console.log(`EMAIL_DELIVERABILITY_DOMAINS=${refresh.domains}`);
  console.log(`EMAIL_DELIVERABILITY_REFRESHED=${refresh.refreshed}`);
  console.log(JSON.stringify({ workspaceId: workspaceId || null, refresh, evidence }, null, 2));
}

main().catch((error) => {
  console.error(`EMAIL_DELIVERABILITY_REFRESH_ERROR=${error instanceof Error ? error.message : "unknown"}`);
  console.error("EMAIL_DELIVERABILITY_REFRESH=FAIL");
  process.exitCode = 1;
});

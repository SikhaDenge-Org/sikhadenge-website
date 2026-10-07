export type PwaEvidence = {
  manifestPresent: boolean;
  serviceWorkerPresent: boolean;
  serviceWorkerRegistered: boolean;
  offlineShellVerified: boolean;
  draftRecoveryVerified: boolean;
  accessibilitySmokeVerified: boolean;
  pushConfigured: boolean;
};

export type PwaReadiness = {
  installableFoundationReady: boolean;
  offlineProductivityReady: boolean;
  pushReady: boolean;
  missing: readonly string[];
};

export function evaluatePwaReadiness(evidence: PwaEvidence): PwaReadiness {
  const missing: string[] = [];
  if (!evidence.manifestPresent) missing.push("manifest");
  if (!evidence.serviceWorkerPresent) missing.push("service-worker");
  if (!evidence.serviceWorkerRegistered) missing.push("service-worker-registration");
  if (!evidence.offlineShellVerified) missing.push("offline-shell");
  if (!evidence.draftRecoveryVerified) missing.push("draft-recovery");
  if (!evidence.accessibilitySmokeVerified) missing.push("accessibility-smoke");
  const installableFoundationReady =
    evidence.manifestPresent && evidence.serviceWorkerPresent && evidence.serviceWorkerRegistered;
  return {
    installableFoundationReady,
    offlineProductivityReady:
      installableFoundationReady &&
      evidence.offlineShellVerified &&
      evidence.draftRecoveryVerified &&
      evidence.accessibilitySmokeVerified,
    pushReady: installableFoundationReady && evidence.pushConfigured,
    missing,
  };
}

export type Phase16RepositoryEvidence = {
  exactShaVerified: boolean;
  validateCiPassed: boolean;
  migrationRegressionPassed: boolean;
  browserRegressionPassed: boolean;
  prismaSchemaMigrationParityVerified: boolean;
  tenantIsolationVerified: boolean;
  publicApiIsolationVerified: boolean;
  webhookWorkspaceIsolationVerified: boolean;
  webhookSecretsEncryptedAtRest: boolean;
  webhookReplayProtectionVerified: boolean;
  auditLoggingVerified: boolean;
  rollbackProcedureVerified: boolean;
  liveWebhookDeliveryDisabled: boolean;
  unresolvedCriticalIncidents: number;
};

export type Phase16ProductionEvidence = {
  productionMigrationApproved: boolean;
  productionMigrationApplied: boolean;
  productionSecretsConfigured: boolean;
  productionMonitoringActive: boolean;
  productionRollbackTested: boolean;
  liveWebhookDeliveryExplicitlyApproved: boolean;
};

export type Phase16FinalGovernanceDecision = {
  repositoryExitReady: boolean;
  productionActivationAllowed: boolean;
  repositoryBlockers: readonly string[];
  productionBlockers: readonly string[];
};

function repositoryBlockers(
  evidence: Phase16RepositoryEvidence,
): string[] {
  const blockers: string[] = [];

  if (!evidence.exactShaVerified) blockers.push("exact SHA verification is missing");
  if (!evidence.validateCiPassed) blockers.push("validate CI is not green");
  if (!evidence.migrationRegressionPassed) blockers.push("migration regression is not green");
  if (!evidence.browserRegressionPassed) blockers.push("browser regression is not green");
  if (!evidence.prismaSchemaMigrationParityVerified) blockers.push("Prisma schema and migration parity is not verified");
  if (!evidence.tenantIsolationVerified) blockers.push("tenant isolation is not verified");
  if (!evidence.publicApiIsolationVerified) blockers.push("public API workspace isolation is not verified");
  if (!evidence.webhookWorkspaceIsolationVerified) blockers.push("webhook workspace isolation is not verified");
  if (!evidence.webhookSecretsEncryptedAtRest) blockers.push("webhook secret encryption at rest is not verified");
  if (!evidence.webhookReplayProtectionVerified) blockers.push("webhook replay protection is not verified");
  if (!evidence.auditLoggingVerified) blockers.push("security audit logging is not verified");
  if (!evidence.rollbackProcedureVerified) blockers.push("rollback procedure is not verified");
  if (!evidence.liveWebhookDeliveryDisabled) blockers.push("live webhook delivery must remain disabled for repository exit");
  if (evidence.unresolvedCriticalIncidents > 0) blockers.push("critical incidents remain unresolved");

  return blockers;
}

function productionBlockers(
  evidence: Phase16ProductionEvidence | undefined,
): string[] {
  if (!evidence) {
    return ["production activation evidence has not been supplied"];
  }

  const blockers: string[] = [];
  if (!evidence.productionMigrationApproved) blockers.push("production migration is not approved");
  if (!evidence.productionMigrationApplied) blockers.push("production migration is not applied");
  if (!evidence.productionSecretsConfigured) blockers.push("production secrets are not configured");
  if (!evidence.productionMonitoringActive) blockers.push("production monitoring is not active");
  if (!evidence.productionRollbackTested) blockers.push("production rollback is not tested");
  if (!evidence.liveWebhookDeliveryExplicitlyApproved) blockers.push("live webhook delivery is not explicitly approved");
  return blockers;
}

export function evaluatePhase16FinalGovernance(input: {
  repository: Phase16RepositoryEvidence;
  production?: Phase16ProductionEvidence;
}): Phase16FinalGovernanceDecision {
  const repositoryIssues = repositoryBlockers(input.repository);
  const repositoryExitReady = repositoryIssues.length === 0;
  const productionIssues = productionBlockers(input.production);

  return {
    repositoryExitReady,
    productionActivationAllowed:
      repositoryExitReady &&
      productionIssues.length === 0,
    repositoryBlockers: repositoryIssues,
    productionBlockers: productionIssues,
  };
}

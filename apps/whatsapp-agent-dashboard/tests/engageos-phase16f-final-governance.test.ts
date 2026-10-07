import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluatePhase16FinalGovernance,
  type Phase16RepositoryEvidence,
} from "../modules/release/application/phase16-final-governance";

const completeRepositoryEvidence: Phase16RepositoryEvidence = {
  exactShaVerified: true,
  validateCiPassed: true,
  migrationRegressionPassed: true,
  browserRegressionPassed: true,
  prismaSchemaMigrationParityVerified: true,
  tenantIsolationVerified: true,
  publicApiIsolationVerified: true,
  webhookWorkspaceIsolationVerified: true,
  webhookSecretsEncryptedAtRest: true,
  webhookReplayProtectionVerified: true,
  auditLoggingVerified: true,
  rollbackProcedureVerified: true,
  liveWebhookDeliveryDisabled: true,
  unresolvedCriticalIncidents: 0,
};

function testRepositoryExitDoesNotImplyProductionActivation() {
  const decision = evaluatePhase16FinalGovernance({
    repository: completeRepositoryEvidence,
  });

  assert.equal(decision.repositoryExitReady, true);
  assert.equal(decision.productionActivationAllowed, false);
  assert.deepEqual(decision.repositoryBlockers, []);
  assert.match(decision.productionBlockers.join(" "), /production activation evidence/i);
}

function testSchemaParityIsMandatory() {
  const decision = evaluatePhase16FinalGovernance({
    repository: {
      ...completeRepositoryEvidence,
      prismaSchemaMigrationParityVerified: false,
    },
  });

  assert.equal(decision.repositoryExitReady, false);
  assert.match(decision.repositoryBlockers.join(" "), /schema and migration parity/i);
}

function testLiveDeliveryCannotSlipIntoRepositoryExit() {
  const decision = evaluatePhase16FinalGovernance({
    repository: {
      ...completeRepositoryEvidence,
      liveWebhookDeliveryDisabled: false,
    },
  });

  assert.equal(decision.repositoryExitReady, false);
  assert.match(decision.repositoryBlockers.join(" "), /live webhook delivery must remain disabled/i);
}

function testProductionActivationRequiresEveryExplicitApproval() {
  const blocked = evaluatePhase16FinalGovernance({
    repository: completeRepositoryEvidence,
    production: {
      productionMigrationApproved: true,
      productionMigrationApplied: true,
      productionSecretsConfigured: true,
      productionMonitoringActive: true,
      productionRollbackTested: true,
      liveWebhookDeliveryExplicitlyApproved: false,
    },
  });

  assert.equal(blocked.productionActivationAllowed, false);
  assert.match(blocked.productionBlockers.join(" "), /live webhook delivery/i);

  const allowed = evaluatePhase16FinalGovernance({
    repository: completeRepositoryEvidence,
    production: {
      productionMigrationApproved: true,
      productionMigrationApplied: true,
      productionSecretsConfigured: true,
      productionMonitoringActive: true,
      productionRollbackTested: true,
      liveWebhookDeliveryExplicitlyApproved: true,
    },
  });

  assert.equal(allowed.productionActivationAllowed, true);
}

function testCriticalIncidentBlocksRepositoryExit() {
  const decision = evaluatePhase16FinalGovernance({
    repository: {
      ...completeRepositoryEvidence,
      unresolvedCriticalIncidents: 1,
    },
  });

  assert.equal(decision.repositoryExitReady, false);
  assert.match(decision.repositoryBlockers.join(" "), /critical incidents/i);
}

function testCommittedPhase16GovernanceContracts() {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const migration = fs.readFileSync(
    "prisma/migrations/20260912194000_add_phase16e_enterprise_webhooks/migration.sql",
    "utf8",
  );
  const webhookService = fs.readFileSync(
    "modules/saas/application/enterprise-webhook-service.ts",
    "utf8",
  );
  const crypto = fs.readFileSync(
    "modules/saas/infrastructure/webhook-secret-crypto.ts",
    "utf8",
  );
  const workflow = fs.readFileSync(
    "../../.github/workflows/whatsapp-agent-ci.yml",
    "utf8",
  );

  assert.match(schema, /model EngageOutboundWebhookEndpoint\s*\{/);
  assert.match(schema, /outboundWebhookEndpoints\s+EngageOutboundWebhookEndpoint\[\]/);
  assert.match(migration, /CREATE TABLE "EngageOutboundWebhookEndpoint"/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|TRUNCATE/i);

  const schemaModel = schema.match(/model EngageOutboundWebhookEndpoint\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(schemaModel, /algorithm\s+String\s+@default\("AES_256_GCM"\)/);
  assert.match(schemaModel, /initializationVector\s+String/);
  assert.match(schemaModel, /authenticationTag\s+String/);
  assert.match(schemaModel, /ciphertext\s+String/);
  assert.doesNotMatch(schemaModel, /plaintext|signingSecret\s+String/i);

  assert.match(crypto, /createCipheriv/);
  assert.match(crypto, /aes-256-gcm/);
  assert.match(webhookService, /verifyOutboundWebhookSignature/);
  assert.match(webhookService, /SIGNED_NO_NETWORK_DELIVERY/);
  assert.doesNotMatch(webhookService, /\bfetch\s*\(/);

  assert.match(workflow, /^\s*validate:/m);
  assert.match(workflow, /^\s*migration-regression:/m);
  assert.match(workflow, /^\s*browser-regression:/m);
  assert.match(workflow, /- phase16-saas-enterprise-20260911/);
  assert.match(workflow, /Test Phase 16 schema and migration parity/);
  assert.match(workflow, /test:phase16-schema-parity:integration/);
}

testRepositoryExitDoesNotImplyProductionActivation();
testSchemaParityIsMandatory();
testLiveDeliveryCannotSlipIntoRepositoryExit();
testProductionActivationRequiresEveryExplicitApproval();
testCriticalIncidentBlocksRepositoryExit();
testCommittedPhase16GovernanceContracts();

console.log("EngageOS Phase 16F final governance: PASS");

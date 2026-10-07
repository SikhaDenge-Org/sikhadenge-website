import assert from "node:assert/strict";

import { evaluateGroundedSend } from "../modules/ai/orchestration/grounded-send-gate";
import { createCustomerMergeRecord, undoCustomerMerge } from "../modules/customers/application/customer-merge-runtime";
import { createJourneyEnrollment, evaluateNextJourneyStep, recordJourneyStepSent } from "../modules/journeys/application/journey-runtime";
import { buildAnalyticsSnapshot } from "../modules/analytics/application/analytics-snapshot";
import { evaluateOfficialConnectorActivation } from "../modules/channels/core/application/official-connector-control";
import { evaluatePwaReadiness } from "../modules/productivity/application/pwa-readiness";
import {
  clearLocalDraft,
  persistLocalDraft,
  restoreLocalDraft,
} from "../modules/productivity/application/local-draft-store";
import { hashApiKey, authorizeEnterpriseRequest } from "../modules/saas/application/enterprise-access";
import { buildRemainingPhaseReadiness } from "../modules/release/application/phase-readiness";
import { evaluateReleaseExit } from "../modules/release/application/release-exit-gate";

function testGroundedAi() {
  const blocked = evaluateGroundedSend({
    enabled: true,
    intent: "FEES",
    confidence: 0.99,
    sourceReferenceIds: [],
    safetyPassed: true,
    sensitive: false,
    requiresHuman: false,
  });
  assert.equal(blocked.route, "HANDOFF");
  const allowed = evaluateGroundedSend({
    enabled: true,
    intent: "FEES",
    confidence: 0.96,
    sourceReferenceIds: ["chunk-1"],
    safetyPassed: true,
    sensitive: false,
    requiresHuman: false,
  });
  assert.equal(allowed.route, "AUTO_SEND");
  assert.equal(allowed.allowedToAutoSend, true);
}

function testCustomer360Merge() {
  const record = createCustomerMergeRecord({
    primaryCustomerId: "customer-a",
    mergedCustomerId: "customer-b",
    actorId: "admin-1",
    evidence: [{
      type: "VERIFIED_PHONE",
      value: "+919999999999",
      observedAt: new Date("2026-09-09T10:00:00Z"),
      source: "whatsapp",
    }],
  });
  assert.equal(record.primaryCustomerId, "customer-a");
  assert.equal(Boolean(undoCustomerMerge(record, "admin-2").reversedAt), true);
  assert.throws(() => createCustomerMergeRecord({
    primaryCustomerId: "a",
    mergedCustomerId: "b",
    actorId: "admin",
    evidence: [{ type: "DISPLAY_NAME", value: "Same Name", observedAt: new Date(), source: "profile" }],
  }));
}

function testJourneyRuntime() {
  const enrolledAt = new Date("2026-09-09T10:00:00Z");
  const enrollment = createJourneyEnrollment({
    journeyId: "demo-followup",
    customerId: "customer-1",
    enrolledAt,
    steps: [{ id: "s1", offsetMinutes: 30, channel: "WHATSAPP", messageReference: "template-1" }],
  });
  const due = evaluateNextJourneyStep({
    enrollment,
    now: new Date("2026-09-09T10:31:00Z"),
    nowLocalMinuteOfDay: 900,
    suppressed: false,
    consentGranted: true,
    customerRespondedSinceEnrollment: false,
    stageChangedSinceEnrollment: false,
    sendsInFrequencyWindow: 0,
    maxSendsInFrequencyWindow: 2,
  });
  assert.equal(due.decision.allowed, true);
  assert.equal(recordJourneyStepSent(enrollment, "s1").status, "COMPLETED");
}

function testAnalytics() {
  const snapshot = buildAnalyticsSnapshot({
    workspaceId: "w1",
    from: new Date("2026-09-01T00:00:00Z"),
    to: new Date("2026-10-01T00:00:00Z"),
    facts: [
      { workspaceId: "w1", type: "MESSAGE_SENT", occurredAt: new Date("2026-09-02T00:00:00Z") },
      { workspaceId: "w1", type: "MESSAGE_READ", occurredAt: new Date("2026-09-02T00:01:00Z") },
      { workspaceId: "w2", type: "MESSAGE_SENT", occurredAt: new Date("2026-09-02T00:00:00Z") },
    ],
  });
  assert.equal(snapshot.eventCount, 2);
  assert.equal(snapshot.metrics.message_read_rate.rate, 1);
}

function testOfficialConnector() {
  const decision = evaluateOfficialConnectorActivation({
    connectorKey: "YOUTUBE_COMMENTS",
    transport: "OFFICIAL_API",
    externalWritesRequested: false,
    controlledWriteProbeApproved: false,
    readiness: {
      connector: "YOUTUBE_COMMENTS",
      officialApiVerified: true,
      requiredPermissionsVerified: true,
      quotaDocumented: true,
      webhookRequired: false,
      webhookVerified: false,
      credentialRevoked: false,
    },
  });
  assert.equal(decision.allowed, true);
  const scraper = evaluateOfficialConnectorActivation({
    connectorKey: "YOUTUBE_COMMENTS",
    transport: "UNOFFICIAL_SCRAPER",
    externalWritesRequested: false,
    controlledWriteProbeApproved: false,
    readiness: {
      connector: "YOUTUBE_COMMENTS",
      officialApiVerified: true,
      requiredPermissionsVerified: true,
      quotaDocumented: true,
      webhookRequired: false,
      webhookVerified: false,
      credentialRevoked: false,
    },
  });
  assert.equal(scraper.allowed, false);
}

function testPwa() {
  const readiness = evaluatePwaReadiness({
    manifestPresent: true,
    serviceWorkerPresent: true,
    serviceWorkerRegistered: true,
    offlineShellVerified: true,
    draftRecoveryVerified: true,
    accessibilitySmokeVerified: true,
    pushConfigured: false,
  });
  assert.equal(readiness.offlineProductivityReady, true);
  assert.equal(readiness.pushReady, false);

  const values =
    new Map<string, string>();

  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(
      key: string,
      value: string,
    ) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };

  const draft = {
    conversationId:
      "phase15-conversation",
    body:
      "Recovered unsent counselor draft.",
    revision: 3,
    savedAt:
      new Date(
        "2026-09-10T12:00:00.000Z",
      ),
    deviceId:
      "phase15-browser-device",
  };

  assert.equal(
    persistLocalDraft(
      storage,
      draft,
    ),
    true,
  );

  const recovered =
    restoreLocalDraft(
      storage,
      draft.conversationId,
      new Date(
        "2026-09-10T12:05:00.000Z",
      ).getTime(),
    );

  assert.equal(
    recovered?.body,
    draft.body,
  );

  assert.equal(
    recovered?.revision,
    draft.revision,
  );

  clearLocalDraft(
    storage,
    draft.conversationId,
  );

  assert.equal(
    restoreLocalDraft(
      storage,
      draft.conversationId,
    ),
    undefined,
  );

  const staleDraft = {
    ...draft,
    conversationId:
      "phase15-stale",
    savedAt:
      new Date(
        "2026-09-01T00:00:00.000Z",
      ),
  };

  assert.equal(
    persistLocalDraft(
      storage,
      staleDraft,
    ),
    true,
  );

  assert.equal(
    restoreLocalDraft(
      storage,
      staleDraft.conversationId,
      new Date(
        "2026-09-10T00:00:00.000Z",
      ).getTime(),
    ),
    undefined,
  );
}

function testEnterprise() {
  const secret = "sd_test_abcdefghijklmnopqrstuvwxyz123456";
  const result = authorizeEnterpriseRequest({
    activeWorkspaceId: "w1",
    resourceWorkspaceId: "w1",
    secret,
    apiKey: {
      id: "key-1",
      workspaceId: "w1",
      sha256: hashApiKey(secret),
      scopes: ["analytics.read"],
      revoked: false,
    },
    requiredScope: "analytics.read",
    limits: {
      maxSeats: 10,
      maxConnections: 5,
      maxMonthlyOutbound: 1000,
      publicApiEnabled: true,
      whiteLabelEnabled: false,
    },
    projectedUsage: { seats: 2, connections: 2, monthlyOutbound: 20 },
    windowUsed: 3,
    windowLimit: 10,
  });
  assert.equal(result.allowed, true);
}

function testReleaseExit() {
  const env: Record<string, string> = {};
  for (let phase = 10; phase <= 17; phase += 1) {
    env[`ENGAGEOS_PHASE${phase}_PRODUCTION_EVIDENCE`] = "true";
  }
  const phases = buildRemainingPhaseReadiness(env);
  const decision = evaluateReleaseExit({
    phases,
    targetMode: "SHADOW",
    evidence: {
      exactShaVerified: true,
      buildVerified: true,
      rollbackTested: true,
      monitoringActive: true,
      permissionsVerified: true,
      policyVerified: true,
      unresolvedCriticalIncidents: 0,
      unexplainedDuplicateSends: 0,
      emergencyStopActive: false,
    },
  });
  assert.equal(decision.allowed, true);
  const blocked = evaluateReleaseExit({
    phases: buildRemainingPhaseReadiness({}),
    targetMode: "SHADOW",
    evidence: {
      exactShaVerified: true,
      buildVerified: true,
      rollbackTested: true,
      monitoringActive: true,
      permissionsVerified: true,
      policyVerified: true,
      unresolvedCriticalIncidents: 0,
      unexplainedDuplicateSends: 0,
      emergencyStopActive: false,
    },
  });
  assert.equal(blocked.allowed, false);
}

testGroundedAi();
testCustomer360Merge();
testJourneyRuntime();
testAnalytics();
testOfficialConnector();
testPwa();
testEnterprise();
testReleaseExit();
console.log("EngageOS Phases 10-17 exit gates: PASS");

import assert from "node:assert/strict";

import {
  AUTHORITATIVE_METRICS,
  activeCollisionWarning,
  apiKeyAllows,
  assertMessengerPageIsolation,
  assertTenantScope,
  assertUsageWithinPlan,
  canSendMessengerText,
  canUseComposerAction,
  connectorCanActivate,
  countMetricEvents,
  decideDraftRecovery,
  deriveConnectorLifecycleStatus,
  deriveIntegrationStatus,
  evaluateIdentityMerge,
  evaluateInstagramCommentAutomation,
  evaluateJourneyDispatch,
  evaluateRolloutPromotion,
  evaluateWhatsAppOutbound,
  ingestDurableEvent,
  insideQuietHours,
  journeyEnrollmentKey,
  processNextEvent,
  publishAutomationVersion,
  retryDelayMs,
  reverseIdentityMerge,
  routeAiCandidate,
  validateAutomationGraph,
  type DeadLetterEntry,
  type DeadLetterStore,
  type DurableEventInput,
  type DurableEventStore,
  type EventJob,
  type EventQueue,
  type StoredDurableEvent,
} from "../modules";

class MemoryEventStore implements DurableEventStore {
  private readonly records = new Map<string, StoredDurableEvent>();

  async reserve(event: DurableEventInput, correlationId: string) {
    const duplicate = [...this.records.values()].find((row) => row.eventKey === event.eventKey);
    if (duplicate) return { created: false, event: duplicate };
    const stored: StoredDurableEvent = {
      ...event,
      state: "RECEIVED",
      attempts: 0,
      correlationId,
    };
    this.records.set(event.id, stored);
    return { created: true, event: stored };
  }

  async getById(eventId: string) {
    return this.records.get(eventId) ?? null;
  }

  async markQueued(eventId: string) {
    this.patch(eventId, { state: "QUEUED" });
  }

  async markProcessing(eventId: string, attempt: number) {
    this.patch(eventId, { state: "PROCESSING", attempts: attempt });
  }

  async markRetry(eventId: string, attempt: number, error: string) {
    this.patch(eventId, { state: "RETRY_WAIT", attempts: attempt, lastError: error });
  }

  async markProcessed(eventId: string, processedAt: Date) {
    this.patch(eventId, { state: "PROCESSED", processedAt });
  }

  async markDeadLetter(eventId: string, attempt: number, error: string) {
    this.patch(eventId, { state: "DEAD_LETTER", attempts: attempt, lastError: error });
  }

  private patch(eventId: string, patch: Partial<StoredDurableEvent>) {
    const current = this.records.get(eventId);
    if (!current) throw new Error("Missing event fixture.");
    this.records.set(eventId, { ...current, ...patch });
  }
}

class MemoryQueue implements EventQueue {
  readonly jobs: EventJob[] = [];

  async enqueue(job: EventJob) {
    this.jobs.push(job);
  }

  async dequeueDue(now: Date) {
    const index = this.jobs.findIndex((job) => Date.parse(job.availableAt) <= now.getTime());
    if (index < 0) return null;
    return this.jobs.splice(index, 1)[0] ?? null;
  }
}

class MemoryDeadLetters implements DeadLetterStore {
  readonly entries: DeadLetterEntry[] = [];
  async append(entry: DeadLetterEntry) {
    this.entries.push(entry);
  }
}

async function testDurableEventRuntime() {
  const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 250 };
  assert.equal(retryDelayMs(1, policy), 100);
  assert.equal(retryDelayMs(2, policy), 200);
  assert.equal(retryDelayMs(3, policy), 250);

  const store = new MemoryEventStore();
  const queue = new MemoryQueue();
  const deadLetters = new MemoryDeadLetters();
  const now = new Date("2026-09-09T10:00:00.000Z");
  const event: DurableEventInput = {
    id: "event-1",
    eventKey: "workspace:connection:message:external-1",
    workspaceId: "workspace",
    connectionId: "connection",
    channel: "WHATSAPP",
    eventType: "MESSAGE_RECEIVED",
    payload: { text: "hello" },
    occurredAt: now,
    receivedAt: now,
  };

  const first = await ingestDurableEvent({
    event,
    correlationId: "correlation-1",
    store,
    queue,
    now,
  });
  assert.equal(first.duplicate, false);

  const duplicate = await ingestDurableEvent({
    event: { ...event, id: "event-2" },
    correlationId: "correlation-2",
    store,
    queue,
    now,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(queue.jobs.length, 1);

  let calls = 0;
  const processor = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary provider failure");
  };

  assert.equal(
    await processNextEvent({ store, queue, deadLetters, processor, retryPolicy: policy, now }),
    "RETRY_SCHEDULED",
  );
  assert.equal(
    await processNextEvent({
      store,
      queue,
      deadLetters,
      processor,
      retryPolicy: policy,
      now: new Date(now.getTime() + 99),
    }),
    "IDLE",
  );
  assert.equal(
    await processNextEvent({
      store,
      queue,
      deadLetters,
      processor,
      retryPolicy: policy,
      now: new Date(now.getTime() + 100),
    }),
    "PROCESSED",
  );
  assert.equal(deadLetters.entries.length, 0);
}

async function main() {
  await testDurableEventRuntime();

  assert.equal(
    deriveIntegrationStatus({
      apiVerifiedAt: new Date(),
      webhookRequired: true,
      webhookVerifiedAt: new Date(),
      permissionsVerified: true,
    }),
    "CONNECTED",
  );
  assert.equal(
    deriveIntegrationStatus({
      apiVerifiedAt: new Date(),
      webhookRequired: true,
      permissionsVerified: true,
    }),
    "DEGRADED",
  );

  assert.equal(
    canUseComposerAction(
      { outboundText: true, outboundMedia: false, outboundTemplate: true, paused: false },
      "TEXT",
    ),
    true,
  );
  assert.equal(
    activeCollisionWarning({
      currentUserId: "a",
      editors: [{ userId: "b", displayName: "Counselor B", lastSeenAt: new Date() }],
    }),
    "Counselor B is currently viewing this conversation.",
  );

  const sessionNow = new Date("2026-09-09T12:00:00Z");
  assert.deepEqual(
    evaluateWhatsAppOutbound({
      kind: "TEXT",
      now: sessionNow,
      lastCustomerMessageAt: new Date("2026-09-09T11:30:00Z"),
      serviceWindowMs: 60 * 60 * 1000,
      approvedTemplateAvailable: false,
      capabilityEnabled: true,
      outboundPaused: false,
    }),
    { allowed: true, mode: "SESSION" },
  );

  const instagramDecision = evaluateInstagramCommentAutomation({
    commentId: "comment-1",
    commentCreatedAt: new Date("2026-09-09T11:00:00Z"),
    now: sessionNow,
    privateReplyWindowMs: 2 * 60 * 60 * 1000,
    matchedRule: true,
    complaintOrSensitive: false,
    suppressed: false,
    publicReplySupported: true,
    privateReplySupported: true,
    initialPrivateReplyAlreadySent: false,
  });
  assert.deepEqual(instagramDecision.actions, ["PUBLIC_REPLY", "PRIVATE_REPLY"]);

  assert.throws(
    () =>
      assertMessengerPageIsolation({
        configuredPageId: "page-a",
        conversationPageId: "page-b",
        outboundTextVerified: true,
        outboundPaused: false,
      }),
    /different Page/,
  );
  assert.equal(
    canSendMessengerText({
      configuredPageId: "page-a",
      conversationPageId: "page-a",
      outboundTextVerified: true,
      outboundPaused: false,
    }),
    true,
  );

  const validGraph = {
    nodes: [
      { id: "trigger", type: "TRIGGER" as const, config: {} },
      { id: "action", type: "ACTION" as const, config: { action: "SEND" } },
    ],
    edges: [{ id: "edge", from: "trigger", to: "action" }],
  };
  assert.deepEqual(validateAutomationGraph(validGraph, { maxNodes: 20, maxEdges: 40 }), []);
  assert.equal(
    publishAutomationVersion({
      automationId: "automation-1",
      version: 1,
      graph: validGraph,
      limits: { maxNodes: 20, maxEdges: 40 },
    }).version,
    1,
  );
  assert.ok(
    validateAutomationGraph(
      {
        nodes: validGraph.nodes,
        edges: [
          { id: "a", from: "trigger", to: "action" },
          { id: "b", from: "action", to: "trigger" },
        ],
      },
      { maxNodes: 20, maxEdges: 40 },
    ).some((issue) => issue.code === "CYCLE"),
  );

  assert.equal(
    routeAiCandidate(
      {
        text: "The fee is X",
        confidence: 0.99,
        factRisk: "FEE",
        sourceReferences: [],
        safetyPassed: true,
        sensitive: false,
      },
      { autoSendThreshold: 0.9, approvalThreshold: 0.7 },
    ).route,
    "HANDOFF",
  );
  assert.equal(
    routeAiCandidate(
      {
        text: "Approved answer",
        confidence: 0.95,
        factRisk: "POLICY",
        sourceReferences: ["knowledge:policy-1"],
        safetyPassed: true,
        sensitive: false,
      },
      { autoSendThreshold: 0.9, approvalThreshold: 0.7 },
    ).route,
    "AUTO_SEND",
  );

  assert.equal(
    evaluateIdentityMerge("a", "b", [
      { type: "DISPLAY_NAME", value: "Same Name", observedAt: new Date(), source: "profile" },
    ]).allowed,
    false,
  );
  const strongMerge = evaluateIdentityMerge("a", "b", [
    { type: "VERIFIED_PHONE", value: "+910000000000", observedAt: new Date(), source: "verified" },
  ]);
  assert.equal(strongMerge.allowed, true);
  assert.equal(
    reverseIdentityMerge(
      {
        id: "merge-1",
        primaryCustomerId: "a",
        mergedCustomerId: "b",
        evidence: [],
        mergedAt: new Date(),
        mergedBy: "admin",
      },
      "admin-2",
    ).reversedBy,
    "admin-2",
  );

  assert.equal(insideQuietHours(30, { startMinuteOfDay: 22 * 60, endMinuteOfDay: 8 * 60 }), true);
  assert.equal(
    evaluateJourneyDispatch({
      nowLocalMinuteOfDay: 600,
      suppressed: false,
      consentGranted: true,
      customerRespondedSinceEnrollment: true,
      stageChangedSinceEnrollment: false,
      sendsInFrequencyWindow: 0,
      maxSendsInFrequencyWindow: 3,
      scheduledAt: new Date("2026-09-09T09:00:00Z"),
      now: new Date("2026-09-09T10:00:00Z"),
    }).allowed,
    false,
  );
  assert.equal(journeyEnrollmentKey("journey 1", "customer 1"), "journey%201:customer%201");

  const failureDefinition = AUTHORITATIVE_METRICS.find((item) => item.key === "message_failure_rate");
  assert.ok(failureDefinition);
  assert.deepEqual(
    countMetricEvents(
      [
        { type: "MESSAGE_SENT", workspaceId: "w", occurredAt: new Date() },
        { type: "MESSAGE_SENT", workspaceId: "w", occurredAt: new Date() },
        { type: "MESSAGE_FAILED", workspaceId: "w", occurredAt: new Date() },
      ],
      failureDefinition,
      "w",
    ),
    { numerator: 1, denominator: 2, rate: 0.5 },
  );

  const connector = {
    connector: "YOUTUBE_COMMENTS",
    officialApiVerified: true,
    requiredPermissionsVerified: true,
    quotaDocumented: true,
    webhookRequired: false,
    webhookVerified: false,
    credentialRevoked: false,
  };
  assert.equal(deriveConnectorLifecycleStatus(connector), "VERIFIED");
  assert.equal(connectorCanActivate(connector), true);

  const draft = {
    conversationId: "conversation-1",
    body: "newer",
    revision: 2,
    savedAt: new Date(),
    deviceId: "device-a",
  };
  assert.equal(
    decideDraftRecovery({
      local: draft,
      server: { ...draft, body: "older", revision: 1, deviceId: "server" },
    }).action,
    "RESTORE_LOCAL",
  );

  assert.doesNotThrow(() =>
    assertUsageWithinPlan(
      {
        maxSeats: 10,
        maxConnections: 5,
        maxMonthlyOutbound: 1000,
        publicApiEnabled: true,
        whiteLabelEnabled: false,
      },
      { seats: 3, connections: 2, monthlyOutbound: 100 },
    ),
  );
  assert.throws(() => assertTenantScope("workspace-a", "workspace-b"), /Cross-tenant/);
  assert.equal(apiKeyAllows(["contacts.read"], "contacts.read"), true);

  const releaseEvidence = {
    exactShaVerified: true,
    buildVerified: true,
    rollbackTested: true,
    monitoringActive: true,
    permissionsVerified: true,
    policyVerified: true,
    unresolvedCriticalIncidents: 0,
    unexplainedDuplicateSends: 0,
    emergencyStopActive: false,
  };
  assert.equal(
    evaluateRolloutPromotion({
      currentMode: "SHADOW",
      targetMode: "APPROVAL_ONLY",
      evidence: releaseEvidence,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateRolloutPromotion({
      currentMode: "SHADOW",
      targetMode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
      evidence: releaseEvidence,
    }).allowed,
    false,
  );

  console.log("EngageOS phases 3-17 foundation tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

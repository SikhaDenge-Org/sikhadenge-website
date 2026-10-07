import assert from "node:assert/strict";

import {
  assertGroundedHighRiskAnswer,
  buildCustomer360,
  computeOperationalHealth,
  legacyLinearFlowToGraph,
  signOutboundWebhook,
  validateKnowledgeGrounding,
  validateLegacyFlowForGraphMigration,
  verifyOutboundWebhookSignature,
} from "../modules";

function main() {
  const legacy = [
    { id: "t", kind: "TRIGGER" as const, type: "INCOMING_KEYWORD", config: { keyword: "AI" } },
    { id: "a", kind: "ACTION" as const, type: "SEND_TEXT", config: { text: "Hello" } },
    { id: "e", kind: "ACTION" as const, type: "END", config: {} },
  ];
  const graph = legacyLinearFlowToGraph(legacy);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(validateLegacyFlowForGraphMigration(legacy), []);

  const grounding = validateKnowledgeGrounding({
    references: [{ id: "policy-1", status: "APPROVED" }],
  });
  assert.equal(grounding.valid, true);
  assert.doesNotThrow(() => assertGroundedHighRiskAnswer({ highRisk: true, grounding }));
  assert.throws(
    () =>
      assertGroundedHighRiskAnswer({
        highRisk: true,
        grounding: validateKnowledgeGrounding({ references: [{ id: "draft", status: "DRAFT" }] }),
      }),
    /approved knowledge/,
  );

  const customer = buildCustomer360({
    customerId: "customer-1",
    identities: [
      { channel: "WHATSAPP", connectionId: "wa-1", externalUserId: "u-1", verified: true },
      { channel: "WHATSAPP", connectionId: "wa-1", externalUserId: "u-1", verified: true },
    ],
    activities: [
      { id: "old", type: "MESSAGE", occurredAt: new Date("2026-09-08T10:00:00Z"), summary: "Older" },
      { id: "new", type: "MESSAGE", occurredAt: new Date("2026-09-09T10:00:00Z"), summary: "Newer" },
    ],
  });
  assert.equal(customer.identities.length, 1);
  assert.equal(customer.timeline[0]?.id, "new");

  const health = computeOperationalHealth({
    webhookReceived: 100,
    webhookFailed: 1,
    outboundSent: 50,
    outboundFailed: 0,
    queueLagSamplesMs: [100, 200, 300],
    deadLetterCount: 0,
  });
  assert.equal(health.degraded, false);

  const secret = "0123456789abcdef0123456789abcdef";
  const timestamp = 1_789_000_000_000;
  const body = JSON.stringify({ event: "test" });
  const signature = signOutboundWebhook({ secret, timestamp, body });
  assert.equal(
    verifyOutboundWebhookSignature({
      secret,
      timestamp,
      body,
      signature,
      now: timestamp + 1000,
    }),
    true,
  );
  assert.equal(
    verifyOutboundWebhookSignature({
      secret,
      timestamp,
      body: `${body}tampered`,
      signature,
      now: timestamp + 1000,
    }),
    false,
  );

  console.log("EngageOS migration bridge tests passed.");
}

main();

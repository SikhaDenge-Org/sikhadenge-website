import assert from "node:assert/strict";

import {
  evaluateOutboundApproval,
  OUTBOUND_APPROVAL_MAX_TTL_MS,
  type ControlledLaunchOutboundApprovalRecord,
  type OutboundApprovalContext,
} from "../modules/release/application/controlled-launch-outbound-approval";

const context: OutboundApprovalContext = {
  workspaceId: "workspace-a",
  connectionId: "whatsapp:12345",
  messageId: "message-1",
  contentFingerprint: "fingerprint-a",
  controlledLaunchStateVersion: 7,
};

function approval(
  overrides: Partial<ControlledLaunchOutboundApprovalRecord> = {},
): ControlledLaunchOutboundApprovalRecord {
  return {
    id: "approval-1",
    workspaceId: context.workspaceId,
    connectionId: context.connectionId,
    messageId: context.messageId,
    contentFingerprint: context.contentFingerprint,
    controlledLaunchStateVersion: context.controlledLaunchStateVersion,
    approvedByUserId: "admin-1",
    reason: "Approve one canary message",
    approvedAt: new Date("2026-09-16T10:00:00.000Z"),
    expiresAt: new Date("2026-09-16T10:10:00.000Z"),
    consumedAt: null,
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
    createdAt: new Date("2026-09-16T10:00:00.000Z"),
    ...overrides,
  };
}

function expectDenied(
  result: ReturnType<typeof evaluateOutboundApproval>,
  code: string,
): void {
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("Expected approval denial.");
  assert.equal(result.code, code);
}

function testMissingApprovalFailsClosed() {
  expectDenied(
    evaluateOutboundApproval({ context, approval: null, now: new Date("2026-09-16T10:05:00.000Z") }),
    "APPROVAL_MISSING",
  );
}

function testScopeIsMessageSpecific() {
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ messageId: "message-other" }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_SCOPE_MISMATCH",
  );
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ connectionId: "whatsapp:other" }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_SCOPE_MISMATCH",
  );
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ workspaceId: "workspace-b" }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_SCOPE_MISMATCH",
  );
}

function testContentMutationInvalidatesApproval() {
  expectDenied(evaluateOutboundApproval({ context, approval: approval({ contentFingerprint: "fingerprint-mutated" }), now: new Date("2026-09-16T10:05:00.000Z") }), "APPROVAL_CONTENT_MISMATCH");
}

function testLaunchStateTransitionInvalidatesApproval() {
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ controlledLaunchStateVersion: 6 }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_STATE_VERSION_MISMATCH",
  );
}

function testExpiryRevocationAndConsumptionFailClosed() {
  expectDenied(
    evaluateOutboundApproval({ context, approval: approval(), now: new Date("2026-09-16T10:10:00.000Z") }),
    "APPROVAL_EXPIRED",
  );
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ revokedAt: new Date("2026-09-16T10:03:00.000Z") }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_REVOKED",
  );
  expectDenied(
    evaluateOutboundApproval({
      context,
      approval: approval({ consumedAt: new Date("2026-09-16T10:04:00.000Z") }),
      now: new Date("2026-09-16T10:05:00.000Z"),
    }),
    "APPROVAL_CONSUMED",
  );
}

function testExactActiveProofAllows() {
  const result = evaluateOutboundApproval({
    context,
    approval: approval(),
    now: new Date("2026-09-16T10:05:00.000Z"),
  });
  assert.equal(result.allowed, true);
  if (!result.allowed) throw new Error("Expected active approval.");
  assert.equal(result.approvalId, "approval-1");
}

function testTtlPolicyIsBounded() {
  assert.equal(OUTBOUND_APPROVAL_MAX_TTL_MS, 30 * 60 * 1_000);
}

function main() {
  testMissingApprovalFailsClosed();
  testScopeIsMessageSpecific();
  testContentMutationInvalidatesApproval();
  testLaunchStateTransitionInvalidatesApproval();
  testExpiryRevocationAndConsumptionFailClosed();
  testExactActiveProofAllows();
  testTtlPolicyIsBounded();
  console.log("EngageOS Phase17-G2 persisted outbound approval: PASS");
}

main();

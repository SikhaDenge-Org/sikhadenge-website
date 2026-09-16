import assert from "node:assert/strict";

import { sendMetaWhatsAppMessage } from "../lib/meta/outbound-client";
import type { PreparedMetaMessage } from "../lib/outbound/types";
import {
  assertWhatsAppProviderConnectionBinding,
  assertWhatsAppProviderRecipientBinding,
  ControlledLaunchOutboundDeniedError,
  evaluateControlledLaunchOutbound,
  type ControlledLaunchOutboundContext,
} from "../modules/release/application/controlled-launch-outbound-guard";
import type { ControlledLaunchStateRecord } from "../modules/release/application/controlled-launch-state";

const context: ControlledLaunchOutboundContext = {
  workspaceId: "workspace-a",
  connectionId: "whatsapp:12345",
  channel: "WHATSAPP",
  action: "OUTBOUND_QUEUED",
  messageId: "message-1",
  recipientKey: "919999999999",
};

function state(
  overrides: Partial<ControlledLaunchStateRecord> = {},
): ControlledLaunchStateRecord {
  return {
    id: "state-1",
    workspaceId: "workspace-a",
    stage: "ONE_CONNECTED_ACCOUNT",
    mode: "APPROVAL_ONLY",
    writePolicy: "HUMAN_APPROVAL_REQUIRED",
    externalWritesAllowed: true,
    scope: {
      workspaceId: "workspace-a",
      connectedAccountIds: ["whatsapp:12345"],
      instagramAssetIds: [],
      automationIds: [],
      counselorGroupIds: [],
      enabledChannels: ["WHATSAPP"],
      maxRealLeads: 0,
      externalWritesRequested: true,
    },
    version: 2,
    activatedAt: new Date("2026-09-16T00:00:00.000Z"),
    updatedAt: new Date("2026-09-16T00:00:00.000Z"),
    ...overrides,
  };
}

function expectDenied(
  decision: ReturnType<typeof evaluateControlledLaunchOutbound>,
  code: string,
): void {
  assert.equal(decision.allowed, false);
  if (decision.allowed) throw new Error("Expected controlled-launch denial.");
  assert.equal(decision.code, code);
}

function testMissingStateFailsClosed() {
  expectDenied(
    evaluateControlledLaunchOutbound({ context, state: null }),
    "CONTROLLED_LAUNCH_STATE_MISSING",
  );
}

function testShadowFailsClosed() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        mode: "SHADOW",
        writePolicy: "NO_EXTERNAL_WRITES",
        externalWritesAllowed: false,
        scope: {
          ...state().scope,
          externalWritesRequested: false,
        },
      }),
    }),
    "CONTROLLED_LAUNCH_SHADOW",
  );
}

function testExternalWritesFlagCannotBeBypassed() {
  const previous = process.env.WHATSAPP_OUTBOUND_MODE;
  process.env.WHATSAPP_OUTBOUND_MODE = "live";
  try {
    expectDenied(
      evaluateControlledLaunchOutbound({
        context,
        state: state({ externalWritesAllowed: false }),
      }),
      "CONTROLLED_LAUNCH_EXTERNAL_WRITES_DISABLED",
    );
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_OUTBOUND_MODE;
    else process.env.WHATSAPP_OUTBOUND_MODE = previous;
  }
}

function testWorkspaceScopeMismatchFailsClosed() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        scope: { ...state().scope, workspaceId: "workspace-b" },
      }),
    }),
    "CONTROLLED_LAUNCH_WORKSPACE_MISMATCH",
  );
}

function testChannelMustBeExplicitlyScoped() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        scope: { ...state().scope, enabledChannels: ["INSTAGRAM"] },
      }),
    }),
    "CONTROLLED_LAUNCH_CHANNEL_NOT_SCOPED",
  );
}

function testConnectionMustBeExplicitlyScoped() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        scope: { ...state().scope, connectedAccountIds: ["whatsapp:other"] },
      }),
    }),
    "CONTROLLED_LAUNCH_CONNECTION_NOT_SCOPED",
  );
}

function testPersistedKillSwitchWins() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state(),
      killSwitches: [
        {
          id: "kill-1",
          workspaceId: "workspace-a",
          scopeType: "CONNECTION",
          channel: "WHATSAPP",
          connectionId: "whatsapp:12345",
          blockedActions: ["OUTBOUND_QUEUED"],
          reason: "emergency stop",
        },
      ],
    }),
    "CONTROLLED_LAUNCH_KILL_SWITCH_ACTIVE",
  );
}

function testApprovalOnlyRequiresPersistedApproval() {
  expectDenied(
    evaluateControlledLaunchOutbound({ context, state: state() }),
    "CONTROLLED_LAUNCH_APPROVAL_REQUIRED",
  );
}

function testBoundedAutopilotRequiresEnforcedRuntimeCap() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        stage: "LIMITED_REAL_LEADS",
        mode: "LIMITED_AUTOPILOT",
        writePolicy: "BOUNDED_AUTOPILOT",
        scope: {
          ...state().scope,
          maxRealLeads: 10,
        },
      }),
    }),
    "CONTROLLED_LAUNCH_BOUNDED_SCOPE_ENFORCEMENT_REQUIRED",
  );
}


function testBoundedAutopilotAllowsWhenRuntimeCapIsVerified() {
  const decision = evaluateControlledLaunchOutbound({
    context,
    state: state({
      stage: "LIMITED_REAL_LEADS",
      mode: "LIMITED_AUTOPILOT",
      writePolicy: "BOUNDED_AUTOPILOT",
      scope: { ...state().scope, maxRealLeads: 10 },
    }),
    boundedScopeVerified: true,
  });
  assert.equal(decision.allowed, true);
}
function testApprovedFlowsRequireAuthoritativeFlowProof() {
  expectDenied(
    evaluateControlledLaunchOutbound({
      context,
      state: state({
        stage: "STABLE_FULL_ROLLOUT",
        mode: "FULL_AUTOPILOT_FOR_APPROVED_FLOWS",
        writePolicy: "APPROVED_FLOWS_ONLY",
      }),
    }),
    "CONTROLLED_LAUNCH_APPROVED_FLOW_PROOF_REQUIRED",
  );
}

function testProviderConnectionBinding() {
  assert.doesNotThrow(() =>
    assertWhatsAppProviderConnectionBinding(context, "12345"),
  );
  assert.throws(
    () => assertWhatsAppProviderConnectionBinding(context, "99999"),
    (error: unknown) =>
      error instanceof ControlledLaunchOutboundDeniedError &&
      error.code === "CONTROLLED_LAUNCH_PROVIDER_CONNECTION_MISMATCH",
  );
}


function testProviderRecipientBinding() {
  assert.doesNotThrow(() => assertWhatsAppProviderRecipientBinding(context, "+91 99999 99999"));
  assert.throws(
    () => assertWhatsAppProviderRecipientBinding(context, "918888888888"),
    (error: unknown) => error instanceof ControlledLaunchOutboundDeniedError,
  );
}
async function testProviderBoundaryRejectsBeforeNetworkIo() {
  const keys = [
    "WHATSAPP_OUTBOUND_MODE",
    "WHATSAPP_CUTOVER_APPROVED",
    "WHATSAPP_OUTBOUND_LIVE_ACK",
    "WHATSAPP_OUTBOUND_KILL_SWITCH",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_GRAPH_VERSION",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  process.env.WHATSAPP_OUTBOUND_MODE = "live";
  process.env.WHATSAPP_CUTOVER_APPROVED = "true";
  process.env.WHATSAPP_OUTBOUND_LIVE_ACK = "I_UNDERSTAND_LIVE_WHATSAPP_SENDS";
  process.env.WHATSAPP_OUTBOUND_KILL_SWITCH = "off";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token-never-used";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "99999";
  process.env.WHATSAPP_GRAPH_VERSION = "v99.0";
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Network must not be reached by this test.");
  }) as typeof fetch;

  const payload: PreparedMetaMessage = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "919999999999",
    type: "text",
    text: { preview_url: false, body: "guard test" },
  };

  try {
    await assert.rejects(
      () => sendMetaWhatsAppMessage(payload, context),
      (error: unknown) =>
        error instanceof ControlledLaunchOutboundDeniedError &&
        error.code === "CONTROLLED_LAUNCH_PROVIDER_CONNECTION_MISMATCH",
    );
    assert.equal(fetchCalls, 0, "provider guard must deny before any Meta network call");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  testMissingStateFailsClosed();
  testShadowFailsClosed();
  testExternalWritesFlagCannotBeBypassed();
  testWorkspaceScopeMismatchFailsClosed();
  testChannelMustBeExplicitlyScoped();
  testConnectionMustBeExplicitlyScoped();
  testPersistedKillSwitchWins();
  testApprovalOnlyRequiresPersistedApproval();
  testBoundedAutopilotRequiresEnforcedRuntimeCap();
  testBoundedAutopilotAllowsWhenRuntimeCapIsVerified();
  testApprovedFlowsRequireAuthoritativeFlowProof();
  testProviderConnectionBinding();
  testProviderRecipientBinding();
  await testProviderBoundaryRejectsBeforeNetworkIo();

  console.log("EngageOS Phase17-G1 controlled-launch outbound guard: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

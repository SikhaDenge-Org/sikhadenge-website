import assert from "node:assert/strict";

import type {
  ControlledLaunchEvidence,
  ControlledLaunchScope,
} from "../modules/release/application/controlled-launch";
import {
  bootstrapStage1ControlledLaunch,
  ControlledLaunchVersionConflictError,
  getControlledLaunchState,
  transitionControlledLaunchState,
  type ControlledLaunchStateRecord,
  type ControlledLaunchStateRepository,
  type ControlledLaunchTransitionRecord,
  type ControlledLaunchTransitionInput,
  type InitialControlledLaunchStateInput,
} from "../modules/release/application/controlled-launch-state";

const completeEvidence: ControlledLaunchEvidence = {
  exactShaVerified: true,
  buildVerified: true,
  rollbackTested: true,
  monitoringActive: true,
  permissionsVerified: true,
  policyVerified: true,
  unresolvedCriticalIncidents: 0,
  unexplainedDuplicateSends: 0,
  emergencyStopActive: false,
  scopeApproved: true,
  smokeTestVerified: true,
  supportRunbookActive: true,
  observationWindowComplete: true,
  humanApprovalEnforced: true,
  boundedAutopilotApproved: true,
  approvedFlowsOnlyEnforced: true,
  productionEvidenceRecorded: false,
};

function copyState(state: ControlledLaunchStateRecord): ControlledLaunchStateRecord {
  return {
    ...state,
    scope: {
      ...state.scope,
      connectedAccountIds: [...state.scope.connectedAccountIds],
      instagramAssetIds: [...state.scope.instagramAssetIds],
      automationIds: [...state.scope.automationIds],
      counselorGroupIds: [...state.scope.counselorGroupIds],
      enabledChannels: [...state.scope.enabledChannels],
    },
  };
}

class MemoryRepository implements ControlledLaunchStateRepository {
  states = new Map<string, ControlledLaunchStateRecord>();
  transitions: ControlledLaunchTransitionRecord[] = [];
  sequence = 0;

  async getState(workspaceId: string) {
    const state = this.states.get(workspaceId);
    return state ? copyState(state) : null;
  }

  async createInitialState(input: InitialControlledLaunchStateInput) {
    const existing = this.states.get(input.workspaceId);
    if (existing) return { created: false, state: copyState(existing) };

    this.sequence += 1;
    const now = new Date(`2026-09-13T00:00:${String(this.sequence).padStart(2, "0")}.000Z`);
    const state: ControlledLaunchStateRecord = {
      id: `state-${this.sequence}`,
      workspaceId: input.workspaceId,
      stage: input.stage,
      mode: input.mode,
      writePolicy: input.writePolicy,
      externalWritesAllowed: input.externalWritesAllowed,
      scope: input.scope,
      version: 1,
      activatedAt: now,
      updatedAt: now,
    };
    this.states.set(input.workspaceId, copyState(state));
    this.transitions.push({
      id: `transition-${this.sequence}`,
      workspaceId: input.workspaceId,
      stateId: state.id,
      fromStage: null,
      toStage: input.stage,
      fromMode: null,
      toMode: input.mode,
      fromWritePolicy: null,
      toWritePolicy: input.writePolicy,
      fromExternalWritesAllowed: null,
      toExternalWritesAllowed: input.externalWritesAllowed,
      expectedVersion: null,
      resultingVersion: 1,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      scope: input.scope,
      createdAt: now,
    });
    return { created: true, state: copyState(state) };
  }

  async transitionState(input: ControlledLaunchTransitionInput) {
    const current = this.states.get(input.workspaceId);
    if (!current) throw new Error("missing state");
    if (current.version !== input.expectedVersion) {
      throw new ControlledLaunchVersionConflictError();
    }

    this.sequence += 1;
    const now = new Date(`2026-09-13T00:01:${String(this.sequence).padStart(2, "0")}.000Z`);
    const next: ControlledLaunchStateRecord = {
      ...current,
      stage: input.stage,
      mode: input.mode,
      writePolicy: input.writePolicy,
      externalWritesAllowed: input.externalWritesAllowed,
      scope: input.scope,
      version: current.version + 1,
      updatedAt: now,
    };
    this.states.set(input.workspaceId, copyState(next));
    this.transitions.push({
      id: `transition-${this.sequence}`,
      workspaceId: input.workspaceId,
      stateId: current.id,
      fromStage: current.stage,
      toStage: input.stage,
      fromMode: current.mode,
      toMode: input.mode,
      fromWritePolicy: current.writePolicy,
      toWritePolicy: input.writePolicy,
      fromExternalWritesAllowed: current.externalWritesAllowed,
      toExternalWritesAllowed: input.externalWritesAllowed,
      expectedVersion: input.expectedVersion,
      resultingVersion: next.version,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      scope: input.scope,
      createdAt: now,
    });
    return copyState(next);
  }

  async listTransitions(workspaceId: string) {
    return this.transitions.filter((item) => item.workspaceId === workspaceId).map((item) => ({ ...item }));
  }
}

function scope(workspaceId: string, overrides: Partial<ControlledLaunchScope> = {}): ControlledLaunchScope {
  return {
    workspaceId,
    connectedAccountIds: [],
    instagramAssetIds: [],
    automationIds: [],
    counselorGroupIds: [],
    enabledChannels: [],
    maxRealLeads: 0,
    externalWritesRequested: false,
    ...overrides,
  };
}

async function testStage1BootstrapIsFailClosedAndIdempotent() {
  const repo = new MemoryRepository();
  const first = await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
    actorUserId: "admin-1",
  });

  assert.equal(first.created, true);
  assert.equal(first.state.stage, "INTERNAL_TEST_IDENTITIES");
  assert.equal(first.state.mode, "SHADOW");
  assert.equal(first.state.writePolicy, "NO_EXTERNAL_WRITES");
  assert.equal(first.state.externalWritesAllowed, false);
  assert.equal(first.state.scope.externalWritesRequested, false);
  assert.equal(first.state.scope.maxRealLeads, 0);
  assert.equal(first.state.version, 1);
  assert.equal(repo.transitions.length, 1);

  const second = await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
    actorUserId: "admin-2",
  });
  assert.equal(second.created, false);
  assert.equal(second.state.id, first.state.id);
  assert.equal(second.state.version, 1);
  assert.equal(repo.transitions.length, 1, "idempotent bootstrap must not append duplicate history");
}

async function testTenantIsolation() {
  const repo = new MemoryRepository();
  await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
  });

  await assert.rejects(
    () => getControlledLaunchState(repo, {
      activeWorkspaceId: "workspace-b",
      workspaceId: "workspace-a",
    }),
    /cross-tenant/i,
  );

  await assert.rejects(
    () => transitionControlledLaunchState(repo, {
      activeWorkspaceId: "workspace-a",
      workspaceId: "workspace-a",
      expectedVersion: 1,
      targetStage: "ONE_CONNECTED_ACCOUNT",
      targetMode: "SHADOW",
      scope: scope("workspace-b", { connectedAccountIds: ["account-1"] }),
      evidence: completeEvidence,
      reason: "cross-tenant attempt",
    }),
    /cross-tenant/i,
  );
}

async function testOptimisticConcurrencyAndImmutableHistory() {
  const repo = new MemoryRepository();
  await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
    actorUserId: "admin-1",
  });

  const initialHistory = JSON.stringify(await repo.listTransitions("workspace-a"));

  const promoted = await transitionControlledLaunchState(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
    actorUserId: "admin-1",
    expectedVersion: 1,
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope: scope("workspace-a", { connectedAccountIds: ["account-1"] }),
    evidence: completeEvidence,
    reason: "Approve one connected-account canary",
  });

  assert.equal(promoted.version, 2);
  assert.equal(promoted.stage, "ONE_CONNECTED_ACCOUNT");
  assert.equal(promoted.mode, "SHADOW");
  assert.equal(promoted.externalWritesAllowed, false);
  assert.equal(repo.transitions.length, 2);
  assert.equal(JSON.stringify(repo.transitions.slice(0, 1)), initialHistory, "prior transition must remain immutable");

  await assert.rejects(
    () => transitionControlledLaunchState(repo, {
      activeWorkspaceId: "workspace-a",
      workspaceId: "workspace-a",
      actorUserId: "admin-2",
      expectedVersion: 1,
      targetStage: "ONE_CONNECTED_ACCOUNT",
      targetMode: "APPROVAL_ONLY",
      scope: scope("workspace-a", { connectedAccountIds: ["account-1"], externalWritesRequested: true }),
      evidence: completeEvidence,
      reason: "stale writer",
    }),
    (error: unknown) => error instanceof ControlledLaunchVersionConflictError,
  );
  assert.equal(repo.transitions.length, 2, "stale writer must not append history");
}

async function testShadowCannotEverEnableWrites() {
  const repo = new MemoryRepository();
  await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
  });

  await assert.rejects(
    () => transitionControlledLaunchState(repo, {
      activeWorkspaceId: "workspace-a",
      workspaceId: "workspace-a",
      expectedVersion: 1,
      targetStage: "ONE_CONNECTED_ACCOUNT",
      targetMode: "SHADOW",
      scope: scope("workspace-a", {
        connectedAccountIds: ["account-1"],
        externalWritesRequested: true,
      }),
      evidence: completeEvidence,
      reason: "unsafe write request",
    }),
    /cannot request external writes/i,
  );

  const current = await repo.getState("workspace-a");
  assert.equal(current?.version, 1);
  assert.equal(current?.externalWritesAllowed, false);
  assert.equal(repo.transitions.length, 1);
}

async function testModePromotionDerivesWritePermissionFromPolicy() {
  const repo = new MemoryRepository();
  await bootstrapStage1ControlledLaunch(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
  });

  const promoted = await transitionControlledLaunchState(repo, {
    activeWorkspaceId: "workspace-a",
    workspaceId: "workspace-a",
    expectedVersion: 1,
    targetStage: "INTERNAL_TEST_IDENTITIES",
    targetMode: "APPROVAL_ONLY",
    scope: scope("workspace-a", { externalWritesRequested: true }),
    evidence: completeEvidence,
    reason: "Enable human-approved write path only",
  });

  assert.equal(promoted.mode, "APPROVAL_ONLY");
  assert.equal(promoted.writePolicy, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(promoted.externalWritesAllowed, true);
  assert.equal(promoted.version, 2);
}

async function main() {
  await testStage1BootstrapIsFailClosedAndIdempotent();
  await testTenantIsolation();
  await testOptimisticConcurrencyAndImmutableHistory();
  await testShadowCannotEverEnableWrites();
  await testModePromotionDerivesWritePermissionFromPolicy();

  console.log("EngageOS Phase17 controlled launch persistence: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

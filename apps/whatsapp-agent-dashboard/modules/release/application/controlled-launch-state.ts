import {
  evaluateControlledLaunchPromotion,
  type ControlledLaunchEvidence,
  type ControlledLaunchScope,
  type ControlledLaunchStage,
  type ControlledWritePolicy,
} from "@/modules/release/application/controlled-launch";
import type { RolloutMode } from "@/modules/release/domain/rollout-policy";
import { assertTenantScope } from "@/modules/saas/domain/tenant-plan";

export type ControlledLaunchStateRecord = {
  id: string;
  workspaceId: string;
  stage: ControlledLaunchStage;
  mode: RolloutMode;
  writePolicy: ControlledWritePolicy;
  externalWritesAllowed: boolean;
  scope: ControlledLaunchScope;
  version: number;
  activatedAt: Date;
  updatedAt: Date;
};

export type ControlledLaunchTransitionRecord = {
  id: string;
  workspaceId: string;
  stateId: string;
  fromStage: ControlledLaunchStage | null;
  toStage: ControlledLaunchStage;
  fromMode: RolloutMode | null;
  toMode: RolloutMode;
  fromWritePolicy: ControlledWritePolicy | null;
  toWritePolicy: ControlledWritePolicy;
  fromExternalWritesAllowed: boolean | null;
  toExternalWritesAllowed: boolean;
  expectedVersion: number | null;
  resultingVersion: number;
  actorUserId: string | null;
  reason: string;
  scope: ControlledLaunchScope;
  createdAt: Date;
};

export type InitialControlledLaunchStateInput = {
  workspaceId: string;
  actorUserId?: string | null;
  reason: string;
  stage: "INTERNAL_TEST_IDENTITIES";
  mode: "SHADOW";
  writePolicy: "NO_EXTERNAL_WRITES";
  externalWritesAllowed: false;
  scope: ControlledLaunchScope;
};

export type ControlledLaunchTransitionInput = {
  workspaceId: string;
  actorUserId?: string | null;
  reason: string;
  expectedVersion: number;
  stage: ControlledLaunchStage;
  mode: RolloutMode;
  writePolicy: ControlledWritePolicy;
  externalWritesAllowed: boolean;
  scope: ControlledLaunchScope;
};

export interface ControlledLaunchStateRepository {
  getState(workspaceId: string): Promise<ControlledLaunchStateRecord | null>;
  createInitialState(
    input: InitialControlledLaunchStateInput,
  ): Promise<{ created: boolean; state: ControlledLaunchStateRecord }>;
  transitionState(
    input: ControlledLaunchTransitionInput,
  ): Promise<ControlledLaunchStateRecord>;
  listTransitions?(workspaceId: string): Promise<readonly ControlledLaunchTransitionRecord[]>;
}

export class ControlledLaunchVersionConflictError extends Error {
  readonly code = "CONTROLLED_LAUNCH_VERSION_CONFLICT";

  constructor(message = "Controlled launch state changed before this transition could be applied.") {
    super(message);
    this.name = "ControlledLaunchVersionConflictError";
  }
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function normalizeReason(reason: string): string {
  const normalized = requireText(reason, "reason");
  if (normalized.length > 500) {
    throw new Error("reason must be 500 characters or fewer.");
  }
  return normalized;
}

function assertValidVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("expectedVersion must be a positive integer.");
  }
}

export function buildStage1ShadowScope(workspaceId: string): ControlledLaunchScope {
  return {
    workspaceId: requireText(workspaceId, "workspaceId"),
    connectedAccountIds: [],
    instagramAssetIds: [],
    automationIds: [],
    counselorGroupIds: [],
    enabledChannels: [],
    maxRealLeads: 0,
    externalWritesRequested: false,
  };
}

export async function getControlledLaunchState(
  repository: ControlledLaunchStateRepository,
  input: { activeWorkspaceId: string; workspaceId: string },
): Promise<ControlledLaunchStateRecord | null> {
  const activeWorkspaceId = requireText(input.activeWorkspaceId, "activeWorkspaceId");
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  assertTenantScope(activeWorkspaceId, workspaceId);

  const state = await repository.getState(workspaceId);
  if (state) assertTenantScope(workspaceId, state.workspaceId);
  return state;
}

export async function bootstrapStage1ControlledLaunch(
  repository: ControlledLaunchStateRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    actorUserId?: string | null;
    reason?: string;
  },
): Promise<{ created: boolean; state: ControlledLaunchStateRecord }> {
  const activeWorkspaceId = requireText(input.activeWorkspaceId, "activeWorkspaceId");
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  assertTenantScope(activeWorkspaceId, workspaceId);

  const current = await repository.getState(workspaceId);
  if (current) {
    assertTenantScope(workspaceId, current.workspaceId);
    return { created: false, state: current };
  }

  const scope = buildStage1ShadowScope(workspaceId);
  return repository.createInitialState({
    workspaceId,
    actorUserId: input.actorUserId ?? null,
    reason: normalizeReason(input.reason ?? "Phase17 Stage1 SHADOW state bootstrap"),
    stage: "INTERNAL_TEST_IDENTITIES",
    mode: "SHADOW",
    writePolicy: "NO_EXTERNAL_WRITES",
    externalWritesAllowed: false,
    scope,
  });
}

export async function transitionControlledLaunchState(
  repository: ControlledLaunchStateRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    actorUserId?: string | null;
    reason: string;
    expectedVersion: number;
    targetStage: ControlledLaunchStage;
    targetMode: RolloutMode;
    scope: ControlledLaunchScope;
    evidence: ControlledLaunchEvidence;
  },
): Promise<ControlledLaunchStateRecord> {
  const activeWorkspaceId = requireText(input.activeWorkspaceId, "activeWorkspaceId");
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  assertTenantScope(activeWorkspaceId, workspaceId);
  assertTenantScope(workspaceId, requireText(input.scope.workspaceId, "scope.workspaceId"));
  assertValidVersion(input.expectedVersion);

  const current = await repository.getState(workspaceId);
  if (!current) throw new Error("Controlled launch state has not been bootstrapped.");
  assertTenantScope(workspaceId, current.workspaceId);

  if (current.version !== input.expectedVersion) {
    throw new ControlledLaunchVersionConflictError();
  }

  const decision = evaluateControlledLaunchPromotion({
    currentStage: current.stage,
    currentMode: current.mode,
    targetStage: input.targetStage,
    targetMode: input.targetMode,
    scope: input.scope,
    evidence: input.evidence,
  });

  if (!decision.allowed) {
    throw new Error(`Controlled launch transition denied: ${decision.reason}`);
  }

  const externalWritesAllowed =
    decision.writePolicy !== "NO_EXTERNAL_WRITES" &&
    input.scope.externalWritesRequested;

  if (input.targetMode === "SHADOW" && externalWritesAllowed) {
    throw new Error("SHADOW mode must never permit external writes.");
  }

  return repository.transitionState({
    workspaceId,
    actorUserId: input.actorUserId ?? null,
    reason: normalizeReason(input.reason),
    expectedVersion: input.expectedVersion,
    stage: decision.targetStage,
    mode: decision.targetMode,
    writePolicy: decision.writePolicy,
    externalWritesAllowed,
    scope: input.scope,
  });
}

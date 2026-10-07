import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  CONTROLLED_LAUNCH_STAGES,
  type ControlledLaunchScope,
  type ControlledLaunchStage,
  type ControlledWritePolicy,
} from "@/modules/release/application/controlled-launch";
import {
  ControlledLaunchVersionConflictError,
  type ControlledLaunchStateRecord,
  type ControlledLaunchStateRepository,
  type ControlledLaunchTransitionRecord,
  type ControlledLaunchTransitionInput,
  type InitialControlledLaunchStateInput,
} from "@/modules/release/application/controlled-launch-state";
import { ROLLOUT_MODES, type RolloutMode } from "@/modules/release/domain/rollout-policy";

const WRITE_POLICIES = [
  "NO_EXTERNAL_WRITES",
  "HUMAN_APPROVAL_REQUIRED",
  "BOUNDED_AUTOPILOT",
  "APPROVED_FLOWS_ONLY",
] as const satisfies readonly ControlledWritePolicy[];

type RawState = {
  id: string;
  workspaceId: string;
  stage: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  scope: unknown;
  version: number;
  activatedAt: Date;
  updatedAt: Date;
};

type RawTransition = {
  id: string;
  workspaceId: string;
  stateId: string;
  fromStage: string | null;
  toStage: string;
  fromMode: string | null;
  toMode: string;
  fromWritePolicy: string | null;
  toWritePolicy: string;
  fromExternalWritesAllowed: boolean | null;
  toExternalWritesAllowed: boolean;
  expectedVersion: number | null;
  resultingVersion: number;
  actorUserId: string | null;
  reason: string;
  scope: unknown;
  createdAt: Date;
};

function isStage(value: string): value is ControlledLaunchStage {
  return (CONTROLLED_LAUNCH_STAGES as readonly string[]).includes(value);
}

function isMode(value: string): value is RolloutMode {
  return (ROLLOUT_MODES as readonly string[]).includes(value);
}

function isWritePolicy(value: string): value is ControlledWritePolicy {
  return (WRITE_POLICIES as readonly string[]).includes(value);
}

function parseStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Persisted controlled launch ${field} is invalid.`);
  }
  return value;
}

function parseScope(value: unknown): ControlledLaunchScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Persisted controlled launch scope is invalid.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.workspaceId !== "string" ||
    typeof record.maxRealLeads !== "number" ||
    !Number.isInteger(record.maxRealLeads) ||
    record.maxRealLeads < 0 ||
    typeof record.externalWritesRequested !== "boolean"
  ) {
    throw new Error("Persisted controlled launch scope fields are invalid.");
  }

  return {
    workspaceId: record.workspaceId,
    connectedAccountIds: parseStringArray(record.connectedAccountIds, "connectedAccountIds"),
    instagramAssetIds: parseStringArray(record.instagramAssetIds, "instagramAssetIds"),
    automationIds: parseStringArray(record.automationIds, "automationIds"),
    counselorGroupIds: parseStringArray(record.counselorGroupIds, "counselorGroupIds"),
    enabledChannels: parseStringArray(record.enabledChannels, "enabledChannels"),
    maxRealLeads: record.maxRealLeads,
    externalWritesRequested: record.externalWritesRequested,
  };
}

function mapState(row: RawState): ControlledLaunchStateRecord {
  if (!isStage(row.stage)) throw new Error(`Unknown controlled launch stage: ${row.stage}`);
  if (!isMode(row.mode)) throw new Error(`Unknown controlled launch mode: ${row.mode}`);
  if (!isWritePolicy(row.writePolicy)) throw new Error(`Unknown controlled launch write policy: ${row.writePolicy}`);
  if (!Number.isInteger(row.version) || row.version < 1) {
    throw new Error("Persisted controlled launch version is invalid.");
  }
  if (row.mode === "SHADOW" && row.externalWritesAllowed) {
    throw new Error("Persisted SHADOW state illegally permits external writes.");
  }

  const scope = parseScope(row.scope);
  if (scope.workspaceId !== row.workspaceId) {
    throw new Error("Persisted controlled launch scope crossed workspace boundaries.");
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    stage: row.stage,
    mode: row.mode,
    writePolicy: row.writePolicy,
    externalWritesAllowed: row.externalWritesAllowed,
    scope,
    version: row.version,
    activatedAt: row.activatedAt,
    updatedAt: row.updatedAt,
  };
}

function mapTransition(row: RawTransition): ControlledLaunchTransitionRecord {
  if (row.fromStage !== null && !isStage(row.fromStage)) throw new Error("Unknown persisted fromStage.");
  if (!isStage(row.toStage)) throw new Error("Unknown persisted toStage.");
  if (row.fromMode !== null && !isMode(row.fromMode)) throw new Error("Unknown persisted fromMode.");
  if (!isMode(row.toMode)) throw new Error("Unknown persisted toMode.");
  if (row.fromWritePolicy !== null && !isWritePolicy(row.fromWritePolicy)) throw new Error("Unknown persisted fromWritePolicy.");
  if (!isWritePolicy(row.toWritePolicy)) throw new Error("Unknown persisted toWritePolicy.");

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    stateId: row.stateId,
    fromStage: row.fromStage,
    toStage: row.toStage,
    fromMode: row.fromMode,
    toMode: row.toMode,
    fromWritePolicy: row.fromWritePolicy,
    toWritePolicy: row.toWritePolicy,
    fromExternalWritesAllowed: row.fromExternalWritesAllowed,
    toExternalWritesAllowed: row.toExternalWritesAllowed,
    expectedVersion: row.expectedVersion,
    resultingVersion: row.resultingVersion,
    actorUserId: row.actorUserId,
    reason: row.reason,
    scope: parseScope(row.scope),
    createdAt: row.createdAt,
  };
}

async function selectState(
  client: Prisma.TransactionClient | typeof prisma,
  workspaceId: string,
  lock = false,
): Promise<RawState | null> {
  const rows = lock
    ? await client.$queryRaw<RawState[]>`
        SELECT "id", "workspaceId", "stage", "mode", "writePolicy",
               "externalWritesAllowed", "scope", "version", "activatedAt", "updatedAt"
        FROM "EngageControlledLaunchState"
        WHERE "workspaceId" = ${workspaceId}
        FOR UPDATE
      `
    : await client.$queryRaw<RawState[]>`
        SELECT "id", "workspaceId", "stage", "mode", "writePolicy",
               "externalWritesAllowed", "scope", "version", "activatedAt", "updatedAt"
        FROM "EngageControlledLaunchState"
        WHERE "workspaceId" = ${workspaceId}
      `;

  return rows[0] ?? null;
}

async function ensureActiveWorkspace(
  client: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  const workspace = await client.engageWorkspace.findFirst({
    where: { id: workspaceId, isActive: true },
    select: { id: true },
  });
  if (!workspace) throw new Error("Active workspace not found for controlled launch state.");
}

async function createInitialState(
  input: InitialControlledLaunchStateInput,
): Promise<{ created: boolean; state: ControlledLaunchStateRecord }> {
  return prisma.$transaction(async (tx) => {
    await ensureActiveWorkspace(tx, input.workspaceId);

    const existing = await selectState(tx, input.workspaceId, true);
    if (existing) return { created: false, state: mapState(existing) };

    if (
      input.stage !== "INTERNAL_TEST_IDENTITIES" ||
      input.mode !== "SHADOW" ||
      input.writePolicy !== "NO_EXTERNAL_WRITES" ||
      input.externalWritesAllowed
    ) {
      throw new Error("Initial controlled launch state must be Stage1 SHADOW with no external writes.");
    }
    if (input.scope.workspaceId !== input.workspaceId || input.scope.externalWritesRequested) {
      throw new Error("Initial controlled launch scope is unsafe or crosses workspace boundaries.");
    }

    const stateId = randomUUID();
    const transitionId = randomUUID();
    const scopeJson = JSON.stringify(input.scope);

    const inserted = await tx.$queryRaw<RawState[]>`
      INSERT INTO "EngageControlledLaunchState" (
        "id", "workspaceId", "stage", "mode", "writePolicy",
        "externalWritesAllowed", "scope", "version", "activatedAt", "updatedAt"
      ) VALUES (
        ${stateId}, ${input.workspaceId}, ${input.stage}, ${input.mode}, ${input.writePolicy},
        false, ${scopeJson}::jsonb, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING "id", "workspaceId", "stage", "mode", "writePolicy",
                "externalWritesAllowed", "scope", "version", "activatedAt", "updatedAt"
    `;

    const state = inserted[0];
    if (!state) throw new Error("Failed to persist initial controlled launch state.");

    await tx.$executeRaw`
      INSERT INTO "EngageControlledLaunchTransition" (
        "id", "workspaceId", "stateId", "fromStage", "toStage", "fromMode", "toMode",
        "fromWritePolicy", "toWritePolicy", "fromExternalWritesAllowed", "toExternalWritesAllowed",
        "expectedVersion", "resultingVersion", "actorUserId", "reason", "scope", "createdAt"
      ) VALUES (
        ${transitionId}, ${input.workspaceId}, ${stateId}, NULL, ${input.stage}, NULL, ${input.mode},
        NULL, ${input.writePolicy}, NULL, false, NULL, 1, ${input.actorUserId ?? null},
        ${input.reason}, ${scopeJson}::jsonb, CURRENT_TIMESTAMP
      )
    `;

    return { created: true, state: mapState(state) };
  });
}

async function transitionState(
  input: ControlledLaunchTransitionInput,
): Promise<ControlledLaunchStateRecord> {
  return prisma.$transaction(async (tx) => {
    await ensureActiveWorkspace(tx, input.workspaceId);
    const currentRow = await selectState(tx, input.workspaceId, true);
    if (!currentRow) throw new Error("Controlled launch state has not been bootstrapped.");

    const current = mapState(currentRow);
    if (current.version !== input.expectedVersion) {
      throw new ControlledLaunchVersionConflictError();
    }
    if (input.scope.workspaceId !== input.workspaceId) {
      throw new Error("Controlled launch transition scope crossed workspace boundaries.");
    }
    if (input.mode === "SHADOW" && (input.externalWritesAllowed || input.scope.externalWritesRequested)) {
      throw new Error("SHADOW mode must never permit or request external writes.");
    }

    const nextVersion = input.expectedVersion + 1;
    const scopeJson = JSON.stringify(input.scope);
    const updated = await tx.$queryRaw<RawState[]>`
      UPDATE "EngageControlledLaunchState"
      SET "stage" = ${input.stage},
          "mode" = ${input.mode},
          "writePolicy" = ${input.writePolicy},
          "externalWritesAllowed" = ${input.externalWritesAllowed},
          "scope" = ${scopeJson}::jsonb,
          "version" = ${nextVersion},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${current.id}
        AND "workspaceId" = ${input.workspaceId}
        AND "version" = ${input.expectedVersion}
      RETURNING "id", "workspaceId", "stage", "mode", "writePolicy",
                "externalWritesAllowed", "scope", "version", "activatedAt", "updatedAt"
    `;

    const next = updated[0];
    if (!next) throw new ControlledLaunchVersionConflictError();

    await tx.$executeRaw`
      INSERT INTO "EngageControlledLaunchTransition" (
        "id", "workspaceId", "stateId", "fromStage", "toStage", "fromMode", "toMode",
        "fromWritePolicy", "toWritePolicy", "fromExternalWritesAllowed", "toExternalWritesAllowed",
        "expectedVersion", "resultingVersion", "actorUserId", "reason", "scope", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${input.workspaceId}, ${current.id}, ${current.stage}, ${input.stage},
        ${current.mode}, ${input.mode}, ${current.writePolicy}, ${input.writePolicy},
        ${current.externalWritesAllowed}, ${input.externalWritesAllowed}, ${input.expectedVersion},
        ${nextVersion}, ${input.actorUserId ?? null}, ${input.reason}, ${scopeJson}::jsonb,
        CURRENT_TIMESTAMP
      )
    `;

    return mapState(next);
  });
}

async function listTransitions(workspaceId: string): Promise<readonly ControlledLaunchTransitionRecord[]> {
  const rows = await prisma.$queryRaw<RawTransition[]>`
    SELECT "id", "workspaceId", "stateId", "fromStage", "toStage", "fromMode", "toMode",
           "fromWritePolicy", "toWritePolicy", "fromExternalWritesAllowed", "toExternalWritesAllowed",
           "expectedVersion", "resultingVersion", "actorUserId", "reason", "scope", "createdAt"
    FROM "EngageControlledLaunchTransition"
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY "resultingVersion" ASC, "createdAt" ASC
  `;
  return rows.map(mapTransition);
}

export const prismaControlledLaunchStateRepository: ControlledLaunchStateRepository = {
  getState: async (workspaceId) => {
    const row = await selectState(prisma, workspaceId);
    return row ? mapState(row) : null;
  },
  createInitialState,
  transitionState,
  listTransitions,
};

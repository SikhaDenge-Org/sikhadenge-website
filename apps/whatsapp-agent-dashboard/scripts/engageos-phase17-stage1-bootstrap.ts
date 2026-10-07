import { prisma } from "@/lib/db/prisma";
import { bootstrapStage1ControlledLaunch } from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const EXPECTED_WORKSPACE_ID = "engagews_default";

function requireReleaseSha(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/i.test(normalized)) {
    throw new Error("ENGAGEOS_STAGE1_RELEASE_SHA must be an exact 40-character Git SHA.");
  }
  return normalized.toLowerCase();
}

function assertExactStage1State(state: Awaited<ReturnType<typeof bootstrapStage1ControlledLaunch>>["state"]): void {
  if (
    state.workspaceId !== EXPECTED_WORKSPACE_ID ||
    state.stage !== "INTERNAL_TEST_IDENTITIES" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed !== false ||
    state.version !== 1 ||
    state.scope.workspaceId !== EXPECTED_WORKSPACE_ID ||
    state.scope.maxRealLeads !== 0 ||
    state.scope.externalWritesRequested !== false ||
    state.scope.connectedAccountIds.length !== 0 ||
    state.scope.instagramAssetIds.length !== 0 ||
    state.scope.automationIds.length !== 0 ||
    state.scope.counselorGroupIds.length !== 0 ||
    state.scope.enabledChannels.length !== 0
  ) {
    throw new Error("Persisted controlled-launch state is not the exact Stage1 SHADOW state.");
  }
}

async function main(): Promise<void> {
  const workspaceId = (process.env.ENGAGEOS_STAGE1_WORKSPACE_ID ?? EXPECTED_WORKSPACE_ID).trim();
  if (workspaceId !== EXPECTED_WORKSPACE_ID) {
    throw new Error(`Stage1 production bootstrap is locked to ${EXPECTED_WORKSPACE_ID}.`);
  }

  const releaseSha = requireReleaseSha(process.env.ENGAGEOS_STAGE1_RELEASE_SHA);
  const existing = await prismaControlledLaunchStateRepository.getState(workspaceId);
  if (existing) assertExactStage1State(existing);

  const result = await bootstrapStage1ControlledLaunch(prismaControlledLaunchStateRepository, {
    activeWorkspaceId: workspaceId,
    workspaceId,
    actorUserId: null,
    reason: `Phase17 Stage1 SHADOW production bootstrap release ${releaseSha}`,
  });

  assertExactStage1State(result.state);

  const listTransitions = prismaControlledLaunchStateRepository.listTransitions;
  if (!listTransitions) throw new Error("Controlled-launch transition history reader is unavailable.");
  const history = await listTransitions(workspaceId);
  if (history.length !== 1) {
    throw new Error(`Stage1 bootstrap requires exactly one transition record; found ${history.length}.`);
  }

  const transition = history[0];
  if (
    transition.fromStage !== null ||
    transition.toStage !== "INTERNAL_TEST_IDENTITIES" ||
    transition.fromMode !== null ||
    transition.toMode !== "SHADOW" ||
    transition.fromWritePolicy !== null ||
    transition.toWritePolicy !== "NO_EXTERNAL_WRITES" ||
    transition.fromExternalWritesAllowed !== null ||
    transition.toExternalWritesAllowed !== false ||
    transition.expectedVersion !== null ||
    transition.resultingVersion !== 1 ||
    transition.scope.workspaceId !== workspaceId ||
    transition.scope.maxRealLeads !== 0 ||
    transition.scope.externalWritesRequested !== false
  ) {
    throw new Error("Stage1 transition history is not the exact initial SHADOW bootstrap transition.");
  }

  console.log(`PHASE17_STAGE1_BOOTSTRAP_CREATED=${result.created ? "true" : "false"}`);
  console.log(`PHASE17_STAGE1_WORKSPACE=${workspaceId}`);
  console.log(`PHASE17_STAGE1_STAGE=${result.state.stage}`);
  console.log(`PHASE17_STAGE1_MODE=${result.state.mode}`);
  console.log(`PHASE17_STAGE1_WRITE_POLICY=${result.state.writePolicy}`);
  console.log(`PHASE17_STAGE1_EXTERNAL_WRITES_ALLOWED=${result.state.externalWritesAllowed}`);
  console.log(`PHASE17_STAGE1_VERSION=${result.state.version}`);
  console.log(`PHASE17_STAGE1_TRANSITION_COUNT=${history.length}`);
  console.log("PASS: PHASE17_STAGE1_SERVICE_BOOTSTRAP_VERIFIED");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

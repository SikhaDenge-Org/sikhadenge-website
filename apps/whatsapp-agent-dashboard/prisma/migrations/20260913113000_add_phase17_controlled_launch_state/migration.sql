-- Phase17 controlled launch persistence.
-- This migration stores the authoritative workspace-scoped rollout state and an immutable transition trail.

CREATE TABLE "EngageControlledLaunchState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "writePolicy" TEXT NOT NULL,
    "externalWritesAllowed" BOOLEAN NOT NULL DEFAULT false,
    "scope" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngageControlledLaunchState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageControlledLaunchState_version_check" CHECK ("version" >= 1),
    CONSTRAINT "EngageControlledLaunchState_stage_check" CHECK ("stage" IN (
        'INTERNAL_TEST_IDENTITIES',
        'ONE_CONNECTED_ACCOUNT',
        'ONE_INSTAGRAM_ASSET',
        'ONE_KEYWORD_AUTOMATION',
        'ONE_COUNSELOR_GROUP',
        'LIMITED_REAL_LEADS',
        'BROADER_INSTAGRAM_COVERAGE',
        'MESSENGER_FACEBOOK_COVERAGE',
        'ADDITIONAL_APPROVED_CHANNELS',
        'STABLE_FULL_ROLLOUT'
    )),
    CONSTRAINT "EngageControlledLaunchState_mode_check" CHECK ("mode" IN (
        'SHADOW',
        'APPROVAL_ONLY',
        'LIMITED_AUTOPILOT',
        'FULL_AUTOPILOT_FOR_APPROVED_FLOWS'
    )),
    CONSTRAINT "EngageControlledLaunchState_write_policy_check" CHECK ("writePolicy" IN (
        'NO_EXTERNAL_WRITES',
        'HUMAN_APPROVAL_REQUIRED',
        'BOUNDED_AUTOPILOT',
        'APPROVED_FLOWS_ONLY'
    )),
    CONSTRAINT "EngageControlledLaunchState_shadow_no_external_writes_check" CHECK (
        "mode" <> 'SHADOW' OR "externalWritesAllowed" = false
    ),
    CONSTRAINT "EngageControlledLaunchState_shadow_policy_check" CHECK (
        "mode" <> 'SHADOW' OR "writePolicy" = 'NO_EXTERNAL_WRITES'
    )
);

CREATE UNIQUE INDEX "EngageControlledLaunchState_workspaceId_key"
    ON "EngageControlledLaunchState"("workspaceId");
CREATE INDEX "EngageControlledLaunchState_stage_mode_idx"
    ON "EngageControlledLaunchState"("stage", "mode");

ALTER TABLE "EngageControlledLaunchState"
    ADD CONSTRAINT "EngageControlledLaunchState_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EngageControlledLaunchTransition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "fromMode" TEXT,
    "toMode" TEXT NOT NULL,
    "fromWritePolicy" TEXT,
    "toWritePolicy" TEXT NOT NULL,
    "fromExternalWritesAllowed" BOOLEAN,
    "toExternalWritesAllowed" BOOLEAN NOT NULL,
    "expectedVersion" INTEGER,
    "resultingVersion" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngageControlledLaunchTransition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EngageControlledLaunchTransition_resulting_version_check" CHECK ("resultingVersion" >= 1),
    CONSTRAINT "EngageControlledLaunchTransition_expected_version_check" CHECK (
        "expectedVersion" IS NULL OR "expectedVersion" >= 1
    ),
    CONSTRAINT "EngageControlledLaunchTransition_shadow_no_external_writes_check" CHECK (
        "toMode" <> 'SHADOW' OR "toExternalWritesAllowed" = false
    )
);

CREATE UNIQUE INDEX "EngageControlledLaunchTransition_state_version_key"
    ON "EngageControlledLaunchTransition"("stateId", "resultingVersion");
CREATE INDEX "EngageControlledLaunchTransition_workspace_created_idx"
    ON "EngageControlledLaunchTransition"("workspaceId", "createdAt");

ALTER TABLE "EngageControlledLaunchTransition"
    ADD CONSTRAINT "EngageControlledLaunchTransition_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "EngageWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngageControlledLaunchTransition"
    ADD CONSTRAINT "EngageControlledLaunchTransition_stateId_fkey"
    FOREIGN KEY ("stateId") REFERENCES "EngageControlledLaunchState"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

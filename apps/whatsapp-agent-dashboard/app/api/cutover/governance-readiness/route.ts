import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOutboundMode } from "@/lib/meta/outbound-client";
import {
  computeAutopilotCapUsage,
  governanceStateIsInternallyConsistent,
  parseGovernanceScope,
} from "@/modules/release/application/controlled-launch-governance-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

async function requirePlatformAdmin() {
  const user = await getCurrentDashboardUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function tablePresence() {
  const [row] = await prisma.$queryRaw<Array<Record<string, boolean>>>`
    SELECT
      to_regclass('public."EngageControlledLaunchOutboundApproval"') IS NOT NULL AS "humanApproval",
      to_regclass('public."EngageControlledLaunchAutopilotRecipient"') IS NOT NULL AS "autopilotLedger",
      to_regclass('public."EngageControlledLaunchApprovedFlow"') IS NOT NULL AS "approvedFlow"
  `;
  return row || { humanApproval: false, autopilotLedger: false, approvedFlow: false };
}
async function loadGovernanceCounts(workspaceId: string, stateVersion: number, presence: Awaited<ReturnType<typeof tablePresence>>) {
  const human = presence.humanApproval
    ? (await prisma.$queryRaw<Array<{ active: bigint; consumed: bigint; revoked: bigint; expired: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > NOW()) AS active,
          COUNT(*) FILTER (WHERE "consumedAt" IS NOT NULL) AS consumed,
          COUNT(*) FILTER (WHERE "revokedAt" IS NOT NULL) AS revoked,
          COUNT(*) FILTER (WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" <= NOW()) AS expired
        FROM "EngageControlledLaunchOutboundApproval"
        WHERE "workspaceId" = ${workspaceId} AND "controlledLaunchStateVersion" = ${stateVersion}
      `)[0]
    : null;
  const autopilot = presence.autopilotLedger
    ? (await prisma.$queryRaw<Array<{ recipients: bigint }>>`
        SELECT COUNT(DISTINCT "recipientKey") AS recipients
        FROM "EngageControlledLaunchAutopilotRecipient"
        WHERE "workspaceId" = ${workspaceId} AND "controlledLaunchStateVersion" = ${stateVersion}
      `)[0]
    : null;
  const flows = presence.approvedFlow
    ? (await prisma.$queryRaw<Array<{ active: bigint; revoked: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE "revokedAt" IS NULL) AS active,
          COUNT(*) FILTER (WHERE "revokedAt" IS NOT NULL) AS revoked
        FROM "EngageControlledLaunchApprovedFlow"
        WHERE "workspaceId" = ${workspaceId} AND "controlledLaunchStateVersion" = ${stateVersion}
      `)[0]
    : null;
  return { human, autopilot, flows };
}
export async function GET() {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");

  const memberships = await prisma.engageWorkspaceMembership.findMany({
    where: { userId: user.id, isActive: true, user: { isActive: true } },
    select: { workspaceId: true },
    orderBy: { workspaceId: "asc" },
  });
  const workspaceIds = [...new Set(memberships.map((membership) => membership.workspaceId))];
  const states = workspaceIds.length === 0
    ? []
    : await prisma.engageControlledLaunchState.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: {
          workspaceId: true,
          stage: true,
          mode: true,
          writePolicy: true,
          externalWritesAllowed: true,
          scope: true,
          version: true,
          activatedAt: true,
          updatedAt: true,
        },
        orderBy: { workspaceId: "asc" },
      });

  const presence = await tablePresence();
  const workspaces = await Promise.all(states.map(async (state) => {
    const scope = parseGovernanceScope(state.scope);
    const counts = await loadGovernanceCounts(state.workspaceId, state.version, presence);
    const distinctRecipients = Number(counts.autopilot?.recipients || 0);
    const cap = computeAutopilotCapUsage(scope?.maxRealLeads || 0, distinctRecipients);
    const consistent = governanceStateIsInternallyConsistent({
      workspaceId: state.workspaceId,
      mode: state.mode,
      writePolicy: state.writePolicy,
      externalWritesAllowed: state.externalWritesAllowed,
      scope,
    });
    const missingTables = [
      !presence.humanApproval ? "HUMAN_APPROVAL" : null,
      !presence.autopilotLedger ? "AUTOPILOT_LEDGER" : null,
      !presence.approvedFlow ? "APPROVED_FLOW" : null,
    ].filter((value): value is string => Boolean(value));

    return {
      workspaceId: state.workspaceId,
      stage: state.stage,
      mode: state.mode,
      writePolicy: state.writePolicy,
      externalWritesAllowed: state.externalWritesAllowed,
      version: state.version,
      activatedAt: state.activatedAt,
      updatedAt: state.updatedAt,
      scope,
      internallyConsistent: consistent,
      migrationReady: missingTables.length === 0,
      missingTables,
      humanApproval: counts.human ? {
        active: Number(counts.human.active),
        consumed: Number(counts.human.consumed),
        revoked: Number(counts.human.revoked),
        expired: Number(counts.human.expired),
      } : null,
      boundedAutopilot: presence.autopilotLedger ? cap : null,
      approvedFlows: counts.flows ? {
        active: Number(counts.flows.active),
        revoked: Number(counts.flows.revoked),
      } : null,
    };
  }));
  const statesByWorkspace = new Set(states.map((state) => state.workspaceId));
  const missingStateWorkspaces = workspaceIds.filter((workspaceId) => !statesByWorkspace.has(workspaceId));
  const providerMode = getOutboundMode();
  const allConsistent = workspaces.every((workspace) => workspace.internallyConsistent);
  const allMigrated = workspaces.every((workspace) => workspace.migrationReady);
  const noCapOverflow = workspaces.every((workspace) => workspace.boundedAutopilot?.withinCap !== false);
  const readyForGovernedExecution =
    workspaces.length > 0 &&
    missingStateWorkspaces.length === 0 &&
    allConsistent &&
    allMigrated &&
    noCapOverflow;

  return NextResponse.json({
    success: true,
    readyForGovernedExecution,
    providerMode,
    providerWriteKillSwitchActive: providerMode !== "live",
    migrationPresence: presence,
    workspaceCount: workspaceIds.length,
    controlledWorkspaceCount: workspaces.length,
    missingStateWorkspaces,
    checks: {
      everyWorkspaceHasControlledState: missingStateWorkspaces.length === 0,
      governanceTablesPresent: allMigrated,
      persistedStateConsistent: allConsistent,
      boundedAutopilotWithinCap: noCapOverflow,
    },
    workspaces,
    generatedAt: new Date().toISOString(),
  });
}

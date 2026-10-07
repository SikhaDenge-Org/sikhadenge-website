import { NextRequest, NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  bootstrapStage1ControlledLaunch,
  getControlledLaunchState,
} from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

async function requirePlatformAdmin() {
  const user = await getCurrentDashboardUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function requireActiveWorkspace(workspaceId: string) {
  return prisma.engageWorkspace.findFirst({
    where: { id: workspaceId, isActive: true },
    select: { id: true, slug: true, name: true },
  });
}

export async function GET(req: NextRequest) {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");

  const workspaceId = req.nextUrl.searchParams.get("workspaceId")?.trim() ?? "";
  if (!workspaceId) return errorResponse(400, "WORKSPACE_REQUIRED", "workspaceId is required.");

  const workspace = await requireActiveWorkspace(workspaceId);
  if (!workspace) return errorResponse(404, "WORKSPACE_NOT_FOUND", "Active workspace not found.");

  try {
    const state = await getControlledLaunchState(prismaControlledLaunchStateRepository, {
      activeWorkspaceId: workspace.id,
      workspaceId: workspace.id,
    });

    return NextResponse.json({
      success: true,
      workspace,
      state,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read controlled launch state.";
    return errorResponse(500, "CONTROLLED_LAUNCH_READ_FAILED", message);
  }
}

export async function POST(req: NextRequest) {
  const user = await requirePlatformAdmin();
  if (!user) return errorResponse(403, "AUTH_REQUIRED", "Platform admin authentication required.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "A JSON request body is required.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_BODY", "Request body must be an object.");
  }

  const input = body as Record<string, unknown>;
  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason : undefined;

  if (!workspaceId) return errorResponse(400, "WORKSPACE_REQUIRED", "workspaceId is required.");

  const unexpectedKeys = Object.keys(input).filter((key) => !["workspaceId", "reason"].includes(key));
  if (unexpectedKeys.length > 0) {
    return errorResponse(
      400,
      "UNSUPPORTED_FIELDS",
      `Stage1 bootstrap does not accept rollout overrides: ${unexpectedKeys.join(", ")}`,
    );
  }

  const workspace = await requireActiveWorkspace(workspaceId);
  if (!workspace) return errorResponse(404, "WORKSPACE_NOT_FOUND", "Active workspace not found.");

  try {
    const result = await bootstrapStage1ControlledLaunch(prismaControlledLaunchStateRepository, {
      activeWorkspaceId: workspace.id,
      workspaceId: workspace.id,
      actorUserId: user.id,
      reason,
    });

    return NextResponse.json(
      {
        success: true,
        created: result.created,
        workspace,
        state: result.state,
        safety: {
          stageLockedTo: "INTERNAL_TEST_IDENTITIES",
          modeLockedTo: "SHADOW",
          externalWritesAllowed: false,
        },
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bootstrap controlled launch state.";
    return errorResponse(500, "CONTROLLED_LAUNCH_BOOTSTRAP_FAILED", message);
  }
}

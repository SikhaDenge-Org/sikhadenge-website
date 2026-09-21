import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../../lib/auth/session";
import {
  changeConversationOwnership,
  type OwnershipAction,
} from "../../../../../../lib/team/team-chat-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function PATCH(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as {
      action?: unknown;
      assigneeId?: unknown;
    };
    const action =
      typeof payload.action === "string"
        ? (payload.action.trim().toLowerCase() as OwnershipAction)
        : ("" as OwnershipAction);
    if (!new Set<OwnershipAction>(["claim", "release", "transfer"]).has(action)) {
      return NextResponse.json(
        { error: "action must be claim, release, or transfer." },
        { status: 400 },
      );
    }

    const conversation = await changeConversationOwnership({
      conversationId: context.params.conversationId,
      action,
      assigneeId:
        typeof payload.assigneeId === "string" ? payload.assigneeId : null,
      actor: { id: user.id, role: user.role },
    });

    return NextResponse.json(
      { conversation, action },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Ownership update failed.";
    const status = detail.includes("not found") ? 404 : detail.includes("already owned") || detail.includes("changed") ? 409 : 422;
    return NextResponse.json({ error: detail }, { status });
  }
}

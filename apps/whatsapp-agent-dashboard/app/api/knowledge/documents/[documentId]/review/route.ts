import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../../lib/auth/session";
import { reviewKnowledgeDocument } from "../../../../../../lib/knowledge/knowledge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

const ACTIONS = new Set(["APPROVE", "REJECT", "ARCHIVE"] as const);

type ReviewAction = "APPROVE" | "REJECT" | "ARCHIVE";

export async function POST(
  request: Request,
  context: { params: { documentId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action =
    typeof payload.action === "string" ? payload.action.trim().toUpperCase() : "";
  if (!ACTIONS.has(action as ReviewAction)) {
    return NextResponse.json(
      { error: "Action must be APPROVE, REJECT, or ARCHIVE." },
      { status: 400 },
    );
  }

  try {
    const document = await reviewKnowledgeDocument({
      documentId: context.params.documentId,
      action: action as ReviewAction,
      actorId: user.id,
      reason: typeof payload.reason === "string" ? payload.reason : null,
    });
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge review failed.";
    const status = message === "Knowledge document not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

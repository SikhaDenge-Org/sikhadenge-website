import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import {
  createLearningSuggestion,
  listPendingLearningSuggestions,
} from "../../../lib/learning/learning-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

const CREATE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

function getRequestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")
  );
}

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!REVIEW_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  const suggestions = await listPendingLearningSuggestions(limit);

  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!CREATE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const category = typeof payload.category === "string" ? payload.category : "";
  const userQuestion =
    typeof payload.userQuestion === "string" ? payload.userQuestion : "";
  const proposedAnswer =
    typeof payload.proposedAnswer === "string" ? payload.proposedAnswer : "";
  const originalAnswer =
    typeof payload.originalAnswer === "string" ? payload.originalAnswer : null;
  const correctionReason =
    typeof payload.correctionReason === "string" ? payload.correctionReason : null;
  const sourceMessageId =
    typeof payload.sourceMessageId === "string" && payload.sourceMessageId.trim()
      ? payload.sourceMessageId.trim()
      : null;

  try {
    const result = await createLearningSuggestion({
      category,
      userQuestion,
      proposedAnswer,
      originalAnswer,
      correctionReason,
      sourceMessageId,
      actorId: user.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      { result, outboundSent: false },
      {
        status: result.duplicate ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "LEARNING_SOURCE_MESSAGE_NOT_FOUND") {
      return NextResponse.json({ error: "Source message not found." }, { status: 404 });
    }
    if (
      code.includes("required") ||
      code.includes("characters") ||
      code.includes("exceeds")
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    throw error;
  }
}

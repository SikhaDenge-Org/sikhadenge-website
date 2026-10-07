import {
  DashboardRole,
  MessageActor,
  MessageDirection,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { analyzeAndPersistConversation } from "../../../../../../lib/agent/conversation-intelligence";
import { getCurrentDashboardUser } from "../../../../../../lib/auth/session";
import { prisma } from "../../../../../../lib/db/prisma";
import { captureDecisionLearningCandidate } from "../../../../../../lib/learning/learning-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: { message?: unknown } = {};
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 0) {
    try {
      payload = (await request.json()) as { message?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const message =
    typeof payload.message === "string" ? payload.message.trim() : null;
  if (message && message.length > 4_000) {
    return NextResponse.json(
      { error: "Message must not exceed 4,000 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeAndPersistConversation({
      conversationId: context.params.conversationId,
      customerMessage: message,
      actorId: user.id,
    });

    const latestInbound = await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: context.params.conversationId,
        direction: MessageDirection.INBOUND,
        actor: MessageActor.CUSTOMER,
        text: { not: null },
      },
      orderBy: { messageTimestamp: "desc" },
      select: { id: true, text: true },
    });

    const question = message || latestInbound?.text?.trim() || null;
    const sourceMessageId =
      !message || message === latestInbound?.text?.trim() ? latestInbound?.id ?? null : null;
    const learningCandidate = question
      ? await captureDecisionLearningCandidate({
          decision: result.decision,
          userQuestion: question,
          sourceMessageId,
          actorId: user.id,
        })
      : null;

    return NextResponse.json(
      { ...result, learningCandidate },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Analysis failed.";
    const status = detail.includes("not found") ? 404 : 422;
    return NextResponse.json({ error: detail }, { status });
  }
}

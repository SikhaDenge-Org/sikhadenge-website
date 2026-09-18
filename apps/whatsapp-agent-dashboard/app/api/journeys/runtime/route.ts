import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { loadPersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";
import { enrollJourney, processDueJourneys, processJourneyEnrollment } from "@/modules/journeys/application/journey-persistence-runtime";
import type { JourneyStep } from "@/modules/journeys/application/journey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

function clean(value: unknown, maximum = 120) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const security = await loadPersistedWorkspaceSecurityContext(user.id);
    if (!security?.workspace?.id) return NextResponse.json({ error: "Workspace context is required." }, { status: 400 });
    const payload = (await request.json()) as Record<string, unknown>;
    const action = clean(payload.action, 30).toLowerCase();
    if (action === "enroll") {
      const steps = Array.isArray(payload.steps) ? (payload.steps as JourneyStep[]) : [];
      const result = await enrollJourney({ journeyId: clean(payload.journeyId), conversationId: clean(payload.conversationId), steps, actorId: user.id, maxSendsInFrequencyWindow: Number(payload.maxSendsInFrequencyWindow) || undefined });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "process") {
      const result = await processJourneyEnrollment({ journeyId: clean(payload.journeyId), conversationId: clean(payload.conversationId), actorId: user.id });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "process_due") {
      const result = await processDueJourneys({ actorId: user.id, limit: Number(payload.limit) || undefined });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "action must be enroll, process or process_due." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey runtime failed." }, { status: 400 });
  }
}

import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import {
  ingestKnowledgeDocument,
  listKnowledgeDocuments,
} from "../../../../lib/knowledge/knowledge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Date must be an ISO string.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Date is invalid.");
  return parsed;
}

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
  const documents = await listKnowledgeDocuments(
    Number.isFinite(requestedLimit) ? requestedLimit : 100,
  );
  return NextResponse.json(
    { documents },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
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

  try {
    const document = await ingestKnowledgeDocument({
      title: typeof payload.title === "string" ? payload.title : "",
      category: typeof payload.category === "string" ? payload.category : "",
      sourceType: typeof payload.sourceType === "string" ? payload.sourceType : "manual",
      sourceUrl: typeof payload.sourceUrl === "string" ? payload.sourceUrl : null,
      content: typeof payload.content === "string" ? payload.content : "",
      effectiveFrom: parseOptionalDate(payload.effectiveFrom),
      effectiveTo: parseOptionalDate(payload.effectiveTo),
      actorId: user.id,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge ingestion failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

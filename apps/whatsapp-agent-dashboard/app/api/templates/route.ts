import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import {
  createTemplateDraft,
  listTemplates,
} from "../../../lib/templates/template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "200");
  const templates = await listTemplates(Number.isFinite(limit) ? limit : 200);
  return NextResponse.json(
    { templates },
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
    const template = await createTemplateDraft({
      name: typeof payload.name === "string" ? payload.name : "",
      language: typeof payload.language === "string" ? payload.language : "",
      category: typeof payload.category === "string" ? payload.category : "",
      components: payload.components,
      actorId: user.id,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template draft creation failed.";
    const status = message.toLowerCase().includes("unique") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

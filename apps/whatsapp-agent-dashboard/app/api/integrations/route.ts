import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import { getIntegrationOverview, saveIntegration } from "../../../lib/integrations/integration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

async function identity() {
  const user = await getCurrentDashboardUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) } as const;
  if (!ALLOWED.has(user.role)) return { error: NextResponse.json({ error: "Insufficient permission." }, { status: 403 }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await identity();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getIntegrationOverview(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await identity();
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const integration = await saveIntegration({
      id: payload.id,
      provider: payload.provider,
      name: payload.name,
      enabled: payload.enabled,
      endpointUrl: payload.endpointUrl,
      accountReference: payload.accountReference,
      notes: payload.notes,
      actorId: auth.user.id,
    });
    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration save failed." }, { status: 400 });
  }
}

import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { assertAutomationFlowWorkspaceAccess } from "@/lib/automation/automation-service";
import { loadPersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";
import {
  getAutomationGraphWorkspace,
  saveAutomationGraphDraft,
  syncAutomationGraphDraft,
} from "@/modules/automations/application/graph-version-service";
import type { AutomationGraph } from "@/modules/automations/domain/automation-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

async function userOrResponse() {
  const user = await getCurrentDashboardUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) } as const;
  if (!ALLOWED.has(user.role)) return { response: NextResponse.json({ error: "Insufficient permission." }, { status: 403 }) } as const;
  return { user } as const;
}

async function assertFlowAccess(userId: string, flowId: string) {
  const security = await loadPersistedWorkspaceSecurityContext(userId);
  await assertAutomationFlowWorkspaceAccess(flowId, security?.workspace.id ?? null);
}

export async function GET(_request: Request, context: { params: { flowId: string } }) {
  const auth = await userOrResponse();
  if ("response" in auth) return auth.response;
  try {
    await assertFlowAccess(auth.user.id, context.params.flowId);
    return NextResponse.json(await getAutomationGraphWorkspace(context.params.flowId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Graph workspace could not load." }, { status: 400 });
  }
}

export async function POST(_request: Request, context: { params: { flowId: string } }) {
  const auth = await userOrResponse();
  if ("response" in auth) return auth.response;
  try {
    await assertFlowAccess(auth.user.id, context.params.flowId);
    const draft = await syncAutomationGraphDraft({ flowId: context.params.flowId, actorId: auth.user.id });
    return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Graph sync failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: { flowId: string } }) {
  const auth = await userOrResponse();
  if ("response" in auth) return auth.response;
  try {
    await assertFlowAccess(auth.user.id, context.params.flowId);
    const payload = (await request.json()) as { sourceFlowVersion?: number; graph?: AutomationGraph };
    if (!payload.graph || !Number.isInteger(payload.sourceFlowVersion)) throw new Error("sourceFlowVersion and graph are required.");
    const draft = await saveAutomationGraphDraft({
      flowId: context.params.flowId,
      sourceFlowVersion: payload.sourceFlowVersion!,
      graph: payload.graph,
      actorId: auth.user.id,
    });
    return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Graph draft save failed." }, { status: 400 });
  }
}

import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import type { DashboardIdentity } from "../auth/session";
import { getCurrentDashboardUser } from "../auth/session";
import type { OperationRequestContext } from "./conversation-operations";

const OPERATION_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function requireOperationsUser(): Promise<
  | { user: DashboardIdentity; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (!OPERATION_ROLES.has(user.role)) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Insufficient permission." },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}

export function operationRequestContext(request: Request): OperationRequestContext {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

export function operationErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Operation failed.";
  const notFound = /not found/i.test(message);
  const forbidden = /only to themselves|permission/i.test(message);
  return NextResponse.json(
    { error: message },
    { status: notFound ? 404 : forbidden ? 403 : 400 },
  );
}

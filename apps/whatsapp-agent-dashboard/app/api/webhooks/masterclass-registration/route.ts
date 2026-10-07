import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { registerMasterclassLead } from "../../../../lib/automation/masterclass-registration-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function suppliedSecret(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-masterclass-secret")?.trim() || "";
}

function automationActionsEnabled(): boolean {
  return process.env.AUTOMATION_ACTIONS_ENABLED?.trim().toLowerCase() === "true";
}

export async function POST(request: Request) {
  if (!automationActionsEnabled()) {
    return NextResponse.json(
      { error: "Automation external actions are disabled." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const expected =
    process.env.MASTERCLASS_REGISTRATION_WEBHOOK_SECRET?.trim() || "";
  if (!expected) {
    return NextResponse.json(
      { error: "Masterclass registration webhook is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const supplied = suppliedSecret(request);
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await registerMasterclassLead({
      registrationId: payload.registrationId,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      city: payload.city,
      source: payload.source,
      consent: payload.consent,
    });
    return NextResponse.json(
      { accepted: true, result },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Masterclass registration could not be processed.";
    const status = detail.includes("OPTED_OUT") ? 409 : 400;
    return NextResponse.json(
      { accepted: false, error: detail },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

type Payload = { workspaceId: string; contactId: string; email: string; expiresAt: number };

function secret(env: NodeJS.ProcessEnv = process.env) {
  const value = env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || "";
  if (value.length < 32) throw new Error("EMAIL_UNSUBSCRIBE_SECRET must be at least 32 characters.");
  return value;
}

function sig(body: string, key = secret()) {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function createEmailUnsubscribeToken(input: { workspaceId: string; contactId: string; email: string; expiresAt?: Date }) {
  const payload: Payload = {
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    email: input.email.trim().toLowerCase(),
    expiresAt: (input.expiresAt ?? new Date(Date.now() + 180 * 86400000)).getTime(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sig(body)}`;
}

export function verifyEmailUnsubscribeToken(token: string): Payload {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("Unsubscribe token is malformed.");
  const expected = Buffer.from(sig(body));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Unsubscribe token signature is invalid.");

  let payload: Payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload; }
  catch { throw new Error("Unsubscribe token payload is invalid."); }

  if (!payload.workspaceId || !payload.contactId || !payload.email || !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    throw new Error("Unsubscribe token is invalid or expired.");
  }
  return payload;
}

export function createEmailUnsubscribeUrl(input: { workspaceId: string; contactId: string; email: string }) {
  const base = process.env.APP_URL?.trim();
  if (!base) throw new Error("APP_URL is required for marketing unsubscribe links.");
  const url = new URL("/api/email/unsubscribe", base);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Marketing unsubscribe URL must use HTTPS in production.");
  url.searchParams.set("t", createEmailUnsubscribeToken(input));
  return url.toString();
}

export async function applyEmailMarketingUnsubscribe(token: string) {
  const payload = verifyEmailUnsubscribeToken(token);
  const contact = await prisma.whatsAppContact.findUnique({
    where: { id: payload.contactId },
    select: { id: true, email: true },
  });
  if (!contact || contact.email?.trim().toLowerCase() !== payload.email) throw new Error("Unsubscribe contact does not match token.");

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [latestConsent, activeSuppression] = await Promise.all([
      tx.engageCustomerConsentEvent.findFirst({
        where: {
          workspaceId: payload.workspaceId,
          customerRef: payload.contactId,
          channel: "EMAIL",
          purpose: "MARKETING",
        },
        orderBy: { occurredAt: "desc" },
        select: { state: true },
      }),
      tx.engageCustomerSuppression.findFirst({
        where: {
          workspaceId: payload.workspaceId,
          customerRef: payload.contactId,
          channel: "EMAIL",
          purposes: { array_contains: ["MARKETING"] },
          startsAt: { lte: now },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      }),
    ]);

    let consentCreated = false;
    let suppressionCreated = false;

    if (latestConsent?.state !== "REVOKED") {
      await tx.engageCustomerConsentEvent.create({
        data: {
          workspaceId: payload.workspaceId,
          customerRef: payload.contactId,
          connectionId: null,
          channel: "EMAIL",
          purpose: "MARKETING",
          state: "REVOKED",
          source: "EMAIL_UNSUBSCRIBE",
          evidence: { email: payload.email },
          occurredAt: now,
        },
      });
      consentCreated = true;
    }

    if (!activeSuppression) {
      await tx.engageCustomerSuppression.create({
        data: {
          workspaceId: payload.workspaceId,
          customerRef: payload.contactId,
          connectionId: null,
          channel: "EMAIL",
          purposes: ["MARKETING"],
          reason: "CUSTOMER_OPT_OUT",
          startsAt: now,
        },
      });
      suppressionCreated = true;
    }

    return { consentCreated, suppressionCreated };
  });

  return {
    workspaceId: payload.workspaceId,
    contactId: payload.contactId,
    email: payload.email,
    ...result,
  };
}

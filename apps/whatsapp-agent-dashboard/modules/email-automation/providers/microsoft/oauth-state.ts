import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function sign(body: string, secret: string): string {
  if (secret.length < 32) throw new Error("Microsoft OAuth state secret must be at least 32 characters.");
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createMicrosoftOAuthState(input: { workspaceId: string; secret: string; now?: number }): string {
  const payload = { workspaceId: input.workspaceId.trim(), nonce: randomBytes(24).toString("base64url"), issuedAt: input.now ?? Date.now() };
  if (!payload.workspaceId) throw new Error("Workspace is required for Microsoft OAuth state.");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, input.secret)}`;
}

export function verifyMicrosoftOAuthState(input: { state: string; secret: string; expectedWorkspaceId: string; now?: number; maxAgeMs?: number }) {
  const [body, signature, extra] = input.state.split(".");
  if (!body || !signature || extra) throw new Error("Microsoft OAuth state is malformed.");
  const expected = Buffer.from(sign(body, input.secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Microsoft OAuth state signature is invalid.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { workspaceId: string; nonce: string; issuedAt: number };
  if (payload.workspaceId !== input.expectedWorkspaceId.trim()) throw new Error("Microsoft OAuth state workspace does not match.");
  const now = input.now ?? Date.now();
  if (payload.issuedAt > now + 30_000 || now - payload.issuedAt > (input.maxAgeMs ?? 600_000)) throw new Error("Microsoft OAuth state has expired.");
  return payload;
}
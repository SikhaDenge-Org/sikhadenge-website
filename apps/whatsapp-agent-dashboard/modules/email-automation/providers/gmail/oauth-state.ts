import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type GmailOAuthStatePayload = {
  workspaceId: string;
  nonce: string;
  issuedAt: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error("Gmail OAuth state secret must be at least 32 characters.");
  }
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createGmailOAuthState(input: {
  workspaceId: string;
  secret: string;
  now?: number;
}): string {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) throw new Error("Workspace is required for Gmail OAuth state.");

  const payload: GmailOAuthStatePayload = {
    workspaceId,
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: input.now ?? Date.now(),
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, input.secret)}`;
}

export function verifyGmailOAuthState(input: {
  state: string;
  secret: string;
  expectedWorkspaceId: string;
  now?: number;
  maxAgeMs?: number;
}): GmailOAuthStatePayload {
  const [body, signature, extra] = input.state.split(".");
  if (!body || !signature || extra) throw new Error("Gmail OAuth state is malformed.");

  const expected = sign(body, input.secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Gmail OAuth state signature is invalid.");
  }

  let payload: GmailOAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GmailOAuthStatePayload;
  } catch {
    throw new Error("Gmail OAuth state payload is invalid.");
  }

  if (
    !payload ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.issuedAt !== "number"
  ) {
    throw new Error("Gmail OAuth state payload is invalid.");
  }
  if (payload.workspaceId !== input.expectedWorkspaceId.trim()) {
    throw new Error("Gmail OAuth state workspace does not match.");
  }

  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 10 * 60 * 1000;
  if (payload.issuedAt > now + 30_000 || now - payload.issuedAt > maxAgeMs) {
    throw new Error("Gmail OAuth state has expired.");
  }

  return payload;
}

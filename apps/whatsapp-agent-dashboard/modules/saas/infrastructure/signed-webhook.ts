import { createHmac, timingSafeEqual } from "node:crypto";

function signaturePayload(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

export function signOutboundWebhook(input: {
  secret: string;
  timestamp: number;
  body: string;
}): string {
  if (input.secret.length < 32) throw new Error("Webhook signing secret is too short.");
  return createHmac("sha256", input.secret)
    .update(signaturePayload(input.timestamp, input.body), "utf8")
    .digest("hex");
}

export function verifyOutboundWebhookSignature(input: {
  secret: string;
  timestamp: number;
  body: string;
  signature: string;
  now?: number;
  replayWindowMs?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const replayWindowMs = input.replayWindowMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(input.timestamp) || Math.abs(now - input.timestamp) > replayWindowMs) {
    return false;
  }
  const expected = signOutboundWebhook(input);
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signature, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { ChannelConnectionId } from "@/modules/channels/core/contracts/channel";

export class WebhookSecurityError extends Error {
  readonly code:
    | "MISSING_SIGNATURE"
    | "INVALID_SIGNATURE"
    | "STALE_WEBHOOK"
    | "FUTURE_WEBHOOK"
    | "INVALID_TIMESTAMP";

  constructor(
    code: WebhookSecurityError["code"],
    message: string,
  ) {
    super(message);
    this.name = "WebhookSecurityError";
    this.code = code;
  }
}

function normalizeHexSignature(
  signature: string,
  prefix: string,
): string {
  const normalized = signature.trim();
  if (!normalized) {
    throw new WebhookSecurityError(
      "MISSING_SIGNATURE",
      "Webhook signature is required.",
    );
  }

  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
}

export function verifyHmacSha256Signature(input: {
  rawBody: string | Buffer;
  secret: string;
  signature: string;
  prefix?: string;
}): void {
  const prefix = input.prefix ?? "sha256=";
  const suppliedHex = normalizeHexSignature(input.signature, prefix);

  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) {
    throw new WebhookSecurityError(
      "INVALID_SIGNATURE",
      "Webhook signature has an invalid format.",
    );
  }

  const expectedHex = createHmac("sha256", input.secret)
    .update(input.rawBody)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const supplied = Buffer.from(suppliedHex, "hex");

  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new WebhookSecurityError(
      "INVALID_SIGNATURE",
      "Webhook signature verification failed.",
    );
  }
}

export function assertFreshWebhookTimestamp(input: {
  timestamp: Date;
  now?: Date;
  maxAgeSeconds?: number;
  maxFutureSkewSeconds?: number;
}): void {
  if (Number.isNaN(input.timestamp.getTime())) {
    throw new WebhookSecurityError(
      "INVALID_TIMESTAMP",
      "Webhook timestamp is invalid.",
    );
  }

  const now = input.now ?? new Date();
  const maxAgeMs = (input.maxAgeSeconds ?? 300) * 1_000;
  const maxFutureSkewMs = (input.maxFutureSkewSeconds ?? 30) * 1_000;
  const ageMs = now.getTime() - input.timestamp.getTime();

  if (ageMs > maxAgeMs) {
    throw new WebhookSecurityError(
      "STALE_WEBHOOK",
      "Webhook timestamp is outside the accepted replay window.",
    );
  }

  if (ageMs < -maxFutureSkewMs) {
    throw new WebhookSecurityError(
      "FUTURE_WEBHOOK",
      "Webhook timestamp is too far in the future.",
    );
  }
}

export function webhookReplayKey(input: {
  connectionId: ChannelConnectionId;
  externalEventId: string;
}): string {
  const externalEventId = input.externalEventId.trim();
  if (!externalEventId) {
    throw new Error("externalEventId must be a non-empty string.");
  }

  return `${input.connectionId}:${externalEventId}`;
}

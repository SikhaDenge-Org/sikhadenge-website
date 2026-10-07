const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export type CanonicalMirrorResult = {
  attempted: boolean;
  delivered: boolean;
  status: number | null;
  reason: string;
};

function mirrorEnabled(): boolean {
  const value = process.env.WHATSAPP_CANONICAL_MIRROR_ENABLED?.trim().toLowerCase();
  return Boolean(value && ENABLED_VALUES.has(value));
}

function mirrorUrl(): string | null {
  const value = process.env.WHATSAPP_CANONICAL_MIRROR_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getCanonicalMirrorPolicy() {
  return {
    enabled: mirrorEnabled(),
    configured: Boolean(mirrorUrl()),
  };
}

/**
 * Mirrors the exact Meta-signed request body to the canonical SikhaDenge
 * dashboard ingest endpoint.
 *
 * Security/integrity contract:
 * - no separate trust token is invented here;
 * - the original x-hub-signature-256 header is forwarded unchanged;
 * - the canonical receiver must independently verify that signature against
 *   the Meta App Secret before persisting anything;
 * - disabled/missing configuration is a no-op;
 * - mirror delivery failure must never make the primary Meta webhook fail.
 */
export async function mirrorMetaWebhookToCanonical(input: {
  rawBody: string;
  signatureHeader: string | null;
}): Promise<CanonicalMirrorResult> {
  if (!mirrorEnabled()) {
    return {
      attempted: false,
      delivered: false,
      status: null,
      reason: "MIRROR_DISABLED",
    };
  }

  const url = mirrorUrl();
  if (!url) {
    return {
      attempted: false,
      delivered: false,
      status: null,
      reason: "MIRROR_URL_NOT_CONFIGURED_OR_NOT_HTTPS",
    };
  }

  if (!input.signatureHeader?.startsWith("sha256=")) {
    return {
      attempted: false,
      delivered: false,
      status: null,
      reason: "META_SIGNATURE_MISSING",
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": input.signatureHeader,
        "x-sikhadenge-webhook-mirror": "legacy-whatsapp-agent",
      },
      body: input.rawBody,
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });

    return {
      attempted: true,
      delivered: response.ok,
      status: response.status,
      reason: response.ok ? "DELIVERED" : `HTTP_${response.status}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UNKNOWN_ERROR";
    return {
      attempted: true,
      delivered: false,
      status: null,
      reason,
    };
  }
}

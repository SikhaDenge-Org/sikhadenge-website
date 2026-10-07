type InstagramApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type InstagramProfileResponse = InstagramApiError & {
  id?: string;
  name?: string | null;
  username?: string | null;
  profile_pic?: string | null;
};

type InstagramSendResponse = InstagramApiError & {
  recipient_id?: string;
  message_id?: string;
  messages?: Array<{ id?: string }>;
};

export type InstagramProfile = {
  id: string;
  name: string | null;
  username: string | null;
  profilePic: string | null;
};

export type InstagramOutboundMode = "disabled" | "live";

const DEFAULT_TIMEOUT_MS = 20_000;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function required(name: string, fallbackName?: string): string {
  const value = clean(process.env[name]) ?? (fallbackName ? clean(process.env[fallbackName]) : null);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function graphVersion(): string {
  return clean(process.env.INSTAGRAM_GRAPH_VERSION) ?? "v23.0";
}

function accessToken(): string {
  return required("INSTAGRAM_ACCESS_TOKEN");
}

function businessAccountId(): string {
  return required("INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID");
}

function timeoutMs(): number {
  const configured = Number(process.env.INSTAGRAM_OUTBOUND_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(5_000, Math.min(60_000, Math.floor(configured)));
}

function apiError(body: InstagramApiError, status: number, fallback: string): Error {
  const code = body.error?.code ? ` (${body.error.code})` : "";
  return new Error(`${body.error?.message || `${fallback} with HTTP ${status}`}${code}`);
}

export function getInstagramOutboundMode(): InstagramOutboundMode {
  const requested = clean(process.env.INSTAGRAM_OUTBOUND_MODE)?.toLowerCase();
  const killed = clean(process.env.INSTAGRAM_OUTBOUND_KILL_SWITCH)?.toLowerCase() === "on";
  return requested === "live" && !killed ? "live" : "disabled";
}

export async function fetchInstagramProfile(
  instagramScopedId: string,
): Promise<InstagramProfile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const url = new URL(
      `https://graph.instagram.com/${encodeURIComponent(graphVersion())}/${encodeURIComponent(
        instagramScopedId,
      )}`,
    );
    url.searchParams.set("fields", "name,username,profile_pic");

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken()}` },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = (await response.json()) as InstagramProfileResponse;
    if (!response.ok || !body.id) {
      throw apiError(body, response.status, "Instagram profile lookup failed");
    }

    return {
      id: body.id,
      name: clean(body.name ?? undefined),
      username: clean(body.username ?? undefined),
      profilePic: clean(body.profile_pic ?? undefined),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendInstagramTextMessage(input: {
  recipientId: string;
  text: string;
}): Promise<{ metaMessageId: string; recipientId: string | null; statusCode: number }> {
  const mode = getInstagramOutboundMode();
  if (mode !== "live") {
    throw new Error("Instagram live sending is disabled.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(
      `https://graph.instagram.com/${encodeURIComponent(graphVersion())}/${encodeURIComponent(
        businessAccountId(),
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: input.recipientId },
          message: { text: input.text },
          messaging_type: "RESPONSE",
        }),
        signal: controller.signal,
      },
    );

    const body = (await response.json()) as InstagramSendResponse;
    const metaMessageId = body.message_id?.trim() || body.messages?.[0]?.id?.trim();
    if (!response.ok || !metaMessageId) {
      throw apiError(body, response.status, "Instagram send failed");
    }

    return {
      metaMessageId,
      recipientId: clean(body.recipient_id),
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isRetriableInstagramError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("http 429") ||
    message.includes("http 500") ||
    message.includes("http 502") ||
    message.includes("http 503") ||
    message.includes("http 504")
  );
}

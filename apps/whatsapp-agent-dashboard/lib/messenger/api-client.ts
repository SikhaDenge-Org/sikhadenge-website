type MessengerApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MessengerSendResponse = MessengerApiError & {
  recipient_id?: string;
  message_id?: string;
};

export type MessengerOutboundMode = "disabled" | "live";

const DEFAULT_TIMEOUT_MS = 20_000;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function required(name: string): string {
  const value = clean(process.env[name]);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function graphVersion(): string {
  return clean(process.env.MESSENGER_GRAPH_VERSION) ?? "v23.0";
}

function pageAccessToken(): string {
  return required("MESSENGER_PAGE_ACCESS_TOKEN");
}

function pageId(): string {
  return required("MESSENGER_PAGE_ID");
}

function timeoutMs(): number {
  const configured = Number(process.env.MESSENGER_OUTBOUND_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(5_000, Math.min(60_000, Math.floor(configured)));
}

function apiError(body: MessengerApiError, status: number, fallback: string): Error {
  const code = body.error?.code ? ` (${body.error.code})` : "";
  return new Error(`${body.error?.message || `${fallback} with HTTP ${status}`}${code}`);
}

export function getMessengerOutboundMode(): MessengerOutboundMode {
  const requested = clean(process.env.MESSENGER_OUTBOUND_MODE)?.toLowerCase();
  const killed =
    clean(process.env.MESSENGER_OUTBOUND_KILL_SWITCH)?.toLowerCase() === "on";
  return requested === "live" && !killed ? "live" : "disabled";
}

export async function sendMessengerTextMessage(input: {
  recipientId: string;
  text: string;
}): Promise<{
  metaMessageId: string;
  recipientId: string | null;
  statusCode: number;
}> {
  const mode = getMessengerOutboundMode();
  if (mode !== "live") {
    throw new Error("Messenger live sending is disabled.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion())}/${encodeURIComponent(
        pageId(),
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: input.recipientId },
          messaging_type: "RESPONSE",
          message: { text: input.text },
        }),
        signal: controller.signal,
      },
    );

    let body: MessengerSendResponse = {};
    try {
      body = (await response.json()) as MessengerSendResponse;
    } catch {
      body = {};
    }

    const metaMessageId = body.message_id?.trim();
    if (!response.ok || !metaMessageId) {
      throw apiError(body, response.status, "Messenger send failed");
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

export function isRetriableMessengerError(error: unknown): boolean {
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

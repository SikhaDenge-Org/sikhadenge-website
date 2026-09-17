import type {
  OutboundMode,
  PreparedMetaMessage,
} from "../outbound/types";

const LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_LIVE_WHATSAPP_SENDS";
const DEFAULT_TIMEOUT_MS = 20_000;

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
  id?: string;
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
};

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function getOutboundMode(): OutboundMode {
  const requested = clean(process.env.WHATSAPP_OUTBOUND_MODE)?.toLowerCase();
  if (requested === "dry_run") return "dry_run";
  if (requested !== "live") return "disabled";

  const approved = process.env.WHATSAPP_CUTOVER_APPROVED === "true";
  const acknowledged =
    process.env.WHATSAPP_OUTBOUND_LIVE_ACK === LIVE_ACKNOWLEDGEMENT;
  const killed = process.env.WHATSAPP_OUTBOUND_KILL_SWITCH === "on";

  return approved && acknowledged && !killed ? "live" : "disabled";
}

function requiredLiveConfig() {
  const accessToken =
    clean(process.env.WHATSAPP_ACCESS_TOKEN) ??
    clean(process.env.META_WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId =
    clean(process.env.WHATSAPP_PHONE_NUMBER_ID) ??
    clean(process.env.META_WHATSAPP_PHONE_NUMBER_ID);
  const graphVersion =
    clean(process.env.WHATSAPP_GRAPH_VERSION) ??
    clean(process.env.META_GRAPH_API_VERSION);

  if (!accessToken) throw new Error("WhatsApp access token is not configured.");
  if (!phoneNumberId) throw new Error("WhatsApp phone number ID is not configured.");
  if (!graphVersion) throw new Error("WhatsApp Graph API version is not configured.");

  return { accessToken, phoneNumberId, graphVersion };
}

function timeoutMs(): number {
  const configured = Number(process.env.WHATSAPP_OUTBOUND_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(5_000, Math.min(60_000, Math.floor(configured)));
}

function metaError(body: MetaSendResponse, status: number, fallback: string): Error {
  const code = body.error?.code ? ` (${body.error.code})` : "";
  return new Error(`${body.error?.message || `${fallback} with HTTP ${status}`}${code}`);
}

export async function uploadMetaWhatsAppMedia(input: {
  data: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ mediaId: string; statusCode: number }> {
  const mode = getOutboundMode();
  if (mode !== "live") throw new Error(`WhatsApp live sending is ${mode}.`);

  const config = requiredLiveConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const formData = new FormData();
    formData.set("messaging_product", "whatsapp");
    formData.set(
      "file",
      new Blob([new Uint8Array(input.data)], { type: input.mimeType }),
      input.filename,
    );

    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(
        config.phoneNumberId,
      )}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}` },
        body: formData,
        signal: controller.signal,
      },
    );
    const body = (await response.json()) as MetaSendResponse;
    const mediaId = body.id?.trim();
    if (!response.ok || !mediaId) throw metaError(body, response.status, "Meta media upload failed");
    return { mediaId, statusCode: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMetaWhatsAppMessage(
  payload: PreparedMetaMessage,
): Promise<{
  metaMessageId: string;
  statusCode: number;
}> {
  const mode = getOutboundMode();
  if (mode !== "live") {
    throw new Error(`WhatsApp live sending is ${mode}.`);
  }

  const config = requiredLiveConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(
        config.phoneNumberId,
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const body = (await response.json()) as MetaSendResponse;
    const metaMessageId = body.messages?.[0]?.id?.trim();

    if (!response.ok || !metaMessageId) {
      throw metaError(body, response.status, "Meta send failed");
    }

    return { metaMessageId, statusCode: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export function isRetriableMetaError(error: unknown): boolean {
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

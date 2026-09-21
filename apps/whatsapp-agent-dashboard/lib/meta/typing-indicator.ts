import { getOutboundMode } from "./outbound-client";

const DEFAULT_TYPING_DELAY_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 10_000;

type MetaTypingResponse = {
  success?: boolean;
  error?: {
    message?: string;
    code?: number;
  };
};

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function numberEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
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

export function getWhatsAppTypingPolicy() {
  return {
    enabled: booleanEnvironment("AGENT_TYPING_INDICATOR_ENABLED", true),
    delayMs: numberEnvironment(
      "AGENT_TYPING_DELAY_MS",
      DEFAULT_TYPING_DELAY_MS,
      500,
      10_000,
    ),
  } as const;
}

export async function showWhatsAppTypingIndicator(
  metaMessageId: string,
): Promise<{
  shown: boolean;
  requestedAt: number;
  acknowledgedAt: number;
  statusCode: number | null;
}> {
  const requestedAt = Date.now();
  const policy = getWhatsAppTypingPolicy();
  const messageId = metaMessageId.trim();

  if (!policy.enabled || !messageId || getOutboundMode() !== "live") {
    return {
      shown: false,
      requestedAt,
      acknowledgedAt: Date.now(),
      statusCode: null,
    };
  }

  const config = requiredLiveConfig();
  const controller = new AbortController();
  const timeoutMs = numberEnvironment(
    "WHATSAPP_TYPING_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    3_000,
    30_000,
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          typing_indicator: { type: "text" },
        }),
        signal: controller.signal,
      },
    );

    const body = (await response.json().catch(() => ({}))) as MetaTypingResponse;
    if (!response.ok) {
      const code = body.error?.code ? ` (${body.error.code})` : "";
      throw new Error(
        `${body.error?.message || `Meta typing indicator failed with HTTP ${response.status}`}${code}`,
      );
    }

    return {
      shown: true,
      requestedAt,
      acknowledgedAt: Date.now(),
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForTypingDelay(acknowledgedAt: number): Promise<number> {
  const delayMs = getWhatsAppTypingPolicy().delayMs;
  const elapsed = Math.max(0, Date.now() - acknowledgedAt);
  const remaining = Math.max(0, delayMs - elapsed);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
  return delayMs;
}

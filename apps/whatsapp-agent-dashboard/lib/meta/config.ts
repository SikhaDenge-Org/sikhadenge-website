const DEFAULT_MAX_WEBHOOK_BYTES = 2_000_000;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function getWhatsAppVerifyToken(): string {
  return requiredEnvironmentValue("WHATSAPP_VERIFY_TOKEN");
}

export function getWhatsAppAppSecret(): string {
  return requiredEnvironmentValue("WHATSAPP_APP_SECRET");
}

export function getWhatsAppWebhookMaxBytes(): number {
  const configured = Number(process.env.WHATSAPP_WEBHOOK_MAX_BYTES);
  if (!Number.isFinite(configured) || configured < 1_024) {
    return DEFAULT_MAX_WEBHOOK_BYTES;
  }
  return Math.min(Math.floor(configured), 10_000_000);
}

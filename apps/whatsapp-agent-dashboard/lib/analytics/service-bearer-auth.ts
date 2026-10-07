import { timingSafeEqual } from "node:crypto";

export type AnalyticsTokenEnvironment = Readonly<
  Record<string, string | undefined>
>;

export function analyticsServiceTokensFromEnv(
  env: AnalyticsTokenEnvironment = process.env,
): string[] {
  return [
    env.WHATSAPP_ANALYTICS_TOKEN,
    env.WHATSAPP_AGENT_ANALYTICS_TOKEN,
  ]
    .map((value) => value?.trim() || "")
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

function bearerToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAnalyticsServiceAuthorized(
  authorization: string | null,
  configuredTokens: readonly string[],
): boolean {
  const presentedToken = bearerToken(authorization);
  if (!presentedToken) return false;

  return configuredTokens.some(
    (configuredToken) =>
      Boolean(configuredToken) && constantTimeEqual(presentedToken, configuredToken),
  );
}

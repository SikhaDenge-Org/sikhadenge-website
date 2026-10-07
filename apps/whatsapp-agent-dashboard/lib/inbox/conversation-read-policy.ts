export type InboxConversationScope = "ALL" | "RECENT" | "HISTORY";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeInboxConversationScope(
  value: string | null | undefined,
): InboxConversationScope {
  const normalized = value?.trim().toUpperCase();

  if (normalized === "RECENT") return "RECENT";
  if (normalized === "HISTORY") return "HISTORY";
  return "ALL";
}

export function parseInboxConversationLimit(
  value: string | null | undefined,
  fallback = 50,
): number | null {
  if (value?.trim().toLowerCase() === "all") {
    return null;
  }

  if (value == null) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function inboxConversationTimeFilter(
  scope: InboxConversationScope,
  nowMs = Date.now(),
): { gte?: Date; lt?: Date } | undefined {
  const cutoff = new Date(nowMs - DAY_MS);

  if (scope === "RECENT") {
    return { gte: cutoff };
  }

  if (scope === "HISTORY") {
    return { lt: cutoff };
  }

  return undefined;
}

export function renderWhatsAppTemplateText(
  body: string,
  parameters: readonly string[],
): string {
  if (!body) return "";

  return body.replace(/\{\{(\d+)\}\}/g, (match, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    const value = index >= 0 && index < parameters.length ? parameters[index] : "";

    return value ? value : match;
  });
}

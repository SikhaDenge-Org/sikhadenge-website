export type FacebookPageCommentRule = {
  id: string;
  enabled: boolean;
  postIds: readonly string[];
  keywords: readonly string[];
  matchAll: boolean;
  publicReplyText: string | null;
  sensitiveKeywords: readonly string[];
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function strings(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maximumItems)
    .map((item) => clean(item, maximumLength))
    .filter(Boolean);
}

export function parseFacebookPageCommentRulesJson(value: string | undefined): FacebookPageCommentRule[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("FACEBOOK_PAGE_COMMENT_RULES_JSON must contain valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("FACEBOOK_PAGE_COMMENT_RULES_JSON must be an array.");
  }

  return parsed.slice(0, 50).flatMap((item, index) => {
    const input = record(item);
    const id = clean(input.id, 80) || `facebook-page-rule-${index + 1}`;
    const publicReplyText = clean(input.publicReplyText, 8_000) || null;
    const rule: FacebookPageCommentRule = {
      id,
      enabled: input.enabled !== false,
      postIds: strings(input.postIds, 100, 150),
      keywords: strings(input.keywords, 100, 200).map((keyword) => keyword.toLowerCase()),
      matchAll: input.matchAll === true,
      publicReplyText,
      sensitiveKeywords: strings(input.sensitiveKeywords, 100, 200).map((keyword) => keyword.toLowerCase()),
    };
    return rule.enabled ? [rule] : [];
  });
}

export function matchingFacebookPageCommentRules(input: {
  postId: string | null;
  message: string | null;
  rules: readonly FacebookPageCommentRule[];
}): FacebookPageCommentRule[] {
  const body = input.message?.toLowerCase() || "";
  return input.rules.filter((rule) => {
    const postMatches = rule.postIds.length === 0 || Boolean(input.postId && rule.postIds.includes(input.postId));
    if (!postMatches) return false;
    if (rule.matchAll) return true;
    return rule.keywords.length > 0 && rule.keywords.some((keyword) => body.includes(keyword));
  });
}

export function facebookPageCommentIsSensitive(
  message: string | null,
  rule: FacebookPageCommentRule,
): boolean {
  const body = message?.toLowerCase() || "";
  return rule.sensitiveKeywords.some((keyword) => body.includes(keyword));
}

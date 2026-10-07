import type { InstagramCommentWebhookEvent } from "@/modules/channels/instagram/mapping/comment-webhook";

export type InstagramCommentRule = {
  id: string;
  enabled: boolean;
  priority: number;
  matchAll: boolean;
  mediaIds: readonly string[];
  keywords: readonly string[];
  sensitiveKeywords: readonly string[];
  publicReplyText: string | null;
  privateReplyText: string | null;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function stringList(value: unknown, maxItems = 50, maxLength = 200): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(values.map((item) => clean(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

export function parseInstagramCommentRules(value: unknown): InstagramCommentRule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item, index) => {
    const input = record(item);
    const id = clean(input.id, 80) || `instagram-comment-rule-${index + 1}`;
    const publicReplyText = clean(input.publicReplyText, 2_200) || null;
    const privateReplyText = clean(input.privateReplyText, 1_000) || null;
    const matchAll = input.matchAll === true;
    const mediaIds = stringList(input.mediaIds, 100, 100);
    const keywords = stringList(input.keywords, 50, 100);
    const sensitiveKeywords = stringList(input.sensitiveKeywords, 50, 100);
    if (!matchAll && mediaIds.length === 0 && keywords.length === 0) return [];
    if (!publicReplyText && !privateReplyText) return [];
    return [{
      id,
      enabled: input.enabled !== false,
      priority: Number.isFinite(Number(input.priority)) ? Math.trunc(Number(input.priority)) : 0,
      matchAll,
      mediaIds,
      keywords,
      sensitiveKeywords,
      publicReplyText,
      privateReplyText,
    }];
  });
}

export function parseInstagramCommentRulesJson(raw: string | undefined): InstagramCommentRule[] {
  if (!raw?.trim()) return [];
  try {
    return parseInstagramCommentRules(JSON.parse(raw));
  } catch {
    throw new Error("INSTAGRAM_COMMENT_RULES_JSON is not valid JSON.");
  }
}

function includesKeyword(haystack: string, keywords: readonly string[]): boolean {
  const normalized = haystack.toLocaleLowerCase("en-US");
  return keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase("en-US")));
}

export function instagramCommentRuleMatches(
  rule: InstagramCommentRule,
  event: InstagramCommentWebhookEvent,
): boolean {
  if (!rule.enabled) return false;
  const mediaMatches = rule.mediaIds.length === 0 || Boolean(event.mediaId && rule.mediaIds.includes(event.mediaId));
  const textMatches = rule.keywords.length === 0 || includesKeyword(event.text ?? "", rule.keywords);
  return rule.matchAll ? mediaMatches && textMatches : mediaMatches && textMatches && (rule.mediaIds.length > 0 || rule.keywords.length > 0);
}

export function matchingInstagramCommentRules(
  rules: readonly InstagramCommentRule[],
  event: InstagramCommentWebhookEvent,
): InstagramCommentRule[] {
  return rules
    .filter((rule) => instagramCommentRuleMatches(rule, event))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function instagramCommentIsSensitive(
  rule: InstagramCommentRule,
  event: InstagramCommentWebhookEvent,
): boolean {
  return rule.sensitiveKeywords.length > 0 && includesKeyword(event.text ?? "", rule.sensitiveKeywords);
}

import { getInstagramOutboundMode, isRetriableInstagramError } from "./api-client";

type Environment = Readonly<Record<string, string | undefined>>;

type ApiErrorBody = { error?: { message?: string; code?: number } };
type PublicReplyBody = ApiErrorBody & { id?: string };
type PrivateReplyBody = ApiErrorBody & { recipient_id?: string; message_id?: string; messages?: Array<{ id?: string }> };

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function required(env: Environment, name: string): string {
  const value = clean(env[name]);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function instagramCommentActionMode(env: Environment = process.env): "disabled" | "dry_run" | "live" {
  const requested = clean(env.INSTAGRAM_COMMENT_ACTION_MODE)?.toLowerCase();
  if (requested === "dry_run") return "dry_run";
  if (requested !== "live") return "disabled";
  if (clean(env.INSTAGRAM_COMMENT_ACTION_KILL_SWITCH)?.toLowerCase() !== "off") return "disabled";
  if (!enabled(env.INTEGRATION_EXTERNAL_WRITES_ENABLED)) return "disabled";
  if (!enabled(env.AUTOMATION_ACTIONS_ENABLED)) return "disabled";
  if (getInstagramOutboundMode() !== "live") return "disabled";
  return "live";
}

export function assertInstagramCommentLiveWritesEnabled(env: Environment = process.env): void {
  if (instagramCommentActionMode(env) !== "live") {
    throw new Error("Instagram comment live actions are disabled by runtime policy.");
  }
}

function config(env: Environment) {
  return {
    accessToken: required(env, "INSTAGRAM_ACCESS_TOKEN"),
    accountId: required(env, "INSTAGRAM_ACCOUNT_ID"),
    graphVersion: clean(env.INSTAGRAM_GRAPH_VERSION) ?? "v23.0",
  };
}

function errorFrom(body: ApiErrorBody, status: number, fallback: string): Error {
  const code = body.error?.code ? ` (${body.error.code})` : "";
  return new Error(`${body.error?.message || `${fallback} with HTTP ${status}`}${code}`);
}

async function postJson<T extends ApiErrorBody>(url: URL, token: string, body: unknown): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as T;
    if (!response.ok) throw errorFrom(payload, response.status, "Instagram comment action failed");
    return { status: response.status, body: payload };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendInstagramPublicCommentReply(input: {
  commentId: string;
  text: string;
  env?: Environment;
}) {
  const env = input.env ?? process.env;
  assertInstagramCommentLiveWritesEnabled(env);
  const cfg = config(env);
  const commentId = input.commentId.trim();
  const replyText = input.text.trim().slice(0, 2_200);
  if (!commentId || !replyText) throw new Error("Comment ID and public reply text are required.");
  const url = new URL(`https://graph.instagram.com/${encodeURIComponent(cfg.graphVersion)}/${encodeURIComponent(commentId)}/replies`);
  const result = await postJson<PublicReplyBody>(url, cfg.accessToken, { message: replyText });
  return { replyId: clean(result.body.id), statusCode: result.status };
}

export async function sendInstagramPrivateCommentReply(input: {
  commentId: string;
  text: string;
  env?: Environment;
}) {
  const env = input.env ?? process.env;
  assertInstagramCommentLiveWritesEnabled(env);
  const cfg = config(env);
  const commentId = input.commentId.trim();
  const replyText = input.text.trim().slice(0, 1_000);
  if (!commentId || !replyText) throw new Error("Comment ID and private reply text are required.");
  const url = new URL(`https://graph.instagram.com/${encodeURIComponent(cfg.graphVersion)}/${encodeURIComponent(cfg.accountId)}/messages`);
  const result = await postJson<PrivateReplyBody>(url, cfg.accessToken, {
    recipient: { comment_id: commentId },
    message: { text: replyText },
  });
  return {
    recipientId: clean(result.body.recipient_id),
    messageId: clean(result.body.message_id) ?? clean(result.body.messages?.[0]?.id),
    statusCode: result.status,
  };
}

export { isRetriableInstagramError };

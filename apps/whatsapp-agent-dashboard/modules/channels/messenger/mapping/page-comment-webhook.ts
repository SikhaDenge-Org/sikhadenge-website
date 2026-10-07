type JsonRecord = Record<string, unknown>;

export type FacebookPageCommentEvent = {
  pageId: string;
  commentId: string;
  postId: string | null;
  parentId: string | null;
  senderId: string | null;
  senderName: string | null;
  message: string | null;
  createdAt: Date;
  verb: "ADD" | "EDIT" | "REMOVE" | "UNKNOWN";
  raw: Readonly<JsonRecord>;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): Date {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function verb(value: unknown): FacebookPageCommentEvent["verb"] {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "add" || normalized === "added") return "ADD";
  if (normalized === "edit" || normalized === "edited") return "EDIT";
  if (normalized === "remove" || normalized === "removed") return "REMOVE";
  return "UNKNOWN";
}

function pageCommentFromChange(pageId: string, changeValue: unknown): FacebookPageCommentEvent | null {
  const value = record(changeValue);
  const item = text(value.item)?.toLowerCase();
  if (item && item !== "comment") return null;

  const commentId =
    text(value.comment_id) ||
    text(value.commentId) ||
    text(record(value.comment).id);
  if (!commentId) return null;

  const sender = record(value.sender);
  return {
    pageId,
    commentId,
    postId: text(value.post_id) || text(value.postId),
    parentId: text(value.parent_id) || text(value.parentId),
    senderId: text(value.sender_id) || text(sender.id),
    senderName: text(value.sender_name) || text(sender.name),
    message: text(value.message),
    createdAt: timestamp(value.created_time ?? value.createdAt ?? value.timestamp),
    verb: verb(value.verb),
    raw: value,
  };
}

export function normalizeFacebookPageCommentWebhooks(payload: unknown): FacebookPageCommentEvent[] {
  const root = record(payload);
  if (root.object !== "page") return [];

  const events: FacebookPageCommentEvent[] = [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const pageId = text(entry.id);
    if (!pageId) continue;

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const change = record(changeValue);
      const field = text(change.field)?.toLowerCase();
      if (field !== "feed" && field !== "comments") continue;
      const event = pageCommentFromChange(pageId, change.value);
      if (event) events.push(event);
    }
  }
  return events;
}

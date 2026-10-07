export type InstagramCommentWebhookEvent = {
  accountId: string;
  field: "comments" | "live_comments";
  commentId: string;
  commenterId: string | null;
  username: string | null;
  text: string | null;
  mediaId: string | null;
  mediaProductType: string | null;
  createdAt: Date;
  raw: Readonly<Record<string, unknown>>;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventTime(value: unknown, fallback: unknown): Date {
  const candidate = value ?? fallback;
  if (typeof candidate === "string") {
    const parsed = new Date(candidate);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  const numeric = typeof candidate === "number" ? candidate : Number(candidate);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    const parsed = new Date(milliseconds);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function changesForEntry(entry: JsonRecord): Array<{ field: string; value: JsonRecord }> {
  const output: Array<{ field: string; value: JsonRecord }> = [];
  const directField = text(entry.field)?.toLowerCase();
  if (directField) output.push({ field: directField, value: record(entry.value) });

  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  for (const item of changes) {
    const change = record(item);
    const field = text(change.field)?.toLowerCase();
    if (field) output.push({ field, value: record(change.value) });
  }
  return output;
}

export function normalizeInstagramCommentWebhooks(
  payload: unknown,
): InstagramCommentWebhookEvent[] {
  const root = record(payload);
  if (text(root.object)?.toLowerCase() !== "instagram") return [];

  const events: InstagramCommentWebhookEvent[] = [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const accountId = text(entry.id);
    if (!accountId) continue;

    for (const change of changesForEntry(entry)) {
      if (change.field !== "comments" && change.field !== "live_comments") continue;
      const value = change.value;
      const commentId = text(value.id);
      if (!commentId) continue;
      const from = record(value.from);
      const media = record(value.media);
      events.push({
        accountId,
        field: change.field,
        commentId,
        commenterId: text(from.id),
        username: text(from.username),
        text: text(value.text),
        mediaId: text(media.id),
        mediaProductType: text(media.media_product_type),
        createdAt: eventTime(value.created_time, entry.time),
        raw: value,
      });
    }
  }
  return events;
}

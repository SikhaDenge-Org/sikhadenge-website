type Environment = Readonly<Record<string, string | undefined>>;
type ErrorBody = { error?: { message?: string; code?: number } };
type MediaListBody = ErrorBody & { data?: Array<{ id?: string }> };
type CommentListBody = ErrorBody & { data?: Array<{ id?: string }> };

export type InstagramCommentCapabilityVerification = {
  verified: boolean;
  checkedAt: string;
  accountId: string | null;
  probeMediaId: string | null;
  statusCode: number | null;
  reason: string;
  externalWriteSent: false;
};

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function safeReason(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, 300)
    : "Instagram comment capability verification failed.";
}

export async function verifyInstagramCommentCapabilityReadOnly(input: {
  env?: Environment;
  fetchImpl?: typeof fetch;
  now?: () => Date;
} = {}): Promise<InstagramCommentCapabilityVerification> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const token = clean(env.INSTAGRAM_ACCESS_TOKEN);
  const accountId = clean(env.INSTAGRAM_ACCOUNT_ID) ?? clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const version = clean(env.INSTAGRAM_GRAPH_VERSION) ?? "v23.0";
  if (!token || !accountId) {
    return {
      verified: false,
      checkedAt: now().toISOString(),
      accountId,
      probeMediaId: null,
      statusCode: null,
      reason: "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID are required.",
      externalWriteSent: false,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const mediaUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(version)}/${encodeURIComponent(accountId)}/media`);
    mediaUrl.searchParams.set("fields", "id");
    mediaUrl.searchParams.set("limit", "1");
    const mediaResponse = await fetchImpl(mediaUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const mediaBody = (await mediaResponse.json()) as MediaListBody;
    if (!mediaResponse.ok) {
      return {
        verified: false,
        checkedAt: now().toISOString(),
        accountId,
        probeMediaId: null,
        statusCode: mediaResponse.status,
        reason: safeReason(mediaBody.error?.message),
        externalWriteSent: false,
      };
    }
    const mediaId = clean(mediaBody.data?.[0]?.id);
    if (!mediaId) {
      return {
        verified: false,
        checkedAt: now().toISOString(),
        accountId,
        probeMediaId: null,
        statusCode: mediaResponse.status,
        reason: "No Instagram media is available for a read-only comment permission probe.",
        externalWriteSent: false,
      };
    }

    const commentsUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}/comments`);
    commentsUrl.searchParams.set("fields", "id");
    commentsUrl.searchParams.set("limit", "1");
    const commentsResponse = await fetchImpl(commentsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const commentsBody = (await commentsResponse.json()) as CommentListBody;
    const verified = commentsResponse.ok;
    return {
      verified,
      checkedAt: now().toISOString(),
      accountId,
      probeMediaId: mediaId,
      statusCode: commentsResponse.status,
      reason: verified
        ? "Instagram media/comment read probe passed; no external write was sent."
        : safeReason(commentsBody.error?.message),
      externalWriteSent: false,
    };
  } catch (error) {
    return {
      verified: false,
      checkedAt: now().toISOString(),
      accountId,
      probeMediaId: null,
      statusCode: null,
      reason: error instanceof Error && error.name === "AbortError" ? "Instagram comment capability verification timed out." : safeReason(error instanceof Error ? error.message : error),
      externalWriteSent: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

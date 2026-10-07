type Environment = Readonly<Record<string, string | undefined>>;

type MetaError = { error?: { message?: string } };
type IdentityBody = MetaError & { id?: string; name?: string };
type EdgeBody = MetaError & { data?: Array<{ id?: string }> };

export type MessengerPageCapabilityVerification = {
  verified: boolean;
  checkedAt: string;
  pageId: string | null;
  pageName: string | null;
  conversationReadVerified: boolean;
  commentReadVerified: boolean;
  probePostId: string | null;
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
    : "Facebook Page / Messenger capability verification failed.";
}

async function json<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function verifyMessengerPageCapabilityReadOnly(input: {
  env?: Environment;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
} = {}): Promise<MessengerPageCapabilityVerification> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const timeoutMs = input.timeoutMs ?? 10_000;
  const token = clean(env.MESSENGER_PAGE_ACCESS_TOKEN);
  const pageId = clean(env.MESSENGER_PAGE_ID);
  const version = clean(env.MESSENGER_GRAPH_VERSION) ?? "v23.0";

  const base = {
    checkedAt: now().toISOString(),
    pageId,
    pageName: null,
    conversationReadVerified: false,
    commentReadVerified: false,
    probePostId: null,
    statusCode: null,
    externalWriteSent: false as const,
  };

  if (!token || !pageId) {
    return {
      ...base,
      verified: false,
      reason: "MESSENGER_PAGE_ACCESS_TOKEN and MESSENGER_PAGE_ID are required.",
    };
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("Messenger capability verification timeout is invalid.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = async (url: URL) =>
    fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });

  try {
    const identityUrl = new URL(
      `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(pageId)}`,
    );
    identityUrl.searchParams.set("fields", "id,name");
    const identityResponse = await request(identityUrl);
    const identity = await json<IdentityBody>(identityResponse);
    const returnedId = clean(identity.id);
    if (!identityResponse.ok || returnedId !== pageId) {
      return {
        ...base,
        verified: false,
        statusCode: identityResponse.status,
        reason: safeReason(identity.error?.message ?? "Configured Page identity could not be verified."),
      };
    }

    const conversationsUrl = new URL(
      `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(pageId)}/conversations`,
    );
    conversationsUrl.searchParams.set("fields", "id");
    conversationsUrl.searchParams.set("limit", "1");
    const conversationsResponse = await request(conversationsUrl);
    const conversations = await json<EdgeBody>(conversationsResponse);
    if (!conversationsResponse.ok) {
      return {
        ...base,
        pageName: clean(identity.name),
        verified: false,
        statusCode: conversationsResponse.status,
        reason: safeReason(conversations.error?.message ?? "Messenger conversations read probe failed."),
      };
    }

    const postsUrl = new URL(
      `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(pageId)}/published_posts`,
    );
    postsUrl.searchParams.set("fields", "id");
    postsUrl.searchParams.set("limit", "1");
    const postsResponse = await request(postsUrl);
    const posts = await json<EdgeBody>(postsResponse);
    if (!postsResponse.ok) {
      return {
        ...base,
        pageName: clean(identity.name),
        conversationReadVerified: true,
        verified: false,
        statusCode: postsResponse.status,
        reason: safeReason(posts.error?.message ?? "Facebook Page post read probe failed."),
      };
    }

    const postId = clean(posts.data?.[0]?.id);
    if (!postId) {
      return {
        ...base,
        pageName: clean(identity.name),
        conversationReadVerified: true,
        verified: false,
        statusCode: postsResponse.status,
        reason: "No published Page post is available for a read-only comment capability probe.",
      };
    }

    const commentsUrl = new URL(
      `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(postId)}/comments`,
    );
    commentsUrl.searchParams.set("fields", "id");
    commentsUrl.searchParams.set("limit", "1");
    const commentsResponse = await request(commentsUrl);
    const comments = await json<EdgeBody>(commentsResponse);
    const verified = commentsResponse.ok;

    return {
      ...base,
      pageName: clean(identity.name),
      conversationReadVerified: true,
      commentReadVerified: verified,
      probePostId: postId,
      statusCode: commentsResponse.status,
      verified,
      reason: verified
        ? "Page identity, Messenger conversation read and Page comment read probes passed. No external write was sent."
        : safeReason(comments.error?.message ?? "Facebook Page comment read probe failed."),
    };
  } catch (error) {
    return {
      ...base,
      verified: false,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Facebook Page / Messenger capability verification timed out."
          : safeReason(error instanceof Error ? error.message : error),
    };
  } finally {
    clearTimeout(timer);
  }
}

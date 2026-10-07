export type VerifiableMetaProvider =
  | "META_WHATSAPP"
  | "META_INSTAGRAM"
  | "META_MESSENGER";

export type ReadOnlyVerificationResult = {
  provider: VerifiableMetaProvider;
  verified: boolean;
  checkedAt: string;
  statusCode: number | null;
  accountReference: string | null;
  reason: string;
  externalWriteSent: false;
};

type ProviderConfig = {
  token: string;
  accountId: string;
  graphVersion: string;
};

type Environment = Readonly<Record<string, string | undefined>>;

type VerificationDependencies = {
  env?: Environment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is not configured.`);
  return normalized;
}

function providerConfig(
  provider: VerifiableMetaProvider,
  env: Environment,
): ProviderConfig {
  if (provider === "META_WHATSAPP") {
    return {
      token: required(
        env.WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN,
        "WHATSAPP_ACCESS_TOKEN",
      ),
      accountId: required(
        env.WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID,
        "WHATSAPP_PHONE_NUMBER_ID",
      ),
      graphVersion: required(
        env.WHATSAPP_GRAPH_VERSION ?? env.META_GRAPH_API_VERSION,
        "WHATSAPP_GRAPH_VERSION",
      ),
    };
  }

  if (provider === "META_INSTAGRAM") {
    return {
      token: required(env.INSTAGRAM_ACCESS_TOKEN, "INSTAGRAM_ACCESS_TOKEN"),
      accountId: required(env.INSTAGRAM_ACCOUNT_ID, "INSTAGRAM_ACCOUNT_ID"),
      graphVersion: required(env.INSTAGRAM_GRAPH_VERSION, "INSTAGRAM_GRAPH_VERSION"),
    };
  }

  return {
    token: required(env.MESSENGER_PAGE_ACCESS_TOKEN, "MESSENGER_PAGE_ACCESS_TOKEN"),
    accountId: required(env.MESSENGER_PAGE_ID, "MESSENGER_PAGE_ID"),
    graphVersion: required(env.MESSENGER_GRAPH_VERSION, "MESSENGER_GRAPH_VERSION"),
  };
}

function cleanProvider(value: unknown): VerifiableMetaProvider {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (
    candidate !== "META_WHATSAPP" &&
    candidate !== "META_INSTAGRAM" &&
    candidate !== "META_MESSENGER"
  ) {
    throw new Error("Provider does not support read-only verification.");
  }
  return candidate;
}

function safeReason(value: unknown): string {
  if (typeof value !== "string") return "Provider verification failed.";
  return value.replace(/\s+/g, " ").trim().slice(0, 300) || "Provider verification failed.";
}

export async function verifyMetaProviderReadOnly(
  providerInput: unknown,
  dependencies: VerificationDependencies = {},
): Promise<ReadOnlyVerificationResult> {
  const provider = cleanProvider(providerInput);
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const timeoutMs = dependencies.timeoutMs ?? 10_000;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("Integration verification timeout is invalid.");
  }

  let config: ProviderConfig;
  try {
    config = providerConfig(provider, env);
  } catch (error) {
    return {
      provider,
      verified: false,
      checkedAt: now().toISOString(),
      statusCode: null,
      accountReference: null,
      reason: error instanceof Error ? error.message : "Provider configuration is incomplete.",
      externalWriteSent: false,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.accountId)}`,
    );
    endpoint.searchParams.set("fields", "id");

    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const returnedId = typeof body.id === "string" ? body.id.trim() : "";
    const errorBody =
      body.error && typeof body.error === "object" && !Array.isArray(body.error)
        ? (body.error as Record<string, unknown>)
        : {};
    const verified = response.ok && returnedId === config.accountId;

    return {
      provider,
      verified,
      checkedAt: now().toISOString(),
      statusCode: response.status,
      accountReference: verified ? returnedId : null,
      reason: verified
        ? "Provider API identity check passed. No external write was sent."
        : safeReason(errorBody.message ?? "Provider API identity check did not verify the configured account."),
      externalWriteSent: false,
    };
  } catch (error) {
    return {
      provider,
      verified: false,
      checkedAt: now().toISOString(),
      statusCode: null,
      accountReference: null,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Provider verification timed out."
          : safeReason(error instanceof Error ? error.message : error),
      externalWriteSent: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

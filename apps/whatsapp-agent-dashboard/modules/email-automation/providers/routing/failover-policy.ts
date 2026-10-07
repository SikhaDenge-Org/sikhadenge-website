import type {
  EmailConnection,
  EmailProvider,
  EmailSenderIdentity,
} from "../../domain/contracts";

export type EmailProviderFailoverPolicy = {
  enabled: boolean;
  orderedProviders: readonly EmailProvider[];
};

export type EmailProviderRoute = {
  sender: EmailSenderIdentity;
  connection: EmailConnection;
  failoverUsed: boolean;
};

const EMAIL_PROVIDERS = new Set<EmailProvider>([
  "GOOGLE_GMAIL",
  "MICROSOFT_365",
  "BREVO",
  "AMAZON_SES",
  "RESEND",
]);

export function emailProviderFailoverPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmailProviderFailoverPolicy {
  const enabled = env.EMAIL_PROVIDER_FAILOVER_ENABLED?.trim().toLowerCase() === "true";
  const ordered = (env.EMAIL_PROVIDER_FAILOVER_ORDER || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is EmailProvider => EMAIL_PROVIDERS.has(value as EmailProvider));

  return {
    enabled,
    orderedProviders: Object.freeze([...new Set(ordered)]),
  };
}

function senderUsable(sender: EmailSenderIdentity): boolean {
  return sender.isActive && sender.verificationStatus === "VERIFIED";
}

function connectedRoute(input: {
  sender: EmailSenderIdentity;
  connections: readonly EmailConnection[];
  registeredProviders: ReadonlySet<EmailProvider>;
}): EmailProviderRoute | null {
  if (!senderUsable(input.sender)) return null;
  if (!input.registeredProviders.has(input.sender.provider)) return null;

  const connection = input.connections.find(
    (candidate) =>
      candidate.id === input.sender.connectionId &&
      candidate.workspaceId === input.sender.workspaceId &&
      candidate.provider === input.sender.provider &&
      candidate.status === "CONNECTED",
  );
  if (!connection) return null;

  return {
    sender: input.sender,
    connection,
    failoverUsed: false,
  };
}

export function selectFailoverSender(input: {
  policy: EmailProviderFailoverPolicy;
  primary: EmailSenderIdentity;
  senders: readonly EmailSenderIdentity[];
}): EmailSenderIdentity | null {
  if (!input.policy.enabled) return null;
  for (const provider of input.policy.orderedProviders) {
    if (provider === input.primary.provider) continue;
    const match = input.senders.find(
      (sender) => sender.provider === provider && senderUsable(sender),
    );
    if (match) return match;
  }
  return null;
}

export function selectEmailProviderRoute(input: {
  policy: EmailProviderFailoverPolicy;
  primary: EmailSenderIdentity;
  senders: readonly EmailSenderIdentity[];
  connections: readonly EmailConnection[];
  registeredProviders: readonly EmailProvider[];
}): EmailProviderRoute | null {
  const registeredProviders = new Set(input.registeredProviders);
  const primary = connectedRoute({
    sender: input.primary,
    connections: input.connections,
    registeredProviders,
  });
  if (primary) return primary;
  if (!input.policy.enabled) return null;

  for (const provider of input.policy.orderedProviders) {
    if (provider === input.primary.provider || !registeredProviders.has(provider)) continue;

    const providerSenders = input.senders.filter(
      (sender) =>
        sender.workspaceId === input.primary.workspaceId &&
        sender.provider === provider &&
        senderUsable(sender),
    );
    for (const sender of providerSenders) {
      const route = connectedRoute({
        sender,
        connections: input.connections,
        registeredProviders,
      });
      if (route) return { ...route, failoverUsed: true };
    }
  }

  return null;
}

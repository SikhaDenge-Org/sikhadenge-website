import { EmailConnectionService } from "../application/connection-service";
import { EmailProviderRegistry } from "../providers/provider-registry";
import { GmailEmailProviderAdapter } from "../providers/gmail/gmail-adapter";
import { gmailProviderConfigFromEnv } from "../providers/gmail/config";
import { emailCredentialCryptoConfigFromEnv, PrismaEmailCredentialVault } from "./prisma-credential-vault";
import { PrismaEmailConnectionRepository } from "./prisma-email-connection-repository";
import { PrismaEmailSenderRepository } from "./prisma-email-sender-repository";

export type EmailE1Runtime = {
  service: EmailConnectionService;
  connections: PrismaEmailConnectionRepository;
  senders: PrismaEmailSenderRepository;

  providers: EmailProviderRegistry;
};

export function emailOAuthRedirectUri(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.APP_URL?.trim();
  if (!base) throw new Error("APP_URL is not configured.");
  const url = new URL("/api/email/google/callback", base);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error("Production Gmail OAuth callback must use HTTPS.");
  }
  return url.toString();
}

export function buildEmailE1Runtime(
  env: NodeJS.ProcessEnv = process.env,
): EmailE1Runtime {
  const connections = new PrismaEmailConnectionRepository();
  const senders = new PrismaEmailSenderRepository();
  const credentials = new PrismaEmailCredentialVault(
    emailCredentialCryptoConfigFromEnv(env),
  );
  const providers = new EmailProviderRegistry();
  providers.register(
    new GmailEmailProviderAdapter(
      gmailProviderConfigFromEnv(env),
      credentials,
    ),
  );

  return {
    service: new EmailConnectionService({
      providers,
      connections,
      senders,
      credentials,
    }),
    connections,
    senders,
    providers,
  };
}

export function buildEmailReadRuntime(): Pick<
  EmailE1Runtime,
  "connections" | "senders"
> {
  return {
    connections: new PrismaEmailConnectionRepository(),
    senders: new PrismaEmailSenderRepository(),
  };
}

import type { EmailProvider, EmailProviderAdapter } from "./types";

const adapters = new Map<EmailProvider, EmailProviderAdapter>();

export function registerEmailProviderAdapter(adapter: EmailProviderAdapter): void {
  if (adapters.has(adapter.provider)) {
    throw new Error(`Email provider adapter ${adapter.provider} is already registered.`);
  }
  adapters.set(adapter.provider, adapter);
}

export function getEmailProviderAdapter(provider: EmailProvider): EmailProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) throw new Error(`Email provider adapter ${provider} is not registered.`);
  return adapter;
}

export function listRegisteredEmailProviders(): EmailProvider[] {
  return [...adapters.keys()];
}

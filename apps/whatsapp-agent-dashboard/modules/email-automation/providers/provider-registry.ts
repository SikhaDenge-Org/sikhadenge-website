import type { EmailProvider } from "../domain/contracts";
import type { EmailProviderAdapter } from "./provider-contract";

export class EmailProviderRegistry {
  private readonly adapters = new Map<EmailProvider, EmailProviderAdapter>();

  register(adapter: EmailProviderAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Email provider ${adapter.provider} is already registered.`);
    }
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: EmailProvider): EmailProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`Email provider ${provider} is not registered.`);
    return adapter;
  }

  list(): readonly EmailProvider[] {
    return [...this.adapters.keys()];
  }
}

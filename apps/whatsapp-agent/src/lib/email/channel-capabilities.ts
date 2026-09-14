import type { EmailProvider } from "./types";

export type EmailChannelCapabilities = {
  provider: EmailProvider;
  send: boolean;
  receive: boolean;
  threads: boolean;
  attachments: boolean;
  inlineImages: boolean;
  aliases: boolean;
  deliveryEvents: boolean;
  openTracking: boolean;
  clickTracking: boolean;
};

export const EMAIL_PROVIDER_CAPABILITIES: Record<EmailProvider, EmailChannelCapabilities> = {
  GOOGLE_GMAIL: {
    provider: "GOOGLE_GMAIL",
    send: true,
    receive: true,
    threads: true,
    attachments: true,
    inlineImages: true,
    aliases: true,
    deliveryEvents: false,
    openTracking: false,
    clickTracking: false,
  },
  MICROSOFT_365: {
    provider: "MICROSOFT_365",
    send: true,
    receive: true,
    threads: true,
    attachments: true,
    inlineImages: true,
    aliases: true,
    deliveryEvents: false,
    openTracking: false,
    clickTracking: false,
  },
  BREVO: {
    provider: "BREVO",
    send: true,
    receive: false,
    threads: false,
    attachments: true,
    inlineImages: true,
    aliases: true,
    deliveryEvents: true,
    openTracking: true,
    clickTracking: true,
  },
  AMAZON_SES: {
    provider: "AMAZON_SES",
    send: true,
    receive: false,
    threads: false,
    attachments: true,
    inlineImages: true,
    aliases: true,
    deliveryEvents: true,
    openTracking: false,
    clickTracking: false,
  },
  RESEND: {
    provider: "RESEND",
    send: true,
    receive: false,
    threads: false,
    attachments: true,
    inlineImages: true,
    aliases: true,
    deliveryEvents: true,
    openTracking: true,
    clickTracking: true,
  },
};

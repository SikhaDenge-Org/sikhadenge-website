export type MicrosoftEmailProviderConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  oauthStateSecret: string;
};

export function microsoftEmailProviderConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MicrosoftEmailProviderConfig {
  const clientId = env.MICROSOFT_EMAIL_CLIENT_ID?.trim() || "";
  const clientSecret = env.MICROSOFT_EMAIL_CLIENT_SECRET?.trim() || "";
  const tenantId = env.MICROSOFT_EMAIL_TENANT_ID?.trim() || "";
  const oauthStateSecret = env.MICROSOFT_EMAIL_OAUTH_STATE_SECRET?.trim() || "";
  if (!clientId || !clientSecret || !tenantId || oauthStateSecret.length < 32) {
    throw new Error("Microsoft 365 email OAuth is not configured.");
  }
  return { clientId, clientSecret, tenantId, oauthStateSecret };
}
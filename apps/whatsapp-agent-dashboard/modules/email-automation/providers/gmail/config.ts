export type GmailProviderConfig = {
  clientId: string;
  clientSecret: string;
  oauthStateSecret: string;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function gmailProviderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GmailProviderConfig {
  const oauthStateSecret = required(env, "GOOGLE_GMAIL_OAUTH_STATE_SECRET");
  if (oauthStateSecret.length < 32) {
    throw new Error("GOOGLE_GMAIL_OAUTH_STATE_SECRET must be at least 32 characters.");
  }
  return {
    clientId: required(env, "GOOGLE_GMAIL_CLIENT_ID"),
    clientSecret: required(env, "GOOGLE_GMAIL_CLIENT_SECRET"),
    oauthStateSecret,
  };
}

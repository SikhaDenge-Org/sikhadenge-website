import type {
  EmailConnection,
  EmailSendRequest,
  EmailSendResult,
  EmailSenderIdentity,
} from "../../domain/contracts";
import type {
  EmailCredentialVaultPort,
  EmailOAuthCredentialMaterial,
  EmailOAuthStart,
  EmailProviderAdapter,
  EmailProviderHealth,
} from "../provider-contract";
import type { GmailProviderConfig } from "./config";
import { gmailScopesForPhase } from "./oauth-scopes";
import {
  createGmailOAuthState,
  verifyGmailOAuthState,
} from "./oauth-state";
import {
  gmailSendAsToSenderIdentity,
  type GmailSendAsResource,
} from "./sender-mapping";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL_SEND_AS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

type GmailSendAsList = {
  sendAs?: GmailSendAsResource[];
};

async function responseJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

function formBody(values: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body;
}

export class GmailEmailProviderAdapter implements EmailProviderAdapter {
  readonly provider = "GOOGLE_GMAIL" as const;

  constructor(
    private readonly config: GmailProviderConfig,
    private readonly credentials: EmailCredentialVaultPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async startOAuth(input: {
    workspaceId: string;
    redirectUri: string;
  }): Promise<EmailOAuthStart> {
    const state = createGmailOAuthState({
      workspaceId: input.workspaceId,
      secret: this.config.oauthStateSecret,
      now: this.now().getTime(),
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", gmailScopesForPhase({ inboundEnabled: false }).join(" "));
    url.searchParams.set("state", state);

    return {
      authorizationUrl: url.toString(),
      state,
      provider: this.provider,
    };
  }

  async completeOAuth(input: {
    workspaceId: string;
    redirectUri: string;
    code: string;
    state: string;
  }): Promise<{
    externalAccountId: string;
    displayName: string;
    credentials: EmailOAuthCredentialMaterial;
  }> {
    verifyGmailOAuthState({
      state: input.state,
      secret: this.config.oauthStateSecret,
      expectedWorkspaceId: input.workspaceId,
      now: this.now().getTime(),
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        code: input.code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const token = await responseJson<GoogleTokenResponse>(
      tokenResponse,
      "Google OAuth code exchange",
    );
    if (!token.access_token) {
      throw new Error("Google OAuth code exchange did not return an access token.");
    }

    const user = await this.fetchUserInfo(token.access_token);
    if (!user.sub || !user.email) {
      throw new Error("Google account identity response is incomplete.");
    }

    return {
      externalAccountId: user.sub,
      displayName: user.email,
      credentials: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt:
          typeof token.expires_in === "number"
            ? new Date(this.now().getTime() + token.expires_in * 1000)
            : null,
        scopes: token.scope?.split(/\s+/u).filter(Boolean) ?? [],
      },
    };
  }

  async verifyConnection(connection: EmailConnection): Promise<EmailProviderHealth> {
    try {
      const accessToken = await this.accessToken(connection);
      const identity = await this.fetchUserInfo(accessToken);
      return {
        provider: this.provider,
        connected: Boolean(identity.sub && identity.email),
        checkedAt: this.now(),
        accountReference: identity.email ?? connection.displayName,
        reason: identity.email ? null : "Google account identity is incomplete.",
        externalWriteSent: false,
      };
    } catch {
      return {
        provider: this.provider,
        connected: false,
        checkedAt: this.now(),
        accountReference: connection.displayName,
        reason: "Google account verification failed.",
        externalWriteSent: false,
      };
    }
  }

  async listSenderIdentities(
    connection: EmailConnection,
  ): Promise<readonly EmailSenderIdentity[]> {
    const accessToken = await this.accessToken(connection);
    const response = await fetch(GMAIL_SEND_AS_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const body = await responseJson<GmailSendAsList>(response, "Gmail send-as discovery");
    return (body.sendAs ?? []).map((resource) =>
      gmailSendAsToSenderIdentity({
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        resource,
      }),
    );
  }

  async sendMessage(_request: EmailSendRequest): Promise<EmailSendResult> {
    throw new Error("Gmail external email delivery is disabled until Phase E3.");
  }

  async revoke(connection: EmailConnection): Promise<void> {
    const credentials = await this.credentials.loadOAuthCredentials({
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
    });
    if (!credentials) return;

    const token = credentials.refreshToken ?? credentials.accessToken;
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ token }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Google OAuth revocation failed with HTTP ${response.status}.`);
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    return responseJson<GoogleUserInfo>(response, "Google account verification");
  }

  private async accessToken(connection: EmailConnection): Promise<string> {
    const stored = await this.credentials.loadOAuthCredentials({
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
    });
    if (!stored) throw new Error("Google OAuth credentials are unavailable.");

    const refreshBefore = this.now().getTime() + 60_000;
    if (!stored.expiresAt || stored.expiresAt.getTime() > refreshBefore) {
      return stored.accessToken;
    }
    if (!stored.refreshToken) {
      throw new Error("Google OAuth refresh token is unavailable.");
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: stored.refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const token = await responseJson<GoogleTokenResponse>(response, "Google OAuth token refresh");
    if (!token.access_token) {
      throw new Error("Google OAuth token refresh did not return an access token.");
    }

    const refreshed: EmailOAuthCredentialMaterial = {
      accessToken: token.access_token,
      refreshToken: stored.refreshToken,
      expiresAt:
        typeof token.expires_in === "number"
          ? new Date(this.now().getTime() + token.expires_in * 1000)
          : null,
      scopes: token.scope?.split(/\s+/u).filter(Boolean) ?? stored.scopes,
    };
    await this.credentials.storeOAuthCredentials({
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
      provider: this.provider,
      credentials: refreshed,
    });
    return refreshed.accessToken;
  }
}

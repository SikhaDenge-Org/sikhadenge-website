import { assertEmailExternalDeliveryAllowed, getEmailRuntimePolicy } from "../../application/runtime-policy";
import type { EmailConnection, EmailSendRequest, EmailSendResult, EmailSenderIdentity } from "../../domain/contracts";
import type { EmailCredentialVaultPort, EmailOAuthCredentialMaterial, EmailOAuthStart, EmailProviderAdapter, EmailProviderHealth } from "../provider-contract";
import type { MicrosoftEmailProviderConfig } from "./config";
import { createMicrosoftOAuthState, verifyMicrosoftOAuthState } from "./oauth-state";

const GRAPH = "https://graph.microsoft.com/v1.0";
type Token = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
type Me = { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };

async function responseJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}.`);
  return (await response.json()) as T;
}

export class Microsoft365EmailProviderAdapter implements EmailProviderAdapter {
  readonly provider = "MICROSOFT_365" as const;
  constructor(private readonly config: MicrosoftEmailProviderConfig, private readonly credentials: EmailCredentialVaultPort, private readonly now: () => Date = () => new Date()) {}
  private authBase(): string { return `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0`; }

  async startOAuth(input: { workspaceId: string; redirectUri: string; inboundEnabled?: boolean }): Promise<EmailOAuthStart> {
    const state = createMicrosoftOAuthState({ workspaceId: input.workspaceId, secret: this.config.oauthStateSecret, now: this.now().getTime() });
    const url = new URL(`${this.authBase()}/authorize`);
    url.searchParams.set("client_id", this.config.clientId); url.searchParams.set("response_type", "code"); url.searchParams.set("redirect_uri", input.redirectUri); url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "openid profile email offline_access User.Read Mail.Send Mail.Read"); url.searchParams.set("state", state);
    return { authorizationUrl: url.toString(), state, provider: this.provider };
  }

  async completeOAuth(input: { workspaceId: string; redirectUri: string; code: string; state: string }) {
    verifyMicrosoftOAuthState({ state: input.state, secret: this.config.oauthStateSecret, expectedWorkspaceId: input.workspaceId, now: this.now().getTime() });
    const body = new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, code: input.code, redirect_uri: input.redirectUri, grant_type: "authorization_code", scope: "openid profile email offline_access User.Read Mail.Send Mail.Read" });
    const token = await responseJson<Token>(await fetch(`${this.authBase()}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }), "Microsoft OAuth code exchange");
    if (!token.access_token) throw new Error("Microsoft OAuth did not return an access token.");
    const me = await this.me(token.access_token); if (!me.id) throw new Error("Microsoft profile response is incomplete.");
    return { externalAccountId: me.id, displayName: me.mail || me.userPrincipalName || me.displayName || me.id, credentials: { accessToken: token.access_token, refreshToken: token.refresh_token ?? null, expiresAt: typeof token.expires_in === "number" ? new Date(this.now().getTime() + token.expires_in * 1000) : null, scopes: token.scope?.split(/\s+/u).filter(Boolean) ?? [] } };
  }

  async verifyConnection(connection: EmailConnection): Promise<EmailProviderHealth> {
    try { const me = await this.me(await this.accessToken(connection.workspaceId, connection.id)); return { provider: this.provider, connected: Boolean(me.id), checkedAt: this.now(), accountReference: me.mail || me.userPrincipalName || connection.displayName, reason: me.id ? null : "Microsoft profile is incomplete.", externalWriteSent: false }; }
    catch { return { provider: this.provider, connected: false, checkedAt: this.now(), accountReference: connection.displayName, reason: "Microsoft account verification failed.", externalWriteSent: false }; }
  }

  async listSenderIdentities(connection: EmailConnection): Promise<readonly EmailSenderIdentity[]> {
    const me = await this.me(await this.accessToken(connection.workspaceId, connection.id)); const address = (me.mail || me.userPrincipalName || "").trim().toLowerCase(); if (!address) throw new Error("Microsoft account has no sender email address.");
    return [{ id: `ms:${connection.id}:${address}`, workspaceId: connection.workspaceId, connectionId: connection.id, provider: this.provider, fromName: me.displayName || address, fromEmail: address, replyToEmail: null, externalSenderId: address, verificationStatus: "VERIFIED", isProviderDefault: true, isWorkspaceDefault: false, isActive: true, dailyLimit: null }];
  }

  async sendMessage(request: EmailSendRequest): Promise<EmailSendResult> {
    assertEmailExternalDeliveryAllowed(getEmailRuntimePolicy()); const token = await this.accessToken(request.workspaceId, request.connectionId);
    const recipients = (items: readonly { email: string; name?: string }[] | undefined) => (items ?? []).map((item) => ({ emailAddress: { address: item.email, ...(item.name ? { name: item.name } : {}) } }));
    const attachments = (request.attachments ?? []).filter((item) => item.contentBase64).map((item) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: item.fileName, contentType: item.mimeType, contentBytes: item.contentBase64 }));
    const response = await fetch(`${GRAPH}/me/sendMail`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { subject: request.rendered.subject, body: { contentType: "HTML", content: request.rendered.html }, toRecipients: recipients(request.to), ccRecipients: recipients(request.cc), bccRecipients: recipients(request.bcc), ...(request.replyTo ? { replyTo: [{ emailAddress: { address: request.replyTo.email, ...(request.replyTo.name ? { name: request.replyTo.name } : {}) } }] } : {}), attachments }, saveToSentItems: true }), cache: "no-store" });
    if (response.status !== 202) throw new Error(`Microsoft Graph sendMail failed with HTTP ${response.status}.`);
    return { accepted: true, status: "SENT", providerMessageId: null, providerThreadId: request.providerThreadId ?? null, externalRequestSent: true };
  }

  async revoke(connection: EmailConnection): Promise<void> {
    // Microsoft Graph revokeSignInSessions is intentionally not used here: it revokes all
    // application refresh tokens/session cookies for the user and requires broad consent.
    // EmailConnectionService performs the app-scoped disconnect by deleting our encrypted
    // credential material and marking this connection REVOKED after this adapter hook returns.
    await this.credentials.loadOAuthCredentials({ workspaceId: connection.workspaceId, connectionId: connection.id });
  }
  private async me(token: string): Promise<Me> { return responseJson<Me>(await fetch(`${GRAPH}/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }), "Microsoft profile lookup"); }
  private async accessToken(workspaceId: string, connectionId: string): Promise<string> {
    const stored = await this.credentials.loadOAuthCredentials({ workspaceId, connectionId }); if (!stored) throw new Error("Microsoft OAuth credentials are unavailable.");
    if (!stored.expiresAt || stored.expiresAt.getTime() > this.now().getTime() + 60_000) return stored.accessToken; if (!stored.refreshToken) throw new Error("Microsoft refresh token is unavailable.");
    const body = new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: stored.refreshToken, grant_type: "refresh_token", scope: "openid profile email offline_access User.Read Mail.Send Mail.Read" });
    const token = await responseJson<Token>(await fetch(`${this.authBase()}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }), "Microsoft token refresh"); if (!token.access_token) throw new Error("Microsoft token refresh returned no access token.");
    const next: EmailOAuthCredentialMaterial = { accessToken: token.access_token, refreshToken: token.refresh_token ?? stored.refreshToken, expiresAt: typeof token.expires_in === "number" ? new Date(this.now().getTime() + token.expires_in * 1000) : null, scopes: token.scope?.split(/\s+/u).filter(Boolean) ?? stored.scopes };
    await this.credentials.storeOAuthCredentials({ workspaceId, connectionId, provider: this.provider, credentials: next }); return next.accessToken;
  }
}
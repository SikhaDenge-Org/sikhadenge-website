import type {
  EmailConnection,
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
  EmailSenderIdentity,
} from "../domain/contracts";

export type EmailProviderHealth = {
  provider: EmailProvider;
  connected: boolean;
  checkedAt: Date;
  accountReference: string | null;
  reason: string | null;
  externalWriteSent: false;
};

export type EmailOAuthStart = {
  authorizationUrl: string;
  state: string;
  provider: EmailProvider;
};

export type EmailOAuthCallback = {
  code: string;
  state: string;
};

export type EmailOAuthCredentialMaterial = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: readonly string[];
};

export interface EmailCredentialVaultPort {
  storeOAuthCredentials(input: {
    workspaceId: string;
    connectionId: string;
    provider: EmailProvider;
    credentials: EmailOAuthCredentialMaterial;
  }): Promise<void>;
  loadOAuthCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<EmailOAuthCredentialMaterial | null>;
  hasUsableCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<boolean>;
  revokeCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<void>;
}

export interface EmailProviderAdapter {
  readonly provider: EmailProvider;
  startOAuth(input: { workspaceId: string; redirectUri: string }): Promise<EmailOAuthStart>;
  completeOAuth(input: EmailOAuthCallback & { workspaceId: string; redirectUri: string }): Promise<{
    externalAccountId: string;
    displayName: string;
    credentials: EmailOAuthCredentialMaterial;
  }>;
  verifyConnection(connection: EmailConnection): Promise<EmailProviderHealth>;
  listSenderIdentities(connection: EmailConnection): Promise<readonly EmailSenderIdentity[]>;
  sendMessage(request: EmailSendRequest): Promise<EmailSendResult>;
  revoke(connection: EmailConnection): Promise<void>;
}

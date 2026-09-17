import type { EmailConnection, EmailProvider, EmailSenderIdentity } from "../domain/contracts";
import type { EmailConnectionRepository, EmailSenderRepository } from "../infrastructure/repositories";
import type { EmailCredentialVaultPort } from "../providers/provider-contract";
import { EmailProviderRegistry } from "../providers/provider-registry";

export type EmailConnectionServiceDeps = {
  providers: EmailProviderRegistry;
  connections: EmailConnectionRepository;
  senders: EmailSenderRepository;
  credentials: EmailCredentialVaultPort;
  now?: () => Date;
  id?: () => string;
};

export class EmailConnectionService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(private readonly deps: EmailConnectionServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.id = deps.id ?? (() => crypto.randomUUID());
  }

  startOAuth(input: {
    workspaceId: string;
    provider: EmailProvider;
    redirectUri: string;
  }) {
    return this.deps.providers.get(input.provider).startOAuth({
      workspaceId: input.workspaceId,
      redirectUri: input.redirectUri,
    });
  }

  async completeOAuth(input: {
    workspaceId: string;
    provider: EmailProvider;
    redirectUri: string;
    code: string;
    state: string;
  }): Promise<{ connection: EmailConnection; senders: readonly EmailSenderIdentity[] }> {
    const adapter = this.deps.providers.get(input.provider);
    const oauth = await adapter.completeOAuth(input);
    const now = this.now();
    const workspaceConnections = await this.deps.connections.listByWorkspace(input.workspaceId);
    const existingConnection = workspaceConnections.find(
      (connection) =>
        connection.provider === input.provider &&
        connection.status !== "REVOKED" &&
        connection.externalAccountId === oauth.externalAccountId,
    );
    const connectionId = existingConnection?.id ?? this.id();

    const pendingConnection: EmailConnection = {
      id: connectionId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      displayName: oauth.displayName,
      externalAccountId: oauth.externalAccountId,
      status: existingConnection?.status ?? "PENDING",
      connectedAt: existingConnection?.connectedAt ?? null,
      lastVerifiedAt: existingConnection?.lastVerifiedAt ?? null,
      revokedAt: null,
    };

    if (!existingConnection) {
      await this.deps.connections.save(pendingConnection);
    }

    const previousCredentials = existingConnection
      ? await this.deps.credentials.loadOAuthCredentials({
          workspaceId: input.workspaceId,
          connectionId,
        })
      : null;
    await this.deps.credentials.storeOAuthCredentials({
      workspaceId: input.workspaceId,
      connectionId,
      provider: input.provider,
      credentials: {
        ...oauth.credentials,
        refreshToken: oauth.credentials.refreshToken ?? previousCredentials?.refreshToken ?? null,
      },
    });

    const discovered = await adapter.listSenderIdentities(pendingConnection);
    if (discovered.length === 0) throw new Error("Email provider did not return any sender identities.");
    const connection: EmailConnection = {
      ...pendingConnection,
      status: "CONNECTED",
      connectedAt: existingConnection?.connectedAt ?? now,
      lastVerifiedAt: now,
    };
    await this.deps.connections.save(connection);
    const senders = await this.deps.senders.replaceConnectionSenders({
      workspaceId: input.workspaceId,
      connectionId,
      senders: discovered,
    });

    return { connection, senders };
  }

  async refreshSenders(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<readonly EmailSenderIdentity[]> {
    const connection = await this.requireConnection(input);
    if (!(await this.deps.credentials.hasUsableCredentials(input))) {
      throw new Error("Email connection credentials are unavailable or expired.");
    }

    const adapter = this.deps.providers.get(connection.provider);
    const discovered = await adapter.listSenderIdentities(connection);
    return this.deps.senders.replaceConnectionSenders({ ...input, senders: discovered });
  }

  async setDefaultSender(input: {
    workspaceId: string;
    senderIdentityId: string;
  }): Promise<void> {
    const senders = await this.deps.senders.listByWorkspace(input.workspaceId);
    const sender = senders.find((item) => item.id === input.senderIdentityId);
    if (!sender) throw new Error("Email sender does not exist in this workspace.");
    if (!sender.isActive || sender.verificationStatus !== "VERIFIED") {
      throw new Error("Only a verified active email sender can be the workspace default.");
    }
    await this.deps.senders.setWorkspaceDefault(input);
  }

  async revoke(input: { workspaceId: string; connectionId: string }): Promise<void> {
    const connection = await this.requireConnection(input);
    await this.deps.providers.get(connection.provider).revoke(connection);
    await this.deps.credentials.revokeCredentials(input);
    await this.deps.connections.save({
      ...connection,
      status: "REVOKED",
      revokedAt: this.now(),
    });
  }

  private async requireConnection(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<EmailConnection> {
    const connection = await this.deps.connections.getById(input);
    if (!connection) throw new Error("Email connection not found.");
    return connection;
  }
}

import { prisma } from "@/lib/db/prisma";

import type { EmailProvider } from "../domain/contracts";
import type { EmailCredentialVaultPort, EmailOAuthCredentialMaterial } from "../providers/provider-contract";
import {
  decryptEmailCredential,
  encryptEmailCredential,
  parseEmailCredentialKeyBase64,
} from "./credential-crypto";

const ACCESS_TOKEN_KIND = "ACCESS_TOKEN";
const REFRESH_TOKEN_KIND = "REFRESH_TOKEN";

export type EmailCredentialCryptoConfig = {
  key: Buffer;
  keyVersion: string;
};

export function emailCredentialCryptoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmailCredentialCryptoConfig {
  const keyVersion = env.EMAIL_CREDENTIAL_KEY_VERSION?.trim() || "email-v1";
  return {
    key: parseEmailCredentialKeyBase64(
      env.EMAIL_CREDENTIAL_ENCRYPTION_KEY_B64 ?? "",
    ),
    keyVersion,
  };
}

export class PrismaEmailCredentialVault implements EmailCredentialVaultPort {
  constructor(
    private readonly crypto: EmailCredentialCryptoConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async storeOAuthCredentials(input: {
    workspaceId: string;
    connectionId: string;
    provider: EmailProvider;
    credentials: EmailOAuthCredentialMaterial;
  }): Promise<void> {
    if (input.provider !== "GOOGLE_GMAIL") {
      throw new Error(`Email credential provider ${input.provider} is not enabled in E1.`);
    }
    await this.assertOwnedEmailConnection(input.workspaceId, input.connectionId);

    const access = encryptEmailCredential({
      plaintext: input.credentials.accessToken,
      key: this.crypto.key,
      keyVersion: this.crypto.keyVersion,
    });

    await prisma.engageConnectionCredential.upsert({
      where: {
        connectionId_kind: {
          connectionId: input.connectionId,
          kind: ACCESS_TOKEN_KIND,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        kind: ACCESS_TOKEN_KIND,
        ...access,
        expiresAt: input.credentials.expiresAt,
      },
      update: {
        workspaceId: input.workspaceId,
        ...access,
        expiresAt: input.credentials.expiresAt,
      },
    });

    if (input.credentials.refreshToken) {
      const refresh = encryptEmailCredential({
        plaintext: input.credentials.refreshToken,
        key: this.crypto.key,
        keyVersion: this.crypto.keyVersion,
      });
      await prisma.engageConnectionCredential.upsert({
        where: {
          connectionId_kind: {
            connectionId: input.connectionId,
            kind: REFRESH_TOKEN_KIND,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          kind: REFRESH_TOKEN_KIND,
          ...refresh,
          expiresAt: null,
        },
        update: {
          workspaceId: input.workspaceId,
          ...refresh,
          expiresAt: null,
        },
      });
    }
  }

  async loadOAuthCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<EmailOAuthCredentialMaterial | null> {
    await this.assertOwnedEmailConnection(input.workspaceId, input.connectionId);
    const records = await prisma.engageConnectionCredential.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        kind: { in: [ACCESS_TOKEN_KIND, REFRESH_TOKEN_KIND] },
      },
    });
    const access = records.find((record) => record.kind === ACCESS_TOKEN_KIND);
    if (!access) return null;
    const refresh = records.find((record) => record.kind === REFRESH_TOKEN_KIND);

    return {
      accessToken: decryptEmailCredential({
        encrypted: {
          algorithm: access.algorithm as "AES_256_GCM",
          keyVersion: access.keyVersion,
          initializationVector: access.initializationVector,
          authenticationTag: access.authenticationTag,
          ciphertext: access.ciphertext,
        },
        key: this.crypto.key,
      }),
      refreshToken: refresh
        ? decryptEmailCredential({
            encrypted: {
              algorithm: refresh.algorithm as "AES_256_GCM",
              keyVersion: refresh.keyVersion,
              initializationVector: refresh.initializationVector,
              authenticationTag: refresh.authenticationTag,
              ciphertext: refresh.ciphertext,
            },
            key: this.crypto.key,
          })
        : null,
      expiresAt: access.expiresAt,
      scopes: [],
    };
  }

  async hasUsableCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<boolean> {
    await this.assertOwnedEmailConnection(input.workspaceId, input.connectionId);
    const records = await prisma.engageConnectionCredential.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        kind: { in: [ACCESS_TOKEN_KIND, REFRESH_TOKEN_KIND] },
      },
      select: { kind: true, expiresAt: true },
    });

    if (records.some((record) => record.kind === REFRESH_TOKEN_KIND)) return true;
    const access = records.find((record) => record.kind === ACCESS_TOKEN_KIND);
    return Boolean(
      access &&
        (!access.expiresAt || access.expiresAt.getTime() > this.now().getTime()),
    );
  }

  async revokeCredentials(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<void> {
    await this.assertOwnedEmailConnection(input.workspaceId, input.connectionId);
    await prisma.engageConnectionCredential.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        kind: { in: [ACCESS_TOKEN_KIND, REFRESH_TOKEN_KIND] },
      },
    });
  }

  private async assertOwnedEmailConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<void> {
    const connection = await prisma.engageChannelConnection.findFirst({
      where: {
        id: connectionId,
        workspaceId,
        channel: "EMAIL",
      },
      select: { id: true },
    });
    if (!connection) {
      throw new Error("Email connection does not exist in this workspace.");
    }
  }
}

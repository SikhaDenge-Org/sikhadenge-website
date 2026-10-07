import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type {
  EncryptedCredentialPayload,
} from "@/modules/channels/core/security/credential-vault";

export const WEBHOOK_SECRET_ALGORITHM =
  "AES_256_GCM" as const;

export type EncryptedWebhookSecret =
  EncryptedCredentialPayload;

function assertEncryptionKey(
  key: Buffer,
): void {
  if (key.length !== 32) {
    throw new Error(
      "Webhook encryption key must be exactly 32 bytes.",
    );
  }
}

function assertKeyVersion(
  keyVersion: string,
): void {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) {
    throw new Error(
      "Webhook encryption key version is invalid.",
    );
  }
}

export function encryptWebhookSecret(input: {
  plaintext: string;
  key: Buffer;
  keyVersion: string;
}): EncryptedWebhookSecret {
  assertEncryptionKey(input.key);
  assertKeyVersion(input.keyVersion);

  if (input.plaintext.length < 32) {
    throw new Error(
      "Webhook signing secret is too short.",
    );
  }

  const initializationVector =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      input.key,
      initializationVector,
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        input.plaintext,
        "utf8",
      ),
      cipher.final(),
    ]);

  return {
    algorithm:
      WEBHOOK_SECRET_ALGORITHM,
    keyVersion:
      input.keyVersion,
    initializationVector:
      initializationVector
        .toString("base64"),
    authenticationTag:
      cipher
        .getAuthTag()
        .toString("base64"),
    ciphertext:
      ciphertext
        .toString("base64"),
  };
}

export function decryptWebhookSecret(input: {
  encrypted: EncryptedWebhookSecret;
  key: Buffer;
  expectedKeyVersion?: string;
}): string {
  assertEncryptionKey(input.key);
  assertKeyVersion(
    input.encrypted.keyVersion,
  );

  if (
    input.encrypted.algorithm !==
      WEBHOOK_SECRET_ALGORITHM ||
    (
      input.expectedKeyVersion &&
      input.encrypted.keyVersion !==
        input.expectedKeyVersion
    )
  ) {
    throw new Error(
      "Webhook secret encryption metadata is invalid.",
    );
  }

  const initializationVector =
    Buffer.from(
      input.encrypted.initializationVector,
      "base64",
    );

  const authenticationTag =
    Buffer.from(
      input.encrypted.authenticationTag,
      "base64",
    );

  if (
    initializationVector.length !== 12 ||
    authenticationTag.length !== 16
  ) {
    throw new Error(
      "Webhook secret encryption metadata is invalid.",
    );
  }

  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      input.key,
      initializationVector,
    );

  decipher.setAuthTag(
    authenticationTag,
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        input.encrypted.ciphertext,
        "base64",
      ),
    ),
    decipher.final(),
  ]).toString("utf8");
}

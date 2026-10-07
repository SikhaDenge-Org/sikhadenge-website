import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type { EncryptedCredentialPayload } from "@/modules/channels/core/security/credential-vault";

const EMAIL_CREDENTIAL_ALGORITHM = "AES_256_GCM" as const;

function assertKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error("Email credential encryption key must be exactly 32 bytes.");
  }
}

function assertKeyVersion(value: string): void {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
    throw new Error("Email credential key version is invalid.");
  }
}

export function parseEmailCredentialKeyBase64(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) throw new Error("Email credential encryption key is not configured.");
  const key = Buffer.from(normalized, "base64");
  assertKey(key);
  return key;
}

export function encryptEmailCredential(input: {
  plaintext: string;
  key: Buffer;
  keyVersion: string;
}): EncryptedCredentialPayload {
  assertKey(input.key);
  assertKeyVersion(input.keyVersion);
  if (!input.plaintext) throw new Error("Email credential plaintext is empty.");

  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.key, initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: EMAIL_CREDENTIAL_ALGORITHM,
    keyVersion: input.keyVersion,
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptEmailCredential(input: {
  encrypted: EncryptedCredentialPayload;
  key: Buffer;
  expectedKeyVersion?: string;
}): string {
  assertKey(input.key);
  assertKeyVersion(input.encrypted.keyVersion);
  if (
    input.encrypted.algorithm !== EMAIL_CREDENTIAL_ALGORITHM ||
    (input.expectedKeyVersion && input.encrypted.keyVersion !== input.expectedKeyVersion)
  ) {
    throw new Error("Email credential encryption metadata is invalid.");
  }

  const initializationVector = Buffer.from(
    input.encrypted.initializationVector,
    "base64",
  );
  const authenticationTag = Buffer.from(
    input.encrypted.authenticationTag,
    "base64",
  );
  if (initializationVector.length !== 12 || authenticationTag.length !== 16) {
    throw new Error("Email credential encryption metadata is invalid.");
  }

  const decipher = createDecipheriv("aes-256-gcm", input.key, initializationVector);
  decipher.setAuthTag(authenticationTag);
  return Buffer.concat([
    decipher.update(Buffer.from(input.encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

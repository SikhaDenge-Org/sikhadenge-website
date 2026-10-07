import { timingSafeEqual } from "node:crypto";

function configured(name: string, env: NodeJS.ProcessEnv = process.env): string { return env[name]?.trim() || ""; }
export function isEmailInternalBearerAuthorized(header: string | null, envName: "EMAIL_INBOUND_WEBHOOK_TOKEN" | "EMAIL_AUTOMATION_WEBHOOK_TOKEN", env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = configured(envName, env); if (!secret || secret.length < 32 || !header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim()); if (!match) return false;
  const actual = Buffer.from(match[1].trim()); const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

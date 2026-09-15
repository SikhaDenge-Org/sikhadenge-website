import { timingSafeEqual } from "node:crypto";

function bearerToken(value: string | null): string {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EmailAutomationSchedulerTokenEnvironment = Readonly<Record<string, string | undefined>>;

export function emailAutomationSchedulerToken(env: EmailAutomationSchedulerTokenEnvironment = process.env): string {
  return env.EMAIL_AUTOMATION_SCHEDULER_TOKEN?.trim() || "";
}

export function isEmailAutomationSchedulerAuthorized(
  authorization: string | null,
  configuredToken = emailAutomationSchedulerToken(),
): boolean {
  const presented = bearerToken(authorization);
  return Boolean(configuredToken && presented && constantTimeEqual(presented, configuredToken));
}
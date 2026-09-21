import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";

const EVENT_TYPE = "integration_config";
const TEST_EVENT_TYPE = "integration_test";

export type IntegrationProvider =
  | "META_WHATSAPP"
  | "OPENAI"
  | "GOOGLE_SHEETS"
  | "GOOGLE_CALENDAR"
  | "RAZORPAY"
  | "GENERIC_WEBHOOK";

type StoredIntegration = {
  id: string;
  provider: IntegrationProvider;
  name: string;
  enabled: boolean;
  endpointUrl: string | null;
  accountReference: string | null;
  notes: string | null;
  secretSource: "ENVIRONMENT" | "NOT_REQUIRED";
  status: "DRAFT" | "READY" | "DISABLED" | "ERROR";
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const PROVIDERS: Array<{
  provider: IntegrationProvider;
  label: string;
  description: string;
  secretEnvironment: string[];
  externalWriteLock: string | null;
}> = [
  {
    provider: "META_WHATSAPP",
    label: "Meta WhatsApp Cloud API",
    description: "Verified webhook, template sync, media and outbound message delivery.",
    secretEnvironment: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID"],
    externalWriteLock: "WHATSAPP_OUTBOUND_MODE",
  },
  {
    provider: "OPENAI",
    label: "OpenAI",
    description: "Provider-neutral AI decision generation with guarded runtime controls.",
    secretEnvironment: ["OPENAI_API_KEY"],
    externalWriteLock: "AGENT_MODEL_CALLS_ENABLED",
  },
  {
    provider: "GOOGLE_SHEETS",
    label: "Google Sheets",
    description: "Controlled lead, campaign and reporting synchronisation foundation.",
    secretEnvironment: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    externalWriteLock: "INTEGRATION_EXTERNAL_WRITES_ENABLED",
  },
  {
    provider: "GOOGLE_CALENDAR",
    label: "Google Calendar",
    description: "Appointment calendar synchronisation and meeting-link foundation.",
    secretEnvironment: ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_CALENDAR_ID"],
    externalWriteLock: "INTEGRATION_EXTERNAL_WRITES_ENABLED",
  },
  {
    provider: "RAZORPAY",
    label: "Razorpay",
    description: "Payment verification and webhook reconciliation foundation.",
    secretEnvironment: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    externalWriteLock: "PAYMENT_EXTERNAL_ACTIONS_ENABLED",
  },
  {
    provider: "GENERIC_WEBHOOK",
    label: "Generic Webhook API",
    description: "Signed outbound webhook foundation for approved third-party systems.",
    secretEnvironment: ["INTEGRATION_WEBHOOK_SIGNING_SECRET"],
    externalWriteLock: "INTEGRATION_EXTERNAL_WRITES_ENABLED",
  },
];

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function nullable(value: unknown, maximum: number): string | null {
  const result = clean(value, maximum);
  return result || null;
}

function booleanEnvironment(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled", "live"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function providerValue(value: unknown): IntegrationProvider {
  const candidate = clean(value, 40).toUpperCase() as IntegrationProvider;
  if (!PROVIDERS.some((item) => item.provider === candidate)) {
    throw new Error("Integration provider is invalid.");
  }
  return candidate;
}

function safeEndpoint(value: unknown): string | null {
  const raw = nullable(value, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Integration endpoint URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("Integration endpoint must use HTTPS.");
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
    throw new Error("Local integration endpoints are not allowed.");
  }
  url.username = "";
  url.password = "";
  return url.toString().slice(0, 500);
}

function parseIntegration(payload: Prisma.JsonValue): StoredIntegration | null {
  const source = record(payload);
  const id = clean(source.id, 80);
  const name = clean(source.name, 120);
  if (!id || !name) return null;
  const provider = clean(source.provider, 40) as IntegrationProvider;
  if (!PROVIDERS.some((item) => item.provider === provider)) return null;
  const status = clean(source.status, 20).toUpperCase() as StoredIntegration["status"];
  return {
    id,
    provider,
    name,
    enabled: source.enabled === true,
    endpointUrl: nullable(source.endpointUrl, 500),
    accountReference: nullable(source.accountReference, 160),
    notes: nullable(source.notes, 1_000),
    secretSource: source.secretSource === "NOT_REQUIRED" ? "NOT_REQUIRED" : "ENVIRONMENT",
    status: ["DRAFT", "READY", "DISABLED", "ERROR"].includes(status) ? status : "DRAFT",
    lastTestedAt: nullable(source.lastTestedAt, 40),
    lastTestResult: nullable(source.lastTestResult, 500),
    createdBy: clean(source.createdBy, 100),
    createdAt: clean(source.createdAt, 40),
    updatedAt: clean(source.updatedAt, 40),
  };
}

function providerReadiness(provider: IntegrationProvider) {
  const definition = PROVIDERS.find((item) => item.provider === provider)!;
  const configured = definition.secretEnvironment.map((name) => ({
    name,
    configured: Boolean(process.env[name]?.trim()),
  }));
  const lock = definition.externalWriteLock;
  const externalWriteEnabled = lock
    ? lock === "WHATSAPP_OUTBOUND_MODE"
      ? process.env.WHATSAPP_OUTBOUND_MODE?.trim().toLowerCase() === "live"
      : booleanEnvironment(lock, false)
    : false;
  return {
    ...definition,
    secrets: configured,
    secretsConfigured: configured.length === 0 || configured.every((item) => item.configured),
    externalWriteEnabled,
  };
}

export async function getIntegrationOverview() {
  const events = await prisma.webhookEvent.findMany({
    where: { eventType: EVENT_TYPE },
    orderBy: { receivedAt: "desc" },
    take: 100,
    select: { payload: true, receivedAt: true },
  });
  const configurations = events
    .map((event) => parseIntegration(event.payload))
    .filter(Boolean) as StoredIntegration[];
  return {
    providers: PROVIDERS.map((item) => providerReadiness(item.provider)),
    configurations,
    externalWritesGloballyEnabled: booleanEnvironment("INTEGRATION_EXTERNAL_WRITES_ENABLED", false),
    generatedAt: new Date().toISOString(),
  };
}

export async function saveIntegration(input: {
  id?: unknown;
  provider: unknown;
  name: unknown;
  enabled?: unknown;
  endpointUrl?: unknown;
  accountReference?: unknown;
  notes?: unknown;
  actorId: string;
}) {
  const provider = providerValue(input.provider);
  const name = clean(input.name, 120);
  if (name.length < 3) throw new Error("Integration name must contain at least 3 characters.");
  const id = clean(input.id, 80) || randomUUID();
  const eventKey = `integration-config:${id}`;
  const existingEvent = await prisma.webhookEvent.findUnique({ where: { eventKey } });
  const existing = existingEvent ? parseIntegration(existingEvent.payload) : null;
  const readiness = providerReadiness(provider);
  const enabled = input.enabled === true;
  const now = new Date().toISOString();
  const configuration: StoredIntegration = {
    id,
    provider,
    name,
    enabled,
    endpointUrl: safeEndpoint(input.endpointUrl),
    accountReference: nullable(input.accountReference, 160),
    notes: nullable(input.notes, 1_000),
    secretSource: "ENVIRONMENT",
    status: enabled
      ? readiness.secretsConfigured
        ? "READY"
        : "ERROR"
      : existing?.status === "DRAFT"
        ? "DRAFT"
        : "DISABLED",
    lastTestedAt: existing?.lastTestedAt ?? null,
    lastTestResult: existing?.lastTestResult ?? null,
    createdBy: existing?.createdBy || input.actorId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await prisma.$transaction([
    existingEvent
      ? prisma.webhookEvent.update({
          where: { id: existingEvent.id },
          data: { payload: toJson(configuration), processedAt: new Date(), processingError: null },
        })
      : prisma.webhookEvent.create({
          data: {
            eventKey,
            eventType: EVENT_TYPE,
            payload: toJson(configuration),
            processedAt: new Date(),
            attemptCount: 1,
          },
        }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: existing ? "INTEGRATION_UPDATED" : "INTEGRATION_CREATED",
        entityType: "IntegrationConfiguration",
        entityId: id,
        before: existing ? toJson({ provider: existing.provider, enabled: existing.enabled, status: existing.status }) : undefined,
        after: toJson({ provider, enabled, status: configuration.status, secretsStored: false }),
      },
    }),
  ]);
  return configuration;
}

export async function testIntegration(input: {
  integrationId: unknown;
  actorId: string;
}) {
  const integrationId = clean(input.integrationId, 80);
  const event = await prisma.webhookEvent.findUnique({
    where: { eventKey: `integration-config:${integrationId}` },
  });
  const configuration = event ? parseIntegration(event.payload) : null;
  if (!event || !configuration) throw new Error("Integration configuration not found.");
  const readiness = providerReadiness(configuration.provider);
  const result = readiness.secretsConfigured
    ? "Configuration validation passed. No external request was sent."
    : "Required environment secrets are not fully configured.";
  const testedAt = new Date().toISOString();
  const updated: StoredIntegration = {
    ...configuration,
    status: readiness.secretsConfigured ? (configuration.enabled ? "READY" : "DISABLED") : "ERROR",
    lastTestedAt: testedAt,
    lastTestResult: result,
    updatedAt: testedAt,
  };
  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { id: event.id },
      data: { payload: toJson(updated), processingError: readiness.secretsConfigured ? null : result },
    }),
    prisma.webhookEvent.create({
      data: {
        eventKey: `integration-test:${integrationId}:${randomUUID()}`,
        eventType: TEST_EVENT_TYPE,
        payload: toJson({ integrationId, provider: configuration.provider, dryRun: true, result, testedAt }),
        processedAt: new Date(),
        attemptCount: 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "INTEGRATION_DRY_RUN_TESTED",
        entityType: "IntegrationConfiguration",
        entityId: integrationId,
        after: toJson({ provider: configuration.provider, dryRun: true, secretsConfigured: readiness.secretsConfigured }),
      },
    }),
  ]);
  return { integration: updated, dryRun: true, externalRequestSent: false };
}

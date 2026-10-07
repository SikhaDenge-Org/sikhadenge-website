import { resolveCname, resolveTxt } from "node:dns/promises";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { EmailProvider } from "../domain/contracts";
import type { EmailDeliverabilitySnapshot } from "./deliverability-guardrails";

const EVIDENCE_VERSION = 1;
const DEFAULT_REFRESH_MINUTES = 60;
const DEFAULT_REPUTATION_WINDOW_HOURS = 168;

export type EmailDeliverabilityDnsResolver = {
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveCname(hostname: string): Promise<string[]>;
};

export type EmailDomainAuthenticationEvidence = {
  domain: string;
  provider: EmailProvider;
  spfAligned: boolean | null;
  dkimAligned: boolean | null;
  dmarcAligned: boolean | null;
  selectorsChecked: readonly string[];
  selectorsPresent: readonly string[];
  reasons: readonly string[];
};

export type EmailDeliverabilityEvidence = EmailDeliverabilitySnapshot & {
  domain: string;
  provider: EmailProvider;
  senderIdentityIds: readonly string[];
  reputationWindowStartedAt: string;
  sentCount: number;
  hardBounceCount: number;
  complaintCount: number;
  complaintTelemetrySource: "UNAVAILABLE" | "ANALYTICS_EVENTS";
  reasons: readonly string[];
};

type StoredSender = {
  id: string;
  provider: EmailProvider;
  fromEmail: string;
  verificationStatus: string;
  isActive: boolean;
};

type DnsLookup<T> = { value: T | null; missing: boolean; error: string | null };

const systemResolver: EmailDeliverabilityDnsResolver = { resolveTxt, resolveCname };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

function provider(value: unknown): EmailProvider | null {
  return value === "GOOGLE_GMAIL" || value === "MICROSOFT_365" || value === "BREVO" || value === "AMAZON_SES" || value === "RESEND"
    ? value
    : null;
}

function emailDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1).replace(/\.$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
}

function storedSenders(capabilities: unknown): StoredSender[] {
  const metadata = asRecord(asRecord(capabilities).emailAutomation);
  if (!Array.isArray(metadata.senderIdentities)) return [];
  return metadata.senderIdentities.flatMap((raw) => {
    const row = asRecord(raw);
    const parsedProvider = provider(row.provider);
    if (
      typeof row.id !== "string" ||
      !parsedProvider ||
      typeof row.fromEmail !== "string" ||
      typeof row.verificationStatus !== "string" ||
      typeof row.isActive !== "boolean"
    ) return [];
    return [{
      id: row.id,
      provider: parsedProvider,
      fromEmail: row.fromEmail.trim().toLowerCase(),
      verificationStatus: row.verificationStatus,
      isActive: row.isActive,
    }];
  });
}

function persistedEvidence(capabilities: unknown): Record<string, EmailDeliverabilityEvidence> {
  const root = asRecord(asRecord(capabilities).emailDeliverability);
  if (root.version !== EVIDENCE_VERSION) return {};
  const domains = asRecord(root.domains);
  const out: Record<string, EmailDeliverabilityEvidence> = {};
  for (const [domain, raw] of Object.entries(domains)) {
    const row = asRecord(raw);
    const parsedProvider = provider(row.provider);
    if (!parsedProvider || typeof row.checkedAt !== "string") continue;
    out[domain] = row as unknown as EmailDeliverabilityEvidence;
  }
  return out;
}

function txtStrings(records: string[][] | null): string[] {
  return (records ?? []).map((chunks) => chunks.join("").trim()).filter(Boolean);
}

function dnsMissing(error: unknown): boolean {
  const code = asRecord(error).code;
  return code === "ENODATA" || code === "ENOTFOUND" || code === "ENOENT" || code === "NXDOMAIN";
}

async function txtLookup(resolver: EmailDeliverabilityDnsResolver, hostname: string): Promise<DnsLookup<string[]>> {
  try {
    return { value: txtStrings(await resolver.resolveTxt(hostname)), missing: false, error: null };
  } catch (error) {
    if (dnsMissing(error)) return { value: [], missing: true, error: null };
    return { value: null, missing: false, error: error instanceof Error ? error.message : "DNS TXT lookup failed." };
  }
}

async function cnameLookup(resolver: EmailDeliverabilityDnsResolver, hostname: string): Promise<DnsLookup<string[]>> {
  try {
    return { value: (await resolver.resolveCname(hostname)).map((item) => item.trim().toLowerCase()).filter(Boolean), missing: false, error: null };
  } catch (error) {
    if (dnsMissing(error)) return { value: [], missing: true, error: null };
    return { value: null, missing: false, error: error instanceof Error ? error.message : "DNS CNAME lookup failed." };
  }
}

function selectorEnvKey(providerName: EmailProvider): string {
  return `EMAIL_DELIVERABILITY_DKIM_SELECTORS_${providerName}`;
}

function selectorCandidates(providerName: EmailProvider, env: NodeJS.ProcessEnv): string[] {
  const defaults: Partial<Record<EmailProvider, string[]>> = {
    GOOGLE_GMAIL: ["google"],
    MICROSOFT_365: ["selector1", "selector2"],
  };
  const configured = (env[selectorEnvKey(providerName)] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9._-]{1,63}$/i.test(item));
  return [...new Set(configured.length ? configured : (defaults[providerName] ?? []))];
}

function spfMarkers(providerName: EmailProvider): string[] {
  if (providerName === "GOOGLE_GMAIL") return ["_spf.google.com"];
  if (providerName === "MICROSOFT_365") return ["spf.protection.outlook.com"];
  if (providerName === "BREVO") return ["spf.brevo.com", "spf.sendinblue.com"];
  return [];
}

export async function qualifyEmailDomainAuthentication(input: {
  domain: string;
  provider: EmailProvider;
  resolver?: EmailDeliverabilityDnsResolver;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailDomainAuthenticationEvidence> {
  const resolver = input.resolver ?? systemResolver;
  const env = input.env ?? process.env;
  const domain = input.domain.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("Email sending domain is invalid.");

  const reasons: string[] = [];
  const spf = await txtLookup(resolver, domain);
  const spfRecords = txtStrings(spf.value ? spf.value.map((item) => [item]) : null).filter((item) => /^v=spf1\b/i.test(item));
  const markers = spfMarkers(input.provider);
  let spfAligned: boolean | null;
  if (spf.error) {
    spfAligned = null;
    reasons.push(`SPF DNS lookup failed: ${spf.error}`);
  } else if (spfRecords.length !== 1) {
    spfAligned = false;
    reasons.push(spfRecords.length === 0 ? "SPF record was not found." : "Multiple SPF records were found; SPF is invalid.");
  } else if (!markers.length) {
    spfAligned = false;
    reasons.push(`Automated SPF provider qualification is not implemented for ${input.provider}.`);
  } else {
    const normalizedSpf = spfRecords[0].toLowerCase();
    spfAligned = markers.some((marker) => normalizedSpf.includes(marker));
    if (!spfAligned) reasons.push(`SPF does not authorize the configured ${input.provider} provider family.`);
  }

  const selectors = selectorCandidates(input.provider, env);
  const selectorsPresent: string[] = [];
  let dkimLookupError = false;
  for (const selector of selectors) {
    const host = `${selector}._domainkey.${domain}`;
    const [txt, cname] = await Promise.all([txtLookup(resolver, host), cnameLookup(resolver, host)]);
    if (txt.error || cname.error) dkimLookupError = true;
    const txtPresent = (txt.value ?? []).some((item) => /^v=dkim1\b/i.test(item) || /\bp=[A-Za-z0-9+/=]+/i.test(item));
    const cnamePresent = Boolean(cname.value?.length);
    if (txtPresent || cnamePresent) selectorsPresent.push(selector);
  }
  let dkimAligned: boolean | null;
  if (!selectors.length) {
    dkimAligned = false;
    reasons.push(`No DKIM selectors are configured for ${input.provider}.`);
  } else if (dkimLookupError && selectorsPresent.length !== selectors.length) {
    dkimAligned = null;
    reasons.push("One or more DKIM DNS lookups failed transiently.");
  } else {
    dkimAligned = selectorsPresent.length === selectors.length;
    if (!dkimAligned) reasons.push(`Required DKIM selectors are missing: ${selectors.filter((item) => !selectorsPresent.includes(item)).join(", ")}.`);
  }

  const dmarc = await txtLookup(resolver, `_dmarc.${domain}`);
  const dmarcRecords = (dmarc.value ?? []).filter((item) => /^v=dmarc1\b/i.test(item));
  let dmarcAligned: boolean | null;
  if (dmarc.error) {
    dmarcAligned = null;
    reasons.push(`DMARC DNS lookup failed: ${dmarc.error}`);
  } else if (dmarcRecords.length !== 1) {
    dmarcAligned = false;
    reasons.push(dmarcRecords.length === 0 ? "DMARC record was not found." : "Multiple DMARC records were found; DMARC is invalid.");
  } else {
    const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i.exec(dmarcRecords[0]);
    dmarcAligned = Boolean(policy);
    if (!dmarcAligned) reasons.push("DMARC record does not declare a valid p= policy.");
  }

  return {
    domain,
    provider: input.provider,
    spfAligned,
    dkimAligned,
    dmarcAligned,
    selectorsChecked: Object.freeze(selectors),
    selectorsPresent: Object.freeze(selectorsPresent),
    reasons: Object.freeze(reasons),
  };
}

function eventMetadata(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

async function reputationForSenderGroup(input: {
  workspaceId: string;
  connectionId: string;
  senderIdentityIds: readonly string[];
  since: Date;
}) {
  const senderIdentityIds = [...new Set(input.senderIdentityIds)];
  const sentCount = await prisma.engageEmailMessage.count({
    where: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      senderIdentityId: { in: senderIdentityIds },
      externalRequestSent: true,
      sentAt: { gte: input.since },
    },
  });

  const events = await prisma.engageEmailAnalyticsEvent.findMany({
    where: {
      workspaceId: input.workspaceId,
      occurredAt: { gte: input.since },
      eventType: { in: ["BOUNCED", "COMPLAINT", "SPAM_COMPLAINT"] },
      messageId: { not: null },
    },
    select: { messageId: true, eventType: true, metadata: true },
  });
  const eventMessageIds = [...new Set(events.map((item) => item.messageId).filter((id): id is string => Boolean(id)))];
  const matchingMessages = eventMessageIds.length
    ? await prisma.engageEmailMessage.findMany({
        where: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          senderIdentityId: { in: senderIdentityIds },
          id: { in: eventMessageIds },
        },
        select: { id: true },
      })
    : [];
  const allowedMessageIds = new Set(matchingMessages.map((item) => item.id));
  const hardBounceIds = new Set<string>();
  const complaintIds = new Set<string>();
  for (const event of events) {
    if (!event.messageId || !allowedMessageIds.has(event.messageId)) continue;
    if (event.eventType === "BOUNCED" && eventMetadata(event.metadata).bounceClass === "HARD") hardBounceIds.add(event.messageId);
    if (event.eventType === "COMPLAINT" || event.eventType === "SPAM_COMPLAINT") complaintIds.add(event.messageId);
  }
  const hardBounceCount = hardBounceIds.size;
  const complaintCount = complaintIds.size;
  const denominator = Math.max(sentCount, 1);
  return {
    sentCount,
    hardBounceCount,
    complaintCount,
    hardBounceRatePct: sentCount ? Number(((hardBounceCount / denominator) * 100).toFixed(4)) : 0,
    complaintRatePct: sentCount ? Number(((complaintCount / denominator) * 100).toFixed(4)) : 0,
    complaintTelemetryQualified: false,
    complaintTelemetrySource: "UNAVAILABLE" as const,
  };
}

function evidenceFresh(checkedAt: string | null | undefined, refreshMinutes: number, now: Date): boolean {
  if (!checkedAt) return false;
  const parsed = new Date(checkedAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime() && now.getTime() - parsed.getTime() < refreshMinutes * 60_000;
}

export async function refreshEmailDeliverabilityEvidence(input: {
  workspaceId?: string;
  connectionId?: string;
  force?: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  resolver?: EmailDeliverabilityDnsResolver;
} = {}) {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const refreshMinutes = positiveInt(env.EMAIL_DELIVERABILITY_REFRESH_MINUTES, DEFAULT_REFRESH_MINUTES, 5, 1_440);
  const reputationWindowHours = positiveInt(env.EMAIL_DELIVERABILITY_REPUTATION_WINDOW_HOURS, DEFAULT_REPUTATION_WINDOW_HOURS, 1, 2_160);
  const since = new Date(now.getTime() - reputationWindowHours * 60 * 60_000);
  const connections = await prisma.engageChannelConnection.findMany({
    where: {
      channel: "EMAIL",
      status: "CONNECTED",
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.connectionId ? { id: input.connectionId } : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: { id: true, workspaceId: true, capabilities: true },
  });

  const results: Array<Record<string, unknown>> = [];
  let refreshed = 0;
  let reused = 0;
  let domains = 0;
  for (const connection of connections) {
    const senders = storedSenders(connection.capabilities).filter((sender) => sender.isActive && sender.verificationStatus === "VERIFIED");
    const groups = new Map<string, { domain: string; provider: EmailProvider; senderIdentityIds: string[] }>();
    for (const sender of senders) {
      const domain = emailDomain(sender.fromEmail);
      if (!domain) continue;
      const key = `${sender.provider}:${domain}`;
      const current = groups.get(key) ?? { domain, provider: sender.provider, senderIdentityIds: [] };
      current.senderIdentityIds.push(sender.id);
      groups.set(key, current);
    }
    if (!groups.size) continue;

    const existing = persistedEvidence(connection.capabilities);
    const nextEvidence: Record<string, EmailDeliverabilityEvidence> = { ...existing };
    for (const group of groups.values()) {
      domains += 1;
      const current = existing[group.domain];
      if (!input.force && current?.provider === group.provider && evidenceFresh(current.checkedAt, refreshMinutes, now)) {
        reused += 1;
        results.push({ workspaceId: connection.workspaceId, connectionId: connection.id, domain: group.domain, provider: group.provider, refreshed: false, evidence: current });
        continue;
      }
      const [authentication, reputation] = await Promise.all([
        qualifyEmailDomainAuthentication({ domain: group.domain, provider: group.provider, resolver: input.resolver, env }),
        reputationForSenderGroup({ workspaceId: connection.workspaceId, connectionId: connection.id, senderIdentityIds: group.senderIdentityIds, since }),
      ]);
      const reasons = [...authentication.reasons];
      if (!reputation.complaintTelemetryQualified) reasons.push(`Complaint/spam telemetry is not authoritatively available for ${group.provider}; scaled delivery remains fail-closed.`);
      const evidence: EmailDeliverabilityEvidence = {
        domain: group.domain,
        provider: group.provider,
        senderIdentityIds: Object.freeze([...new Set(group.senderIdentityIds)]),
        checkedAt: now.toISOString(),
        spfAligned: authentication.spfAligned,
        dkimAligned: authentication.dkimAligned,
        dmarcAligned: authentication.dmarcAligned,
        hardBounceRatePct: reputation.hardBounceRatePct,
        complaintRatePct: reputation.complaintRatePct,
        complaintTelemetryQualified: reputation.complaintTelemetryQualified,
        reputationWindowStartedAt: since.toISOString(),
        sentCount: reputation.sentCount,
        hardBounceCount: reputation.hardBounceCount,
        complaintCount: reputation.complaintCount,
        complaintTelemetrySource: reputation.complaintTelemetrySource,
        reasons: Object.freeze(reasons),
      };
      nextEvidence[group.domain] = evidence;
      refreshed += 1;
      results.push({ workspaceId: connection.workspaceId, connectionId: connection.id, domain: group.domain, provider: group.provider, refreshed: true, evidence });
    }

    if (Object.keys(nextEvidence).length) {
      const root = { ...asRecord(connection.capabilities) };
      root.emailDeliverability = {
        version: EVIDENCE_VERSION,
        lastRefreshedAt: now.toISOString(),
        domains: nextEvidence,
      };
      await prisma.engageChannelConnection.update({
        where: { id: connection.id },
        data: { capabilities: JSON.parse(JSON.stringify(root)) as Prisma.InputJsonValue },
      });
    }
  }

  return { connectionsScanned: connections.length, domains, refreshed, reused, results };
}

export async function listEmailDeliverabilityEvidence(workspaceId: string) {
  const connections = await prisma.engageChannelConnection.findMany({
    where: { workspaceId, channel: "EMAIL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, displayName: true, status: true, capabilities: true },
  });
  return connections.flatMap((connection) => Object.values(persistedEvidence(connection.capabilities)).map((evidence) => ({
    connectionId: connection.id,
    connectionDisplayName: connection.displayName,
    connectionStatus: connection.status,
    ...evidence,
  })));
}

export async function loadPersistedEmailDeliverabilitySnapshot(input: {
  workspaceId: string;
  connectionId: string;
  senderEmail: string;
  provider: EmailProvider;
}): Promise<EmailDeliverabilitySnapshot | null> {
  const domain = emailDomain(input.senderEmail);
  if (!domain) return null;
  const connection = await prisma.engageChannelConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId, channel: "EMAIL" },
    select: { capabilities: true },
  });
  if (!connection) return null;
  const evidence = persistedEvidence(connection.capabilities)[domain];
  if (!evidence || evidence.provider !== input.provider) return null;
  return {
    checkedAt: evidence.checkedAt,
    spfAligned: evidence.spfAligned,
    dkimAligned: evidence.dkimAligned,
    dmarcAligned: evidence.dmarcAligned,
    hardBounceRatePct: evidence.hardBounceRatePct,
    complaintRatePct: evidence.complaintRatePct,
    complaintTelemetryQualified: evidence.complaintTelemetryQualified,
  };
}

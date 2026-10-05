import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { EmailAddress, EmailAttachmentReference } from "../domain/contracts";
import { resolveEmailSender } from "../domain/sender-resolution";
import { buildEmailE1Runtime } from "../infrastructure/runtime";
import { buildEmailTemplateRuntime } from "../infrastructure/template-runtime";
import { readEmailAsset } from "../infrastructure/email-template-asset-storage";
import { renderEmailTemplate } from "../templates/render";
import {
  assertAutomationEmailDispatchPolicy,
  automationRecipientCohortAllowlist,
} from "./automation-send-policy";
import { loadPersistedEmailDeliverabilitySnapshot } from "./deliverability-evidence-service";
import { getEmailRuntimePolicy } from "./runtime-policy";
import { assertManualEmailDispatchPolicy, assertManualEmailRetryAllowed, internalRecipientAllowlist } from "./manual-send-policy";
import { instrumentEmailHtml } from "../analytics/tracking";
import { isPersistedDeliveryRetrySafe, persistedEmailDeliveryError } from "../providers/provider-error-policy";
import {
  emailProviderFailoverPolicyFromEnv,
  selectEmailProviderRoute,
} from "../providers/routing/failover-policy";

const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function addresses(values: readonly EmailAddress[] | undefined, required = false): EmailAddress[] {
  const list = (values ?? []).map((item) => ({ email: item.email.trim().toLowerCase(), ...(item.name?.trim() ? { name: item.name.trim() } : {}) }));
  if (required && list.length === 0) throw new Error("At least one To recipient is required.");
  if (list.length > 50) throw new Error("Email recipient list cannot exceed 50 addresses.");
  for (const item of list) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) throw new Error(`Invalid email address: ${item.email}.`);
  return list;
}

function storedAddresses(value: Prisma.JsonValue): EmailAddress[] {
  if (!Array.isArray(value)) throw new Error("Stored email recipient snapshot is invalid.");
  return addresses(value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string") return [];
    return [{ email: row.email, ...(typeof row.name === "string" ? { name: row.name } : {}) }];
  }));
}

function storedReplyTo(value: Prisma.JsonValue | null): EmailAddress | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  return typeof row.email === "string" ? addresses([{ email: row.email, ...(typeof row.name === "string" ? { name: row.name } : {}) }], true)[0] : undefined;
}

function applyContentOverrides(rendered: { subject:string; preheader?:string; html:string; text:string; variables:Readonly<Record<string,string>> }, input: ManualEmailSendInput) {
  if (input.deliveryContext === "AUTOMATION" && (input.subjectOverride || input.htmlOverride || input.textOverride)) throw new Error("Automation email content overrides are not allowed.");
  const subject = input.subjectOverride?.trim() || rendered.subject;
  const html = input.htmlOverride?.trim() || rendered.html;
  const text = input.textOverride?.trim() || rendered.text;
  if (!subject || subject.length > 200) throw new Error("Manual email subject override must be 1-200 characters.");
  if (html.length > 200_000 || text.length > 100_000) throw new Error("Manual email content override exceeds the allowed size.");
  if (/<\s*(script|iframe|object|embed|form|meta|base)\b/iu.test(html) || /\son[a-z]+\s*=/iu.test(html) || /javascript\s*:/iu.test(html)) throw new Error("Manual email HTML override contains unsafe HTML.");
  return { ...rendered, subject, html, text };
}

function storedVariables(value: Prisma.JsonValue): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")]));
}

export type ManualEmailSendInput = {
  workspaceId: string; templateId: string; templateVersionId?: string | null; manualSenderIdentityId?: string | null; automationSenderIdentityId?: string | null;
  to: readonly EmailAddress[]; cc?: readonly EmailAddress[]; bcc?: readonly EmailAddress[]; replyTo?: EmailAddress;
  variables?: Readonly<Record<string, string | null | undefined>>; idempotencyKey: string; actorUserId: string;
  subjectOverride?: string | null; htmlOverride?: string | null; textOverride?: string | null; providerThreadId?: string | null;
  deliveryContext?: "MANUAL" | "AUTOMATION";
};

export class ManualEmailSendService {
  async send(input: ManualEmailSendInput) {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!KEY.test(idempotencyKey)) throw new Error("idempotencyKey must be 8-128 safe characters.");
    const prior = await prisma.engageEmailMessage.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey } } });
    const retryPersisted = Boolean(
      input.deliveryContext === "AUTOMATION" &&
      prior?.status === "FAILED" &&
      !prior.externalRequestSent &&
      isPersistedDeliveryRetrySafe(prior.lastError),
    );
    if (prior && !retryPersisted) {
      if (prior.status === "FAILED") throw new Error("Persisted email delivery failed and is not automatically retry-safe. Use an explicit manual retry after operator review.");
      if (prior.status === "SENDING") throw new Error("Persisted email delivery is still SENDING; automatic replay is blocked because delivery outcome is unknown.");
      return { message: prior, replayed: true };
    }

    const to = addresses(input.to, true), cc = addresses(input.cc), bcc = addresses(input.bcc);
    const allRecipients = [...to, ...cc, ...bcc];
    const templateRuntime = buildEmailTemplateRuntime();
    const template = await templateRuntime.service.get({ workspaceId: input.workspaceId, templateId: input.templateId });
    if (template.status !== "APPROVED") throw new Error("Manual email requires an APPROVED template.");
    const version = input.templateVersionId
      ? template.versions.find((item) => item.id === input.templateVersionId)
      : template.versions.find((item) => item.version === template.currentVersion);
    if (!version || !version.approvedAt) throw new Error("Approved email template version is unavailable.");
    if (input.templateVersionId && version.templateId !== template.id) throw new Error("Pinned email template version does not belong to the selected template.");

    const emailRuntime = buildEmailE1Runtime();
    const senders = await emailRuntime.senders.listByWorkspace(input.workspaceId);
    const resolved = resolveEmailSender({ availableSenders: senders, manualSenderIdentityId: input.manualSenderIdentityId, automationSenderIdentityId: input.automationSenderIdentityId, templateSenderIdentityId: version.defaultSenderIdentityId });
    const connections = await emailRuntime.connections.listByWorkspace(input.workspaceId);
    const route = selectEmailProviderRoute({
      policy: emailProviderFailoverPolicyFromEnv(),
      primary: resolved.sender,
      senders,
      connections,
      registeredProviders: emailRuntime.providers.list(),
    });
    if (!route) throw new Error("No connected registered email provider route is available for the resolved sender.");
    const connection = route.connection;
    const sender = route.sender;

    const policy = getEmailRuntimePolicy();
    const deliverabilitySnapshot =
      input.deliveryContext === "AUTOMATION" && (policy.mode === "LIMITED_COHORT" || policy.mode === "LIVE")
        ? await loadPersistedEmailDeliverabilitySnapshot({
            workspaceId: input.workspaceId,
            connectionId: connection.id,
            senderEmail: sender.fromEmail,
            provider: connection.provider,
          })
        : null;
    const decision = input.deliveryContext === "AUTOMATION"
      ? assertAutomationEmailDispatchPolicy({
          policy,
          recipients: allRecipients,
          internalAllowlist: internalRecipientAllowlist(),
          cohortAllowlist: automationRecipientCohortAllowlist(),
          deliverabilitySnapshot,
        })
      : assertManualEmailDispatchPolicy({ policy, recipients: allRecipients, allowlist: internalRecipientAllowlist() });
    const rendered = applyContentOverrides(renderEmailTemplate({ document: version.document, values: input.variables ?? {} }), input);
    const attachments: EmailAttachmentReference[] = [];
    for (const asset of version.assets) {
      const data = await readEmailAsset(asset.storageKey);
      attachments.push({ assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, disposition: asset.kind === "INLINE_IMAGE" ? "INLINE" : "ATTACHMENT", ...(asset.contentId ? { contentId: asset.contentId } : {}), contentBase64: data.toString("base64") });
    }
    const auditAttachments = attachments.map(({ contentBase64: _content, ...item }) => item);
    const replyTo = input.replyTo ? addresses([input.replyTo], true)[0] : sender.replyToEmail ? { email: sender.replyToEmail } : undefined;
    let created;
    if (retryPersisted && prior) {
      if (
        prior.templateId !== template.id ||
        prior.templateVersionId !== version.id ||
        prior.connectionId !== connection.id ||
        prior.senderIdentityId !== sender.id
      ) {
        throw new Error("Persisted retry-safe email no longer matches the pinned automation delivery contract.");
      }
      created = prior;
    } else {
      try {
        created = await prisma.engageEmailMessage.create({ data: {
      workspaceId: input.workspaceId, templateId: template.id, templateVersionId: version.id, connectionId: connection.id,
      senderIdentityId: sender.id, senderResolutionSource: resolved.source, status: "DRAFT", runtimeMode: decision.mode,
      toRecipients: json(to), ccRecipients: json(cc), bccRecipients: json(bcc), ...(replyTo ? { replyTo: json(replyTo) } : {}),
      subject: rendered.subject, preheader: rendered.preheader ?? null, htmlBody: rendered.html, textBody: rendered.text,
      variables: json(rendered.variables), attachments: json(auditAttachments), idempotencyKey, createdById: input.actorUserId,
      }});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.engageEmailMessage.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey } } });
        if (replay) return { message: replay, replayed: true };
      }
        throw error;
      }
    }
    if (!decision.externalRequestAllowed) {
      if (retryPersisted) throw new Error("Retry-safe failed delivery remains pending until external delivery is enabled.");
      return { message: created, replayed: false };
    }
    const outboundRendered = getEmailRuntimePolicy().trackingEnabled
      ? { ...rendered, html: instrumentEmailHtml({ messageId: created.id, html: rendered.html, appUrl: process.env.APP_URL || '' }) }
      : rendered;

    await prisma.engageEmailMessage.update({ where: { id: created.id }, data: { status: "SENDING", lastError: null, runtimeMode: decision.mode } });
    try {
      const result = await emailRuntime.providers.get(connection.provider).sendMessage({
        workspaceId: input.workspaceId, connectionId: connection.id, senderIdentityId: sender.id,
        from: { email: sender.fromEmail, ...(sender.fromName ? { name: sender.fromName } : {}) },
        to, cc, bcc, ...(replyTo ? { replyTo } : {}), rendered: outboundRendered, attachments, idempotencyKey, ...(input.providerThreadId?.trim() ? { providerThreadId: input.providerThreadId.trim() } : {}),
      });
      const message = await prisma.engageEmailMessage.update({ where: { id: created.id }, data: {
        status: result.status, providerMessageId: result.providerMessageId, providerThreadId: result.providerThreadId,
        externalRequestSent: result.externalRequestSent, sentAt: result.status === "SENT" ? new Date() : null,
      }});
      return { message, replayed: false };
    } catch (error) {
      const message = persistedEmailDeliveryError(error);
      await prisma.engageEmailMessage.update({ where: { id: created.id }, data: { status: "FAILED", lastError: message } });
      throw error;
    }
  }

  async retry(input: { workspaceId: string; messageId: string; idempotencyKey: string; actorUserId: string }) {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!KEY.test(idempotencyKey)) throw new Error("idempotencyKey must be 8-128 safe characters.");
    const prior = await prisma.engageEmailMessage.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey } } });
    if (prior) return { message: prior, replayed: true };

    const source = await prisma.engageEmailMessage.findFirst({ where: { id: input.messageId, workspaceId: input.workspaceId } });
    if (!source) throw new Error("Email message not found.");
    assertManualEmailRetryAllowed(source.status);
    const to = storedAddresses(source.toRecipients), cc = storedAddresses(source.ccRecipients), bcc = storedAddresses(source.bccRecipients);
    const replyTo = storedReplyTo(source.replyTo);
    const decision = assertManualEmailDispatchPolicy({ policy: getEmailRuntimePolicy(), recipients: [...to, ...cc, ...bcc], allowlist: internalRecipientAllowlist() });

    const emailRuntime = buildEmailE1Runtime();
    const senders = await emailRuntime.senders.listByWorkspace(input.workspaceId);
    const sender = senders.find((item) => item.id === source.senderIdentityId);
    if (!sender || !sender.isActive || sender.verificationStatus !== "VERIFIED") throw new Error("Original email sender is no longer verified and active.");
    if (sender.connectionId !== source.connectionId) throw new Error("Original email sender connection has changed.");
    const connection = await emailRuntime.connections.getById({ workspaceId: input.workspaceId, connectionId: source.connectionId });
    if (!connection || connection.status !== "CONNECTED") throw new Error("Original email sender connection is not connected.");

    const assetRows = source.templateVersionId ? await prisma.engageEmailTemplateAsset.findMany({ where: { workspaceId: input.workspaceId, versionId: source.templateVersionId }, orderBy: { createdAt: "asc" } }) : [];
    const attachments: EmailAttachmentReference[] = [];
    for (const asset of assetRows) {
      const data = await readEmailAsset(asset.storageKey);
      attachments.push({ assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, disposition: asset.kind === "INLINE_IMAGE" ? "INLINE" : "ATTACHMENT", ...(asset.contentId ? { contentId: asset.contentId } : {}), contentBase64: data.toString("base64") });
    }
    const auditAttachments = attachments.map(({ contentBase64: _content, ...item }) => item);
    const rendered = { subject: source.subject, ...(source.preheader ? { preheader: source.preheader } : {}), html: source.htmlBody, text: source.textBody, variables: storedVariables(source.variables) };

    let created;
    try {
      created = await prisma.engageEmailMessage.create({ data: {
        workspaceId: input.workspaceId, templateId: source.templateId, templateVersionId: source.templateVersionId, connectionId: source.connectionId, senderIdentityId: source.senderIdentityId,
        senderResolutionSource: source.senderResolutionSource, status: "DRAFT", runtimeMode: decision.mode, toRecipients: json(to), ccRecipients: json(cc), bccRecipients: json(bcc),
        ...(replyTo ? { replyTo: json(replyTo) } : {}), subject: source.subject, preheader: source.preheader, htmlBody: source.htmlBody, textBody: source.textBody, variables: json(source.variables),
        attachments: json(auditAttachments), idempotencyKey, retryOfMessageId: source.id, createdById: input.actorUserId,
      }});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.engageEmailMessage.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey } } });
        if (replay) return { message: replay, replayed: true };
      }
      throw error;
    }
    if (!decision.externalRequestAllowed) return { message: created, replayed: false };
    const outboundRendered = getEmailRuntimePolicy().trackingEnabled
      ? { ...rendered, html: instrumentEmailHtml({ messageId: created.id, html: rendered.html, appUrl: process.env.APP_URL || '' }) }
      : rendered;

    await prisma.engageEmailMessage.update({ where: { id: created.id }, data: { status: "SENDING" } });
    try {
      const result = await emailRuntime.providers.get(connection.provider).sendMessage({ workspaceId: input.workspaceId, connectionId: connection.id, senderIdentityId: sender.id, from: { email: sender.fromEmail, ...(sender.fromName ? { name: sender.fromName } : {}) }, to, cc, bcc, ...(replyTo ? { replyTo } : {}), rendered: outboundRendered, attachments, idempotencyKey });
      const message = await prisma.engageEmailMessage.update({ where: { id: created.id }, data: { status: result.status, providerMessageId: result.providerMessageId, providerThreadId: result.providerThreadId, externalRequestSent: result.externalRequestSent, sentAt: result.status === "SENT" ? new Date() : null } });
      return { message, replayed: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email provider retry failed.";
      await prisma.engageEmailMessage.update({ where: { id: created.id }, data: { status: "FAILED", lastError: message } });
      throw error;
    }
  }

  list(workspaceId: string, take = 50) {
    return prisma.engageEmailMessage.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(take, 1), 100), select: {
      id: true, templateId: true, templateVersionId: true, retryOfMessageId: true, senderIdentityId: true, senderResolutionSource: true, status: true, runtimeMode: true,
      toRecipients: true, subject: true, providerMessageId: true, externalRequestSent: true, lastError: true, createdById: true, sentAt: true, createdAt: true,
    }});
  }
}

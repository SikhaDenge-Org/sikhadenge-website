import assert from "node:assert/strict";

import { EmailTemplateService } from "../application/template-service";
import type { EmailSenderIdentity } from "../domain/contracts";
import type { EmailSenderRepository } from "../infrastructure/repositories";
import type { EmailTemplateDocument } from "../templates/blocks";
import type {
  EmailTemplateRepository,
  StoredEmailTemplateDetail,
  StoredEmailTemplateSummary,
} from "../templates/persistence";

const now = new Date("2026-09-15T00:35:00+05:30");

function doc(subject = "Welcome {{firstName}}"): EmailTemplateDocument {
  return {
    subject,
    preheader: "Welcome to SikhaDenge",
    variables: [{ key: "firstName", label: "First name", required: true }],
    blocks: [{ id: "hello", type: "TEXT", text: "Hello {{firstName}}" }],
  };
}

function sender(id = "sender-1"): EmailSenderIdentity {
  return {
    id,
    workspaceId: "workspace-1",
    connectionId: "connection-1",
    provider: "GOOGLE_GMAIL",
    fromName: "SikhaDenge",
    fromEmail: "mail@sikhadenge.in",
    replyToEmail: null,
    externalSenderId: "mail@sikhadenge.in",
    verificationStatus: "VERIFIED",
    isProviderDefault: true,
    isWorkspaceDefault: true,
    isActive: true,
    dailyLimit: null,
  };
}

class MemorySenders implements EmailSenderRepository {
  constructor(private readonly items: EmailSenderIdentity[]) {}
  async listByWorkspace(workspaceId: string) { return this.items.filter((item) => item.workspaceId === workspaceId); }
  async listByConnection(input: { workspaceId: string; connectionId: string }) { return this.items.filter((item) => item.workspaceId === input.workspaceId && item.connectionId === input.connectionId); }
  async replaceConnectionSenders(input: { workspaceId: string; connectionId: string; senders: readonly EmailSenderIdentity[] }) { return input.senders; }
  async setWorkspaceDefault() {}
}

class MemoryTemplates implements EmailTemplateRepository {
  private current: StoredEmailTemplateDetail | null = null;
  async listByWorkspace(workspaceId: string): Promise<readonly StoredEmailTemplateSummary[]> {
    return this.current?.workspaceId === workspaceId ? [this.current] : [];
  }
  async getById(input: { workspaceId: string; templateId: string }) {
    return this.current?.workspaceId === input.workspaceId && this.current.id === input.templateId ? this.current : null;
  }
  async create(input: Parameters<EmailTemplateRepository["create"]>[0]) {
    if (this.current) throw new Error("already exists");
    this.current = {
      id: "template-1",
      workspaceId: input.workspaceId,
      name: input.name,
      category: input.category,
      status: "DRAFT",
      currentVersion: 1,
      defaultSenderIdentityId: input.defaultSenderIdentityId,
      createdById: input.actorUserId,
      approvedById: null,
      approvedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      versions: [{
        id: "version-1", workspaceId: input.workspaceId, templateId: "template-1", version: 1,
        subject: input.document.subject, preheader: input.document.preheader, document: input.document,
        defaultSenderIdentityId: input.defaultSenderIdentityId, assets: [], createdById: input.actorUserId,
        approvedById: null, approvedAt: null, createdAt: now,
      }],
    };
    return this.current;
  }
  async createDraftVersion(input: Parameters<EmailTemplateRepository["createDraftVersion"]>[0]) {
    if (!this.current || this.current.currentVersion !== input.expectedCurrentVersion || this.current.status !== "DRAFT") {
      throw new Error("changed concurrently");
    }
    const next = input.expectedCurrentVersion + 1;
    this.current = {
      ...this.current,
      currentVersion: next,
      defaultSenderIdentityId: input.defaultSenderIdentityId,
      versions: [{
        id: `version-${next}`, workspaceId: input.workspaceId, templateId: input.templateId, version: next,
        subject: input.document.subject, preheader: input.document.preheader, document: input.document,
        defaultSenderIdentityId: input.defaultSenderIdentityId, assets: [], createdById: input.actorUserId,
        approvedById: null, approvedAt: null, createdAt: now,
      }, ...this.current.versions],
    };
    return this.current;
  }
  async transitionStatus(input: Parameters<EmailTemplateRepository["transitionStatus"]>[0]) {
    if (!this.current || this.current.status !== input.fromStatus) throw new Error("changed concurrently");
    this.current = {
      ...this.current,
      status: input.toStatus,
      approvedById: input.toStatus === "APPROVED" ? input.actorUserId : this.current.approvedById,
      approvedAt: input.toStatus === "APPROVED" ? input.now : this.current.approvedAt,
      archivedAt: input.toStatus === "ARCHIVED" ? input.now : this.current.archivedAt,
      versions: this.current.versions.map((version) => version.version === this.current?.currentVersion && input.toStatus === "APPROVED" ? { ...version, approvedById: input.actorUserId, approvedAt: input.now } : version),
    };
    return this.current;
  }
}

async function run() {
  const repo = new MemoryTemplates();
  const service = new EmailTemplateService(repo, new MemorySenders([sender()]));
  const created = await service.create({
    workspaceId: "workspace-1", name: "Lead welcome", category: "LEAD_WELCOME", document: doc(),
    defaultSenderIdentityId: "sender-1", actorUserId: "user-1",
  });
  assert.equal(created.status, "DRAFT");
  assert.equal(created.currentVersion, 1);

  const v2 = await service.createDraftVersion({
    workspaceId: "workspace-1", templateId: created.id, expectedCurrentVersion: 1,
    document: doc("Your next step, {{firstName}}"), defaultSenderIdentityId: "sender-1", actorUserId: "user-1",
  });
  assert.equal(v2.currentVersion, 2);
  assert.equal(v2.versions[0].subject, "Your next step, {{firstName}}");

  await assert.rejects(() => service.createDraftVersion({
    workspaceId: "workspace-1", templateId: created.id, expectedCurrentVersion: 1,
    document: doc(), actorUserId: "user-1",
  }), /changed/i);

  const review = await service.transition({ workspaceId: "workspace-1", templateId: created.id, toStatus: "IN_REVIEW", actorUserId: "user-1", now });
  assert.equal(review.status, "IN_REVIEW");
  const approved = await service.transition({ workspaceId: "workspace-1", templateId: created.id, toStatus: "APPROVED", actorUserId: "manager-1", now });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedById, "manager-1");

  await assert.rejects(() => service.createDraftVersion({
    workspaceId: "workspace-1", templateId: created.id, expectedCurrentVersion: 2, document: doc(), actorUserId: "user-1",
  }), /only DRAFT/i);

  const foreignSenderService = new EmailTemplateService(new MemoryTemplates(), new MemorySenders([sender("sender-1")]));
  await assert.rejects(() => foreignSenderService.create({
    workspaceId: "workspace-2", name: "Bad sender", category: "CUSTOM", document: doc(),
    defaultSenderIdentityId: "sender-1", actorUserId: "user-2",
  }), /does not belong/i);

  console.log("Email automation E2 template persistence contracts: PASS");
}

void run();

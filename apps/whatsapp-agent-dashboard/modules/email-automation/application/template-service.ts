import type { EmailTemplateStatus } from "../domain/contracts";
import type { EmailSenderRepository } from "../infrastructure/repositories";
import type { EmailTemplateDocument } from "../templates/blocks";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  assertEmailTemplateTransition,
  type EmailTemplateCategory,
} from "../templates/contracts";
import type {
  EmailTemplateRepository,
  StoredEmailTemplateDetail,
  StoredEmailTemplateSummary,
} from "../templates/persistence";
import { assertEmailTemplateDocument } from "../templates/validation";

const CATEGORIES = new Set<string>(EMAIL_TEMPLATE_CATEGORIES);
const STATUSES = new Set<EmailTemplateStatus>(["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"]);

export class EmailTemplateService {
  constructor(
    private readonly repository: EmailTemplateRepository,
    private readonly senders: EmailSenderRepository,
  ) {}

  list(workspaceId: string): Promise<readonly StoredEmailTemplateSummary[]> {
    return this.repository.listByWorkspace(workspaceId);
  }

  async get(input: { workspaceId: string; templateId: string }): Promise<StoredEmailTemplateDetail> {
    const template = await this.repository.getById(input);
    if (!template) throw new Error("Email template not found.");
    return template;
  }

  async create(input: {
    workspaceId: string;
    name: string;
    category: string;
    document: EmailTemplateDocument;
    defaultSenderIdentityId?: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail> {
    const name = input.name.trim();
    if (!name || name.length > 120) throw new Error("Email template name must be 1-120 characters.");
    const category = this.category(input.category);
    assertEmailTemplateDocument(input.document);
    const senderId = await this.validateSender(input.workspaceId, input.defaultSenderIdentityId ?? null);
    return this.repository.create({
      workspaceId: input.workspaceId,
      name,
      category,
      document: input.document,
      defaultSenderIdentityId: senderId,
      actorUserId: input.actorUserId,
    });
  }

  async createDraftVersion(input: {
    workspaceId: string;
    templateId: string;
    expectedCurrentVersion: number;
    document: EmailTemplateDocument;
    defaultSenderIdentityId?: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail> {
    if (!Number.isInteger(input.expectedCurrentVersion) || input.expectedCurrentVersion < 1) {
      throw new Error("expectedCurrentVersion must be a positive integer.");
    }
    const current = await this.get({ workspaceId: input.workspaceId, templateId: input.templateId });
    if (current.status !== "DRAFT") throw new Error("Only DRAFT email templates can be edited.");
    if (current.currentVersion !== input.expectedCurrentVersion) {
      throw new Error("Email template draft has changed; reload before editing.");
    }
    assertEmailTemplateDocument(input.document);
    const senderId = await this.validateSender(input.workspaceId, input.defaultSenderIdentityId ?? null);
    return this.repository.createDraftVersion({
      workspaceId: input.workspaceId,
      templateId: input.templateId,
      expectedCurrentVersion: input.expectedCurrentVersion,
      document: input.document,
      defaultSenderIdentityId: senderId,
      actorUserId: input.actorUserId,
    });
  }

  async transition(input: {
    workspaceId: string;
    templateId: string;
    toStatus: string;
    actorUserId: string;
    now?: Date;
  }): Promise<StoredEmailTemplateDetail> {
    if (!STATUSES.has(input.toStatus as EmailTemplateStatus)) throw new Error("Invalid email template status.");
    const current = await this.get({ workspaceId: input.workspaceId, templateId: input.templateId });
    const toStatus = input.toStatus as EmailTemplateStatus;
    assertEmailTemplateTransition(current.status, toStatus);
    if (current.status === toStatus) return current;
    if (toStatus === "APPROVED") {
      const latest = current.versions.find((version) => version.version === current.currentVersion);
      if (!latest) throw new Error("Current email template version is missing.");
      assertEmailTemplateDocument(latest.document);
      for (const block of latest.document.blocks) {
        if (block.type !== "IMAGE" || !block.src.startsWith("cid:")) continue;
        const contentId = block.src.slice(4);
        if (!latest.assets.some((asset) => asset.kind === "INLINE_IMAGE" && asset.contentId === contentId)) {
          throw new Error(`Inline image ${block.id} is missing its current-version asset.`);
        }
      }
      await this.validateSender(input.workspaceId, latest.defaultSenderIdentityId);
    }
    return this.repository.transitionStatus({
      workspaceId: input.workspaceId,
      templateId: input.templateId,
      fromStatus: current.status,
      toStatus,
      actorUserId: input.actorUserId,
      now: input.now ?? new Date(),
    });
  }

  private category(value: string): EmailTemplateCategory {
    if (!CATEGORIES.has(value)) throw new Error("Invalid email template category.");
    return value as EmailTemplateCategory;
  }

  private async validateSender(workspaceId: string, senderIdentityId: string | null): Promise<string | null> {
    if (!senderIdentityId) return null;
    const senders = await this.senders.listByWorkspace(workspaceId);
    const sender = senders.find((item) => item.id === senderIdentityId);
    if (!sender) throw new Error("Email template sender does not belong to this workspace.");
    if (!sender.isActive || sender.verificationStatus !== "VERIFIED") {
      throw new Error("Email template sender must be verified and active.");
    }
    return sender.id;
  }
}

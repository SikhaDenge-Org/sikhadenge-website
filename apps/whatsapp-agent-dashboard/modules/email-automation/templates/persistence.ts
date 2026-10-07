import type { EmailTemplateStatus } from "../domain/contracts";
import type { EmailTemplateCategory, EmailTemplateAsset } from "./contracts";
import type { EmailTemplateDocument } from "./blocks";

export type StoredEmailTemplateSummary = {
  id: string;
  workspaceId: string;
  name: string;
  category: EmailTemplateCategory;
  status: EmailTemplateStatus;
  currentVersion: number;
  defaultSenderIdentityId: string | null;
  createdById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredEmailTemplateVersion = {
  id: string;
  workspaceId: string;
  templateId: string;
  version: number;
  subject: string;
  preheader: string | null;
  document: EmailTemplateDocument;
  defaultSenderIdentityId: string | null;
  assets: readonly EmailTemplateAsset[];
  createdById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
};

export type StoredEmailTemplateDetail = StoredEmailTemplateSummary & {
  versions: readonly StoredEmailTemplateVersion[];
};

export interface EmailTemplateRepository {
  listByWorkspace(workspaceId: string): Promise<readonly StoredEmailTemplateSummary[]>;
  getById(input: { workspaceId: string; templateId: string }): Promise<StoredEmailTemplateDetail | null>;
  create(input: {
    workspaceId: string;
    name: string;
    category: EmailTemplateCategory;
    document: EmailTemplateDocument;
    defaultSenderIdentityId: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail>;
  createDraftVersion(input: {
    workspaceId: string;
    templateId: string;
    expectedCurrentVersion: number;
    document: EmailTemplateDocument;
    defaultSenderIdentityId: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail>;
  transitionStatus(input: {
    workspaceId: string;
    templateId: string;
    fromStatus: EmailTemplateStatus;
    toStatus: EmailTemplateStatus;
    actorUserId: string;
    now: Date;
  }): Promise<StoredEmailTemplateDetail>;
}

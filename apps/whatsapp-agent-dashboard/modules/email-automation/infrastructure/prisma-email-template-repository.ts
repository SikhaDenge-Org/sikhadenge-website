import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type { EmailTemplateStatus } from "../domain/contracts";
import type { EmailTemplateDocument } from "../templates/blocks";
import { EMAIL_TEMPLATE_CATEGORIES, type EmailTemplateAsset, type EmailTemplateCategory } from "../templates/contracts";
import { assertEmailTemplateDocument } from "../templates/validation";
import type {
  EmailTemplateRepository,
  StoredEmailTemplateDetail,
  StoredEmailTemplateSummary,
  StoredEmailTemplateVersion,
} from "../templates/persistence";

const TEMPLATE_STATUSES = new Set<EmailTemplateStatus>(["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"]);
const TEMPLATE_CATEGORIES = new Set<string>(EMAIL_TEMPLATE_CATEGORIES);

function category(value: string): EmailTemplateCategory {
  if (!TEMPLATE_CATEGORIES.has(value)) throw new Error(`Unknown persisted email template category: ${value}.`);
  return value as EmailTemplateCategory;
}

function status(value: string): EmailTemplateStatus {
  if (!TEMPLATE_STATUSES.has(value as EmailTemplateStatus)) throw new Error(`Unknown persisted email template status: ${value}.`);
  return value as EmailTemplateStatus;
}

function document(value: Prisma.JsonValue): EmailTemplateDocument {
  const parsed = value as unknown as EmailTemplateDocument;
  assertEmailTemplateDocument(parsed);
  return parsed;
}

function asset(row: {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  contentId: string | null;
}): EmailTemplateAsset {
  if (row.kind !== "INLINE_IMAGE" && row.kind !== "ATTACHMENT" && row.kind !== "DOCUMENT") {
    throw new Error(`Unknown persisted email template asset kind: ${row.kind}.`);
  }
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    ...(row.contentId ? { contentId: row.contentId } : {}),
  };
}

function summary(row: {
  id: string;
  workspaceId: string;
  name: string;
  category: string;
  status: string;
  currentVersion: number;
  defaultSenderIdentityId: string | null;
  createdById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredEmailTemplateSummary {
  return { ...row, category: category(row.category), status: status(row.status) };
}

const DETAIL_INCLUDE = {
  versions: {
    orderBy: { version: "desc" as const },
    include: { assets: { orderBy: { createdAt: "asc" as const } } },
  },
} satisfies Prisma.EngageEmailTemplateInclude;

type DetailRow = Prisma.EngageEmailTemplateGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function detail(row: DetailRow): StoredEmailTemplateDetail {
  const base = summary(row);
  const versions: StoredEmailTemplateVersion[] = row.versions.map((version) => ({
    id: version.id,
    workspaceId: version.workspaceId,
    templateId: version.templateId,
    version: version.version,
    subject: version.subject,
    preheader: version.preheader,
    document: document(version.document),
    defaultSenderIdentityId: version.defaultSenderIdentityId,
    assets: version.assets.map(asset),
    createdById: version.createdById,
    approvedById: version.approvedById,
    approvedAt: version.approvedAt,
    createdAt: version.createdAt,
  }));
  return { ...base, versions };
}

function documentJson(value: EmailTemplateDocument): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function variablesJson(value: EmailTemplateDocument): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value.variables)) as Prisma.InputJsonValue;
}

export class PrismaEmailTemplateRepository implements EmailTemplateRepository {
  async listByWorkspace(workspaceId: string): Promise<readonly StoredEmailTemplateSummary[]> {
    const rows = await prisma.engageEmailTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return rows.map(summary);
  }

  async getById(input: { workspaceId: string; templateId: string }): Promise<StoredEmailTemplateDetail | null> {
    const row = await prisma.engageEmailTemplate.findFirst({
      where: { id: input.templateId, workspaceId: input.workspaceId },
      include: DETAIL_INCLUDE,
    });
    return row ? detail(row) : null;
  }

  async create(input: {
    workspaceId: string;
    name: string;
    category: EmailTemplateCategory;
    document: EmailTemplateDocument;
    defaultSenderIdentityId: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail> {
    const row = await prisma.engageEmailTemplate.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        category: input.category,
        status: "DRAFT",
        currentVersion: 1,
        defaultSenderIdentityId: input.defaultSenderIdentityId,
        createdById: input.actorUserId,
        versions: {
          create: {
            workspaceId: input.workspaceId,
            version: 1,
            subject: input.document.subject,
            preheader: input.document.preheader,
            document: documentJson(input.document),
            variables: variablesJson(input.document),
            defaultSenderIdentityId: input.defaultSenderIdentityId,
            createdById: input.actorUserId,
          },
        },
      },
      include: DETAIL_INCLUDE,
    });
    return detail(row);
  }

  async createDraftVersion(input: {
    workspaceId: string;
    templateId: string;
    expectedCurrentVersion: number;
    document: EmailTemplateDocument;
    defaultSenderIdentityId: string | null;
    actorUserId: string;
  }): Promise<StoredEmailTemplateDetail> {
    const nextVersion = input.expectedCurrentVersion + 1;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.engageEmailTemplate.updateMany({
        where: {
          id: input.templateId,
          workspaceId: input.workspaceId,
          status: "DRAFT",
          currentVersion: input.expectedCurrentVersion,
        },
        data: {
          currentVersion: nextVersion,
          defaultSenderIdentityId: input.defaultSenderIdentityId,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Email template draft changed concurrently or is no longer editable.");
      }
      await tx.engageEmailTemplateVersion.create({
        data: {
          workspaceId: input.workspaceId,
          templateId: input.templateId,
          version: nextVersion,
          subject: input.document.subject,
          preheader: input.document.preheader,
          document: documentJson(input.document),
          variables: variablesJson(input.document),
          defaultSenderIdentityId: input.defaultSenderIdentityId,
          createdById: input.actorUserId,
        },
      });
    });
    const current = await this.getById({ workspaceId: input.workspaceId, templateId: input.templateId });
    if (!current) throw new Error("Email template disappeared after version creation.");
    return current;
  }

  async transitionStatus(input: {
    workspaceId: string;
    templateId: string;
    fromStatus: EmailTemplateStatus;
    toStatus: EmailTemplateStatus;
    actorUserId: string;
    now: Date;
  }): Promise<StoredEmailTemplateDetail> {
    await prisma.$transaction(async (tx) => {
      const target = await tx.engageEmailTemplate.findFirst({
        where: { id: input.templateId, workspaceId: input.workspaceId, status: input.fromStatus },
        select: { currentVersion: true },
      });
      if (!target) throw new Error("Email template status changed concurrently or template was not found.");
      const approving = input.toStatus === "APPROVED";
      const archiving = input.toStatus === "ARCHIVED";
      const updated = await tx.engageEmailTemplate.updateMany({
        where: { id: input.templateId, workspaceId: input.workspaceId, status: input.fromStatus },
        data: {
          status: input.toStatus,
          approvedById: approving ? input.actorUserId : input.toStatus === "DRAFT" ? null : undefined,
          approvedAt: approving ? input.now : input.toStatus === "DRAFT" ? null : undefined,
          archivedAt: archiving ? input.now : undefined,
        },
      });
      if (updated.count !== 1) throw new Error("Email template status changed concurrently.");
      if (approving) {
        await tx.engageEmailTemplateVersion.update({
          where: { templateId_version: { templateId: input.templateId, version: target.currentVersion } },
          data: { approvedById: input.actorUserId, approvedAt: input.now },
        });
      }
    });
    const current = await this.getById({ workspaceId: input.workspaceId, templateId: input.templateId });
    if (!current) throw new Error("Email template disappeared after status transition.");
    return current;
  }
}

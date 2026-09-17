import {
  AgentMode,
  ConsentStatus,
  DashboardRole,
  LeadStage,
  LeadTemperature,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";

type ContactInput = {
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  language?: string | null;
  consentStatus?: string | null;
  optInSource?: string | null;
  source?: string | null;
  batch?: string | null;
  interestedCourse?: string | null;
  stage?: string | null;
  temperature?: string | null;
  assignedToId?: string | null;
  tags?: string[];
};

export type ContactListFilters = {
  search?: string;
  consentStatus?: string;
  stage?: string;
  assignedToId?: string;
  limit?: number;
};

function clean(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximum) : null;
}

function required(value: unknown, field: string, maximum: number): string {
  const normalized = clean(value, maximum);
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function normalizePhone(value: unknown): string {
  const raw = required(value, "Phone", 40);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Phone must contain 8-15 digits including country code.");
  }
  return `+${digits}`;
}

function normalizeEmail(value: unknown): string | null {
  const email = clean(value, 254)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email address is invalid.");
  }
  return email;
}

function normalizeConsent(value: unknown): ConsentStatus {
  const normalized = clean(value, 30)?.toUpperCase();
  if (!normalized || normalized === "UNKNOWN") return ConsentStatus.UNKNOWN;
  if (["OPTED_IN", "OPTED IN", "YES", "TRUE", "1"].includes(normalized)) {
    return ConsentStatus.OPTED_IN;
  }
  if (["OPTED_OUT", "OPTED OUT", "NO", "FALSE", "0"].includes(normalized)) {
    return ConsentStatus.OPTED_OUT;
  }
  throw new Error("Consent must be UNKNOWN, OPTED_IN or OPTED_OUT.");
}

function normalizeStage(value: unknown): LeadStage {
  const normalized = clean(value, 60)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized) return LeadStage.NEW;
  if (Object.values(LeadStage).includes(normalized as LeadStage)) {
    return normalized as LeadStage;
  }
  throw new Error("Lead stage is invalid.");
}

function normalizeTemperature(value: unknown): LeadTemperature {
  const normalized = clean(value, 40)?.toUpperCase();
  if (!normalized) return LeadTemperature.COLD;
  if (Object.values(LeadTemperature).includes(normalized as LeadTemperature)) {
    return normalized as LeadTemperature;
  }
  throw new Error("Lead temperature is invalid.");
}

function normalizeTags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[|,;]/)
      : [];
  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 60))
        .filter((item): item is string => Boolean(item))
        .map((item) => item.toLowerCase()),
    ),
  ).slice(0, 25);
}

function metadata(input: ContactInput): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({
      crm: {
        batch: clean(input.batch, 120),
        source: clean(input.source, 120),
      },
    }),
  ) as Prisma.InputJsonValue;
}

async function validateAssignee(assignedToId: string | null | undefined) {
  if (!assignedToId) return null;
  const user = await prisma.dashboardUser.findFirst({
    where: {
      id: assignedToId,
      isActive: true,
      role: { in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR] },
    },
    select: { id: true },
  });
  if (!user) throw new Error("Selected counselor is unavailable.");
  return user.id;
}

function mapContact(contact: any) {
  const conversation = contact.conversations?.[0] ?? null;
  const lead = contact.lead ?? null;
  const crmMetadata =
    contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata)
      ? ((contact.metadata as Record<string, unknown>).crm as Record<string, unknown> | undefined)
      : undefined;

  return {
    id: contact.id,
    name: contact.displayName || contact.profileName || contact.phone,
    phone: contact.phone,
    waId: contact.waId,
    email: contact.email,
    city: contact.city,
    language: contact.language,
    consentStatus: contact.consentStatus,
    marketingOptInAt: contact.marketingOptInAt,
    marketingOptInSource: contact.marketingOptInSource,
    optedOutAt: contact.optedOutAt,
    source: conversation?.source || (typeof crmMetadata?.source === "string" ? crmMetadata.source : null),
    batch: typeof crmMetadata?.batch === "string" ? crmMetadata.batch : null,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    conversation: conversation
      ? {
          id: conversation.id,
          status: conversation.status,
          agentMode: conversation.agentMode,
          lastMessageAt: conversation.lastMessageAt,
          messageCount: conversation._count?.messages ?? 0,
          assignee: conversation.assignedTo,
          tags: (conversation.tags ?? []).map((item: any) => item.tag),
        }
      : null,
    lead: lead
      ? {
          id: lead.id,
          stage: lead.stage,
          temperature: lead.temperature,
          score: lead.score,
          interestedCourse: lead.interestedCourse,
          nextFollowUpAt: lead.nextFollowUpAt,
          assignedTo: lead.assignedTo,
        }
      : null,
  };
}

const contactInclude = {
  lead: {
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  },
  conversations: {
    orderBy: { lastMessageAt: "desc" as const },
    take: 1,
    include: {
      assignedTo: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      _count: { select: { messages: true } },
    },
  },
};

export async function listContacts(filters: ContactListFilters = {}) {
  const search = clean(filters.search, 120);
  const consent = clean(filters.consentStatus, 30)?.toUpperCase();
  const stage = clean(filters.stage, 50)?.toUpperCase();
  const assignedToId = clean(filters.assignedToId, 80);
  const limit = Math.max(1, Math.min(500, Math.floor(filters.limit ?? 200)));

  const contacts = await prisma.whatsAppContact.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" as const } },
              { profileName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { email: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
              { lead: { interestedCourse: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(consent && consent !== "ALL"
        ? { consentStatus: normalizeConsent(consent) }
        : {}),
      ...(stage && stage !== "ALL" ? { lead: { stage: normalizeStage(stage) } } : {}),
      ...(assignedToId && assignedToId !== "ALL"
        ? {
            OR: [
              { lead: { assignedToId } },
              { conversations: { some: { assignedToId } } },
            ],
          }
        : {}),
    },
    include: contactInclude,
    orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    take: limit,
  });

  const [total, optedIn, optedOut, withLead] = await prisma.$transaction([
    prisma.whatsAppContact.count(),
    prisma.whatsAppContact.count({ where: { consentStatus: ConsentStatus.OPTED_IN } }),
    prisma.whatsAppContact.count({ where: { consentStatus: ConsentStatus.OPTED_OUT } }),
    prisma.whatsAppContact.count({ where: { lead: { isNot: null } } }),
  ]);

  return {
    contacts: contacts.map(mapContact),
    metrics: { total, optedIn, optedOut, withLead },
  };
}

export async function getContactOptions() {
  const [users, tags] = await prisma.$transaction([
    prisma.dashboardUser.findMany({
      where: {
        isActive: true,
        role: { in: [DashboardRole.ADMIN, DashboardRole.MANAGER, DashboardRole.COUNSELOR] },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.conversationTag.findMany({ orderBy: { name: "asc" }, take: 250 }),
  ]);
  return { users, tags };
}

export async function createContact(input: ContactInput, actorId: string) {
  const name = required(input.name, "Name", 120);
  const phone = normalizePhone(input.phone);
  const waId = phone.replace(/\D/g, "");
  const consentStatus = normalizeConsent(input.consentStatus);
  const assignedToId = await validateAssignee(input.assignedToId);
  const tagNames = normalizeTags(input.tags);
  const existing = await prisma.whatsAppContact.findFirst({
    where: { OR: [{ phone }, { waId }] },
    select: { id: true },
  });
  if (existing) throw new Error("A contact with this phone number already exists.");

  const createdId = await prisma.$transaction(async (tx) => {
    const contact = await tx.whatsAppContact.create({
      data: {
        waId,
        phone,
        displayName: name,
        profileName: name,
        email: normalizeEmail(input.email),
        city: clean(input.city, 120),
        language: clean(input.language, 30),
        consentStatus,
        marketingOptInAt: consentStatus === ConsentStatus.OPTED_IN ? new Date() : null,
        marketingOptInSource:
          consentStatus === ConsentStatus.OPTED_IN
            ? clean(input.optInSource, 180) || "CRM_MANUAL"
            : null,
        optedOutAt: consentStatus === ConsentStatus.OPTED_OUT ? new Date() : null,
        metadata: metadata(input),
      },
    });

    const conversation = await tx.whatsAppConversation.create({
      data: {
        contactId: contact.id,
        assignedToId,
        agentMode: AgentMode.PAUSED,
        source: clean(input.source, 120) || "CRM_MANUAL",
      },
    });

    await tx.lead.create({
      data: {
        contactId: contact.id,
        conversationId: conversation.id,
        assignedToId,
        stage: normalizeStage(input.stage),
        temperature: normalizeTemperature(input.temperature),
        interestedCourse: clean(input.interestedCourse, 180),
      },
    });

    for (const tagName of tagNames) {
      const tag = await tx.conversationTag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });
      await tx.conversationTagLink.create({
        data: { conversationId: conversation.id, tagId: tag.id },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "CRM_CONTACT_CREATED",
        entityType: "WhatsAppContact",
        entityId: contact.id,
        after: JSON.parse(
          JSON.stringify({ name, phone, consentStatus, assignedToId, tagNames }),
        ) as Prisma.InputJsonValue,
      },
    });
    return contact.id;
  });

  return getContactById(createdId);
}

export async function getContactById(contactId: string) {
  const contact = await prisma.whatsAppContact.findUnique({
    where: { id: contactId },
    include: contactInclude,
  });
  if (!contact) throw new Error("Contact not found.");
  return mapContact(contact);
}

export async function updateContact(
  contactId: string,
  input: Partial<ContactInput>,
  actorId: string,
) {
  const current = await prisma.whatsAppContact.findUnique({
    where: { id: contactId },
    include: { conversations: { orderBy: { createdAt: "asc" }, take: 1 }, lead: true },
  });
  if (!current) throw new Error("Contact not found.");

  const assignedToId =
    input.assignedToId !== undefined
      ? await validateAssignee(input.assignedToId)
      : undefined;
  const consentStatus =
    input.consentStatus !== undefined
      ? normalizeConsent(input.consentStatus)
      : current.consentStatus;
  const tagNames = input.tags !== undefined ? normalizeTags(input.tags) : null;

  await prisma.$transaction(async (tx) => {
    const updatedContact = await tx.whatsAppContact.update({
      where: { id: contactId },
      data: {
        ...(input.name !== undefined
          ? {
              displayName: required(input.name, "Name", 120),
              profileName: required(input.name, "Name", 120),
            }
          : {}),
        ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
        ...(input.city !== undefined ? { city: clean(input.city, 120) } : {}),
        ...(input.language !== undefined ? { language: clean(input.language, 30) } : {}),
        ...(input.consentStatus !== undefined
          ? {
              consentStatus,
              marketingOptInAt:
                consentStatus === ConsentStatus.OPTED_IN
                  ? current.marketingOptInAt || new Date()
                  : null,
              marketingOptInSource:
                consentStatus === ConsentStatus.OPTED_IN
                  ? clean(input.optInSource, 180) || current.marketingOptInSource || "CRM_MANUAL"
                  : null,
              optedOutAt: consentStatus === ConsentStatus.OPTED_OUT ? new Date() : null,
            }
          : {}),
        ...(input.batch !== undefined || input.source !== undefined
          ? { metadata: metadata({ ...input, name: "", phone: "" } as ContactInput) }
          : {}),
      },
    });

    let conversation = current.conversations[0] ?? null;
    if (!conversation) {
      conversation = await tx.whatsAppConversation.create({
        data: {
          contactId,
          assignedToId: assignedToId ?? null,
          agentMode: AgentMode.PAUSED,
          source: clean(input.source, 120) || "CRM_MANUAL",
        },
      });
    } else {
      await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          ...(assignedToId !== undefined ? { assignedToId } : {}),
          ...(input.source !== undefined ? { source: clean(input.source, 120) } : {}),
        },
      });
    }

    if (current.lead) {
      await tx.lead.update({
        where: { id: current.lead.id },
        data: {
          ...(assignedToId !== undefined ? { assignedToId } : {}),
          ...(input.interestedCourse !== undefined
            ? { interestedCourse: clean(input.interestedCourse, 180) }
            : {}),
          ...(input.stage !== undefined ? { stage: normalizeStage(input.stage) } : {}),
          ...(input.temperature !== undefined
            ? { temperature: normalizeTemperature(input.temperature) }
            : {}),
        },
      });
    } else {
      await tx.lead.create({
        data: {
          contactId,
          conversationId: conversation.id,
          assignedToId: assignedToId ?? null,
          stage: normalizeStage(input.stage),
          temperature: normalizeTemperature(input.temperature),
          interestedCourse: clean(input.interestedCourse, 180),
        },
      });
    }

    if (tagNames) {
      await tx.conversationTagLink.deleteMany({ where: { conversationId: conversation.id } });
      for (const tagName of tagNames) {
        const tag = await tx.conversationTag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await tx.conversationTagLink.create({
          data: { conversationId: conversation.id, tagId: tag.id },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "CRM_CONTACT_UPDATED",
        entityType: "WhatsAppContact",
        entityId: updatedContact.id,
        before: JSON.parse(
          JSON.stringify({ consentStatus: current.consentStatus, displayName: current.displayName }),
        ) as Prisma.InputJsonValue,
        after: JSON.parse(
          JSON.stringify({ consentStatus, input: { ...input, phone: undefined } }),
        ) as Prisma.InputJsonValue,
      },
    });
  });

  return getContactById(contactId);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function importContactsCsv(text: string, actorId: string) {
  if (Buffer.byteLength(text, "utf8") > 2_000_000) throw new Error("CSV file is too large.");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one contact.");
  if (rows.length > 501) throw new Error("Import supports up to 500 contacts per file.");

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const find = (row: string[], ...names: string[]) => {
    const index = headers.findIndex((header) => names.includes(header));
    return index >= 0 ? row[index] ?? "" : "";
  };

  let created = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const phone = normalizePhone(find(row, "phone", "mobile", "whatsapp", "wa_id"));
      const duplicate = await prisma.whatsAppContact.findFirst({
        where: { OR: [{ phone }, { waId: phone.replace(/\D/g, "") }] },
        select: { id: true },
      });
      if (duplicate) {
        skipped += 1;
        continue;
      }
      await createContact(
        {
          name: find(row, "name", "student_name", "display_name"),
          phone,
          email: find(row, "email"),
          city: find(row, "city"),
          language: find(row, "language"),
          consentStatus: find(row, "consent", "consent_status", "opt_in"),
          optInSource: find(row, "opt_in_source", "consent_source"),
          source: find(row, "source"),
          batch: find(row, "batch"),
          interestedCourse: find(row, "course", "interested_course"),
          stage: find(row, "stage"),
          temperature: find(row, "temperature", "priority"),
          assignedToId: find(row, "assigned_to_id", "counselor_id") || null,
          tags: normalizeTags(find(row, "tags")),
        },
        actorId,
      );
      created += 1;
    } catch (error) {
      errors.push({
        row: index + 1,
        error: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "CRM_CONTACTS_IMPORTED",
      entityType: "WhatsAppContact",
      after: JSON.parse(
        JSON.stringify({ rows: rows.length - 1, created, skipped, errors: errors.slice(0, 100) }),
      ) as Prisma.InputJsonValue,
    },
  });
  return { rows: rows.length - 1, created, skipped, failed: errors.length, errors };
}

function csvValue(value: unknown): string {
  if (value == null) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportContactsCsv() {
  const contacts = await prisma.whatsAppContact.findMany({
    include: contactInclude,
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const headers = [
    "name",
    "phone",
    "email",
    "city",
    "language",
    "consent_status",
    "opt_in_source",
    "source",
    "batch",
    "course",
    "stage",
    "temperature",
    "score",
    "counselor",
    "tags",
    "last_message_at",
    "created_at",
  ];
  const lines = [headers.join(",")];
  for (const record of contacts.map(mapContact)) {
    lines.push(
      [
        record.name,
        record.phone,
        record.email,
        record.city,
        record.language,
        record.consentStatus,
        record.marketingOptInSource,
        record.source,
        record.batch,
        record.lead?.interestedCourse,
        record.lead?.stage,
        record.lead?.temperature,
        record.lead?.score,
        record.conversation?.assignee?.name || record.lead?.assignedTo?.name,
        record.conversation?.tags.map((tag: any) => tag.name).join("|"),
        record.conversation?.lastMessageAt?.toISOString?.() || record.conversation?.lastMessageAt,
        record.createdAt?.toISOString?.() || record.createdAt,
      ]
        .map(csvValue)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

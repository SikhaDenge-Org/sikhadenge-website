import { Prisma, TemplateStatus } from "@prisma/client";

import { prisma } from "../db/prisma";

type TemplateComponent = Record<string, unknown>;

type MetaTemplateRecord = {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components?: unknown[];
  rejected_reason?: string;
  quality_score?: unknown;
};

type MetaTemplateListResponse = {
  data?: MetaTemplateRecord[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

type MetaTemplateCreateResponse = {
  id?: string;
  status?: string;
  category?: string;
  error?: { message?: string; code?: number };
};

export type TemplateDraftInput = {
  name: string;
  language: string;
  category: string;
  components: unknown;
  actorId: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanRequired(value: string, field: string, maximum: number): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${field} is required.`);
  if (cleaned.length > maximum) throw new Error(`${field} is too long.`);
  return cleaned;
}

function normalizeTemplateName(value: string): string {
  const cleaned = cleanRequired(value, "Template name", 512)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!cleaned) throw new Error("Template name must contain letters or numbers.");
  return cleaned;
}

function normalizeLanguage(value: string): string {
  const cleaned = cleanRequired(value, "Language", 20).replace("-", "_");
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(cleaned)) {
    throw new Error("Language must look like en, en_US or hi.");
  }
  return cleaned;
}

function normalizeCategory(value: string): string {
  const cleaned = cleanRequired(value, "Category", 40).toUpperCase();
  if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(cleaned)) {
    throw new Error("Category must be MARKETING, UTILITY or AUTHENTICATION.");
  }
  return cleaned;
}

function normalizeComponents(value: unknown): TemplateComponent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one template component is required.");
  }
  if (value.length > 10) throw new Error("Too many template components.");

  const normalized = value.map((component, index) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      throw new Error(`Component ${index + 1} is invalid.`);
    }
    const record = component as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
    if (!["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(type)) {
      throw new Error(`Component ${index + 1} has an unsupported type.`);
    }

    const result: TemplateComponent = { ...record, type };
    if (typeof result.text === "string") result.text = result.text.trim();
    return result;
  });

  const body = normalized.find((component) => component.type === "BODY");
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    throw new Error("A non-empty BODY component is required.");
  }
  return normalized;
}

function metaStatus(value: string | undefined): TemplateStatus {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "APPROVED") return TemplateStatus.APPROVED;
  if (normalized === "REJECTED") return TemplateStatus.REJECTED;
  if (normalized === "PAUSED") return TemplateStatus.PAUSED;
  if (normalized === "DISABLED" || normalized === "DELETED") return TemplateStatus.DISABLED;
  return TemplateStatus.PENDING;
}

function templateConfig() {
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaId =
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ||
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ||
    process.env.META_WABA_ID?.trim();
  const graphVersion =
    process.env.WHATSAPP_GRAPH_VERSION?.trim() ||
    process.env.META_GRAPH_API_VERSION?.trim();

  if (!accessToken) throw new Error("WhatsApp access token is not configured.");
  if (!wabaId) throw new Error("WhatsApp Business Account ID is not configured.");
  if (!graphVersion) throw new Error("Meta Graph API version is not configured.");
  return { accessToken, wabaId, graphVersion };
}

async function metaFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const { accessToken } = templateConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as T & {
      error?: { message?: string; code?: number };
    };
    if (!response.ok) {
      const suffix = payload.error?.code ? ` (${payload.error.code})` : "";
      throw new Error(
        `${payload.error?.message || `Meta request failed with HTTP ${response.status}`}${suffix}`,
      );
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function hasPlaceholderMediaHandle(components: Prisma.JsonValue): boolean {
  if (!Array.isArray(components)) return false;
  return components.some((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) return false;
    const example = (component as Record<string, unknown>).example;
    return JSON.stringify(example ?? "").includes("REPLACE_WITH_META_SAMPLE_HANDLE_BEFORE_SUBMIT");
  });
}

export async function listTemplates(limit = 200) {
  return prisma.whatsAppTemplate.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: Math.max(1, Math.min(250, Math.floor(limit))),
  });
}

export async function createTemplateDraft(input: TemplateDraftInput) {
  const name = normalizeTemplateName(input.name);
  const language = normalizeLanguage(input.language);
  const category = normalizeCategory(input.category);
  const components = normalizeComponents(input.components);

  const created = await prisma.whatsAppTemplate.create({
    data: {
      name,
      language,
      category,
      components: toJson(components),
      status: TemplateStatus.DRAFT,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "WHATSAPP_TEMPLATE_DRAFT_CREATED",
      entityType: "WhatsAppTemplate",
      entityId: created.id,
      after: toJson({ name, language, category, status: created.status }),
    },
  });
  return created;
}

export async function submitTemplateToMeta(input: {
  templateId: string;
  actorId: string;
}) {
  const template = await prisma.whatsAppTemplate.findUnique({
    where: { id: input.templateId },
  });
  if (!template) throw new Error("WhatsApp template not found.");
  if (
    template.status !== TemplateStatus.DRAFT &&
    template.status !== TemplateStatus.REJECTED
  ) {
    throw new Error("Only draft or rejected templates can be submitted.");
  }
  if (hasPlaceholderMediaHandle(template.components)) {
    throw new Error("Media-header sample handle must be uploaded before Meta submission.");
  }

  const config = templateConfig();
  const result = await metaFetch<MetaTemplateCreateResponse>(
    `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.wabaId)}/message_templates`,
    {
      method: "POST",
      body: JSON.stringify({
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components,
      }),
    },
  );
  if (!result.id) throw new Error("Meta did not return a template ID.");

  const updated = await prisma.whatsAppTemplate.update({
    where: { id: template.id },
    data: {
      metaTemplateId: result.id,
      status: metaStatus(result.status),
      category: result.category || template.category,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "WHATSAPP_TEMPLATE_SUBMITTED",
      entityType: "WhatsAppTemplate",
      entityId: updated.id,
      before: toJson({ status: template.status }),
      after: toJson({ status: updated.status, metaTemplateId: updated.metaTemplateId }),
    },
  });
  return updated;
}

export async function syncTemplatesFromMeta(actorId: string) {
  const config = templateConfig();
  const fields = [
    "id",
    "name",
    "language",
    "category",
    "status",
    "components",
    "rejected_reason",
    "quality_score",
  ].join(",");
  let nextUrl: string | undefined =
    `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.wabaId)}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`;
  const records: MetaTemplateRecord[] = [];

  for (let page = 0; nextUrl && page < 10; page += 1) {
    const response: MetaTemplateListResponse =
      await metaFetch<MetaTemplateListResponse>(nextUrl);
    records.push(...(response.data ?? []));
    nextUrl = response.paging?.next;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const rejectionSummary: Array<{ name: string; reason: string | null }> = [];

  for (const record of records) {
    if (!record.id || !record.name || !record.language) {
      skipped += 1;
      continue;
    }
    const existing = await prisma.whatsAppTemplate.findFirst({
      where: { OR: [{ metaTemplateId: record.id }, { name: record.name }] },
    });
    const components = Array.isArray(record.components) ? record.components : [];

    if (existing) {
      await prisma.whatsAppTemplate.update({
        where: { id: existing.id },
        data: {
          metaTemplateId: record.id,
          language: record.language,
          category: record.category || existing.category,
          status: metaStatus(record.status),
          components: toJson(components),
          lastSyncedAt: new Date(),
        },
      });
      updated += 1;
    } else {
      try {
        await prisma.whatsAppTemplate.create({
          data: {
            metaTemplateId: record.id,
            name: record.name,
            language: record.language,
            category: record.category || "UTILITY",
            status: metaStatus(record.status),
            components: toJson(components),
            lastSyncedAt: new Date(),
          },
        });
        created += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    if (record.rejected_reason) {
      rejectionSummary.push({ name: record.name, reason: record.rejected_reason });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "WHATSAPP_TEMPLATES_SYNCED",
      entityType: "WhatsAppTemplate",
      after: toJson({
        fetched: records.length,
        created,
        updated,
        skipped,
        rejected: rejectionSummary.slice(0, 50),
      }),
    },
  });

  return { fetched: records.length, created, updated, skipped };
}

import { Prisma, TemplateStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  dashboardMediaUrl,
  loadMediaAsset,
  readMediaAsset,
} from "../media/media-storage";
import { uploadTemplateSampleToMeta } from "../templates/template-media-service";
import { submitTemplateToMeta } from "../templates/template-service";

const IMAGE_CONFIG_EVENT_KEY = "masterclass-two-step:image-config";
const IMAGE_CONFIG_EVENT_TYPE = "masterclass_two_step_image_config";
const IMAGE_SNAPSHOT_EVENT_TYPE = "masterclass_two_step_image_snapshot";
const INSTANT_IMAGE_TEMPLATE_NAME =
  "sikhadenge_masterclass_registration_image_v1";
const REMINDER_IMAGE_TEMPLATE_NAME =
  "sikhadenge_masterclass_reminder_image_v1";
const MASTERCLASS_OUTBOUND_KEY =
  /^masterclass:([a-f0-9]{32}):(instant|reminder)$/u;

export type MasterclassImageConfig = {
  message1ImageAssetId: string | null;
  useSameImageForMessage2: boolean;
  message2ImageAssetId: string | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
};

type MasterclassImageSnapshot = {
  enrollmentId: string;
  message1ImageAssetId: string | null;
  message2ImageAssetId: string | null;
  configVersion: number;
  createdAt: string;
};

type ImageTemplateSummary = {
  id: string;
  name: string;
  status: TemplateStatus;
  category: string;
  language: string;
} | null;

export type MasterclassImageAssetSummary = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
} | null;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function integer(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(1_000_000, Math.floor(parsed))
    : fallback;
}

function normalizeAssetId(value: unknown): string | null {
  if (value === null || value === "") return null;
  const id = clean(value, 64);
  if (!id) return null;
  if (!/^[a-f0-9]{32}$/u.test(id)) {
    throw new Error("Invalid image asset ID.");
  }
  return id;
}

function defaultImageConfig(): MasterclassImageConfig {
  return {
    message1ImageAssetId: null,
    useSameImageForMessage2: true,
    message2ImageAssetId: null,
    version: 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };
}

function parseImageConfig(value: Prisma.JsonValue): MasterclassImageConfig | null {
  const record = asRecord(value);
  try {
    return {
      message1ImageAssetId: normalizeAssetId(record.message1ImageAssetId),
      useSameImageForMessage2: record.useSameImageForMessage2 !== false,
      message2ImageAssetId: normalizeAssetId(record.message2ImageAssetId),
      version: integer(record.version, 1),
      updatedBy: clean(record.updatedBy, 100) || null,
      updatedAt: clean(record.updatedAt, 60) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function parseSnapshot(value: Prisma.JsonValue): MasterclassImageSnapshot | null {
  const record = asRecord(value);
  const enrollmentId = clean(record.enrollmentId, 64);
  if (!/^[a-f0-9]{32}$/u.test(enrollmentId)) return null;
  try {
    return {
      enrollmentId,
      message1ImageAssetId: normalizeAssetId(record.message1ImageAssetId),
      message2ImageAssetId: normalizeAssetId(record.message2ImageAssetId),
      configVersion: integer(record.configVersion, 1),
      createdAt: clean(record.createdAt, 60) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function effectiveMessage2ImageAssetId(
  config: Pick<
    MasterclassImageConfig,
    | "message1ImageAssetId"
    | "useSameImageForMessage2"
    | "message2ImageAssetId"
  >,
): string | null {
  return config.useSameImageForMessage2
    ? config.message1ImageAssetId
    : config.message2ImageAssetId;
}

export function parseMasterclassImageOutboundKey(value: string): {
  enrollmentId: string;
  kind: "instant" | "reminder";
} | null {
  const match = MASTERCLASS_OUTBOUND_KEY.exec(value.trim());
  if (!match) return null;
  return {
    enrollmentId: match[1],
    kind: match[2] as "instant" | "reminder",
  };
}

async function assertImageAsset(assetId: string | null): Promise<void> {
  if (!assetId) return;
  const asset = await loadMediaAsset(assetId);
  if (asset.kind !== "image") {
    throw new Error("Only JPG, PNG or WEBP images can be selected for this flow.");
  }
}

export async function getMasterclassImageConfig(): Promise<MasterclassImageConfig> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventKey: IMAGE_CONFIG_EVENT_KEY },
  });
  const parsed = existing ? parseImageConfig(existing.payload) : null;
  if (parsed) return parsed;

  const config = defaultImageConfig();
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: IMAGE_CONFIG_EVENT_KEY,
        eventType: IMAGE_CONFIG_EVENT_TYPE,
        payload: toJson(config),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    return config;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.webhookEvent.findUnique({
        where: { eventKey: IMAGE_CONFIG_EVENT_KEY },
      });
      const concurrentConfig = concurrent
        ? parseImageConfig(concurrent.payload)
        : null;
      if (concurrentConfig) return concurrentConfig;
    }
    throw error;
  }
}

export async function saveMasterclassImageConfig(input: {
  message1ImageAssetId?: unknown;
  useSameImageForMessage2?: unknown;
  message2ImageAssetId?: unknown;
  actorId: string;
}): Promise<MasterclassImageConfig> {
  const current = await getMasterclassImageConfig();
  const message1ImageAssetId =
    input.message1ImageAssetId === undefined
      ? current.message1ImageAssetId
      : normalizeAssetId(input.message1ImageAssetId);
  const useSameImageForMessage2 =
    input.useSameImageForMessage2 === undefined
      ? current.useSameImageForMessage2
      : input.useSameImageForMessage2 === true;
  const message2ImageAssetId =
    input.message2ImageAssetId === undefined
      ? current.message2ImageAssetId
      : normalizeAssetId(input.message2ImageAssetId);

  await Promise.all([
    assertImageAsset(message1ImageAssetId),
    assertImageAsset(message2ImageAssetId),
  ]);

  const updated: MasterclassImageConfig = {
    message1ImageAssetId,
    useSameImageForMessage2,
    message2ImageAssetId,
    version: current.version + 1,
    updatedBy: input.actorId,
    updatedAt: new Date().toISOString(),
  };

  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { eventKey: IMAGE_CONFIG_EVENT_KEY },
      data: { payload: toJson(updated), processedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "MASTERCLASS_FLOW_IMAGES_UPDATED",
        entityType: "MasterclassTwoStepFlow",
        entityId: IMAGE_CONFIG_EVENT_KEY,
        before: toJson(current),
        after: toJson(updated),
      },
    }),
  ]);
  return updated;
}

function renderInstantTemplateBody(input: {
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
}): string {
  return `Hi Learner 👋\n\nAapka registration *Free AI Expert Masterclass* ke liye *successfully receive ho gaya hai.* 🚀\n\n🔴 *Live Class | ${input.classTime}*\n🗓 *${input.classDate} | ${input.classDay}*\n\n📌 *Masterclass ki joining link aur complete details* aapko hamari *WhatsApp Community* mein share ki jayengi.\n\n👉 Updates miss na karne aur apni seat confirm karne ke liye abhi *WhatsApp Community join karein:*\n\n🟢 ${input.communityLink}\n\n⚠️ *Seats limited hain — abhi community join karein.* ⏳\n\n*Thank You for Registering!*\n*Team SikhaDenge* 🎓`;
}

function renderReminderTemplateBody(input: {
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
}): string {
  return `Hi Learner 👋\n\n⏰ Just a Quick Reminder\n\n*AI Expert Masterclass* ki joining link aur final class instructions hamari *WhatsApp Community* mein hi share ki jayengi.\n\n🔴 *Live Class | ${input.classTime}*\n🗓 *${input.classDate} | ${input.classDay}*\n\n👉 Agar aapne abhi tak WhatsApp Community join nahi ki hai, to neeche diye gaye link se abhi join karein:\n\n🟢 ${input.communityLink}\n\n✅ Community pehle hi join kar chuke hain?\nPerfect! Aapko kuch aur karne ki zarurat nahi hai. Class ki details community mein mil jayengi.\n\n⚠️ Class start hone se pehle WhatsApp Community check karna na bhoolein.\n\n*See You in the 🔴Live Masterclass!*\n*Team SikhaDenge* 🎓`;
}

function imageTemplateComponents(
  bodyText: string,
  headerHandle: string,
): Prisma.InputJsonValue {
  const example = [
    "08:00 PM",
    "07 August",
    "Friday",
    "https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd",
  ];
  return toJson([
    {
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    },
    {
      type: "BODY",
      text: bodyText,
      example: { body_text: [example] },
    },
  ]);
}

async function loadImageTemplates(): Promise<{
  instant: ImageTemplateSummary;
  reminder: ImageTemplateSummary;
}> {
  const templates = await prisma.whatsAppTemplate.findMany({
    where: {
      name: {
        in: [INSTANT_IMAGE_TEMPLATE_NAME, REMINDER_IMAGE_TEMPLATE_NAME],
      },
    },
  });
  const summary = (name: string): ImageTemplateSummary => {
    const template = templates.find((item) => item.name === name);
    return template
      ? {
          id: template.id,
          name: template.name,
          status: template.status,
          category: template.category,
          language: template.language,
        }
      : null;
  };
  return {
    instant: summary(INSTANT_IMAGE_TEMPLATE_NAME),
    reminder: summary(REMINDER_IMAGE_TEMPLATE_NAME),
  };
}

export async function ensureMasterclassImageTemplates(actorId: string) {
  const config = await getMasterclassImageConfig();
  const sampleAssetId =
    config.message1ImageAssetId || effectiveMessage2ImageAssetId(config);
  if (!sampleAssetId) {
    return {
      prepared: false,
      reason: "Upload a masterclass image before preparing image templates.",
      templates: await loadImageTemplates(),
    };
  }

  const { asset, data } = await readMediaAsset(sampleAssetId);
  if (asset.kind !== "image") {
    throw new Error("Masterclass template sample must be an image.");
  }
  const sampleBytes = new ArrayBuffer(data.byteLength);
  new Uint8Array(sampleBytes).set(data);
  const sampleFile = new File([sampleBytes], asset.originalName, {
    type: asset.mimeType,
  });
  const sample = await uploadTemplateSampleToMeta({
    file: sampleFile,
    requestedFormat: "IMAGE",
  });

  const definitions = [
    {
      name: INSTANT_IMAGE_TEMPLATE_NAME,
      components: imageTemplateComponents(
        renderInstantTemplateBody({
          classTime: "{{1}}",
          classDate: "{{2}}",
          classDay: "{{3}}",
          communityLink: "{{4}}",
        }),
        sample.headerHandle,
      ),
    },
    {
      name: REMINDER_IMAGE_TEMPLATE_NAME,
      components: imageTemplateComponents(
        renderReminderTemplateBody({
          classTime: "{{1}}",
          classDate: "{{2}}",
          classDay: "{{3}}",
          communityLink: "{{4}}",
        }),
        sample.headerHandle,
      ),
    },
  ];

  const prepared = [];
  for (const definition of definitions) {
    const existing = await prisma.whatsAppTemplate.findUnique({
      where: { name: definition.name },
    });
    if (!existing) {
      prepared.push(
        await prisma.whatsAppTemplate.create({
          data: {
            name: definition.name,
            language: "en_US",
            category: "MARKETING",
            status: TemplateStatus.DRAFT,
            components: definition.components,
          },
        }),
      );
    } else if (
      existing.status === TemplateStatus.DRAFT ||
      existing.status === TemplateStatus.REJECTED
    ) {
      prepared.push(
        await prisma.whatsAppTemplate.update({
          where: { id: existing.id },
          data: {
            language: "en_US",
            category: "MARKETING",
            components: definition.components,
          },
        }),
      );
    } else {
      prepared.push(existing);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "MASTERCLASS_IMAGE_TEMPLATES_PREPARED",
      entityType: "MasterclassTwoStepFlow",
      entityId: IMAGE_CONFIG_EVENT_KEY,
      after: toJson(
        prepared.map((template) => ({
          name: template.name,
          status: template.status,
        })),
      ),
    },
  });

  return { prepared: true, templates: await loadImageTemplates() };
}

export async function submitMasterclassImageTemplates(actorId: string) {
  const prepared = await ensureMasterclassImageTemplates(actorId);
  const templates = await loadImageTemplates();
  const submitted = [];
  for (const template of [templates.instant, templates.reminder]) {
    if (!template) continue;
    if (
      template.status === TemplateStatus.DRAFT ||
      template.status === TemplateStatus.REJECTED
    ) {
      submitted.push(
        await submitTemplateToMeta({ templateId: template.id, actorId }),
      );
    }
  }
  return { prepared, submitted };
}

export async function assertMasterclassImageTemplatesReady(
  config?: MasterclassImageConfig,
): Promise<void> {
  const resolvedConfig = config ?? (await getMasterclassImageConfig());
  const templates = await loadImageTemplates();
  if (
    resolvedConfig.message1ImageAssetId &&
    templates.instant?.status !== TemplateStatus.APPROVED
  ) {
    throw new Error(
      "Message 1 image template must be APPROVED before enabling the flow.",
    );
  }
  if (
    effectiveMessage2ImageAssetId(resolvedConfig) &&
    templates.reminder?.status !== TemplateStatus.APPROVED
  ) {
    throw new Error(
      "Message 2 image template must be APPROVED before enabling the flow.",
    );
  }
}

async function assetSummary(
  assetId: string | null,
): Promise<MasterclassImageAssetSummary> {
  if (!assetId) return null;
  try {
    const asset = await loadMediaAsset(assetId);
    if (asset.kind !== "image") return null;
    return {
      id: asset.id,
      name: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      previewUrl: dashboardMediaUrl(asset.id),
    };
  } catch {
    return null;
  }
}

export async function getMasterclassImageOverview() {
  const config = await getMasterclassImageConfig();
  const effectiveMessage2 = effectiveMessage2ImageAssetId(config);
  const [message1, message2, templates] = await Promise.all([
    assetSummary(config.message1ImageAssetId),
    assetSummary(effectiveMessage2),
    loadImageTemplates(),
  ]);
  return {
    config,
    assets: { message1, message2 },
    templates,
    active: Boolean(config.message1ImageAssetId || effectiveMessage2),
  };
}

async function getOrCreateSnapshot(
  enrollmentId: string,
): Promise<MasterclassImageSnapshot> {
  const eventKey = `masterclass-image-snapshot:${enrollmentId}`;
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey } });
  const parsed = existing ? parseSnapshot(existing.payload) : null;
  if (parsed) return parsed;

  const config = await getMasterclassImageConfig();
  const snapshot: MasterclassImageSnapshot = {
    enrollmentId,
    message1ImageAssetId: config.message1ImageAssetId,
    message2ImageAssetId: effectiveMessage2ImageAssetId(config),
    configVersion: config.version,
    createdAt: new Date().toISOString(),
  };
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey,
        eventType: IMAGE_SNAPSHOT_EVENT_TYPE,
        payload: toJson(snapshot),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    return snapshot;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.webhookEvent.findUnique({ where: { eventKey } });
      const concurrentSnapshot = concurrent
        ? parseSnapshot(concurrent.payload)
        : null;
      if (concurrentSnapshot) return concurrentSnapshot;
    }
    throw error;
  }
}

export async function resolveMasterclassImageForOutbound(
  idempotencyKey: string,
): Promise<{
  enrollmentId: string;
  kind: "instant" | "reminder";
  assetId: string | null;
  imageTemplateId: string | null;
  imageTemplateStatus: TemplateStatus | null;
} | null> {
  const parsed = parseMasterclassImageOutboundKey(idempotencyKey);
  if (!parsed) return null;
  const snapshot = await getOrCreateSnapshot(parsed.enrollmentId);
  const assetId =
    parsed.kind === "instant"
      ? snapshot.message1ImageAssetId
      : snapshot.message2ImageAssetId;
  if (!assetId) {
    return {
      ...parsed,
      assetId: null,
      imageTemplateId: null,
      imageTemplateStatus: null,
    };
  }
  await assertImageAsset(assetId);
  const templates = await loadImageTemplates();
  const selected =
    parsed.kind === "instant" ? templates.instant : templates.reminder;
  return {
    ...parsed,
    assetId,
    imageTemplateId: selected?.id ?? null,
    imageTemplateStatus: selected?.status ?? null,
  };
}

export const MASTERCLASS_IMAGE_TEMPLATE_NAMES = {
  instant: INSTANT_IMAGE_TEMPLATE_NAME,
  reminder: REMINDER_IMAGE_TEMPLATE_NAME,
} as const;

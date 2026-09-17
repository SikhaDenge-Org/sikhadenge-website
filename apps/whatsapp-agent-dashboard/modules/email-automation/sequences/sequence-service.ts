import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ManualEmailSendService } from "../application/manual-send-service";
import { assertEmailBulkRecipientAllowed } from "../campaigns/campaign-service";
import { createEmailUnsubscribeUrl } from "../campaigns/unsubscribe";
import type { EmailSenderIdentity } from "../domain/contracts";
import { resolveEmailSender } from "../domain/sender-resolution";
import { buildEmailReadRuntime } from "../infrastructure/runtime";
import { buildEmailTemplateRuntime } from "../infrastructure/template-runtime";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}
function int(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.floor(number)))
    : fallback;
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function validEmail(value: unknown) {
  const email = clean(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }
  return email;
}

type SequenceStep = {
  delayMinutes: number;
  templateId: string;
  templateVersionId: string;
  senderIdentityId: string | null;
};

async function assertPinned(
  workspaceId: string,
  templateId: string,
  versionId: string,
  marketing: boolean,
) {
  const template = await buildEmailTemplateRuntime().service.get({
    workspaceId,
    templateId,
  });
  if (template.status !== "APPROVED") {
    throw new Error("Sequence step requires an APPROVED template.");
  }
  const version = template.versions.find(
    (item) => item.id === versionId && item.approvedAt,
  );
  if (!version) {
    throw new Error(
      "Sequence step templateVersionId must be the pinned approved version.",
    );
  }
  if (
    marketing &&
    !version.document.variables.some((variable) => variable.key === "unsubscribe_url")
  ) {
    throw new Error(
      "Marketing sequence template must declare unsubscribe_url.",
    );
  }
  return version;
}

async function validateSequenceSenderOverrides(
  workspaceId: string,
  steps: readonly SequenceStep[],
) {
  const ids = [
    ...new Set(
      steps
        .map((step) => step.senderIdentityId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!ids.length) return;

  const senders = await buildEmailReadRuntime().senders.listByWorkspace(workspaceId);
  for (const id of ids) {
    const sender = senders.find((item) => item.id === id);
    if (!sender || !sender.isActive || sender.verificationStatus !== "VERIFIED") {
      throw new Error(`Sequence sender ${id} is not verified and active.`);
    }
  }
}

async function resolveSequenceSender(input: {
  workspaceId: string;
  step: SequenceStep;
}): Promise<EmailSenderIdentity> {
  const template = await buildEmailTemplateRuntime().service.get({
    workspaceId: input.workspaceId,
    templateId: input.step.templateId,
  });
  if (template.status !== "APPROVED") {
    throw new Error("Sequence step requires an APPROVED template.");
  }
  const version = template.versions.find(
    (item) => item.id === input.step.templateVersionId && item.approvedAt,
  );
  if (!version) {
    throw new Error("Sequence pinned template version is no longer approved.");
  }

  const senders = await buildEmailReadRuntime().senders.listByWorkspace(
    input.workspaceId,
  );
  const resolved = resolveEmailSender({
    availableSenders: senders,
    automationSenderIdentityId: input.step.senderIdentityId,
    templateSenderIdentityId: version.defaultSenderIdentityId,
  });

  if (resolved.sender.dailyLimit && resolved.sender.dailyLimit > 0) {
    const used = await prisma.engageEmailMessage.count({
      where: {
        workspaceId: input.workspaceId,
        senderIdentityId: resolved.sender.id,
        externalRequestSent: true,
        sentAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (used >= resolved.sender.dailyLimit) {
      throw new Error(
        `Sender daily limit reached for ${resolved.sender.fromEmail}.`,
      );
    }
  }

  return resolved.sender;
}

export async function createEmailSequence(input: {
  workspaceId: string;
  actorUserId: string;
  name: unknown;
  purpose?: unknown;
  steps: unknown;
}) {
  const name = clean(input.name, 160);
  if (name.length < 3) throw new Error("Sequence name is required.");
  const purpose =
    clean(input.purpose, 30).toUpperCase() === "MARKETING"
      ? "MARKETING"
      : "TRANSACTIONAL";
  const steps: SequenceStep[] = list(input.steps)
    .slice(0, 50)
    .map((raw, index) => {
      const row =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const templateId = clean(row.templateId, 100);
      const templateVersionId = clean(row.templateVersionId, 100);
      if (!templateId || !templateVersionId) {
        throw new Error(
          `Sequence step ${index + 1} requires templateId and templateVersionId.`,
        );
      }
      return {
        delayMinutes: int(row.delayMinutes, index === 0 ? 0 : 60, 0, 43_200),
        templateId,
        templateVersionId,
        senderIdentityId: clean(row.senderIdentityId, 100) || null,
      };
    });
  if (!steps.length) throw new Error("Sequence requires at least one step.");

  for (const step of steps) {
    await assertPinned(
      input.workspaceId,
      step.templateId,
      step.templateVersionId,
      purpose === "MARKETING",
    );
  }
  await validateSequenceSenderOverrides(input.workspaceId, steps);

  return prisma.engageEmailSequence.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      status: "DRAFT",
      purpose,
      steps: json(steps),
      createdById: input.actorUserId,
    },
  });
}

export async function listEmailSequences(workspaceId: string) {
  return prisma.engageEmailSequence.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { enrollments: true } } },
  });
}

export async function setEmailSequenceStatus(input: {
  workspaceId: string;
  sequenceId: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
}) {
  const row = await prisma.engageEmailSequence.findFirst({
    where: { id: input.sequenceId, workspaceId: input.workspaceId },
  });
  if (!row) throw new Error("Sequence not found.");
  if (row.status === "ARCHIVED") {
    throw new Error("Archived sequence cannot be reactivated.");
  }
  return prisma.engageEmailSequence.update({
    where: { id: row.id },
    data: { status: input.status },
  });
}

export async function enrollEmailSequence(input: {
  workspaceId: string;
  sequenceId: string;
  contactId?: unknown;
  email: unknown;
  name?: unknown;
}) {
  const sequence = await prisma.engageEmailSequence.findFirst({
    where: { id: input.sequenceId, workspaceId: input.workspaceId },
  });
  if (!sequence || sequence.status !== "ACTIVE") {
    throw new Error("Active sequence not found.");
  }

  const address = validEmail(input.email);
  const contactId = clean(input.contactId, 100) || null;
  if (sequence.purpose === "MARKETING") {
    await assertEmailBulkRecipientAllowed({
      workspaceId: input.workspaceId,
      purpose: "MARKETING",
      recipient: {
        contactId,
        email: address,
        name: clean(input.name, 160) || null,
      },
      frequencyCapPerDay: 1,
    });
  }

  const steps = list(sequence.steps);
  const first =
    steps[0] && typeof steps[0] === "object" && !Array.isArray(steps[0])
      ? (steps[0] as Record<string, unknown>)
      : {};
  const nextRunAt = new Date(
    Date.now() + int(first.delayMinutes, 0, 0, 43_200) * 60_000,
  );

  return prisma.engageEmailSequenceEnrollment.upsert({
    where: { sequenceId_email: { sequenceId: sequence.id, email: address } },
    update: {
      status: "ACTIVE",
      currentStep: 0,
      nextRunAt,
      lastError: null,
      contactId,
      name: clean(input.name, 160) || null,
    },
    create: {
      workspaceId: input.workspaceId,
      sequenceId: sequence.id,
      contactId,
      email: address,
      name: clean(input.name, 160) || null,
      status: "ACTIVE",
      currentStep: 0,
      nextRunAt,
    },
  });
}

export async function processDueEmailSequences(limit = 50) {
  const due = await prisma.engageEmailSequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextRunAt: { lte: new Date() },
      sequence: { status: "ACTIVE" },
    },
    include: { sequence: true },
    orderBy: { nextRunAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });

  let processed = 0;
  let failed = 0;
  let completed = 0;

  for (const enrollment of due) {
    try {
      const steps = list(enrollment.sequence.steps);
      const raw = steps[enrollment.currentStep];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        await prisma.engageEmailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED" },
        });
        completed += 1;
        continue;
      }

      const row = raw as Record<string, unknown>;
      const step: SequenceStep = {
        delayMinutes: int(row.delayMinutes, 0, 0, 43_200),
        templateId: clean(row.templateId, 100),
        templateVersionId: clean(row.templateVersionId, 100),
        senderIdentityId: clean(row.senderIdentityId, 100) || null,
      };
      if (!step.templateId || !step.templateVersionId) {
        throw new Error("Sequence step template snapshot is invalid.");
      }

      if (enrollment.sequence.purpose === "MARKETING") {
        await assertEmailBulkRecipientAllowed({
          workspaceId: enrollment.workspaceId,
          purpose: "MARKETING",
          recipient: {
            contactId: enrollment.contactId,
            email: enrollment.email,
            name: enrollment.name,
          },
          frequencyCapPerDay: 1,
        });
      }

      const sender = await resolveSequenceSender({
        workspaceId: enrollment.workspaceId,
        step,
      });
      const variables: Record<string, string> = {
        contactId: enrollment.contactId ?? "",
        sequenceName: enrollment.sequence.name,
      };
      if (enrollment.sequence.purpose === "MARKETING") {
        if (!enrollment.contactId) {
          throw new Error("Marketing sequence contactId is required.");
        }
        variables.unsubscribe_url = createEmailUnsubscribeUrl({
          workspaceId: enrollment.workspaceId,
          contactId: enrollment.contactId,
          email: enrollment.email,
        });
      }

      const result = await new ManualEmailSendService().send({
        workspaceId: enrollment.workspaceId,
        templateId: step.templateId,
        templateVersionId: step.templateVersionId,
        automationSenderIdentityId: sender.id,
        to: [
          {
            email: enrollment.email,
            ...(enrollment.name ? { name: enrollment.name } : {}),
          },
        ],
        variables,
        idempotencyKey: `sequence:${enrollment.id}:step:${enrollment.currentStep}`,
        actorUserId: enrollment.sequence.createdById,
        deliveryContext: "AUTOMATION",
      });

      const next = enrollment.currentStep + 1;
      const nextRaw = steps[next];
      const done = !nextRaw;
      const nextStep =
        nextRaw && typeof nextRaw === "object" && !Array.isArray(nextRaw)
          ? (nextRaw as Record<string, unknown>)
          : {};

      await prisma.$transaction(async (tx) => {
        await tx.engageEmailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: done
            ? { status: "COMPLETED", currentStep: next, lastError: null }
            : {
                currentStep: next,
                nextRunAt: new Date(
                  Date.now() +
                    int(nextStep.delayMinutes, 60, 0, 43_200) * 60_000,
                ),
                lastError: null,
              },
        });
        await tx.engageEmailAnalyticsEvent.upsert({
          where: {
            workspaceId_eventKey: {
              workspaceId: enrollment.workspaceId,
              eventKey: `sequence:${enrollment.id}:${enrollment.currentStep}:${result.message.id}`,
            },
          },
          update: {},
          create: {
            workspaceId: enrollment.workspaceId,
            messageId: result.message.id,
            contactId: enrollment.contactId,
            eventType: result.message.externalRequestSent
              ? "SEQUENCE_SENT"
              : "SEQUENCE_DRY_RUN",
            provider: sender.provider,
            eventKey: `sequence:${enrollment.id}:${enrollment.currentStep}:${result.message.id}`,
            metadata: json({
              sequenceId: enrollment.sequenceId,
              step: enrollment.currentStep,
              email: enrollment.email,
              senderIdentityId: sender.id,
            }),
            occurredAt: new Date(),
          },
        });
      });

      processed += 1;
      if (done) completed += 1;
    } catch (error) {
      failed += 1;
      await prisma.engageEmailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "FAILED",
          lastError:
            error instanceof Error ? error.message : "Sequence execution failed.",
        },
      });
    }
  }

  return { processed, failed, completed };
}

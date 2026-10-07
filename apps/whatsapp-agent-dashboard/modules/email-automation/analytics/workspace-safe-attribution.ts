import { prisma } from "@/lib/db/prisma";
import { selectUniqueWorkspaceContactId } from "./contact-attribution-contract";

const TRUSTED_SEND_EVENT_TYPES = [
  "CAMPAIGN_SENT",
  "CAMPAIGN_DRY_RUN",
  "SEQUENCE_SENT",
  "SEQUENCE_DRY_RUN",
  "AUTOMATION_SENT",
  "AUTOMATION_DRY_RUN",
] as const;

export async function resolveWorkspaceSafeTrackingContactId(input: {
  workspaceId: string;
  messageId: string;
}): Promise<string | null> {
  const [sendEvents, campaignRecipients] = await Promise.all([
    prisma.engageEmailAnalyticsEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        eventType: { in: [...TRUSTED_SEND_EVENT_TYPES] },
        contactId: { not: null },
      },
      orderBy: { occurredAt: "asc" },
      take: 25,
      select: { contactId: true },
    }),
    prisma.engageEmailCampaignRecipient.findMany({
      where: {
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        contactId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { contactId: true },
    }),
  ]);

  return selectUniqueWorkspaceContactId([
    ...sendEvents.map((row) => row.contactId),
    ...campaignRecipients.map((row) => row.contactId),
  ]);
}

export async function backfillWorkspaceTrackingContactId(input: {
  workspaceId: string;
  messageId: string;
  contactId: string | null | undefined;
}) {
  const contactId = input.contactId?.trim();
  if (!contactId) return { count: 0 };

  return prisma.engageEmailAnalyticsEvent.updateMany({
    where: {
      workspaceId: input.workspaceId,
      messageId: input.messageId,
      eventType: { in: ["OPENED", "CLICKED", "DELIVERED"] },
      contactId: null,
    },
    data: { contactId },
  });
}

import {
  AgentMode,
  LeadStage,
  LeadTemperature,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  PrismaClient,
  TemplateStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const FIXTURE_WA_ID = "ci-browser-wa-id";
const FIXTURE_TEMPLATE_NAME = "ci_browser_template";

async function main() {
  await prisma.whatsAppContact.deleteMany({
    where: { waId: FIXTURE_WA_ID },
  });
  await prisma.whatsAppTemplate.deleteMany({
    where: { name: FIXTURE_TEMPLATE_NAME },
  });

  const now = new Date();
  const contact = await prisma.whatsAppContact.create({
    data: {
      waId: FIXTURE_WA_ID,
      phone: "+919999000001",
      displayName: "CI Browser Learner",
      profileName: "CI Browser Learner",
      email: "browser-learner@example.invalid",
      city: "Varanasi",
      language: "en",
    },
  });

  const conversation = await prisma.whatsAppConversation.create({
    data: {
      contactId: contact.id,
      status: "OPEN",
      agentMode: AgentMode.HUMAN,
      source: "whatsapp",
      currentIntent: "COURSE_DETAILS",
      detectedLanguage: "en",
      aiConfidence: 0.96,
      aiSummary:
        "Authenticated browser regression fixture with enough context to exercise the fixed composer dock, responsive controls, and template modal stacking.",
      unreadCount: 1,
      lastMessageAt: now,
      serviceWindowExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      metaMessageId: "ci-browser-message-1",
      direction: MessageDirection.INBOUND,
      actor: MessageActor.CUSTOMER,
      type: MessageType.TEXT,
      status: MessageStatus.RECEIVED,
      text: "Please share the approved course details.",
      messageTimestamp: now,
    },
  });

  await prisma.lead.create({
    data: {
      contactId: contact.id,
      conversationId: conversation.id,
      stage: LeadStage.QUALIFIED,
      temperature: LeadTemperature.HOT,
      score: 88,
      goal: "Learn AI for business growth",
      interestedCourse: "AI Business Growth Architect Program",
      joiningTimeline: "This month",
      counselorRequested: true,
    },
  });

  await prisma.whatsAppTemplate.create({
    data: {
      name: FIXTURE_TEMPLATE_NAME,
      language: "en_US",
      category: "UTILITY",
      status: TemplateStatus.APPROVED,
      components: [
        {
          type: "BODY",
          text: "Your approved SikhaDenge course details are ready.",
        },
      ],
      lastSyncedAt: now,
    },
  });

  console.log(
    `Authenticated Inbox browser fixture ready: ${conversation.id}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

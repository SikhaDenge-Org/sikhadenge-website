import { AgentMode, LeadStage } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const LEAD_STAGES = new Set<LeadStage>(Object.values(LeadStage));
const QUALIFIED_STAGES = new Set<LeadStage>([LeadStage.QUALIFIED, LeadStage.COUNSELOR_ASSIGNED, LeadStage.DEMO_BOOKED, LeadStage.PAYMENT_PENDING, LeadStage.ENROLLED]);

export function emailAutomationConditionPasses(expression: unknown, values: Record<string, string>): boolean {
  if (typeof expression !== "string") return false;
  const match = /^\s*([A-Za-z0-9_.-]+)\s*(?:==|=)\s*(.*?)\s*$/.exec(expression);
  if (!match) return false;
  return (values[match[1]] ?? "").toLowerCase() === match[2].replace(/^['"]|['"]$/g, "").toLowerCase();
}

export async function emailAutomationContactContext(contactId: string) {
  const contact = await prisma.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, displayName: true, profileName: true, lead: { select: { id: true, conversationId: true, stage: true, assignedToId: true } } },
  });
  if (!contact) throw new Error("Automation contact not found.");
  return contact;
}

export async function executeEmailAutomationCrmAction(input: {
  workspaceId: string; flowId: string; eventId: string; contactId: string;
  node: { type: string; config: Record<string, unknown>; id: string }; actorUserId: string;
}) {
  const ctx = await emailAutomationContactContext(input.contactId);
  const lead = ctx.lead;
  if (input.node.type === "ADD_TAG" || input.node.type === "REMOVE_TAG") {
    if (!lead?.conversationId) throw new Error("CRM tag action requires a conversation-backed lead.");
    const tagName = typeof input.node.config.tag === "string" ? input.node.config.tag.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    if (!tagName) throw new Error("CRM tag action requires tag.");
    await prisma.$transaction(async (tx) => {
      const tag = await tx.conversationTag.upsert({ where: { name: tagName }, create: { name: tagName }, update: {}, select: { id: true } });
      if (input.node.type === "ADD_TAG") await tx.conversationTagLink.upsert({ where: { conversationId_tagId: { conversationId: lead.conversationId, tagId: tag.id } }, create: { conversationId: lead.conversationId, tagId: tag.id }, update: {} });
      else await tx.conversationTagLink.deleteMany({ where: { conversationId: lead.conversationId, tagId: tag.id } });
      await tx.auditLog.create({ data: { actorId: input.actorUserId, action: "EMAIL_AUTOMATION_" + input.node.type, entityType: "WhatsAppConversation", entityId: lead.conversationId, after: { flowId: input.flowId, eventId: input.eventId, nodeId: input.node.id, tag: tagName } } });
    });
    return;
  }
  if (input.node.type === "UPDATE_STAGE") {
    if (!lead) throw new Error("Update Stage requires a lead.");
    const raw = typeof input.node.config.stage === "string" ? input.node.config.stage.trim().toUpperCase() : "";
    if (!LEAD_STAGES.has(raw as LeadStage)) throw new Error("Update Stage has an invalid lead stage.");
    const stage = raw as LeadStage;
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: { stage, qualifiedAt: QUALIFIED_STAGES.has(stage) ? new Date() : undefined, closedAt: stage === LeadStage.CLOSED ? new Date() : null } });
      await tx.auditLog.create({ data: { actorId: input.actorUserId, action: "EMAIL_AUTOMATION_UPDATE_STAGE", entityType: "Lead", entityId: lead.id, before: { stage: lead.stage }, after: { stage, flowId: input.flowId, eventId: input.eventId, nodeId: input.node.id } } });
    });
    return;
  }
  if (input.node.type === "ASSIGN_COUNSELOR") {
    if (!lead?.conversationId) throw new Error("Assign Counselor requires a conversation-backed lead.");
    const counselorId = typeof input.node.config.counselorId === "string" ? input.node.config.counselorId.trim() : "";
    const counselor = await prisma.dashboardUser.findFirst({ where: { id: counselorId, isActive: true }, select: { id: true } });
    if (!counselor) throw new Error("Assign Counselor user is invalid.");
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: { assignedToId: counselor.id } });
      await tx.whatsAppConversation.update({ where: { id: lead.conversationId }, data: { assignedToId: counselor.id, agentMode: AgentMode.HUMAN, humanTakeoverAt: new Date(), humanTakeoverReason: "Email automation counselor assignment." } });
      await tx.auditLog.create({ data: { actorId: input.actorUserId, action: "EMAIL_AUTOMATION_ASSIGN_COUNSELOR", entityType: "Lead", entityId: lead.id, after: { counselorId: counselor.id, flowId: input.flowId, eventId: input.eventId, nodeId: input.node.id } } });
    });
    return;
  }
  if (input.node.type === "HUMAN_HANDOFF") {
    if (!lead?.conversationId) throw new Error("Human Handoff requires a conversation-backed lead.");
    await prisma.$transaction(async (tx) => {
      await tx.whatsAppConversation.update({ where: { id: lead.conversationId }, data: { agentMode: AgentMode.HUMAN, humanTakeoverAt: new Date(), humanTakeoverReason: "Email automation human handoff." } });
      await tx.auditLog.create({ data: { actorId: input.actorUserId, action: "EMAIL_AUTOMATION_HUMAN_HANDOFF", entityType: "WhatsAppConversation", entityId: lead.conversationId, after: { flowId: input.flowId, eventId: input.eventId, nodeId: input.node.id } } });
    });
    return;
  }
  if (input.node.type === "CREATE_TASK") {
    const title = typeof input.node.config.title === "string" ? input.node.config.title.trim().slice(0, 200) : "Follow up with contact";
    const dueMinutes = Number(input.node.config.dueMinutes);
    await prisma.engageEmailAutomationTask.create({ data: { workspaceId: input.workspaceId, contactId: ctx.id, leadId: lead?.id ?? null, title: title || "Follow up with contact", description: typeof input.node.config.description === "string" ? input.node.config.description.trim().slice(0, 2000) || null : null, dueAt: Number.isFinite(dueMinutes) && dueMinutes >= 0 ? new Date(Date.now() + Math.floor(dueMinutes) * 60_000) : null, assignedToId: lead?.assignedToId ?? null, sourceFlowId: input.flowId, sourceEventId: input.eventId } });
  }
}
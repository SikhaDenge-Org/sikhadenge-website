import { prisma } from "../db/prisma";
import { checkSuppression } from "./consent-engine";
import { isAIHandlingAllowed } from "./takeover-engine";

export interface CourseFact {
  id: string;
  name: string;
  regularPrice: number;
  workshopPrice: number;
  duration: string;
  eligibility: string;
}

// Approved SikhaDenge Course Catalog (AI cannot invent prices or discounts)
export const APPROVED_COURSES: Record<string, CourseFact> = {
  "ai-mastery": {
    id: "ai-mastery",
    name: "AI & Generative AI Mastery",
    regularPrice: 4999,
    workshopPrice: 9,
    duration: "4 Weeks Live Workshop",
    eligibility: "No coding or technical background required"
  },
  "video-editing": {
    id: "video-editing",
    name: "Video Editing & Content Creation",
    regularPrice: 2999,
    workshopPrice: 9,
    duration: "3 Weeks Practical Projects",
    eligibility: "Basic computer familiarity"
  },
  "graphic-design": {
    id: "graphic-design",
    name: "Graphic Design & Brand Identity",
    regularPrice: 2999,
    workshopPrice: 9,
    duration: "3 Weeks Hands-on Training",
    eligibility: "Creative beginners"
  }
};

export interface QualificationSignals {
  detectedIntent: "COURSE_DETAILS" | "FEES_QUERY" | "COUNSELLOR_REQUEST" | "GENERAL_QUERY";
  interestedCourse?: string | null;
  experienceLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  counselorRequested: boolean;
}

/**
 * Extracts student intent and qualification signals from inbound message
 */
export function extractSignals(text: string): QualificationSignals {
  const lower = text.toLowerCase();
  
  let detectedIntent: QualificationSignals["detectedIntent"] = "GENERAL_QUERY";
  if (/(fee|fees|kitna|price|cost|charge|paise|amount)/i.test(lower)) {
    detectedIntent = "FEES_QUERY";
  } else if (/(syllabus|detail|class|timing|kya sikhaye|topic)/i.test(lower)) {
    detectedIntent = "COURSE_DETAILS";
  } else if (/(counsellor|call|baat karni|human|agent|sir)/i.test(lower)) {
    detectedIntent = "COUNSELLOR_REQUEST";
  }

  let interestedCourse: string | null = null;
  if (/(ai|chatgpt|artificial intelligence|prompt|midjourney)/i.test(lower)) {
    interestedCourse = "AI & Generative AI Mastery";
  } else if (/(video|premiere|after effects|reels|editing)/i.test(lower)) {
    interestedCourse = "Video Editing & Content Creation";
  } else if (/(graphic|photoshop|illustrator|design|canva)/i.test(lower)) {
    interestedCourse = "Graphic Design & Brand Identity";
  }

  let experienceLevel: QualificationSignals["experienceLevel"] = null;
  if (/(non technical|beginner|zero|kuch nahi aata|fresh|starting)/i.test(lower)) {
    experienceLevel = "BEGINNER";
  } else if (/(experience|basic aata hai|thoda pata hai)/i.test(lower)) {
    experienceLevel = "INTERMEDIATE";
  }

  return {
    detectedIntent,
    interestedCourse,
    experienceLevel,
    counselorRequested: detectedIntent === "COUNSELLOR_REQUEST"
  };
}

/**
 * Safely updates or creates Lead qualification state and recomputes LeadScore
 */
export async function updateLeadFromSignals(params: {
  contactId: string;
  conversationId: string;
  phone: string;
  signals: QualificationSignals;
}) {
  const { contactId, conversationId, signals } = params;

  let lead = await prisma.lead.findFirst({
    where: {
      OR: [
        { contactId },
        { conversationId }
      ]
    }
  });

  // Calculate score boost
  let scoreBoost = 10;
  if (signals.detectedIntent === "FEES_QUERY") scoreBoost += 25;
  if (signals.detectedIntent === "COURSE_DETAILS") scoreBoost += 20;
  if (signals.counselorRequested) scoreBoost += 30;
  if (signals.interestedCourse) scoreBoost += 15;

  const currentScore = lead?.score || 0;
  const newScore = Math.min(100, currentScore + scoreBoost);

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        contactId,
        conversationId,
        stage: "NEW",
        temperature: newScore >= 50 ? "WARM" : "COLD",
        score: newScore,
        interestedCourse: signals.interestedCourse || null,
        experienceLevel: signals.experienceLevel || null,
        counselorRequested: signals.counselorRequested,
        feeUnderstood: signals.detectedIntent === "FEES_QUERY"
      }
    });
  } else {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        score: newScore,
        temperature: newScore >= 70 ? "HOT" : newScore >= 40 ? "WARM" : "COLD",
        ...(signals.interestedCourse ? { interestedCourse: signals.interestedCourse } : {}),
        ...(signals.experienceLevel ? { experienceLevel: signals.experienceLevel } : {}),
        ...(signals.counselorRequested ? { counselorRequested: true } : {}),
        ...(signals.detectedIntent === "FEES_QUERY" ? { feeUnderstood: true } : {})
      }
    });
  }

  return lead;
}

/**
 * Main AI Sales Agent Gateway: evaluates message, checks safety gates,
 * updates lead context, and returns approved response parameters.
 */
export async function processSalesAgentMessage(params: {
  conversationId: string;
  phone: string;
  messageText: string;
}) {
  // Gate 1: Check Global Suppression
  const suppression = await checkSuppression(params.phone);
  if (suppression.isSuppressed) {
    return { shouldReply: false, reason: "SUPPRESSED_USER" };
  }

  // Gate 2: Check Human Takeover
  const aiAllowed = await isAIHandlingAllowed(params.conversationId);
  if (!aiAllowed) {
    return { shouldReply: false, reason: "HUMAN_TAKEOVER_ACTIVE" };
  }

  // Extract qualification and update Lead CRM truth
  const signals = extractSignals(params.messageText);
  const conv = await prisma.whatsAppConversation.findUnique({
    where: { id: params.conversationId },
    select: { contactId: true }
  });

  if (conv?.contactId) {
    await updateLeadFromSignals({
      contactId: conv.contactId,
      conversationId: params.conversationId,
      phone: params.phone,
      signals
    });
  }

  return {
    shouldReply: true,
    signals,
    approvedCourses: APPROVED_COURSES
  };
}

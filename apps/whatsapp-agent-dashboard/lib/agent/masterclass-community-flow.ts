
export function sanitizeToRelativeDay(raw?: string): string {
  if (!raw) return "Next Wednesday";
  const val = raw.trim();
  if (/^next\s+/i.test(val)) return val;
  const match = val.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  if (match) {
    const day = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    return `Next ${day}`;
  }
  return "Next Wednesday";
}

import type {
  AgentInput,
  AgentIntent,
  AgentLeadUpdates,
  HandoffReason,
  RuleClassification,
} from "./types";

export type MasterclassCommunityFlowReply = {
  reply: string;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
  nextQuestion: string | null;
  leadUpdates: AgentLeadUpdates;
  intent: AgentIntent;
};

export type MasterclassConfig = {
  name: string;
  dateLabel: string;
  timeLabel: string;
  communityUrl: string;
};

const MASTERCLASS_CONTEXT =
  /(?:become\s+ai\s+expert|free\s+(?:ai\s+)?master\s*class|free\s+(?:ai\s+)?masterclass|ai\s+tools\s+workshop|build\s+your\s+career\s+in\s+ai|master\s*class|masterclass\s+community|whatsapp\s+community)/iu;
const JOINED_REPLY =
  /^\s*(?:joined|join\s+ho\s+gaya|join\s+ho\s+gayi|community\s+join(?:ed)?|maine\s+join\s+kar\s+liya|maine\s+join\s+kar\s+li|done)\s*[.!✅😊🎉]*\s*$/iu;
const INTEREST_REPLY =
  /(?:interested|join\s+karna|masterclass\s+join|registration|register|seat\s+confirm|yes|haan|ha|ji)/iu;
const FREE_QUERY = /(?:free\s+hai|fees?\s+kya|kitne\s+paise|price|cost|charge)/iu;
const WHEN_QUERY = /(?:kab\s+hai|date|time|timing|kitne\s+baje|when)/iu;
const TOPIC_QUERY =
  /(?:kya\s+sikh|kya\s+seekh|topics?|syllabus|masterclass\s+me\s+kya|masterclass\s+mein\s+kya)/iu;
const COMMUNITY_REQUIRED_QUERY =
  /(?:community\s+join.*(?:zaroori|required)|join\s+karna\s+zaroori|community\s+kyun)/iu;
const COMMUNITY_SAFE_QUERY = /(?:community\s+safe|number\s+visible|privacy)/iu;
const LINK_ISSUE =
  /(?:link\s+(?:open|work)\s+nahi|link\s+issue|link\s+nhi|community\s+link\s+nahi\s+chal)/iu;
const NOT_NOW = /(?:baad\s+me|later|abhi\s+time\s+nahi|busy|kal\s+join|time\s+nahi)/iu;
const GREETING = /^\s*(?:hi|hello|hey|hii+|helo|namaste)\s*[.!😊👋]*\s*$/iu;

function enabled(): boolean {
  const value = process.env.MASTERCLASS_COMMUNITY_FLOW_ENABLED?.trim().toLowerCase();
  if (!value) return true;
  return !["0", "false", "no", "off", "disabled"].includes(value);
}


export function toRelativeDayOnly(rawDate?: string): string {
  if (!rawDate) return "Next Wednesday";
  const trimmed = rawDate.trim();
  
  // If already relative (e.g. Next Monday, Next Wednesday)
  if (/^next\s+/i.test(trimmed)) {
    return trimmed;
  }

  // Extract day of week if present
  const match = trimmed.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  if (match) {
    const day = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    return `Next ${day}`;
  }

  return "Next Wednesday";
}

function config(
  override?: AgentInput["masterclass"],
): MasterclassConfig {
  const name = override?.name?.trim();
  const dateLabel = override?.dateLabel?.trim();
  const timeLabel = override?.timeLabel?.trim();
  const communityUrl = override?.communityUrl?.trim();

  if (name && dateLabel && timeLabel && communityUrl) {
    return {
      name,
      dateLabel: toRelativeDayOnly(dateLabel),
      timeLabel,
      communityUrl,
    };
  }

  return {
    name:
      process.env.MASTERCLASS_NAME?.trim() ||
      "Become AI Expert – Free Masterclass",
    dateLabel: toRelativeDayOnly(process.env.MASTERCLASS_DATE_LABEL?.trim() || "Next Wednesday"),
    timeLabel: process.env.MASTERCLASS_TIME_LABEL?.trim() || "08:00 PM IST",
    communityUrl:
      process.env.MASTERCLASS_COMMUNITY_URL?.trim() ||
      "https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd",
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function lastAssistantMessage(input: AgentInput): string {
  return (
    (input.history ?? [])
      .filter((message) => message.role === "assistant")
      .at(-1)?.text ?? ""
  );
}

function firstName(input: AgentInput): string | null {
  const value = normalize(input.contact?.name ?? "");
  return value ? value.split(" ")[0]?.slice(0, 40) || null : null;
}

function contextText(input: AgentInput): string {
  return [
    input.customerMessage,
    input.conversationSummary ?? "",
    input.lead?.interestedCourse ?? "",
    ...(input.history ?? []).slice(-8).map((message) => message.text),
  ].join("\n");
}

function isGoalQuestion(value: string): boolean {
  return /AI\s+mainly\s+kis\s+purpose|Job\s*\/\s*Career\s+Growth|General\s+Learning/iu.test(
    value,
  );
}

function inferGoal(message: string):
  | "JOB_CAREER"
  | "BUSINESS"
  | "FREELANCING"
  | "PRODUCTIVITY"
  | "CONTENT_CREATION"
  | "GENERAL_LEARNING"
  | null {
  const normalized = normalize(message);
  if (/^(?:1|one)$/iu.test(normalized) || /job|career|naukri|placement/iu.test(normalized)) {
    return "JOB_CAREER";
  }
  if (/^(?:2|two)$/iu.test(normalized) || /business|company|agency|apna\s+kaam/iu.test(normalized)) {
    return "BUSINESS";
  }
  if (/^(?:3|three)$/iu.test(normalized) || /freelanc/iu.test(normalized)) {
    return "FREELANCING";
  }
  if (/^(?:4|four)$/iu.test(normalized) || /productivity|daily\s+work|office\s+work/iu.test(normalized)) {
    return "PRODUCTIVITY";
  }
  if (/^(?:5|five)$/iu.test(normalized) || /content|creator|social\s+media|video|design/iu.test(normalized)) {
    return "CONTENT_CREATION";
  }
  if (/^(?:6|six)$/iu.test(normalized) || /general|bas\s+seekhna|learning/iu.test(normalized)) {
    return "GENERAL_LEARNING";
  }
  return null;
}

function result(input: {
  reply: string;
  summary: string;
  intent?: AgentIntent;
  nextQuestion?: string | null;
  leadUpdates?: AgentLeadUpdates;
  confidence?: number;
}): MasterclassCommunityFlowReply {
  return {
    reply: input.reply,
    confidence: input.confidence ?? 0.99,
    decisionSummary: input.summary,
    requiresHuman: false,
    handoffReason: null,
    nextQuestion: input.nextQuestion ?? null,
    leadUpdates: input.leadUpdates ?? {},
    intent: input.intent ?? "DEMO_CLASS",
  };
}

function communityCta(input: AgentInput, cfg: MasterclassConfig): string {
  const name = firstName(input);
  return `${name ? `Hi ${name} 👋` : "Hi Learner 👋"}\n\nAapka registration **${cfg.name}** ke liye successfully receive ho gaya hai ✅\n\n🗓️ ${toRelativeDayOnly(cfg.dateLabel)}\n⏰ ${cfg.timeLabel}\n💻 Live Online Masterclass\n\nMasterclass ka live joining link, important reminders aur complete details hamari official WhatsApp Community mein share ki jayengi.\n\n👇 Abhi WhatsApp Community join karke apni registration complete karein:\n\n🟢 ${cfg.communityUrl}\n\nCommunity join karne ke baad yahin **JOINED** reply kar dijiye ✅\n\nSikhaDenge Institute 🎓\nLearn • Earn • Grow`;
}

export function generateMasterclassCommunityReply(input: {
  agentInput: AgentInput;
  classification: RuleClassification;
}): MasterclassCommunityFlowReply | null {
  if (!enabled()) return null;

  const agentInput = input.agentInput;
  const message = normalize(agentInput.customerMessage);
  const lastAssistant = lastAssistantMessage(agentInput);
  const fullContext = contextText(agentInput);
  const active =
    MASTERCLASS_CONTEXT.test(fullContext) ||
    LINK_ISSUE.test(message) ||
    (JOINED_REPLY.test(message) && /community|JOINED/iu.test(lastAssistant)) ||
    isGoalQuestion(lastAssistant);
  if (!active) return null;

  const cfg = config(agentInput.masterclass);
  const commonLeadUpdates: AgentLeadUpdates = {
    interestedCourse: "Become AI Expert – Free Masterclass",
  };

  if (isGoalQuestion(lastAssistant)) {
    const goal = inferGoal(message);
    if (!goal) {
      return result({
        reply:
          "Koi problem nahi 😊 Bas option number ya apna goal likh dijiye:\n\n1. Job / Career Growth\n2. Business Growth\n3. Freelancing\n4. Daily Work Productivity\n5. Content Creation\n6. General Learning",
        summary: "Asked the joined learner to provide one clear masterclass goal.",
        nextQuestion: "Aap AI mainly kis purpose ke liye seekhna chahte hain?",
        leadUpdates: {
          ...commonLeadUpdates,
          joiningTimeline: "COMMUNITY_JOINED",
        },
      });
    }

    const replies: Record<typeof goal, string> = {
      JOB_CAREER:
        "Bahut badhiya 👍\n\nYe masterclass aapko samjhayegi ki AI tools ko career growth aur practical work mein kaise use kiya ja sakta hai.\n\nCommunity notifications ON rakhiye, taaki live link miss na ho 😊",
      BUSINESS:
        "Perfect 👍\n\nMasterclass mein aap dekhenge ki AI ko business, planning, content aur productivity mein kaise use kar sakte hain.\n\nCommunity notifications ON rakhiye 😊",
      FREELANCING:
        "Great choice 👍\n\nAI freelancing mein research, content, client work aur productivity improve karne mein help kar sakta hai.\n\nLive link community mein milega 😊",
      PRODUCTIVITY:
        "Bilkul 👍\n\nAI ka use research, email, documents, presentations aur repetitive work ko faster karne mein hota hai.\n\nSession ka link community mein share hoga 😊",
      CONTENT_CREATION:
        "Nice 👍\n\nMasterclass mein aap jaanenge ki AI tools content ideas, writing aur creative workflow mein kaise help karte hain.\n\nCommunity check karte rahiye 😊",
      GENERAL_LEARNING:
        "Bahut achha 😊\n\nYe masterclass beginners ke liye bhi useful hai aur aapko AI learning ka practical roadmap milega.\n\nLive link community mein share hoga ✅",
    };

    return result({
      reply: replies[goal],
      summary: `Captured the masterclass learner goal: ${goal}.`,
      intent: "COURSE_DISCOVERY",
      leadUpdates: {
        ...commonLeadUpdates,
        joiningTimeline: "COMMUNITY_JOINED",
        goal,
      },
    });
  }

  if (JOINED_REPLY.test(message)) {
    return result({
      reply: `Great 🎉\n\nAapne WhatsApp Community successfully join kar li hai ✅\n\n🗓️ ${toRelativeDayOnly(cfg.dateLabel)}\n⏰ ${cfg.timeLabel}\n\nLive session ka joining link aur reminder community mein share kiya jayega.\n\nEk chhota sa question 😊\nAap AI mainly kis purpose ke liye seekhna chahte hain?\n\n1. Job / Career Growth\n2. Business Growth\n3. Freelancing\n4. Daily Work Productivity\n5. Content Creation\n6. General Learning`,
      summary: "Recorded community-join confirmation and requested the learner goal.",
      nextQuestion: "Aap AI mainly kis purpose ke liye seekhna chahte hain?",
      leadUpdates: {
        ...commonLeadUpdates,
        joiningTimeline: "COMMUNITY_JOINED",
      },
      intent: "ENROLLMENT",
    });
  }

  if (LINK_ISSUE.test(message)) {
    return result({
      reply: `Koi problem nahi 👍\n\n1. Link ko WhatsApp mein open karein\n2. WhatsApp app update check karein\n3. Link ko Chrome browser mein open karke dekhein\n\n🟢 ${cfg.communityUrl}\n\nPhir bhi issue aaye to **LINK ISSUE** ke saath screenshot bhej dijiye. Hamari team help karegi.`,
      summary: "Provided safe troubleshooting for the WhatsApp Community link.",
      leadUpdates: commonLeadUpdates,
    });
  }

  if (FREE_QUERY.test(message)) {
    return result({
      reply: `Ji haan 😊\n\n**${cfg.name} bilkul free hai.**\n\nLive link aur reminders ke liye WhatsApp Community join karein:\n\n🟢 ${cfg.communityUrl}\n\nJoin karne ke baad **JOINED** reply kar dijiye ✅`,
      summary: "Confirmed that the masterclass is free and repeated the community CTA.",
      leadUpdates: commonLeadUpdates,
      intent: "FEES",
    });
  }

  if (WHEN_QUERY.test(message)) {
    return result({
      reply: `🗓️ ${toRelativeDayOnly(cfg.dateLabel)}\n⏰ ${cfg.timeLabel}\n💻 Live Online Masterclass\n\nLive joining link community mein share hoga:\n\n🟢 ${cfg.communityUrl}\n\nJoin karne ke baad **JOINED** reply kar dijiye ✅`,
      summary: "Shared the configured masterclass schedule and community CTA.",
      leadUpdates: commonLeadUpdates,
      intent: "BATCH_SCHEDULE",
    });
  }

  if (TOPIC_QUERY.test(message)) {
    return result({
      reply: `Is masterclass mein aapko practical overview milega:\n\n✅ AI tools ka practical use\n✅ Career aur work productivity\n✅ Content aur research use cases\n✅ AI learning roadmap\n✅ Beginner se next-step clarity\n\nLive link aur complete updates community mein milengi:\n\n🟢 ${cfg.communityUrl}`,
      summary: "Shared concise approved masterclass topics and the community CTA.",
      leadUpdates: commonLeadUpdates,
      intent: "COURSE_DETAILS",
    });
  }

  if (COMMUNITY_REQUIRED_QUERY.test(message)) {
    return result({
      reply: `Ji haan, community join karna important hai 😊\n\nMasterclass ka live link, reminders aur important instructions community mein hi share ki jayengi.\n\n🟢 ${cfg.communityUrl}\n\nJoin karne ke baad **JOINED** reply kar dijiye ✅`,
      summary: "Explained why the WhatsApp Community is required for the masterclass.",
      leadUpdates: commonLeadUpdates,
    });
  }

  if (COMMUNITY_SAFE_QUERY.test(message)) {
    return result({
      reply: `Ji haan 😊\n\nCommunity ka purpose sirf masterclass updates, learning information aur important announcements share karna hai. WhatsApp ke applicable privacy controls community par apply honge.\n\n🟢 ${cfg.communityUrl}`,
      summary: "Answered the community privacy question without making unsupported guarantees.",
      leadUpdates: commonLeadUpdates,
    });
  }

  if (NOT_NOW.test(message)) {
    return result({
      reply: `Koi problem nahi 😊\n\nCommunity abhi join karke rakhiye, taaki masterclass ka live link aur reminder miss na ho. Aap apni availability ke according attend kar sakte hain.\n\n🟢 ${cfg.communityUrl}\n\nJoin karne ke baad **JOINED** reply kar dijiye ✅`,
      summary: "Handled a not-now objection with a low-pressure community CTA.",
      leadUpdates: commonLeadUpdates,
    });
  }

  if (
    INTEREST_REPLY.test(message) ||
    GREETING.test(message) ||
    input.classification.intent === "GREETING" ||
    input.classification.intent === "DEMO_CLASS" ||
    input.classification.intent === "ENROLLMENT"
  ) {
    return result({
      reply: communityCta(agentInput, cfg),
      summary: "Sent the Become AI Expert registration confirmation and community CTA.",
      leadUpdates: {
        ...commonLeadUpdates,
        joiningTimeline: "COMMUNITY_LINK_SENT",
      },
      intent: "ENROLLMENT",
    });
  }

  return result({
    reply: `Masterclass ka live link, reminders aur important updates WhatsApp Community mein share honge 😊\n\n🟢 ${cfg.communityUrl}\n\nJoin karne ke baad **JOINED** reply kar dijiye ✅`,
    summary: "Kept the active masterclass conversation focused on community conversion.",
    leadUpdates: commonLeadUpdates,
  });
}

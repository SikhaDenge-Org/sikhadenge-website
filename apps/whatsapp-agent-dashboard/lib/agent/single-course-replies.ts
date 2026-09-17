import type {
  AgentIntent,
  AgentKnowledgeReference,
  AgentLanguage,
  AgentLeadUpdates,
} from "./types";

export type SingleCourseReply = {
  intent: AgentIntent;
  reply: string;
  confidence: number;
  decisionSummary: string;
  nextQuestion: string | null;
  leadUpdates: AgentLeadUpdates;
};

const SHORT_ACKNOWLEDGEMENT =
  /^\s*(?:ji+|haan|ha|yes|ok|okay|bilkul|theek\s*hai|achha|acha)\s*[.!?]*$/i;

const COURSE_DETAILS_QUERY = [
  /\b(?:course|program)\s*(?:details?|information|info|overview)\b/i,
  /\b(?:syllabus|curriculum|modules?|topics?|what\s+will\s+i\s+learn)\b/i,
  /\b(?:course\s+me\s+kya|kya\s+kya\s+sikh|kya\s+sikhayenge|course\s+batao)\b/i,
  /\b(?:become\s+)?(?:s?ai|a\.?i\.?)\s+expert(?:\s+program)?\b/i,
  /\b(?:ai\s+course|learn\s+ai|ai\s+seekhna|ai\s+sikhna)\b/i,
  /\b(?:which|kaunsa|konsa)\s+(?:course|program)\b/i,
  /^\s*(?:course|ai\s+course|become\s+ai\s+expert)\s*[.!?]*$/i,
];

const CLASS_TIMING_QUERY = [
  /\b(?:class|batch).*(?:timing|time|schedule|kitne\s+baje|kab)\b/i,
  /\b(?:timing|schedule|kitne\s+baje).*(?:class|batch)\b/i,
  /\b8\s*(?:pm|baje).*(?:10\s*(?:pm|baje))\b/i,
  /\b(?:week\s+mein|per\s+week).*(?:class|classes)\b/i,
  /\b(?:alternate\s+day|alternate\s+days|alternate\s+din)\b/i,
];

const CLASS_MODE_QUERY = [
  /\b(?:online|offline).*(?:class|course|program)\b/i,
  /\b(?:class|course|program).*(?:online|offline)\b/i,
  /\b(?:mobile|phone|laptop).*(?:join|class)\b/i,
  /\bghar\s+se\s+(?:class|join)\b/i,
];

const DURATION_QUERY = [
  /\b(?:duration|how\s+long|kitne\s+(?:week|weeks|mahine|months))\b/i,
  /\b(?:course|program).*(?:kitne\s+time|kitne\s+din|duration)\b/i,
  /\b10\s*weeks?\b/i,
];

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function preferredLanguage(message: string): AgentLanguage {
  const explicitEnglish =
    /\b(?:what|which|how|when|where|please|tell\s+me|can\s+i|is\s+the|are\s+the|i\s+want)\b/i.test(
      message,
    );
  return explicitEnglish ? "en" : "hinglish";
}

function courseDetailsReply(language: AgentLanguage): string {
  if (language === "en") {
    return "🚀 SikhaDenge currently has one student-facing course: Become AI Expert. It is a 10-week live-online program with classes from 8 PM to 10 PM IST. Each class is 2 hours, and 3 classes are conducted every week on alternate days. It covers AI basics, prompting, research, Excel and office work, content creation, design-media, automation basics and freelancing.\n\n🎓 Reply DEMO for the free masterclass link.";
  }

  return "🚀 SikhaDenge ka student-facing course Become AI Expert Program hai. Ye 10 weeks ka live-online program hai. Class timing 8 PM se 10 PM IST hai, har class 2 hours ki hoti hai aur week mein 3 classes alternate days par hoti hain. Ismein AI basics, prompting, research, Excel/office work, content creation, design-media, automation basics aur freelancing cover hota hai.\n\n🎓 Free masterclass link ke liye DEMO reply kijiye.";
}

function timingReply(language: AgentLanguage): string {
  if (language === "en") {
    return "💻 Become AI Expert classes are live online from 8 PM to 10 PM IST. Each class is 2 hours, with 3 classes every week on alternate days. The complete program duration is 10 weeks.\n\n🎓 Reply DEMO for the free masterclass link.";
  }

  return "💻 Become AI Expert ki live-online classes 8 PM se 10 PM IST hoti hain. Har class 2 hours ki hoti hai, week mein 3 classes alternate days par hoti hain aur complete program 10 weeks ka hai.\n\n🎓 Free masterclass link ke liye DEMO reply kijiye.";
}

function classModeReply(language: AgentLanguage): string {
  if (language === "en") {
    return "💻 Become AI Expert classes are live online, so you can join from home using a mobile phone or laptop. Classes run from 8 PM to 10 PM IST, each class is 2 hours, and 3 classes are held every week on alternate days.\n\n🎓 Reply DEMO for the free masterclass link.";
  }

  return "💻 Become AI Expert ki classes live online hoti hain; aap ghar se mobile ya laptop se join kar sakte hain. Timing 8 PM se 10 PM IST hai, har class 2 hours ki hoti hai aur week mein 3 classes alternate days par hoti hain.\n\n🎓 Free masterclass link ke liye DEMO reply kijiye.";
}

function acknowledgementReply(language: AgentLanguage): string {
  if (language === "en") {
    return "💬 Certainly. SikhaDenge’s student-facing course is Become AI Expert: 10 weeks, live online, 8 PM to 10 PM IST, 2-hour classes and 3 classes per week on alternate days.\n\n🎓 Reply DEMO for the free masterclass link.";
  }

  return "💬 Bilkul ji. SikhaDenge ka student-facing course Become AI Expert hai—10 weeks, live online, 8 PM se 10 PM IST, 2-hour class aur week mein 3 classes alternate days par.\n\n🎓 Free masterclass link ke liye DEMO reply kijiye.";
}

export function getSingleCourseReply(input: {
  message: string;
  language: AgentLanguage;
}): SingleCourseReply | null {
  const message = input.message.trim();
  if (!message) return null;

  const leadUpdates: AgentLeadUpdates = {
    interestedCourse: "Become AI Expert",
  };

  if (matchesAny(message, CLASS_TIMING_QUERY) || matchesAny(message, DURATION_QUERY)) {
    return {
      intent: "BATCH_SCHEDULE",
      reply: timingReply(input.language),
      confidence: 0.995,
      decisionSummary: "Answered the fixed Become AI Expert schedule directly.",
      nextQuestion: null,
      leadUpdates,
    };
  }

  if (matchesAny(message, CLASS_MODE_QUERY)) {
    return {
      intent: "BATCH_SCHEDULE",
      reply: classModeReply(input.language),
      confidence: 0.995,
      decisionSummary: "Answered the fixed Become AI Expert delivery mode and schedule directly.",
      nextQuestion: null,
      leadUpdates,
    };
  }

  if (matchesAny(message, COURSE_DETAILS_QUERY)) {
    return {
      intent: "COURSE_DETAILS",
      reply: courseDetailsReply(input.language),
      confidence: 0.995,
      decisionSummary: "Presented the only student-facing SikhaDenge course with complete approved delivery facts.",
      nextQuestion: null,
      leadUpdates,
    };
  }

  if (SHORT_ACKNOWLEDGEMENT.test(message)) {
    return {
      intent: "COURSE_DETAILS",
      reply: acknowledgementReply(input.language),
      confidence: 0.94,
      decisionSummary: "Handled a short acknowledgement without repeating a course-choice question.",
      nextQuestion: null,
      leadUpdates,
    };
  }

  return null;
}

export function searchSingleCourseReplies(
  query: string,
): AgentKnowledgeReference[] {
  const match = getSingleCourseReply({
    message: query,
    language: preferredLanguage(query),
  });
  if (!match) return [];

  return [
    {
      chunkId: `single-course:${match.intent.toLowerCase()}`,
      documentId: "sikhadenge-single-course-facts-v1",
      title: "SikhaDenge Become AI Expert Fixed Facts",
      heading:
        match.intent === "BATCH_SCHEDULE"
          ? "Become AI Expert class schedule"
          : "Become AI Expert program details",
      content: match.reply,
      score: 1,
    },
  ];
}

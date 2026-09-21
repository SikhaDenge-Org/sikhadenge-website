import type { AgentKnowledgeReference } from "./types";

type ConciseReply = {
  id: string;
  heading: string;
  icon: string;
  patterns: RegExp[];
  hinglish: string;
  english: string;
};

function validMasterclassUrl(): string | null {
  const value = process.env.SIKHADENGE_MASTERCLASS_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function isHinglish(query: string): boolean {
  if (/[ऀ-ॿ]/.test(query)) return true;
  return /\b(kya|hai|hoga|hogi|kaise|kab|kitna|kitni|mujhe|chahiye|kar|sakta|sakti|mile|milega|batao|jaruri|aana|join|mein|me|kaun|se|honge|sikhayenge)\b/i.test(
    query,
  );
}

function demoCta(language: "en" | "hinglish"): string {
  const url = validMasterclassUrl();
  if (url) {
    return language === "en"
      ? `🎓 Join the free masterclass for complete details: ${url}`
      : `🎓 Complete details ke liye free masterclass join kijiye: ${url}`;
  }
  return language === "en"
    ? "🎓 Reply DEMO to get the free masterclass link."
    : "🎓 Free masterclass link ke liye DEMO reply kijiye.";
}

const REPLIES: readonly ConciseReply[] = [
  {
    id: "course-syllabus-overview",
    heading: "Course mein kya sikhayenge?",
    icon: "🚀",
    patterns: [
      /\b(course|program).*(kya|what).*(sikh|learn|cover)/i,
      /\b(syllabus|curriculum|modules?|topics?)\b/i,
      /\bkya\s+kya\s+(sikhayenge|padhayenge|cover)\b/i,
    ],
    hinglish:
      "Become AI Expert mein AI basics, prompting, research, Excel/office work, content, design-media, automation basics aur freelancing cover hota hai.",
    english:
      "Become AI Expert covers AI basics, prompting, research, Excel and office work, content, design media, automation basics and freelancing.",
  },
  {
    id: "ai-tools-overview",
    heading: "Kaun-kaun se AI tools honge?",
    icon: "🧠",
    patterns: [
      /\b(kaun|which|what).*(ai\s*)?tools?\b/i,
      /\btools?.*(honge|milenge|sikhayenge|included|covered)\b/i,
      /\bai\s+tools?\s+(list|naam|names?)\b/i,
    ],
    hinglish:
      "Research, content, office work, image-video, design aur automation ke practical AI tools use honge. Exact list masterclass mein dikhayi jayegi.",
    english:
      "You will use practical AI tools for research, content, office work, image-video, design and automation. The exact list is shown in the masterclass.",
  },
  {
    id: "class-mode",
    heading: "Class online hai ya offline?",
    icon: "💻",
    patterns: [
      /\b(online|offline).*(class|course)|\b(class|course).*(online|offline)\b/i,
      /\bghar\s+se\s+(class|join)\b/i,
    ],
    hinglish:
      "Classes live online hoti hain; aap ghar se mobile ya laptop ke through join kar sakte hain.",
    english:
      "Classes are live online, so you can join from home using a mobile phone or laptop.",
  },
  {
    id: "course-duration",
    heading: "Course kitne time ka hai?",
    icon: "⏳",
    patterns: [
      /\b(duration|kitne\s+(week|weeks|mahine|months)|how\s+long)\b/i,
      /\bcourse.*(kitne\s+din|kitne\s+time)\b/i,
    ],
    hinglish: "Become AI Expert program 10 weeks ka hai.",
    english: "The Become AI Expert program runs for 10 weeks.",
  },
  {
    id: "class-timing",
    heading: "Class timing kya hai?",
    icon: "🕘",
    patterns: [
      /\b(class|batch).*(timing|time|kitne\s+baje)\b/i,
      /\b8\s*(pm|baje).*10\s*(pm|baje)\b/i,
    ],
    hinglish: "Class timing 8 PM se 10 PM IST hai, week mein 3 live classes hoti hain.",
    english: "Classes run from 8 PM to 10 PM IST, with 3 live classes per week.",
  },
  {
    id: "beginner-eligibility",
    heading: "Beginner join kar sakta hai?",
    icon: "✅",
    patterns: [
      /\b(beginner|bilkul\s+nahi\s+aata|zero\s+knowledge|no\s+experience)\b/i,
      /\b(non[-\s]?technical|commerce|arts).*(join|eligible)\b/i,
    ],
    hinglish:
      "Haan, beginner aur non-technical learners join kar sakte hain; program basics se start hota hai.",
    english:
      "Yes, beginners and non-technical learners can join because the program starts from the basics.",
  },
  {
    id: "coding-required",
    heading: "Coding zaroori hai?",
    icon: "👨‍💻",
    patterns: [
      /\b(coding|programming).*(required|jaruri|zaroori|aana)\b/i,
      /\bwithout\s+coding\b/i,
    ],
    hinglish: "Become AI Expert ke liye pehle se coding aana zaroori nahi hai.",
    english: "Prior coding knowledge is not required for Become AI Expert.",
  },
  {
    id: "mobile-laptop",
    heading: "Mobile se class ho jayegi?",
    icon: "📱",
    patterns: [
      /\b(mobile|phone|laptop|device).*(join|class|required|jaruri|compulsory)\b/i,
      /\blaptop.*(chahiye|zaroori|required)\b/i,
    ],
    hinglish:
      "Class mobile ya laptop dono se join ho sakti hai; practical work ke liye laptop zyada convenient rahega.",
    english:
      "You can join from a mobile phone or laptop, though a laptop is more convenient for practical work.",
  },
  {
    id: "certificate",
    heading: "Certificate milega?",
    icon: "🏅",
    patterns: [/\bcertificate|certification\b/i],
    hinglish:
      "Completion requirements poori hone ke baad digital program-completion certificate issue hota hai.",
    english:
      "A digital program-completion certificate is issued after the completion requirements are met.",
  },
  {
    id: "fees",
    heading: "Fees kya hai?",
    icon: "ℹ️",
    patterns: [
      /\b(fee|fees|price|cost|rate|discount|offer|emi|installment|instalment)\b/i,
      /\bkitne\s+paise\b/i,
    ],
    hinglish:
      "Fee aur current offer ki verified details free demo/masterclass process mein explain ki jaati hain.",
    english:
      "Verified fee and current-offer details are explained through the free demo/masterclass process.",
  },
  {
    id: "demo",
    heading: "Demo/masterclass kaise join karein?",
    icon: "🎥",
    patterns: [/\b(demo|masterclass|trial\s+class|free\s+class|webinar)\b/i],
    hinglish: "Free masterclass mein course ka process, learning outcome aur next step clear hoga.",
    english: "The free masterclass explains the course process, learning outcomes and next step.",
  },
  {
    id: "admission",
    heading: "Admission kaise hoga?",
    icon: "📝",
    patterns: [
      /\b(admission|enrol|enroll|registration|join\s+karna|course\s+join)\b/i,
    ],
    hinglish:
      "Admission free masterclass registration se start hota hai; uske baad team next step guide karti hai.",
    english:
      "Admission starts with free masterclass registration, after which the team guides the next step.",
  },
  {
    id: "recording",
    heading: "Recording milegi?",
    icon: "🎬",
    patterns: [/\b(recording|recorded\s+class|missed\s+class|class\s+miss)\b/i],
    hinglish:
      "Core classes live online hoti hain. Recording ya catch-up active batch policy ke hisaab se confirm hota hai.",
    english:
      "Core classes are live online. Recording or catch-up is confirmed according to the active batch policy.",
  },
  {
    id: "job-career",
    heading: "Job ya career mein help hogi?",
    icon: "📈",
    patterns: [
      /\b(job|placement|career|freelancing|client|income|earning).*(guarantee|help|milega|hogi|after)\b/i,
      /\bcourse\s+ke\s+baad.*(job|freelancing|career)\b/i,
    ],
    hinglish:
      "Program practical AI skills, portfolio, productivity aur freelancing foundations par focus karta hai; job ya income guarantee nahi di jaati.",
    english:
      "The program focuses on practical AI skills, portfolio work, productivity and freelancing foundations; it does not promise a job or income guarantee.",
  },
] as const;

export function searchConciseSalesReplies(
  query: string,
): AgentKnowledgeReference[] {
  const normalized = query.trim();
  if (!normalized) return [];

  const match = REPLIES.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (!match) return [];

  const language = isHinglish(normalized) ? "hinglish" : "en";
  const answer = language === "hinglish" ? match.hinglish : match.english;
  const content = `${match.icon} ${answer}\n\n${demoCta(language)}`;

  return [
    {
      chunkId: `concise-sales:${match.id}`,
      documentId: "sikhadenge-concise-sales-replies-v2",
      title: "SikhaDenge Concise Conversion Replies",
      heading: match.heading,
      content,
      score: 0.995,
    },
  ];
}

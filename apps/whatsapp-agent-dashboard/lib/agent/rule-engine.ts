import type {
  AgentIntent,
  AgentLanguage,
  HandoffReason,
  RuleClassification,
} from "./types";

const INTENT_PATTERNS: Array<{
  intent: AgentIntent;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    intent: "OPT_OUT",
    weight: 1,
    patterns: [
      /\b(stop|unsubscribe|remove me|do not message|don't message)\b/i,
      /\b(message mat (karo|bhejo)|band karo|unsubscribe)\b/i,
      /मैसेज\s+मत\s+करो|बंद\s+करो/i,
    ],
  },
  {
    intent: "COUNSELOR_REQUEST",
    weight: 1,
    patterns: [
      /\b(human|person|counselor|counsellor|call me|talk to team|agent se baat)\b/i,
      /\b(sir se baat|mam se baat|team se baat|call karwao)\b/i,
      /\b(yes\s*call|haan\s*call|ha\s*call|mujhe\s*call|phone\s*karo|call\s*chahiye|connect\s*me)\b/i,
      /काउंसलर|इंसान\s+से\s+बात|कॉल\s+करवाओ/i,
    ],
  },
  {
    intent: "REFUND_OR_COMPLAINT",
    weight: 1,
    patterns: [
      /\b(refund|complaint|fraud|scam|legal|consumer court|chargeback)\b/i,
      /\b(paise wapas|paisa wapas|shikayat|dhokha)\b/i,
      /रिफंड|शिकायत|पैसे\s+वापस|धोखा/i,
    ],
  },
  {
    intent: "PAYMENT_SUPPORT",
    weight: 0.96,
    patterns: [
      /\b(payment failed|paid but|money deducted|transaction|receipt|upi|razorpay)\b/i,
      /\b(payment nahi|paisa kat|fees pay|transaction id)\b/i,
      /पेमेंट|पैसा\s+कट|भुगतान/i,
    ],
  },
  {
    intent: "FEES",
    weight: 0.9,
    patterns: [
      /\b(fee|fees|price|cost|installment|emi|discount|offer)\b/i,
      /\b(kitne paise|kitni fees|course ka rate)\b/i,
      /फीस|कीमत|कितने\s+पैसे|किस्त/i,
    ],
  },
  {
    intent: "DEMO_CLASS",
    weight: 0.9,
    patterns: [
      /\b(demo|trial class|free class|orientation|masterclass|webinar|workshop)\b/i,
      /\b(demo class|free demo|trial chahiye|masterclass link|demo link)\b/i,
      /डेमो|फ्री\s+क्लास|मास्टरक्लास/i,
    ],
  },
  {
    intent: "BATCH_SCHEDULE",
    weight: 0.9,
    patterns: [
      /\b(batch|timing|schedule|class time|start date|duration|weekend)\b/i,
      /\b(online|offline|live class|live online|recorded class|class mode|mode of class)\b/i,
      /\b(class kab|batch kab|kitne baje|duration kya|class online|online class|offline class|ghar se class)\b/i,
      /बैच|टाइमिंग|क्लास\s+कब|अवधि|ऑनलाइन|ऑफलाइन/i,
    ],
  },
  {
    intent: "CERTIFICATE",
    weight: 0.86,
    patterns: [
      /\b(certificate|certification|verified certificate)\b/i,
      /\b(certificate milega|certificate valid)\b/i,
      /सर्टिफिकेट|प्रमाणपत्र/i,
    ],
  },
  {
    intent: "ELIGIBILITY",
    weight: 0.84,
    patterns: [
      /\b(eligible|eligibility|beginner|qualification|required experience|age limit)\b/i,
      /\b(main kar sakta|mai kar sakta|beginner hu|experience nahi)\b/i,
      /योग्यता|शुरुआत|अनुभव\s+नहीं/i,
    ],
  },
  {
    intent: "ENROLLMENT",
    weight: 0.88,
    patterns: [
      /\b(enroll|enrol|admission|join now|register|registration|registered)\b/i,
      /\b(admission lena|join karna|register kaise|registration done|form fill(?:ed)?)\b/i,
      /एडमिशन|रजिस्ट्रेशन|जॉइन/i,
    ],
  },
  {
    intent: "COURSE_DETAILS",
    weight: 0.82,
    patterns: [
      /\b(syllabus|curriculum|modules|topics|course details|what will i learn)\b/i,
      /\b(kya sikhoge|kya sikhayenge|course me kya|syllabus bhejo)\b/i,
      /सिलेबस|कोर्स\s+में\s+क्या|क्या\s+सीखेंगे/i,
    ],
  },
  {
    intent: "COURSE_DISCOVERY",
    weight: 0.76,
    patterns: [
      /\b(which course|best course|course suggest|career course|ai course|learn ai)\b/i,
      /\b(kaunsa course|course batao|mere liye course|ai seekhna|ai sikhna)\b/i,
      /^\s*(course|courses|ai course)\s*[?.!]*$/i,
      /कौनसा\s+कोर्स|कोर्स\s+बताओ|एआई\s+सीखना/i,
    ],
  },
  {
    intent: "GREETING",
    weight: 0.72,
    patterns: [
      /^\s*(hi|hello|hey|hii+|namaste|good morning|good evening)\s*[!.]*$/i,
      /^\s*(bhai|sir|hello sir|hello bhai)\s*[!.]*$/i,
      /^\s*(नमस्ते|हेलो|हाय)\s*[!.]*$/i,
    ],
  },
];

function normalize(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

export function detectLanguage(
  message: string,
  hint?: string | null,
): AgentLanguage {
  const devanagari = (message.match(/[\u0900-\u097F]/g) ?? []).length;
  const latin = (message.match(/[A-Za-z]/g) ?? []).length;

  if (devanagari > 0 && devanagari >= latin * 0.45) return "hi";

  // Current-message evidence must override a stale language stored on the contact.
  // This keeps "fees kya hai" and "class online hai ya offline" in Hinglish.
  const hinglishMarkers = [
    /\b(bhai|ji|haan|ha|kya|kaise|kab|kyu|kyun|kitna|kitni|mujhe|chahiye|nahi|hai|hain|hoon|hoga|hogi|karna|batao|bataiye)\b/i,
    /\b(aap|apka|aapka|mera|mere|ka|ki|ke|ko|ya|par|se|mein|me|wala|wali|samjhe|milega|milegi)\b/i,
  ];
  if (hinglishMarkers.some((pattern) => pattern.test(message))) return "hinglish";

  const normalizedHint = hint?.trim().toLowerCase();
  if (normalizedHint === "hi" || normalizedHint === "hindi") return "hi";
  if (normalizedHint === "hinglish") return "hinglish";
  if (normalizedHint === "en" || normalizedHint === "english") return "en";

  return "en";
}

export function classifyMessage(
  message: string,
  languageHint?: string | null,
): RuleClassification {
  const normalized = normalize(message);
  const language = detectLanguage(normalized, languageHint);

  let intent: AgentIntent = "UNKNOWN";
  let confidence = 0.42;

  for (const candidate of INTENT_PATTERNS) {
    const matchCount = candidate.patterns.filter((pattern) =>
      pattern.test(normalized),
    ).length;
    if (matchCount === 0) continue;

    const candidateConfidence = Math.min(
      0.99,
      candidate.weight + Math.min(0.08, (matchCount - 1) * 0.04),
    );
    if (candidateConfidence > confidence) {
      intent = candidate.intent;
      confidence = candidateConfidence;
    }
  }

  let requiresHuman = false;
  let handoffReason: HandoffReason | null = null;

  if (intent === "COUNSELOR_REQUEST") {
    requiresHuman = true;
    handoffReason = "CUSTOMER_REQUESTED_HUMAN";
  } else if (intent === "REFUND_OR_COMPLAINT") {
    requiresHuman = true;
    handoffReason = "REFUND_OR_COMPLAINT";
  } else if (intent === "PAYMENT_SUPPORT") {
    requiresHuman = true;
    handoffReason = "PAYMENT_OR_ACCOUNT_RISK";
  }

  return {
    language,
    intent,
    confidence,
    requiresHuman,
    handoffReason,
  };
}

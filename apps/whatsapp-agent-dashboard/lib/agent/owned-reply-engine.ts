import type {
  AgentInput,
  AgentIntent,
  AgentKnowledgeReference,
  AgentLanguage,
  AgentLeadUpdates,
  HandoffReason,
  RuleClassification,
} from "./types";

export type OwnedReplyResult = {
  reply: string;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
  nextQuestion: string | null;
  leadUpdates: AgentLeadUpdates;
};

const COMMERCIAL_SENTENCE =
  /(?:₹|\b(?:fee|fees|price|pricing|cost|discount|offer|emi|installment|inr|rs\.?|rupees?)\b)/i;

const CALL_CONFIRMATION =
  /\b(?:yes\s*call|haan\s*call|ha\s*call|call\s*(?:karo|karwao|chahiye)|mujhe\s*call|phone\s*(?:karo|karna)|connect\s*me|counsell?or\s*se\s*baat)\b/i;

const DELIVERY_MODE_QUERY =
  /\b(?:online|offline|live\s*(?:online|class)?|recorded\s*class|class\s*mode|mode\s*of\s*class|ghar\s*se\s*class)\b/i;

const SHORT_DELIVERY_FOLLOW_UP =
  /^\s*(?:course|class|classes|online|offline|haan|ha|yes|wahi|same)\s*[?.!]*$/i;

const STRONG_INTEREST = [
  /\b(?:join|joining|admission|enrol|enroll|register|registration)\b/i,
  /\b(?:join\s*karna|admission\s*lena|register\s*karna|start\s*karna)\b/i,
  /\b(?:serious|bahut\s*interested|ready\s*to\s*join|start\s*now|aaj\s*se)\b/i,
];

const MEDIUM_INTEREST = [
  /\b(?:demo|masterclass|trial|orientation|link\s*bhejo|registration\s*link)\b/i,
  /\b(?:course\s*details|syllabus|batch|timing|certificate|eligibility)\b/i,
  /\b(?:interested|seekhna|sikhna|career|job|freelancing|business\s*growth)\b/i,
];

function validHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function masterclassUrl(): string | null {
  return validHttpUrl(process.env.SIKHADENGE_MASTERCLASS_URL);
}

function hashValue(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function replySeed(input: AgentInput, label: string): string {
  return [
    input.conversationId ?? "conversation",
    input.customerMessage.trim().toLowerCase(),
    String(input.history?.length ?? 0),
    label,
  ].join("|");
}

function pickVariant(values: readonly string[], seed: string): string {
  return values[hashValue(seed) % values.length] ?? values[0] ?? "";
}

function sentenceParts(value: string): string[] {
  return value
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?।])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function approvedKnowledgeExcerpt(
  references: AgentKnowledgeReference[],
): string | null {
  for (const reference of references) {
    const safeParts = sentenceParts(reference.content).filter(
      (part) => !COMMERCIAL_SENTENCE.test(part),
    );
    if (safeParts.length === 0) continue;

    const combined = safeParts.join(" ").replace(/\s+/g, " ").trim();
    if (!combined) continue;
    return combined.length > 620
      ? `${combined.slice(0, 617).trimEnd()}...`
      : combined;
  }
  return null;
}

function demoReply(language: AgentLanguage, seed: string): string {
  const url = masterclassUrl();
  if (language === "en") {
    return url
      ? pickVariant(
          [
            `Complete details are covered in the free demo/masterclass. You can register here: ${url}\nOnce done, reply DONE.`,
            `The best next step is the free demo/masterclass. Registration link: ${url}\nPlease reply DONE after registering.`,
          ],
          seed,
        )
      : pickVariant(
          [
            "The verified demo/masterclass link is being updated right now. Please reply DEMO and the team will share it with you.",
            "The demo/masterclass registration link will be available shortly. Reply DEMO so the team can send the verified link.",
          ],
          seed,
        );
  }

  return url
    ? pickVariant(
        [
          `Complete details free demo/masterclass mein explain ki jaati hain. Yahan register kijiye: ${url}\nRegistration ke baad DONE reply kar dijiye.`,
          `Aap free demo/masterclass se complete process samajh sakte hain. Registration link: ${url}\nForm submit karne ke baad DONE likh dijiye.`,
        ],
        seed,
      )
    : pickVariant(
        [
          "Demo/masterclass ka verified link abhi update ho raha hai. Aap DEMO reply kar dijiye, team link share kar degi.",
          "Masterclass registration link thodi der mein update ho jayega. Filhaal DEMO likh dijiye, team verified link bhej degi.",
        ],
        seed,
      );
}

function callOffer(language: AgentLanguage, seed: string): string {
  return language === "en"
    ? pickVariant(
        [
          "Would you like a SikhaDenge counsellor to call you and explain the next step? Reply YES CALL.",
          "A counsellor can explain the next step over a quick call. Reply YES CALL if that would help.",
        ],
        seed,
      )
    : pickVariant(
        [
          "Kya SikhaDenge counsellor aapko call karke next step samjha de? YES CALL reply kar dijiye.",
          "Aap chahein to counsellor short call par complete next step samjha dega. YES CALL likh dijiye.",
        ],
        seed,
      );
}

function deliveryModeReply(language: AgentLanguage, seed: string): string {
  if (language === "en") {
    return pickVariant(
      [
        "Classes are conducted live online, so you can join from home using a mobile phone or laptop. Which course are you interested in?",
        "Yes, the classes are live online. You can attend from anywhere on a phone or laptop. Which program would you like details about?",
      ],
      seed,
    );
  }

  return pickVariant(
    [
      "Classes live online hoti hain, isliye aap ghar se mobile ya laptop par join kar sakte hain. Aap kis course mein interested hain?",
      "Ji, classes live online hoti hain. Aap kahin se bhi mobile ya laptop ke through join kar sakte hain. Kaunsa course dekh rahe hain?",
      "Haan, class live online hoti hai—offline centre par aane ki zarurat nahi hoti. Aap student hain ya working professional?",
    ],
    seed,
  );
}

function hasDeliveryModeContext(input: AgentInput): boolean {
  const current = input.customerMessage.trim();
  if (DELIVERY_MODE_QUERY.test(current)) return true;
  if (!SHORT_DELIVERY_FOLLOW_UP.test(current)) return false;

  return (input.history ?? [])
    .filter((item) => item.role === "customer")
    .slice(-4)
    .some((item) => DELIVERY_MODE_QUERY.test(item.text));
}

function interestScore(
  input: AgentInput,
  classification: RuleClassification,
): number {
  const current = input.customerMessage;
  const historyText = (input.history ?? [])
    .filter((item) => item.role === "customer")
    .slice(-8)
    .map((item) => item.text)
    .join(" ");
  const combined = `${historyText} ${current}`;

  let score = 0;
  for (const pattern of STRONG_INTEREST) {
    if (pattern.test(combined)) score += 3;
  }
  for (const pattern of MEDIUM_INTEREST) {
    if (pattern.test(combined)) score += 1;
  }

  if (classification.intent === "ENROLLMENT") score += 3;
  if (classification.intent === "DEMO_CLASS") score += 2;
  if (classification.intent === "COURSE_DETAILS") score += 1;

  const leadScore = input.lead?.score ?? 0;
  if (leadScore >= 70) score += 3;
  else if (leadScore >= 40) score += 1;

  const temperature = input.lead?.temperature?.toUpperCase();
  if (temperature === "HOT") score += 3;
  else if (temperature === "WARM") score += 1;

  if ((input.history ?? []).filter((item) => item.role === "customer").length >= 4) {
    score += 1;
  }

  return score;
}

function inferLeadUpdates(input: AgentInput): AgentLeadUpdates {
  const message = input.customerMessage.toLowerCase();
  const updates: AgentLeadUpdates = {};

  if (/business\s*growth|growth\s*architect/.test(message)) {
    updates.interestedCourse = "AI Business Growth Architect Program";
  } else if (/become\s*ai\s*expert|ai\s*expert/.test(message)) {
    updates.interestedCourse = "Become AI Expert";
  }

  if (/\b(?:student|college|school|padhai)\b/i.test(message)) {
    updates.occupation = "student";
  } else if (/\b(?:working professional|job karta|job karti|employee)\b/i.test(message)) {
    updates.occupation = "working professional";
  } else if (/\b(?:freelancer|freelancing)\b/i.test(message)) {
    updates.occupation = "freelancer";
  } else if (/\b(?:business owner|business karta|business karti|entrepreneur)\b/i.test(message)) {
    updates.occupation = "business owner";
  }

  if (/\b(?:today|aaj|abhi|immediately|jaldi|start now)\b/i.test(message)) {
    updates.joiningTimeline = "immediate";
  } else if (/\b(?:this week|is hafte|within a week)\b/i.test(message)) {
    updates.joiningTimeline = "within one week";
  }

  if (/\b(?:evening|shaam|8\s*(?:pm|baje)|raat)\b/i.test(message)) {
    updates.classAvailability = "evening";
  } else if (/\b(?:morning|subah)\b/i.test(message)) {
    updates.classAvailability = "morning";
  } else if (/\b(?:weekend|saturday|sunday)\b/i.test(message)) {
    updates.classAvailability = "weekend";
  }

  return updates;
}

function baseReply(
  input: AgentInput,
  language: AgentLanguage,
  intent: AgentIntent,
  knowledge: AgentKnowledgeReference[],
): { reply: string; nextQuestion: string | null; confidence: number } {
  const excerpt = approvedKnowledgeExcerpt(knowledge);
  const hinglish = language !== "en";
  const seed = replySeed(input, intent);

  if (hasDeliveryModeContext(input)) {
    return {
      reply: deliveryModeReply(language, seed),
      nextQuestion: hinglish
        ? "Aap kis course mein interested hain?"
        : "Which course are you interested in?",
      confidence: 0.98,
    };
  }

  switch (intent) {
    case "GREETING":
      return {
        reply: hinglish
          ? pickVariant(
              [
                "Hello! SikhaDenge mein aapka welcome hai. Aap AI learning, career growth, freelancing ya business growth mein kis goal ke liye guidance chahte hain?",
                "Namaste! Bataiye, aap AI seekhna chahte hain, career grow karna chahte hain ya freelancing/business mein use karna chahte hain?",
                "Hello! Zaroor help karenge. Aap student hain, working professional, freelancer ya business owner?",
              ],
              seed,
            )
          : pickVariant(
              [
                "Hello! Welcome to SikhaDenge. Are you looking to learn AI, grow your career, start freelancing, or use AI for business?",
                "Hello! Happy to guide you. Are you a student, working professional, freelancer, or business owner?",
              ],
              seed,
            ),
        nextQuestion: hinglish
          ? "Aapka main goal kya hai?"
          : "What is your main goal?",
        confidence: 0.92,
      };
    case "COURSE_DISCOVERY":
      return {
        reply: hinglish
          ? pickVariant(
              [
                "Bilkul. Sahi course suggest karne ke liye bas apna current background bata dijiye—student, job, freelancing ya business?",
                "Course aapke goal ke basis par suggest hoga. Aap AI career, freelancing, office productivity ya business growth mein se kis result par focus karna chahte hain?",
                "Zaroor. Pehle ye bata dijiye ki aap abhi student hain, working professional hain, freelancer hain ya business owner.",
              ],
              seed,
            )
          : pickVariant(
              [
                "Certainly. To suggest the right course, please tell me whether you are a student, working professional, freelancer, or business owner.",
                "The right course depends on your goal. Are you focused on an AI career, freelancing, productivity, or business growth?",
              ],
              seed,
            ),
        nextQuestion: hinglish
          ? "Aapka current background aur goal kya hai?"
          : "What is your current background and goal?",
        confidence: 0.9,
      };
    case "FEES":
      return {
        reply: demoReply(language, seed),
        nextQuestion: hinglish
          ? "Link milne ke baad registration complete karke DONE reply kar dijiye."
          : "After receiving the link, complete registration and reply DONE.",
        confidence: 0.99,
      };
    case "DEMO_CLASS":
      return {
        reply: demoReply(language, seed),
        nextQuestion: hinglish
          ? "Registration ke baad DONE reply kar dijiye."
          : "Reply DONE after registration.",
        confidence: 0.99,
      };
    case "ENROLLMENT":
      return {
        reply: demoReply(language, seed),
        nextQuestion: hinglish
          ? "Kya aap counsellor call bhi chahenge?"
          : "Would you also like a counsellor call?",
        confidence: 0.96,
      };
    case "BATCH_SCHEDULE":
      if (excerpt) {
        return {
          reply: excerpt,
          nextQuestion: hinglish
            ? "Aap kis course ka batch dekh rahe hain?"
            : "Which course batch are you considering?",
          confidence: Math.max(0.84, knowledge[0]?.score ?? 0.84),
        };
      }
      return {
        reply: hinglish
          ? pickVariant(
              [
                "Batch timing course ke hisaab se confirm hoti hai. Aap kaunsa course dekh rahe hain?",
                "Ji, batch timing bata denge. Bas course ka naam share kar dijiye.",
              ],
              seed,
            )
          : "Batch timings depend on the selected course. Which course are you asking about?",
        nextQuestion: hinglish
          ? "Course ka naam kya hai?"
          : "What is the course name?",
        confidence: 0.82,
      };
    case "COURSE_DETAILS":
    case "ELIGIBILITY":
    case "CERTIFICATE":
      if (excerpt) {
        return {
          reply: excerpt,
          nextQuestion: hinglish
            ? "Iske baare mein aur kya jaanna chahenge?"
            : "What else would you like to know about it?",
          confidence: Math.max(0.82, knowledge[0]?.score ?? 0.82),
        };
      }
      return {
        reply: hinglish
          ? pickVariant(
              [
                "Iski exact details course ke according hoti hain. Aap course ka naam bata dijiye, main sahi information share karunga.",
                "Zaroor. Pehle course ka naam confirm kar dijiye, phir usi ke according details bata dete hain.",
              ],
              seed,
            )
          : "The exact details depend on the course. Please share the course name so I can give you the correct information.",
        nextQuestion: hinglish
          ? "Aap kis course ke baare mein pooch rahe hain?"
          : "Which course are you asking about?",
        confidence: 0.78,
      };
    case "OPT_OUT":
      return {
        reply: hinglish
          ? "Theek hai, aapki request note ho gayi hai. Aage promotional follow-up nahi bheja jayega."
          : "Understood. Your request has been recorded and no promotional follow-up will be sent.",
        nextQuestion: null,
        confidence: 1,
      };
    case "OUT_OF_SCOPE":
      return {
        reply: hinglish
          ? "Main SikhaDenge courses, demo/masterclass, admission, batches, certificates aur learning guidance mein help kar sakta hoon."
          : "I can help with SikhaDenge courses, demo/masterclasses, admissions, batches, certificates, and learning guidance.",
        nextQuestion: hinglish
          ? "Aap kis learning goal ke liye help chahte hain?"
          : "Which learning goal do you need help with?",
        confidence: 0.88,
      };
    case "UNKNOWN":
      if (excerpt) {
        return {
          reply: excerpt,
          nextQuestion: hinglish
            ? "Iske baare mein aur kya poochna chahenge?"
            : "What else would you like to ask about this?",
          confidence: Math.max(0.72, knowledge[0]?.score ?? 0.72),
        };
      }
      return {
        reply: hinglish
          ? pickVariant(
              [
                "Ji, bataiye aap course, class timing, demo, certificate ya admission mein se kis cheez ki details chahte hain?",
                "Bilkul. Aapka question kis baare mein hai—course, batch, demo, certificate ya joining process?",
                "Zaroor help karenge. Thoda sa clear kar dijiye ki aap course details, class timing, demo ya admission ke baare mein pooch rahe hain.",
              ],
              seed,
            )
          : pickVariant(
              [
                "Certainly. Is your question about a course, class timing, demo, certificate, or admission?",
                "Please tell me whether you need course details, batch timing, demo information, or admission guidance.",
              ],
              seed,
            ),
        nextQuestion: hinglish
          ? "Aap exactly kya jaanna chahte hain?"
          : "What exactly would you like to know?",
        confidence: 0.68,
      };
    default:
      return {
        reply: hinglish
          ? "Is request ko SikhaDenge counsellor safely handle karega."
          : "A SikhaDenge counsellor will handle this request safely.",
        nextQuestion: null,
        confidence: 0.75,
      };
  }
}

export function generateOwnedReply(input: {
  agentInput: AgentInput;
  classification: RuleClassification;
  knowledge: AgentKnowledgeReference[];
}): OwnedReplyResult {
  const { agentInput, classification, knowledge } = input;
  const score = interestScore(agentInput, classification);
  const updates = inferLeadUpdates(agentInput);
  const response = baseReply(
    agentInput,
    classification.language,
    classification.intent,
    knowledge,
  );

  const confirmedCall = CALL_CONFIRMATION.test(agentInput.customerMessage);
  if (confirmedCall) {
    return {
      reply:
        classification.language === "en"
          ? "Thank you. Your call request has been recorded. A SikhaDenge counsellor will contact you."
          : "Thank you. Aapki call request note ho gayi hai. SikhaDenge counsellor aapse contact karega.",
      confidence: 0.99,
      decisionSummary: "Customer explicitly confirmed a counsellor call request.",
      requiresHuman: true,
      handoffReason: "CUSTOMER_REQUESTED_HUMAN",
      nextQuestion: null,
      leadUpdates: { ...updates, counselorRequested: true },
    };
  }

  const shouldOfferCall =
    score >= 5 &&
    !agentInput.lead?.counselorRequested &&
    !["GREETING", "OPT_OUT", "OUT_OF_SCOPE"].includes(classification.intent);
  const offer = shouldOfferCall
    ? callOffer(classification.language, replySeed(agentInput, "call-offer"))
    : null;

  return {
    reply: offer ? `${response.reply}\n\n${offer}` : response.reply,
    confidence: response.confidence,
    decisionSummary: `Owned SikhaDenge reply engine handled ${classification.intent}; interest score ${score}${shouldOfferCall ? "; counsellor call offered" : ""}.`,
    requiresHuman: false,
    handoffReason: null,
    nextQuestion: offer ?? response.nextQuestion,
    leadUpdates: updates,
  };
}

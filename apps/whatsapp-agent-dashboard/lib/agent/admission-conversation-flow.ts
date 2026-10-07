import type {
  AgentInput,
  AgentIntent,
  AgentLeadUpdates,
  HandoffReason,
  RuleClassification,
} from "./types";

export type AdmissionFlowReply = {
  reply: string;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
  nextQuestion: string | null;
  leadUpdates: AgentLeadUpdates;
  intent?: AgentIntent;
};

const PROGRAM_NAME = "AI Expert Program";
const DEMO_URL = "https://www.sikhadenge.in";

const FEE_QUERY =
  /(?:\bfee(?:s)?\b|\bprice\b|\bcost\b|\bcharge\b|\bpayment\s+kitna\b|\bkitna\s+(?:charge|paisa|amount)\b|₹|\brupees?\b)/iu;
const FEE_INSISTENCE =
  /(?:fee\s+(?:pehle|hi|bata)|sirf\s+(?:fee|price)|bas\s+(?:fee|price)|price\s+hi|direct\s+(?:fee|price))/iu;
const DEMO_QUERY = /(?:\bdemo\b|masterclass|free\s+class)/iu;
const DEMO_DONE =
  /^\s*(?:done|complete|completed|demo\s+(?:dekh\s+li|dekh\s+liya|complete)|dekh\s+li|dekh\s+liya|ho\s+gaya)\s*[.!😊💙🌸]*\s*$/iu;
const DEMO_NOT_NOW =
  /(?:abhi\s+(?:time\s+)?nahi|baad\s+me|later|busy|free\s+nahi|kal\s+dekh)/iu;
const DEMO_WHAT =
  /(?:demo\s+me\s+kya|demo\s+mein\s+kya|what\s+is\s+in\s+(?:the\s+)?demo)/iu;
const YES_REPLY =
  /^\s*(?:haan|ha|yes|ji|bilkul|sure|ok|okay|dekh\s+li|dekh\s+liya)\s*[.!😊]*\s*$/iu;
const NO_REPLY = /^\s*(?:nahi|no|nahin|nhi|abhi\s+nahi)\s*[.!😊]*\s*$/iu;
const JOB_GUARANTEE = /(?:100\s*%\s*job|job\s+guarantee|guaranteed\s+job)/iu;
const JOB_ONLY = /(?:mujhe\s+sirf\s+job|only\s+job|bas\s+job)/iu;
const JOB_QUERY = /(?:job\s+milegi|placement|job\s+opportunit|job\s+support)/iu;
const POSITIVE_DEMO_FEEDBACK =
  /(?:bahut\s+achh|bahut\s+acch|achh[ia]|acch[ia]|great|excellent|helpful|samajh\s+aa\s+gaya)/iu;
const NEGATIVE_DEMO_FEEDBACK =
  /(?:doubt|samajh\s+nahi|clear\s+nahi|confus|achh[ia]\s+nahi|acch[ia]\s+nahi)/iu;
const CALL_TIME =
  /(?:11\s*(?:am)?\s*(?:-|to|se)\s*2\s*(?:pm)?|2\s*(?:pm)?\s*(?:-|to|se)\s*5\s*(?:pm)?|5\s*(?:pm)?\s*(?:-|to|se)\s*8\s*(?:pm)?|morning|afternoon|evening|shaam|dopahar|subah|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)/iu;

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function assistantMessages(input: AgentInput): string[] {
  return (input.history ?? [])
    .filter((item) => item.role === "assistant")
    .map((item) => item.text);
}

function customerMessages(input: AgentInput): string[] {
  return (input.history ?? [])
    .filter((item) => item.role === "customer")
    .map((item) => item.text);
}

function lastAssistantMessage(input: AgentInput): string {
  return assistantMessages(input).at(-1) ?? "";
}

function firstName(input: AgentInput): string | null {
  const name = normalize(input.contact?.name ?? "");
  return name ? name.split(" ")[0]?.slice(0, 40) || null : null;
}

function stableVariant(value: string, count: number): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return count > 0 ? hash % count : 0;
}

function acknowledgement(input: AgentInput, message: string): string {
  if (/beginner|bilkul\s+nahi|never|pehli\s+baar|nahi\s+kiya/iu.test(message)) {
    return "Bilkul, koi problem nahi 😊";
  }
  if (/freelanc|business|job|earning|career/iu.test(message)) {
    return stableVariant(message, 2) === 0
      ? "Perfect, samajh gayi. 😊"
      : "Achha, ye clear ho gaya 😊";
  }

  const name = firstName(input);
  const options = [
    "Achha, samajh gayi. 😊",
    "Bilkul, ye clear ho gaya 😊",
    name ? `${name} ji, samajh gayi 😊` : "Theek hai, samajh gayi 😊",
  ];
  return options[stableVariant(message, options.length)]!;
}

function inferSource(message: string): string | undefined {
  if (/facebook|instagram|insta|fb|social\s+media|ad/iu.test(message)) {
    return "SOCIAL_MEDIA";
  }
  if (/student|friend|dost|relative|recommend|referral|kisi\s+ne\s+bataya/iu.test(message)) {
    return "REFERRAL";
  }
  if (/google|website|search|youtube/iu.test(message)) return "SEARCH_OR_WEBSITE";
  return undefined;
}

function inferExperience(message: string): string | undefined {
  if (/beginner|bilkul\s+nahi|never|pehli\s+baar|nahi\s+kiya|new\s+hoon/iu.test(message)) {
    return "BEGINNER";
  }
  if (/advanced|expert|regularly|professional|automation|client\s+work|kaafi\s+use/iu.test(message)) {
    return "EXPERIENCED";
  }
  if (/chatgpt|gemini|claude|ai\s+tool|software|thoda|basic|kabhi\s+kabhi|use\s+kiya/iu.test(message)) {
    return "SOME_EXPERIENCE";
  }
  return undefined;
}

function inferGoal(message: string): string | undefined {
  if (/freelanc/iu.test(message)) return "FREELANCING";
  if (/business|apna\s+kaam|company|agency/iu.test(message)) return "BUSINESS";
  if (/job|placement|career|naukri/iu.test(message)) return "JOB";
  if (/online\s+earning|earn|income|paise\s+kam/iu.test(message)) {
    return "ONLINE_EARNING";
  }
  return undefined;
}

function inferJoiningTimeline(message: string): string | undefined {
  if (/sirf\s+details|details\s+(?:dekh|chahiye)|pehle\s+details|explore/iu.test(message)) {
    return "DETAILS_ONLY";
  }
  if (/aaj|abhi|immediate|jaldi|asap|turant|start\s+karna/iu.test(message)) {
    return "IMMEDIATELY";
  }
  if (/is\s+month|this\s+month|isi\s+month|mahine\s+me|month\s+ke\s+andar/iu.test(message)) {
    return "THIS_MONTH";
  }
  if (/next\s+month|agle\s+mahine/iu.test(message)) return "NEXT_MONTH";
  if (/baad\s+me|later|future|sochkar|abhi\s+nahi/iu.test(message)) return "LATER";
  return undefined;
}

function inferredLeadUpdates(message: string): AgentLeadUpdates {
  const experienceLevel = inferExperience(message);
  const goal = inferGoal(message);
  const joiningTimeline = inferJoiningTimeline(message);
  return {
    interestedCourse: PROGRAM_NAME,
    ...(experienceLevel ? { experienceLevel } : {}),
    ...(goal ? { goal } : {}),
    ...(joiningTimeline ? { joiningTimeline } : {}),
  };
}

function feeRequestCount(input: AgentInput): number {
  return [...customerMessages(input), input.customerMessage].filter((text) =>
    FEE_QUERY.test(text),
  ).length;
}

function hasSharedDemo(input: AgentInput): boolean {
  return assistantMessages(input).some((text) =>
    text.includes(DEMO_URL) || /demo\s+complete\s+hone\s+ke\s+baad/iu.test(text),
  );
}

function asksDemoWatched(value: string): boolean {
  return /(?:demo\s+class\s+dekh\s+li|free\s+demo\s+class\s+dekh)/iu.test(value);
}

function asksCallTime(value: string): boolean {
  return /(?:call.*time|time.*convenient|11\s*(?:AM)?\s*[–-]\s*2|2\s*(?:PM)?\s*[–-]\s*5|5\s*(?:PM)?\s*[–-]\s*8)/iu.test(value);
}

function asksDemoFeedback(value: string): boolean {
  return /demo\s+class\s+aapko\s+kaisi\s+lagi/iu.test(value);
}

function flowReply(input: {
  reply: string;
  summary: string;
  nextQuestion?: string | null;
  leadUpdates?: AgentLeadUpdates;
  confidence?: number;
  intent?: AgentIntent;
  requiresHuman?: boolean;
  handoffReason?: HandoffReason | null;
}): AdmissionFlowReply {
  return {
    reply: input.reply,
    confidence: input.confidence ?? 0.99,
    decisionSummary: input.summary,
    requiresHuman: input.requiresHuman ?? false,
    handoffReason: input.handoffReason ?? null,
    nextQuestion: input.nextQuestion ?? null,
    leadUpdates: input.leadUpdates ?? {},
    intent: input.intent,
  };
}

function callSchedulingFlow(input: AgentInput): AdmissionFlowReply | null {
  const message = normalize(input.customerMessage);
  if (!asksCallTime(lastAssistantMessage(input))) return null;

  if (CALL_TIME.test(message)) {
    return flowReply({
      reply: `${acknowledgement(input, message)}\n\nAapka preferred call time note kar liya hai. Admission Team isi time window mein aapse contact karegi. 💙`,
      summary: "Captured the preferred admission-call time in a natural free-text flow.",
      intent: "COUNSELOR_REQUEST",
      leadUpdates: {
        interestedCourse: PROGRAM_NAME,
        classAvailability: message.slice(0, 120),
        counselorRequested: true,
      },
    });
  }

  return flowReply({
    reply:
      "Bilkul 😊 Aap apni convenient timing likh dijiye—jaise 11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM.",
    summary: "Requested a clear call-time value without forcing buttons.",
    nextQuestion:
      "Aap apni convenient timing likh dijiye—11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM mein se kaunsa time theek rahega?",
    intent: "COUNSELOR_REQUEST",
    leadUpdates: { interestedCourse: PROGRAM_NAME, counselorRequested: true },
  });
}

function feeFlow(input: AgentInput): AdmissionFlowReply | null {
  const message = normalize(input.customerMessage);
  const lastAssistant = lastAssistantMessage(input);

  if (asksDemoWatched(lastAssistant)) {
    if (YES_REPLY.test(message)) {
      return flowReply({
        reply:
          "Great 😊 Fee, current offer aur available payment options Admission Team latest batch ke according confirm karti hai. Aaj call ke liye kaunsa time convenient rahega—11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM?",
        summary: "Moved a demo-watched learner to a fee-confirmation call.",
        nextQuestion:
          "Aaj call ke liye 11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM mein se kaunsa time convenient rahega?",
        intent: "FEES",
        leadUpdates: {
          interestedCourse: PROGRAM_NAME,
          feeUnderstood: true,
          counselorRequested: true,
        },
      });
    }
    if (NO_REPLY.test(message)) {
      return flowReply({
        reply:
          "Koi baat nahi 😊 Pehle Demo Class dekh lena better rahega, kyunki usse course quality aur teaching style ka clear idea mil jayega. Main Demo Class ka link share kar doon?",
        summary: "Recommended demo before fee discussion and asked one link question.",
        nextQuestion: "Main Demo Class ka link share kar doon?",
        intent: "FEES",
        leadUpdates: { interestedCourse: PROGRAM_NAME },
      });
    }
  }

  if (!FEE_QUERY.test(message)) return null;
  if (feeRequestCount(input) >= 3 || FEE_INSISTENCE.test(message)) {
    return flowReply({
      reply:
        "Samajh sakti hoon 😊 Main galat ya outdated amount share nahi karna chahti. Fee aur current offer clear karne ke liye short Admission Team call best rahegi. Aaj 11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM mein se kaunsa time convenient rahega?",
      summary: "Repeated fee request moved transparently to an admission call.",
      nextQuestion:
        "Aaj 11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM mein se kaunsa time convenient rahega?",
      intent: "FEES",
      leadUpdates: { interestedCourse: PROGRAM_NAME, counselorRequested: true },
    });
  }

  return flowReply({
    reply:
      "Bilkul bata dungi 😊 Usse pehle bas ek cheez confirm karni thi—kya aapne hamari Free Demo Class dekh li hai?",
    summary: "Fee amount was not invented; one demo-status question was asked.",
    nextQuestion: "Kya aapne hamari Free Demo Class dekh li hai?",
    intent: "FEES",
    leadUpdates: { interestedCourse: PROGRAM_NAME },
  });
}

function demoFlow(input: AgentInput): AdmissionFlowReply | null {
  const message = normalize(input.customerMessage);
  const lastAssistant = lastAssistantMessage(input);

  if (asksDemoFeedback(lastAssistant)) {
    if (NEGATIVE_DEMO_FEEDBACK.test(message)) {
      return flowReply({
        reply:
          "Bilkul, aap apna doubt normal message mein likh dijiye. Main pehle wahi clear karungi. 😊\n\nDemo Class mein exactly kis point par doubt hua?",
        summary: "Invited the learner to explain a demo-related doubt in free text.",
        nextQuestion: "Demo Class mein exactly kis point par doubt hua?",
        intent: "DEMO_CLASS",
        leadUpdates: { interestedCourse: PROGRAM_NAME },
      });
    }
    if (POSITIVE_DEMO_FEEDBACK.test(message)) {
      return flowReply({
        reply: `${acknowledgement(input, message)}\n\nAb aap sabse pehle kis cheez ki information lena chahenge—course details, fee/current offer, batch timing ya job support?`,
        summary: "Acknowledged positive demo feedback and asked one natural next-step question.",
        nextQuestion:
          "Aap sabse pehle course details, fee/current offer, batch timing ya job support mein se kya clear karna chahenge?",
        intent: "COURSE_DISCOVERY",
        leadUpdates: { interestedCourse: PROGRAM_NAME },
      });
    }
  }

  if (DEMO_DONE.test(message)) {
    return flowReply({
      reply:
        "Welcome back! 😊\n\nMujhe umeed hai Demo Class dekhkar aapko program ka idea mil gaya hoga.\n\nWaise Demo Class aapko kaisi lagi?",
      summary: "Demo completion acknowledged and one feedback question asked.",
      nextQuestion: "Waise Demo Class aapko kaisi lagi?",
      intent: "DEMO_CLASS",
      leadUpdates: { interestedCourse: PROGRAM_NAME },
    });
  }

  if (DEMO_WHAT.test(message)) {
    return flowReply({
      reply:
        "Bilkul 😊 Demo Class mein aap teaching style, concepts explain karne ka practical method aur AI Expert Program ki learning quality dekh payenge. Isse admission se pehle program ko properly evaluate kar sakte hain.",
      summary: "Explained demo contents without adding multiple questions.",
      intent: "DEMO_CLASS",
      leadUpdates: { interestedCourse: PROGRAM_NAME },
    });
  }

  if (DEMO_NOT_NOW.test(message) && /demo/iu.test(lastAssistant)) {
    return flowReply({
      reply:
        "Koi baat nahi 😊 Jab bhi 20–30 minutes ka free time mile, ek baar Demo Class dekh lijiye. Dekhne ke baad bas “Done” likh dijiyega; main yahin se aage guide kar dungi. 💙",
      summary: "Customer will watch the demo later.",
      intent: "DEMO_CLASS",
      leadUpdates: { interestedCourse: PROGRAM_NAME },
    });
  }

  if (YES_REPLY.test(message) && /(?:link\s+share|link\s+bhej|demo\s+ka\s+link)/iu.test(lastAssistant)) {
    return flowReply({
      reply: `Great! 😊 Aap ${DEMO_URL} par Free Demo Class dekh sakte hain. Demo complete hone ke baad bas “Done” likh dijiyega; phir main aapka feedback lekar aage guide kar dungi. 🌸`,
      summary: "Shared the verified demo website and requested DONE after completion.",
      intent: "DEMO_CLASS",
      leadUpdates: { interestedCourse: PROGRAM_NAME },
    });
  }

  if (DEMO_QUERY.test(message) && !hasSharedDemo(input)) {
    return flowReply({
      reply:
        "Perfect 😊 Admission se pehle main ek baar Free Demo Class dekhne ki recommendation deti hoon. Isse teaching style aur course quality clear ho jayegi. Main link share kar doon?",
      summary: "Recommended the demo and asked one link-sharing question.",
      nextQuestion: "Main Free Demo Class ka link share kar doon?",
      intent: "DEMO_CLASS",
      leadUpdates: { interestedCourse: PROGRAM_NAME },
    });
  }

  return null;
}

function jobFlow(input: AgentInput): AdmissionFlowReply | null {
  const message = normalize(input.customerMessage);
  if (JOB_GUARANTEE.test(message)) {
    return flowReply({
      reply:
        "Samajh gayi 😊 Humara focus aapko industry-ready banana hai. Hiring requirement aane par eligible students ko recommend kiya jaata hai, lekin final selection company ke interview aur aapki skills par depend karta hai.",
      summary: "Clarified placement assistance without a job-guarantee claim.",
      intent: "COURSE_DETAILS",
      leadUpdates: { goal: "JOB", interestedCourse: PROGRAM_NAME },
    });
  }
  if (JOB_ONLY.test(message)) {
    return flowReply({
      reply:
        "Bilkul 😊 Agar aapka main goal job hai, to program ko usi perspective se guide karna useful rahega. Aap kis field ya role mein job dekh rahe hain?",
      summary: "Captured job goal and asked one job-field question.",
      nextQuestion: "Aap kis field ya role mein job dekh rahe hain?",
      intent: "COURSE_DISCOVERY",
      leadUpdates: { goal: "JOB", interestedCourse: PROGRAM_NAME },
    });
  }
  if (JOB_QUERY.test(message)) {
    return flowReply({
      reply:
        "Bilkul 😊 Course complete karne ke baad eligible students ko suitable job opportunities ke liye recommend kiya ja sakta hai. Final hiring company ke interview, requirement aur student ki skills par depend karti hai. 💼",
      summary: "Shared accurate placement-assistance wording.",
      intent: "COURSE_DETAILS",
      leadUpdates: { goal: "JOB", interestedCourse: PROGRAM_NAME },
    });
  }
  return null;
}

function qualificationCompletion(
  input: AgentInput,
  leadUpdates: AgentLeadUpdates,
): AdmissionFlowReply {
  const name = firstName(input);
  const personal = name && stableVariant(input.customerMessage, 3) === 0 ? `${name} ji, ` : "";
  return flowReply({
    reply: `${personal}thank you 😊 Mujhe aapki requirement clear ho gayi hai. Aapke goal ke according AI Expert Program relevant rahega. Admission se pehle ek baar Free Demo Class dekhna best rahega—main link share kar doon?`,
    summary: "Completed dynamic qualification and recommended the demo as the next natural step.",
    nextQuestion: "Main Free Demo Class ka link share kar doon?",
    intent: "DEMO_CLASS",
    leadUpdates,
  });
}

function qualificationFlow(input: AgentInput): AdmissionFlowReply | null {
  const message = normalize(input.customerMessage);
  const assistantHistory = assistantMessages(input);
  const lastAssistant = lastAssistantMessage(input);
  const updates = inferredLeadUpdates(message);
  const source = inferSource(message);

  const isQualificationContext =
    assistantHistory.length === 0 ||
    /Facebook\/Instagram|student\s+ne\s+recommend|AI\s+mein\s+bilkul\s+beginner|ChatGPT\/Gemini|mainly\s+online\s+earning|online\s+earning.*freelancing.*job|kab\s+tak\s+(?:join|start)|learning\s+kab\s+tak\s+start|details\s+explore/iu.test(
      lastAssistant,
    );
  if (!isQualificationContext) return null;

  const currentExperience = updates.experienceLevel ?? input.lead?.experienceLevel ?? undefined;
  const currentGoal = updates.goal ?? input.lead?.goal ?? undefined;
  const currentTimeline = updates.joiningTimeline ?? input.lead?.joiningTimeline ?? undefined;

  if (assistantHistory.length === 0 && (input.lead?.stage ?? "NEW") === "NEW" && !source) {
    const greeting = firstName(input) ? `Hi ${firstName(input)} ji 😊` : "Hi 😊";
    return flowReply({
      reply: `${greeting}\n\nThank you! Aapki enquiry mujhe receive ho gayi hai. Bas kuch chhoti details samajhni hain, phir main aapko properly guide kar dungi.\n\nWaise aapne hamare program ke baare mein Facebook/Instagram par dekha tha ya kisi ne recommend kiya?`,
      summary: "Started a natural free-text qualification conversation.",
      nextQuestion:
        "Aapne hamare program ke baare mein Facebook/Instagram par dekha tha ya kisi ne recommend kiya?",
      intent: "COURSE_DISCOVERY",
      leadUpdates: updates,
    });
  }

  const ack = assistantHistory.length > 0 ? `${acknowledgement(input, message)}\n\n` : "";
  if (!currentExperience) {
    return flowReply({
      reply: `${ack}Aap AI mein bilkul beginner hain, ya ChatGPT/Gemini jaise tools pehle thoda use kiye hain?`,
      summary: "Asked only the next missing qualification detail: experience.",
      nextQuestion:
        "Aap AI mein bilkul beginner hain, ya ChatGPT/Gemini jaise tools pehle thoda use kiye hain?",
      intent: "ELIGIBILITY",
      leadUpdates: updates,
    });
  }
  if (!currentGoal) {
    return flowReply({
      reply: `${ack}Aap AI mainly online earning, freelancing, job ya apne business ke liye seekhna chahte hain?`,
      summary: "Skipped known details and asked only the missing goal question.",
      nextQuestion:
        "Aap AI mainly online earning, freelancing, job ya apne business ke liye seekhna chahte hain?",
      intent: "COURSE_DISCOVERY",
      leadUpdates: updates,
    });
  }
  if (!currentTimeline) {
    return flowReply({
      reply: `${ack}Agar program aapki expectation ke according hua, to aap learning kab tak start karna chahenge—abhi, is month, next month, ya filhaal details explore kar rahe hain?`,
      summary: "Skipped known details and asked only the missing joining timeline.",
      nextQuestion:
        "Aap learning kab tak start karna chahenge—abhi, is month, next month, ya filhaal details explore kar rahe hain?",
      intent: "ENROLLMENT",
      leadUpdates: updates,
    });
  }
  return qualificationCompletion(input, updates);
}

export function generateAdmissionConversationReply(input: {
  agentInput: AgentInput;
  classification: RuleClassification;
}): AdmissionFlowReply | null {
  const { agentInput } = input;
  return (
    callSchedulingFlow(agentInput) ??
    feeFlow(agentInput) ??
    demoFlow(agentInput) ??
    jobFlow(agentInput) ??
    qualificationFlow(agentInput)
  );
}

export function approvedProgramName(): string {
  return PROGRAM_NAME;
}

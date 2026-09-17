import type { AgentIntent, AgentLanguage, AgentKnowledgeReference } from "./types";

export type QuestionBankDefinition = {
  id: string;
  category: string;
  intent: AgentIntent;
  questions: readonly [string, string, string];
  keywords: readonly string[];
  answer: { en: string; hinglish: string };
  nextQuestion?: { en: string; hinglish: string };
  minScore?: number;
};

const MASTERCLASS_TOKEN = "{{MASTERCLASS_LINK}}";

export const QUESTION_BANK_DEFINITIONS: readonly QuestionBankDefinition[] = [
  {
    id: "class-mode-online",
    category: "CLASS_MODE",
    intent: "BATCH_SCHEDULE",
    questions: ["class online hai ya offline", "classes online hoti hain", "is the course online or offline"],
    keywords: ["online", "offline", "class", "course"],
    answer: {
      en: "Classes are conducted live online, so you can join from home using a mobile phone or laptop.",
      hinglish: "Classes live online hoti hain, isliye aap ghar se mobile ya laptop ke through join kar sakte hain.",
    },
    nextQuestion: { en: "Which course are you interested in?", hinglish: "Aap kis course mein interested hain?" },
  },
  {
    id: "live-or-recorded",
    category: "CLASS_MODE",
    intent: "BATCH_SCHEDULE",
    questions: ["class live hoti hai ya recorded", "recorded class milegi", "are sessions live or recorded"],
    keywords: ["live", "recorded", "recording", "session"],
    answer: {
      en: "The regular learning sessions are live online. Recording availability can depend on the batch policy, so the team should confirm it before registration.",
      hinglish: "Regular learning sessions live online hoti hain. Recording availability batch policy par depend kar sakti hai, isliye registration se pehle team se confirm karna sahi rahega.",
    },
  },
  {
    id: "mobile-or-laptop",
    category: "DEVICE",
    intent: "ELIGIBILITY",
    questions: ["mobile se class join kar sakte hain", "laptop jaruri hai", "can i attend on phone"],
    keywords: ["mobile", "phone", "laptop", "device"],
    answer: {
      en: "You can join live classes from a mobile phone or laptop. A laptop is more convenient for assignments, tools and practical work.",
      hinglish: "Aap mobile ya laptop dono se live class join kar sakte hain. Assignments, tools aur practical work ke liye laptop zyada convenient rahega.",
    },
  },
  {
    id: "internet-requirement",
    category: "DEVICE",
    intent: "ELIGIBILITY",
    questions: ["internet kitna chahiye", "slow internet me class chalegi", "what internet speed is required"],
    keywords: ["internet", "speed", "network", "data"],
    answer: {
      en: "A stable internet connection is recommended for live video classes. Using reliable Wi-Fi or a stable 4G/5G connection will reduce interruptions.",
      hinglish: "Live video classes ke liye stable internet connection recommended hai. Reliable Wi-Fi ya stable 4G/5G se interruptions kam rahenge.",
    },
  },
  {
    id: "ai-expert-duration",
    category: "COURSE_DURATION",
    intent: "BATCH_SCHEDULE",
    questions: ["become ai expert course kitne weeks ka hai", "ai expert duration kya hai", "how long is the ai expert program"],
    keywords: ["ai", "expert", "duration", "weeks"],
    answer: {
      en: "The Become AI Expert program runs for 10 weeks.",
      hinglish: "Become AI Expert program 10 weeks ka hai.",
    },
  },
  {
    id: "ai-expert-frequency",
    category: "COURSE_SCHEDULE",
    intent: "BATCH_SCHEDULE",
    questions: ["week me kitni classes hoti hain", "ai expert classes per week", "how many classes are held each week"],
    keywords: ["week", "classes", "frequency", "days"],
    answer: {
      en: "The Become AI Expert program has 3 classes per week.",
      hinglish: "Become AI Expert program mein har week 3 classes hoti hain.",
    },
  },
  {
    id: "ai-expert-session-length",
    category: "COURSE_SCHEDULE",
    intent: "BATCH_SCHEDULE",
    questions: ["ek class kitne ghante ki hoti hai", "session duration kya hai", "how long is each class"],
    keywords: ["class", "session", "hours", "duration"],
    answer: {
      en: "Each Become AI Expert class is planned for 2 hours.",
      hinglish: "Become AI Expert ki har class 2 hours ki planned hoti hai.",
    },
  },
  {
    id: "ai-expert-timing",
    category: "COURSE_SCHEDULE",
    intent: "BATCH_SCHEDULE",
    questions: ["class timing kya hai", "ai expert batch kitne baje hai", "what are the class timings"],
    keywords: ["timing", "time", "baje", "batch"],
    answer: {
      en: "The planned Become AI Expert class timing is 8:00 PM to 10:00 PM IST.",
      hinglish: "Become AI Expert ki planned class timing 8:00 PM se 10:00 PM IST hai.",
    },
  },
  {
    id: "timezone",
    category: "COURSE_SCHEDULE",
    intent: "BATCH_SCHEDULE",
    questions: ["timing kis timezone me hai", "ist timing hai kya", "which timezone is used"],
    keywords: ["timezone", "ist", "time", "zone"],
    answer: {
      en: "All published class timings are in Indian Standard Time unless the batch notice says otherwise.",
      hinglish: "Published class timings Indian Standard Time mein hoti hain, jab tak batch notice mein kuch aur na diya ho.",
    },
  },
  {
    id: "missed-class",
    category: "ATTENDANCE",
    intent: "BATCH_SCHEDULE",
    questions: ["class miss ho jaye to kya hoga", "missed session kaise cover hoga", "what happens if i miss a class"],
    keywords: ["miss", "missed", "absent", "class"],
    answer: {
      en: "Please inform the support team if you miss a class. The available catch-up option depends on the active batch policy.",
      hinglish: "Class miss ho jaaye to support team ko inform kijiye. Catch-up ka available option active batch policy par depend karega.",
    },
  },
  {
    id: "recording-access",
    category: "ATTENDANCE",
    intent: "BATCH_SCHEDULE",
    questions: ["recording kab milegi", "class recording available hai", "will i get recordings"],
    keywords: ["recording", "recorded", "access", "video"],
    answer: {
      en: "Recording access is batch-specific and should be confirmed before admission. The core delivery format is live online learning.",
      hinglish: "Recording access batch-specific hota hai aur admission se pehle confirm karna chahiye. Core delivery format live online learning hai.",
    },
  },
  {
    id: "beginner-friendly",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["beginner join kar sakta hai", "mujhe ai bilkul nahi aata", "is this suitable for beginners"],
    keywords: ["beginner", "basic", "starting", "experience"],
    answer: {
      en: "Yes. The Become AI Expert program starts with AI fundamentals and is structured for learners who are beginning from the basics.",
      hinglish: "Haan. Become AI Expert program AI fundamentals se start hota hai aur basics se shuru karne wale learners ke liye structured hai.",
    },
  },
  {
    id: "non-technical-background",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["non technical background se join kar sakte hain", "commerce student ai seekh sakta hai", "can a non technical person join"],
    keywords: ["non", "technical", "commerce", "arts"],
    answer: {
      en: "A non-technical learner can join. Prior technical experience is not required for the core Become AI Expert curriculum.",
      hinglish: "Non-technical learner join kar sakta hai. Become AI Expert ke core curriculum ke liye prior technical experience required nahi hai.",
    },
  },
  {
    id: "coding-required",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["coding aana jaruri hai", "programming ke bina ai seekh sakte hain", "is coding required"],
    keywords: ["coding", "programming", "code", "required"],
    answer: {
      en: "Prior coding is not required for the Become AI Expert program. Coding-heavy application building is covered separately in the business-focused program.",
      hinglish: "Become AI Expert program ke liye pehle se coding aana required nahi hai. Coding-heavy application building business-focused program mein separately cover hota hai.",
    },
  },
  {
    id: "student-eligibility",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["student join kar sakta hai", "college students ke liye hai", "can students enroll"],
    keywords: ["student", "college", "school", "study"],
    answer: {
      en: "Students can join if they can attend the live schedule and complete the practical work.",
      hinglish: "Students join kar sakte hain, bas live schedule attend karna aur practical work complete karna possible hona chahiye.",
    },
  },
  {
    id: "working-professional",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["job ke sath course kar sakte hain", "working professional join kar sakta hai", "can i do this with a full time job"],
    keywords: ["job", "working", "professional", "employee"],
    answer: {
      en: "Yes. The evening live schedule is designed to be manageable for many working professionals.",
      hinglish: "Haan. Evening live schedule ko working professionals ke liye manageable rakhne ke purpose se plan kiya gaya hai.",
    },
  },
  {
    id: "freelancer-fit",
    category: "ELIGIBILITY",
    intent: "COURSE_DISCOVERY",
    questions: ["freelancer ke liye kaunsa course hai", "freelancing me ai kaise use hoga", "which program is suitable for freelancers"],
    keywords: ["freelancer", "freelancing", "client", "services"],
    answer: {
      en: "Become AI Expert covers AI productivity, content workflows and freelancing foundations. Your current service and goal will help determine the best path.",
      hinglish: "Become AI Expert mein AI productivity, content workflows aur freelancing foundations cover hote hain. Aapki current service aur goal ke basis par best path decide hoga.",
    },
  },
  {
    id: "business-owner-fit",
    category: "ELIGIBILITY",
    intent: "COURSE_DISCOVERY",
    questions: ["business owner ke liye kaunsa course hai", "business growth ke liye ai course", "which course is for business owners"],
    keywords: ["business", "owner", "growth", "entrepreneur"],
    answer: {
      en: "Business owners who want strategy, automation and growth systems should consider the AI Business Growth Architect Program.",
      hinglish: "Business owners jo strategy, automation aur growth systems banana chahte hain, unke liye AI Business Growth Architect Program suitable hai.",
    },
  },
  {
    id: "which-course",
    category: "COURSE_DISCOVERY",
    intent: "COURSE_DISCOVERY",
    questions: ["mere liye kaunsa course sahi hai", "which course should i choose", "course suggest karo"],
    keywords: ["which", "kaunsa", "course", "suggest"],
    answer: {
      en: "Become AI Expert is focused on learning and career skills. AI Business Growth Architect is focused on business systems, automation and growth.",
      hinglish: "Become AI Expert learning aur career skills par focused hai. AI Business Growth Architect business systems, automation aur growth par focused hai.",
    },
    nextQuestion: { en: "Are you a student, professional, freelancer or business owner?", hinglish: "Aap student, working professional, freelancer ya business owner hain?" },
  },
  {
    id: "ai-expert-overview",
    category: "COURSE_DETAILS",
    intent: "COURSE_DETAILS",
    questions: ["become ai expert course kya hai", "ai expert program details", "tell me about become ai expert"],
    keywords: ["become", "ai", "expert", "details"],
    answer: {
      en: "Become AI Expert is a 10-week live online program covering AI fundamentals, prompting, research, productivity, Excel/data, content, design media, automation basics, career growth, freelancing, safety and a capstone.",
      hinglish: "Become AI Expert 10-week live online program hai jisme AI fundamentals, prompting, research, productivity, Excel/data, content, design media, automation basics, career growth, freelancing, safety aur capstone cover hote hain.",
    },
  },
  {
    id: "business-growth-overview",
    category: "COURSE_DETAILS",
    intent: "COURSE_DETAILS",
    questions: ["business growth architect course kya hai", "ai business course details", "tell me about business growth architect"],
    keywords: ["business", "growth", "architect", "course"],
    answer: {
      en: "AI Business Growth Architect is a 10–12 week business-focused program covering deeper automation, chatbots, knowledge assistants, voice AI, application building and AI-led business growth systems.",
      hinglish: "AI Business Growth Architect 10–12 week business-focused program hai jisme deeper automation, chatbots, knowledge assistants, voice AI, application building aur AI-led business growth systems cover hote hain.",
    },
  },
  {
    id: "ai-fundamentals",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["ai fundamentals cover honge", "ai basics sikhayenge", "does the course cover ai fundamentals"],
    keywords: ["ai", "fundamentals", "basics", "foundation"],
    answer: {
      en: "Yes. The program begins with AI fundamentals so learners understand core concepts before moving to practical workflows.",
      hinglish: "Haan. Program AI fundamentals se start hota hai, taaki practical workflows se pehle core concepts clear ho jaayen.",
    },
  },
  {
    id: "prompting-module",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["prompt engineering sikhayenge", "prompting module hai", "is prompting included"],
    keywords: ["prompt", "prompting", "engineering", "included"],
    answer: {
      en: "Yes. Practical prompting is included, with emphasis on writing clear instructions and improving results for real tasks.",
      hinglish: "Haan. Practical prompting included hai, jisme real tasks ke liye clear instructions likhna aur results improve karna sikhaya jaata hai.",
    },
  },
  {
    id: "research-module",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["ai research sikhayenge", "research tools cover honge", "is ai research included"],
    keywords: ["research", "tools", "information", "included"],
    answer: {
      en: "Yes. AI-assisted research and information workflows are part of the Become AI Expert curriculum.",
      hinglish: "Haan. AI-assisted research aur information workflows Become AI Expert curriculum ka part hain.",
    },
  },
  {
    id: "office-productivity",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["office work ke liye ai sikhayenge", "productivity tools cover honge", "does it cover office productivity"],
    keywords: ["office", "productivity", "work", "documents"],
    answer: {
      en: "Yes. The program covers AI for office productivity, document work and everyday professional tasks.",
      hinglish: "Haan. Program mein office productivity, document work aur daily professional tasks ke liye AI use cover hota hai.",
    },
  },
  {
    id: "excel-data",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["excel aur data sikhayenge", "ai with excel included hai", "does it cover excel and data"],
    keywords: ["excel", "data", "sheet", "analysis"],
    answer: {
      en: "Yes. Excel and data productivity workflows are included in the Become AI Expert program.",
      hinglish: "Haan. Excel aur data productivity workflows Become AI Expert program mein included hain.",
    },
  },
  {
    id: "content-creation",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["content creation sikhayenge", "social media content included hai", "is content creation covered"],
    keywords: ["content", "social", "writing", "creation"],
    answer: {
      en: "Yes. The curriculum includes AI-assisted content creation and practical content workflows.",
      hinglish: "Haan. Curriculum mein AI-assisted content creation aur practical content workflows included hain.",
    },
  },
  {
    id: "design-media",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["image video audio tools sikhayenge", "ai design module hai", "does it cover image video and audio"],
    keywords: ["image", "video", "audio", "design"],
    answer: {
      en: "Yes. The program introduces design, image, video and audio workflows using AI tools.",
      hinglish: "Haan. Program mein AI tools ke through design, image, video aur audio workflows introduce kiye jaate hain.",
    },
  },
  {
    id: "automation-basics",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["automation sikhayenge", "basic automation included hai", "does the course include automation"],
    keywords: ["automation", "workflow", "automate", "basic"],
    answer: {
      en: "Become AI Expert includes automation basics. Advanced business automation is covered more deeply in the AI Business Growth Architect Program.",
      hinglish: "Become AI Expert mein automation basics included hain. Advanced business automation AI Business Growth Architect Program mein zyada depth mein cover hota hai.",
    },
  },
  {
    id: "career-growth",
    category: "OUTCOMES",
    intent: "COURSE_DETAILS",
    questions: ["career growth me help hogi", "ai career kaise banega", "will this help my career"],
    keywords: ["career", "growth", "job", "skills"],
    answer: {
      en: "The program builds practical AI skills for productivity, portfolio work, career growth and freelancing. Outcomes depend on practice and implementation.",
      hinglish: "Program productivity, portfolio work, career growth aur freelancing ke liye practical AI skills build karta hai. Result aapki practice aur implementation par depend karega.",
    },
  },
  {
    id: "freelancing-module",
    category: "OUTCOMES",
    intent: "COURSE_DETAILS",
    questions: ["freelancing sikhayenge", "client kaise milega", "is freelancing included"],
    keywords: ["freelancing", "client", "service", "earning"],
    answer: {
      en: "Freelancing foundations and service-oriented AI use cases are included. The program does not guarantee clients or income.",
      hinglish: "Freelancing foundations aur service-oriented AI use cases included hain. Program clients ya income ki guarantee nahi deta.",
    },
  },
  {
    id: "safety-ethics",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["ai safety sikhayenge", "ethics module hai", "does it cover ai safety and ethics"],
    keywords: ["safety", "ethics", "responsible", "privacy"],
    answer: {
      en: "Yes. AI safety, responsible use and ethics are included in the curriculum.",
      hinglish: "Haan. AI safety, responsible use aur ethics curriculum mein included hain.",
    },
  },
  {
    id: "capstone-project",
    category: "SYLLABUS",
    intent: "COURSE_DETAILS",
    questions: ["final project hoga", "capstone included hai", "is there a capstone project"],
    keywords: ["capstone", "project", "final", "practical"],
    answer: {
      en: "Yes. The Become AI Expert program includes a capstone so learners apply the covered skills in a practical outcome.",
      hinglish: "Haan. Become AI Expert program mein capstone included hai, jisme covered skills ko practical outcome mein apply kiya jaata hai.",
    },
  },
  {
    id: "chatbot-module",
    category: "COURSE_SCOPE",
    intent: "COURSE_DETAILS",
    questions: ["chatbot banana sikhayenge", "chatbot course me hai", "is chatbot building included"],
    keywords: ["chatbot", "bot", "assistant", "building"],
    answer: {
      en: "Chatbots and knowledge assistants are part of the AI Business Growth Architect Program, not the core Become AI Expert curriculum.",
      hinglish: "Chatbots aur knowledge assistants AI Business Growth Architect Program ka part hain, core Become AI Expert curriculum ka nahi.",
    },
  },
  {
    id: "voice-ai-module",
    category: "COURSE_SCOPE",
    intent: "COURSE_DETAILS",
    questions: ["voice ai sikhayenge", "calling agent included hai", "is voice ai included"],
    keywords: ["voice", "calling", "agent", "ai"],
    answer: {
      en: "Voice AI and calling-agent systems are covered in the AI Business Growth Architect Program.",
      hinglish: "Voice AI aur calling-agent systems AI Business Growth Architect Program mein cover hote hain.",
    },
  },
  {
    id: "app-building-module",
    category: "COURSE_SCOPE",
    intent: "COURSE_DETAILS",
    questions: ["ai app banana sikhayenge", "application building included hai", "is ai application building covered"],
    keywords: ["app", "application", "building", "develop"],
    answer: {
      en: "Application building is included in the AI Business Growth Architect Program rather than the core Become AI Expert program.",
      hinglish: "Application building AI Business Growth Architect Program mein included hai, core Become AI Expert program mein nahi.",
    },
  },
  {
    id: "demo-masterclass",
    category: "DEMO",
    intent: "DEMO_CLASS",
    questions: ["demo class kaise join kare", "masterclass link bhejo", "how can i join the demo"],
    keywords: ["demo", "masterclass", "link", "join"],
    answer: {
      en: `You can register for the free demo/masterclass here: ${MASTERCLASS_TOKEN}`,
      hinglish: `Aap free demo/masterclass ke liye yahan register kar sakte hain: ${MASTERCLASS_TOKEN}`,
    },
    nextQuestion: { en: "Reply DONE after registering.", hinglish: "Registration ke baad DONE reply kar dijiye." },
  },
  {
    id: "fees-policy",
    category: "COMMERCIAL",
    intent: "FEES",
    questions: ["fees kya hai", "course price kitna hai", "what is the course fee"],
    keywords: ["fee", "fees", "price", "cost"],
    answer: {
      en: `Complete commercial details are explained through the verified demo/masterclass process. Register here: ${MASTERCLASS_TOKEN}`,
      hinglish: `Complete commercial details verified demo/masterclass process mein explain ki jaati hain. Yahan register kijiye: ${MASTERCLASS_TOKEN}`,
    },
  },
  {
    id: "discount-policy",
    category: "COMMERCIAL",
    intent: "FEES",
    questions: ["discount milega", "offer chal raha hai", "is there any discount"],
    keywords: ["discount", "offer", "coupon", "deal"],
    answer: {
      en: `Current verified offers are explained during the demo/masterclass process. Register here: ${MASTERCLASS_TOKEN}`,
      hinglish: `Current verified offers demo/masterclass process mein explain kiye jaate hain. Yahan register kijiye: ${MASTERCLASS_TOKEN}`,
    },
  },
  {
    id: "emi-policy",
    category: "COMMERCIAL",
    intent: "FEES",
    questions: ["emi available hai", "installment me payment ho sakta hai", "can i pay in instalments"],
    keywords: ["emi", "installment", "instalment", "payment"],
    answer: {
      en: "Payment-plan availability must be confirmed by the counsellor for the current admission cycle.",
      hinglish: "Current admission cycle ke liye payment-plan availability counsellor se confirm karni hogi.",
    },
  },
  {
    id: "admission-process",
    category: "ADMISSION",
    intent: "ENROLLMENT",
    questions: ["admission kaise hoga", "course join kaise kare", "what is the admission process"],
    keywords: ["admission", "join", "enroll", "register"],
    answer: {
      en: `Start with the free demo/masterclass registration. The team will then guide you through the verified next step: ${MASTERCLASS_TOKEN}`,
      hinglish: `Free demo/masterclass registration se start kijiye. Uske baad team verified next step guide karegi: ${MASTERCLASS_TOKEN}`,
    },
  },
  {
    id: "certificate-availability",
    category: "CERTIFICATE",
    intent: "CERTIFICATE",
    questions: ["certificate milega", "course completion certificate hai", "will i receive a certificate"],
    keywords: ["certificate", "completion", "certification", "receive"],
    answer: {
      en: "A program-completion certificate is issued after the applicable completion and verification requirements are met.",
      hinglish: "Applicable completion aur verification requirements complete hone ke baad program-completion certificate issue kiya jaata hai.",
    },
  },
  {
    id: "certificate-timeline",
    category: "CERTIFICATE",
    intent: "CERTIFICATE",
    questions: ["certificate kab milega", "certificate kitne din me aata hai", "when will the certificate be issued"],
    keywords: ["certificate", "when", "days", "timeline"],
    answer: {
      en: "After successful completion and verification, the certificate process is targeted within 7 working days.",
      hinglish: "Successful completion aur verification ke baad certificate process 7 working days ke andar target kiya jaata hai.",
    },
  },
  {
    id: "job-guarantee",
    category: "OUTCOMES",
    intent: "COURSE_DETAILS",
    questions: ["job guarantee hai", "course ke baad job pakki hai", "is there a job guarantee"],
    keywords: ["job", "guarantee", "placement", "pakki"],
    answer: {
      en: "No job or income guarantee is promised. The program focuses on practical skills, portfolio work and career readiness.",
      hinglish: "Job ya income guarantee promise nahi ki jaati. Program practical skills, portfolio work aur career readiness par focus karta hai.",
    },
  },
  {
    id: "placement-support",
    category: "OUTCOMES",
    intent: "COURSE_DETAILS",
    questions: ["placement milegi", "placement support hai", "does the course provide placement"],
    keywords: ["placement", "job", "support", "career"],
    answer: {
      en: "The program supports career preparation and practical skill development, but placement is not guaranteed.",
      hinglish: "Program career preparation aur practical skill development mein support karta hai, lekin placement guarantee nahi karta.",
    },
  },
  {
    id: "trainer-mentor",
    category: "TRAINER",
    intent: "COURSE_DETAILS",
    questions: ["course kaun conduct karega", "trainer kaun hai", "who will teach the program"],
    keywords: ["trainer", "mentor", "teach", "conduct"],
    answer: {
      en: "The program is conducted by Ankit from SikhaDenge, with the delivery team supporting operations and learner coordination.",
      hinglish: "Program SikhaDenge se Ankit conduct karenge, aur delivery team operations aur learner coordination support karegi.",
    },
  },
  {
    id: "group-or-one-to-one",
    category: "CLASS_FORMAT",
    intent: "BATCH_SCHEDULE",
    questions: ["one to one class hai", "group class hoti hai", "is it group or one to one"],
    keywords: ["one", "group", "personal", "class"],
    answer: {
      en: "The standard program is delivered as a live batch. Any one-to-one option must be separately confirmed by the team.",
      hinglish: "Standard program live batch format mein deliver hota hai. One-to-one option alag se team ke saath confirm karna hoga.",
    },
  },
  {
    id: "batch-start-date",
    category: "BATCH",
    intent: "BATCH_SCHEDULE",
    questions: ["next batch kab start hoga", "batch start date kya hai", "when does the next batch begin"],
    keywords: ["next", "batch", "start", "date"],
    answer: {
      en: `The current batch start date is shared through the verified demo/masterclass registration flow: ${MASTERCLASS_TOKEN}`,
      hinglish: `Current batch start date verified demo/masterclass registration flow mein share ki jaati hai: ${MASTERCLASS_TOKEN}`,
    },
  },
  {
    id: "seat-availability",
    category: "BATCH",
    intent: "ENROLLMENT",
    questions: ["seat available hai", "batch full to nahi hai", "are seats available"],
    keywords: ["seat", "available", "full", "batch"],
    answer: {
      en: "Seat availability changes by batch. The team will confirm the current status after demo/masterclass registration.",
      hinglish: "Seat availability batch ke saath change hoti hai. Demo/masterclass registration ke baad team current status confirm karegi.",
    },
  },
  {
    id: "call-request",
    category: "COUNSELLOR",
    intent: "COUNSELOR_REQUEST",
    questions: ["mujhe call chahiye", "counsellor se baat karni hai", "please arrange a call"],
    keywords: ["call", "counsellor", "talk", "contact"],
    answer: {
      en: "Your call request can be recorded for a SikhaDenge counsellor. Reply YES CALL to confirm.",
      hinglish: "SikhaDenge counsellor ke liye aapki call request record ki ja sakti hai. Confirm karne ke liye YES CALL reply kijiye.",
    },
  },
  {
    id: "language-medium",
    category: "CLASS_FORMAT",
    intent: "BATCH_SCHEDULE",
    questions: ["class hindi me hogi", "english compulsory hai", "what language is used in class"],
    keywords: ["hindi", "english", "language", "medium"],
    answer: {
      en: "The learning experience is designed to be Hindi/Hinglish-friendly. The exact language mix can be confirmed for the active batch.",
      hinglish: "Learning experience Hindi/Hinglish-friendly rakha gaya hai. Active batch ka exact language mix team se confirm kiya ja sakta hai.",
    },
  },
  {
    id: "assignments-practice",
    category: "LEARNING_FORMAT",
    intent: "COURSE_DETAILS",
    questions: ["assignments milenge", "practice kaise hogi", "are there assignments and practical work"],
    keywords: ["assignment", "practice", "homework", "practical"],
    answer: {
      en: "The program is practical and includes guided tasks and a capstone. Exact assignment frequency can vary by module.",
      hinglish: "Program practical hai aur guided tasks ke saath capstone include karta hai. Exact assignment frequency module ke according vary kar sakti hai.",
    },
  },
  {
    id: "study-material",
    category: "LEARNING_FORMAT",
    intent: "COURSE_DETAILS",
    questions: ["study material milega", "notes provide honge", "will study material be provided"],
    keywords: ["material", "notes", "resources", "pdf"],
    answer: {
      en: "Learning resources are shared according to the active module and batch plan. The team can confirm the exact resource format.",
      hinglish: "Learning resources active module aur batch plan ke according share kiye jaate hain. Exact resource format team confirm kar sakti hai.",
    },
  },
  {
    id: "doubt-support",
    category: "SUPPORT",
    intent: "COURSE_DETAILS",
    questions: ["doubt support milega", "question kaha puchenge", "how are doubts handled"],
    keywords: ["doubt", "support", "question", "help"],
    answer: {
      en: "Learner questions are handled through the batch support process. The exact support channel is shared during onboarding.",
      hinglish: "Learner questions batch support process ke through handle hote hain. Exact support channel onboarding ke time share kiya jaata hai.",
    },
  },
  {
    id: "city-location",
    category: "ACCESS",
    intent: "ELIGIBILITY",
    questions: ["main dusre city se join kar sakta hu", "location kaha hai", "can i join from another city"],
    keywords: ["city", "location", "another", "join"],
    answer: {
      en: "Yes. Because classes are live online, learners can join from any city with a suitable device and stable internet.",
      hinglish: "Haan. Classes live online hone ki wajah se suitable device aur stable internet ke saath kisi bhi city se join kiya ja sakta hai.",
    },
  },
  {
    id: "international-access",
    category: "ACCESS",
    intent: "ELIGIBILITY",
    questions: ["india ke bahar se join kar sakte hain", "international student join kar sakta hai", "can i join from outside india"],
    keywords: ["outside", "india", "international", "abroad"],
    answer: {
      en: "Yes. International learners can attend the live online classes, but they should check the IST schedule before registering.",
      hinglish: "Haan. International learners live online classes attend kar sakte hain, lekin registration se pehle IST schedule check karna chahiye.",
    },
  },
  {
    id: "attendance-policy",
    category: "ATTENDANCE",
    intent: "BATCH_SCHEDULE",
    questions: ["attendance compulsory hai", "minimum attendance kitni hai", "is attendance mandatory"],
    keywords: ["attendance", "mandatory", "minimum", "compulsory"],
    answer: {
      en: "Regular attendance is strongly recommended for live learning and practical continuity. Any formal minimum should be confirmed from the active batch policy.",
      hinglish: "Live learning aur practical continuity ke liye regular attendance strongly recommended hai. Formal minimum active batch policy se confirm karna chahiye.",
    },
  },
  {
    id: "demo-free",
    category: "DEMO",
    intent: "DEMO_CLASS",
    questions: ["demo free hai", "masterclass ka charge hai", "is the demo class free"],
    keywords: ["demo", "free", "masterclass", "charge"],
    answer: {
      en: `The demo/masterclass registration is free. Use the verified registration link: ${MASTERCLASS_TOKEN}`,
      hinglish: `Demo/masterclass registration free hai. Verified registration link use kijiye: ${MASTERCLASS_TOKEN}`,
    },
  },
  {
    id: "registration-link-problem",
    category: "DEMO_SUPPORT",
    intent: "DEMO_CLASS",
    questions: ["link open nahi ho raha", "registration link work nahi kar raha", "the demo link is not working"],
    keywords: ["link", "open", "working", "registration"],
    answer: {
      en: "Please send a screenshot of the link error. The team will verify the active registration link and assist you.",
      hinglish: "Link error ka screenshot bhej dijiye. Team active registration link verify karke aapko assist karegi.",
    },
  },
  {
    id: "after-demo-next-step",
    category: "ADMISSION",
    intent: "ENROLLMENT",
    questions: ["demo ke baad kya hoga", "masterclass ke baad next step", "what happens after the demo"],
    keywords: ["after", "demo", "next", "step"],
    answer: {
      en: "After the demo/masterclass, the team confirms your course fit, current batch and verified admission process.",
      hinglish: "Demo/masterclass ke baad team aapka course fit, current batch aur verified admission process confirm karti hai.",
    },
  },
  {
    id: "course-change",
    category: "ADMISSION",
    intent: "ENROLLMENT",
    questions: ["course change kar sakte hain", "galat course select ho gaya", "can i switch programs"],
    keywords: ["change", "switch", "wrong", "course"],
    answer: {
      en: "A course-change request must be reviewed by the team based on your admission status and the active policy.",
      hinglish: "Course-change request ko admission status aur active policy ke basis par team review karegi.",
    },
  },
  {
    id: "corporate-training",
    category: "BUSINESS",
    intent: "COURSE_DISCOVERY",
    questions: ["company team ke liye training chahiye", "corporate ai training available hai", "do you provide corporate training"],
    keywords: ["corporate", "company", "team", "training"],
    answer: {
      en: "Corporate or team-training requirements need a custom discussion. A counsellor can collect the team size, goals and preferred schedule.",
      hinglish: "Corporate ya team-training requirement ke liye custom discussion chahiye. Counsellor team size, goals aur preferred schedule collect karega.",
    },
  },
  {
    id: "parent-enquiry",
    category: "ELIGIBILITY",
    intent: "COURSE_DISCOVERY",
    questions: ["main apne child ke liye puch raha hu", "parents course details chahte hain", "i am asking for my child"],
    keywords: ["parent", "child", "son", "daughter"],
    answer: {
      en: "Please share the learner's current education level, age group and goal so the team can suggest the suitable program.",
      hinglish: "Learner ka current education level, age group aur goal share kijiye, taaki team suitable program suggest kar sake.",
    },
  },
  {
    id: "age-limit",
    category: "ELIGIBILITY",
    intent: "ELIGIBILITY",
    questions: ["age limit kya hai", "minimum age kitni hai", "is there an age limit"],
    keywords: ["age", "limit", "minimum", "years"],
    answer: {
      en: "Suitability is assessed from the learner's background, ability to attend live classes and learning goal. Please share the age group for confirmation.",
      hinglish: "Suitability learner ke background, live classes attend karne ki ability aur learning goal se assess hoti hai. Confirmation ke liye age group share kijiye.",
    },
  },
  {
    id: "tools-cost",
    category: "TOOLS",
    intent: "COURSE_DETAILS",
    questions: ["paid tools lene padenge", "tools ka extra charge hai", "will i need paid ai tools"],
    keywords: ["paid", "tools", "extra", "subscription"],
    answer: {
      en: "Some practical workflows may use free plans and some tools may have optional paid features. No paid tool should be purchased without checking the module requirement.",
      hinglish: "Kuch practical workflows free plans par ho sakte hain aur kuch tools mein optional paid features ho sakte hain. Module requirement check kiye bina paid tool purchase nahi karna chahiye.",
    },
  },
  {
    id: "certificate-delivery",
    category: "CERTIFICATE",
    intent: "CERTIFICATE",
    questions: ["certificate hard copy milega", "certificate email se aayega", "is the certificate digital or physical"],
    keywords: ["certificate", "digital", "hard", "copy"],
    answer: {
      en: "The standard certificate workflow is digital. Any physical-copy option must be separately confirmed by the team.",
      hinglish: "Standard certificate workflow digital hai. Physical-copy option team se separately confirm karna hoga.",
    },
  },
  {
    id: "demo-content",
    category: "DEMO",
    intent: "DEMO_CLASS",
    questions: ["masterclass me kya batayenge", "demo me kya cover hoga", "what will be covered in the demo"],
    keywords: ["masterclass", "demo", "cover", "content"],
    answer: {
      en: "The demo/masterclass explains the program direction, learning outcomes, class process and verified next steps.",
      hinglish: "Demo/masterclass mein program direction, learning outcomes, class process aur verified next steps explain kiye jaate hain.",
    },
  },
  {
    id: "registration-confirmation",
    category: "DEMO",
    intent: "ENROLLMENT",
    questions: ["registration ho gaya", "form submit kar diya", "i have completed registration"],
    keywords: ["registration", "done", "submitted", "complete"],
    answer: {
      en: "Thank you. Your registration response has been noted. The team will use the submitted details for the next communication.",
      hinglish: "Thank you. Aapka registration response note ho gaya hai. Team submitted details ke basis par next communication karegi.",
    },
  },
  {
    id: "general-help",
    category: "GENERAL",
    intent: "UNKNOWN",
    questions: ["mujhe complete details chahiye", "please guide me", "i need more information"],
    keywords: ["details", "guide", "information", "help"],
    answer: {
      en: "Please share whether your goal is AI learning, career growth, freelancing or business growth. The guidance will be based on that goal.",
      hinglish: "Please bataiye aapka goal AI learning, career growth, freelancing ya business growth mein se kya hai. Guidance usi goal ke basis par di jaayegi.",
    },
  },
] as const;

const PREFIXES = ["", "please "] as const;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-IN")
    .replace(/offilne|ofline/g, "offline")
    .replace(/onine/g, "online")
    .replace(/cource/g, "course")
    .replace(/replay/g, "reply")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return Array.from(new Set(normalize(value).split(" ").filter((token) => token.length > 1)));
}

function languageForQuery(query: string): AgentLanguage {
  if (/[\u0900-\u097F]/.test(query)) return "hi";
  if (/\b(kya|hai|hoga|hogi|kaise|kab|kitna|kitni|mujhe|chahiye|kar|sakta|sakti|mile|milega|batao|jaruri|aana|join)\b/i.test(query)) {
    return "hinglish";
  }
  return "en";
}

function validHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function renderQuestionBankAnswer(
  definition: QuestionBankDefinition,
  language: AgentLanguage,
): string {
  const selected = language === "en" ? definition.answer.en : definition.answer.hinglish;
  const link = validHttpUrl(process.env.SIKHADENGE_MASTERCLASS_URL);
  if (link) return selected.replaceAll(MASTERCLASS_TOKEN, link);
  return selected.replaceAll(
    MASTERCLASS_TOKEN,
    language === "en"
      ? "the verified link is being updated; reply DEMO so the team can share it"
      : "verified link update ho raha hai; DEMO reply kijiye, team link share karegi",
  );
}

export function questionBankVariants(definition: QuestionBankDefinition): string[] {
  return definition.questions.flatMap((question) =>
    PREFIXES.map((prefix) => `${prefix}${question}`.trim()),
  );
}

export const QUESTION_BANK_VARIANT_COUNT = QUESTION_BANK_DEFINITIONS.reduce(
  (count, definition) => count + questionBankVariants(definition).length,
  0,
);

function scoreDefinition(query: string, definition: QuestionBankDefinition): number {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  if (!normalizedQuery || queryTokens.length === 0) return 0;

  let phraseScore = 0;
  let tokenScore = 0;
  for (const variant of questionBankVariants(definition)) {
    const normalizedVariant = normalize(variant);
    if (normalizedQuery === normalizedVariant) phraseScore = Math.max(phraseScore, 1);
    else if (
      normalizedQuery.length >= 8 &&
      (normalizedQuery.includes(normalizedVariant) || normalizedVariant.includes(normalizedQuery))
    ) {
      phraseScore = Math.max(phraseScore, 0.9);
    }

    const variantTokens = tokens(variant);
    const matched = variantTokens.filter((token) => queryTokens.includes(token)).length;
    const coverage = matched / Math.max(variantTokens.length, queryTokens.length, 1);
    tokenScore = Math.max(tokenScore, coverage);
  }

  const keywordHits = definition.keywords.filter((keyword) =>
    normalizedQuery.includes(normalize(keyword)),
  ).length;
  const keywordScore = keywordHits / Math.max(2, Math.min(4, definition.keywords.length));

  if (phraseScore === 0 && keywordHits === 0) return 0;
  return Math.min(1, phraseScore * 0.62 + tokenScore * 0.25 + keywordScore * 0.13);
}

export function findQuestionBankDefinitions(
  query: string,
  limit = 3,
): Array<{ definition: QuestionBankDefinition; score: number }> {
  return QUESTION_BANK_DEFINITIONS.map((definition) => ({
    definition,
    score: scoreDefinition(query, definition),
  }))
    .filter(({ definition, score }) => score >= (definition.minScore ?? 0.52))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 5)));
}

export function searchQuestionBankKnowledge(
  query: string,
  limit = 2,
): AgentKnowledgeReference[] {
  const language = languageForQuery(query);
  return findQuestionBankDefinitions(query, limit).map(({ definition, score }) => ({
    chunkId: `question-bank:${definition.id}`,
    documentId: "sikhadenge-owned-question-bank-v1",
    title: "SikhaDenge Owned Question Bank",
    heading: definition.questions[0],
    content: renderQuestionBankAnswer(definition, language),
    score: Number(Math.max(0.82, score).toFixed(4)),
  }));
}

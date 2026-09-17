import type { AgentKnowledgeReference } from "./types";

type SkillProfile = {
  id: string;
  heading: string;
  patterns: RegExp[];
  hinglish: string;
  english: string;
};

function isHinglish(query: string): boolean {
  return /[\u0900-\u097F]/.test(query) ||
    /\b(kya|hai|hain|hu|hoon|mera|meri|mujhe|karna|seekhna|sikhna|improve|badha|bhai|ji|kaise|main|mai|wala|wali)\b/i.test(
      query,
    );
}

function normalize(query: string): string {
  return query
    .toLocaleLowerCase("en-IN")
    .replace(/grafhic|grapic|garphic/g, "graphic")
    .replace(/desginer|desinger|desiner/g, "designer")
    .replace(/vedio/g, "video")
    .replace(/editior|editer/g, "editor")
    .replace(/markting/g, "marketing")
    .replace(/contant/g, "content")
    .replace(/fotographer/g, "photographer")
    .replace(/freelacer|frilancer/g, "freelancer")
    .replace(/improving|improvment/g, "improve")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PROFILES: readonly SkillProfile[] = [
  {
    id: "graphic-designer",
    heading: "Graphic designer aur design improvement",
    patterns: [
      /\bgraphic\s+designer\b/,
      /\bgraphic\s+design\b/,
      /\bdesign\s+improve\b/,
      /\bimprove\s+(?:my\s+)?design\b/,
      /\bdesigner\b/,
      /\bbranding\s+designer\b/,
    ],
    hinglish:
      "🎨 Graphic designer ke liye Become AI Expert Program AI-assisted design research, concept generation, better prompting, image creation, social-media creatives, presentations, content workflow aur client work ko faster banane mein useful hai. Program design-media ko AI workflow ke saath cover karta hai; ye standalone Photoshop, Illustrator ya complete graphic-design diploma nahi hai.\n\n🎯 Aap branding, social-media design ya freelance client work mein se kis area ko improve karna chahte hain?",
    english:
      "🎨 For a graphic designer, Become AI Expert is useful for AI-assisted design research, concept generation, better prompting, image creation, social-media creatives, presentations, content workflows and faster client delivery. It covers design-media through practical AI workflows; it is not a standalone Photoshop, Illustrator or full graphic-design diploma.\n\n🎯 Which area do you want to improve most: branding, social-media design or freelance client work?",
  },
  {
    id: "ui-ux-designer",
    heading: "UI UX aur web/app designer",
    patterns: [
      /\bui\s*\/?\s*ux\b/,
      /\bux\s+designer\b/,
      /\bui\s+designer\b/,
      /\bweb\s+designer\b/,
      /\bapp\s+designer\b/,
      /\bproduct\s+designer\b/,
    ],
    hinglish:
      "🧩 UI/UX ya web-app designer ke liye program AI research, user-problem exploration, content hierarchy, idea generation, prompt-based visual concepts, presentation aur productivity workflows mein help karta hai. Full Figma, wireframing ya complete UI/UX specialization iska primary focus nahi hai.\n\n🎯 Aap research, visual ideation, portfolio presentation ya workflow speed mein se kya improve karna chahte hain?",
    english:
      "🧩 For a UI/UX or web-app designer, the program helps with AI research, user-problem exploration, content hierarchy, ideation, prompt-based visual concepts, presentations and productivity workflows. Full Figma, wireframing or a complete UI/UX specialisation is not the primary focus.\n\n🎯 What do you want to improve most: research, visual ideation, portfolio presentation or workflow speed?",
  },
  {
    id: "video-editor",
    heading: "Video editor, reels editor aur motion creator",
    patterns: [
      /\bvideo\s+editor\b/,
      /\breels?\s+editor\b/,
      /\bshorts?\s+editor\b/,
      /\bmotion\s+(?:graphic|designer|editor)\b/,
      /\bvideo\s+editing\b/,
      /\bafter\s+effects\b/,
      /\bpremiere\s+pro\b/,
    ],
    hinglish:
      "🎬 Video editor ke liye Become AI Expert script ideas, hooks, shot planning, AI image-video generation, captions, voice/audio workflows, research aur faster content production cover karta hai. Ye AI-assisted editing workflow improve karta hai; full Premiere Pro, After Effects ya advanced VFX specialization nahi hai.\n\n🎯 Aap reels, YouTube videos, client editing ya motion content mein se kis type ka work karte hain?",
    english:
      "🎬 For a video editor, Become AI Expert covers script ideas, hooks, shot planning, AI image-video generation, captions, voice/audio workflows, research and faster content production. It improves AI-assisted editing workflows; it is not a full Premiere Pro, After Effects or advanced VFX specialisation.\n\n🎯 Do you mainly work on reels, YouTube videos, client editing or motion content?",
  },
  {
    id: "content-creator",
    heading: "Content creator, influencer aur YouTuber",
    patterns: [
      /\bcontent\s+creator\b/,
      /\binfluencer\b/,
      /\byoutuber\b/,
      /\bcreator\b/,
      /\bcontent\s+creation\b/,
      /\breels?\s+creator\b/,
    ],
    hinglish:
      "📱 Content creator ke liye program research, content ideas, script, captions, content planning, AI images, AI video/audio, thumbnails/creative direction aur productivity workflows mein practical help karta hai. Focus AI se content quality aur speed improve karna hai.\n\n🎯 Aap Instagram, YouTube, personal brand ya client content mein se kis platform par focus kar rahe hain?",
    english:
      "📱 For a content creator, the program provides practical help with research, content ideas, scripts, captions, planning, AI images, AI video/audio, thumbnail direction and productivity workflows. The focus is improving content quality and speed with AI.\n\n🎯 Are you focused on Instagram, YouTube, a personal brand or client content?",
  },
  {
    id: "social-media-manager",
    heading: "Social-media manager aur community role",
    patterns: [
      /\bsocial\s+media\s+(?:manager|executive|management)\b/,
      /\bcommunity\s+manager\b/,
      /\binstagram\s+manager\b/,
      /\bsocial\s+media\b/,
    ],
    hinglish:
      "📲 Social-media work ke liye Become AI Expert audience research, content calendar, post/reel ideas, captions, creatives, repurposing, reporting summaries aur automation basics cover karta hai. Ye AI-enabled social workflow hai; full social-media agency ya advanced ads course nahi hai.\n\n🎯 Aap content planning, creative production, engagement ya reporting mein se kis area ko improve karna chahte hain?",
    english:
      "📲 For social-media work, Become AI Expert covers audience research, content calendars, post and reel ideas, captions, creatives, repurposing, reporting summaries and automation basics. It is an AI-enabled social workflow, not a full social-media agency or advanced ads course.\n\n🎯 Which area do you want to improve: planning, creative production, engagement or reporting?",
  },
  {
    id: "digital-marketer",
    heading: "Digital marketer aur growth professional",
    patterns: [
      /\bdigital\s+marketer\b/,
      /\bdigital\s+marketing\b/,
      /\bmarketing\s+(?:executive|manager|professional)\b/,
      /\bgrowth\s+marketer\b/,
      /\bmarketing\b/,
    ],
    hinglish:
      "📈 Digital marketer ke liye program AI research, customer understanding, campaign ideas, copy/captions, creative briefs, content production, spreadsheet analysis, reporting aur automation basics mein useful hai. Full performance-marketing certification iska primary focus nahi hai.\n\n🎯 Aap content marketing, lead generation, ads support ya reporting mein se kis area par kaam karte hain?",
    english:
      "📈 For a digital marketer, the program is useful for AI research, customer understanding, campaign ideas, copy and captions, creative briefs, content production, spreadsheet analysis, reporting and automation basics. It is not primarily a full performance-marketing certification.\n\n🎯 Do you mainly work in content marketing, lead generation, ads support or reporting?",
  },
  {
    id: "performance-marketer",
    heading: "Performance marketer, Meta Ads aur Google Ads",
    patterns: [
      /\bperformance\s+marketer\b/,
      /\bmedia\s+buyer\b/,
      /\bmeta\s+ads?\b/,
      /\bfacebook\s+ads?\b/,
      /\bgoogle\s+ads?\b/,
      /\bpaid\s+ads?\b/,
      /\bads?\s+manager\b/,
    ],
    hinglish:
      "🎯 Ads professional ke liye Become AI Expert audience/competitor research, ad-copy ideas, creative concepts, reporting summaries, spreadsheet analysis aur repetitive-work automation basics mein help karta hai. Campaign setup, tracking aur advanced media buying ka complete specialization program ka primary scope nahi hai.\n\n🎯 Aap creative testing, copy, research ya reporting mein se kya improve karna chahte hain?",
    english:
      "🎯 For an ads professional, Become AI Expert helps with audience and competitor research, ad-copy ideas, creative concepts, reporting summaries, spreadsheet analysis and basic workflow automation. Complete campaign setup, tracking and advanced media buying are not the programme’s primary specialisation.\n\n🎯 What do you want to improve most: creative testing, copy, research or reporting?",
  },
  {
    id: "seo-writer",
    heading: "SEO, content writer aur copywriter",
    patterns: [
      /\bseo\s+(?:expert|executive|specialist)\b/,
      /\bcontent\s+writer\b/,
      /\bcopywriter\b/,
      /\bblog\s+writer\b/,
      /\bseo\b/,
      /\bcopywriting\b/,
    ],
    hinglish:
      "✍️ SEO/content writing ke liye program research, source verification, outlines, drafts, rewriting, captions, content repurposing aur productivity workflows cover karta hai. AI ko assistant ki tarah use karna sikhaya jaata hai—blind copy-paste nahi. Full technical SEO specialization iska main focus nahi hai.\n\n🎯 Aap blogs, website copy, social content ya client writing mein se kya karte hain?",
    english:
      "✍️ For SEO and content writing, the program covers research, source verification, outlines, drafting, rewriting, captions, repurposing and productivity workflows. AI is used as an assistant rather than for blind copy-paste. Full technical SEO specialisation is not the main focus.\n\n🎯 Do you work mainly on blogs, website copy, social content or client writing?",
  },
  {
    id: "photographer-photo-editor",
    heading: "Photographer aur photo editor",
    patterns: [
      /\bphotographer\b/,
      /\bphotography\b/,
      /\bphoto\s+editor\b/,
      /\bphoto\s+editing\b/,
      /\bretoucher\b/,
    ],
    hinglish:
      "📸 Photographer ya photo editor ke liye program AI image ideation, mood-board research, prompt-based visuals, background/creative concepts, captions, client presentation aur content workflow mein help karta hai. Full camera, lighting, Lightroom ya Photoshop mastery iska primary focus nahi hai.\n\n🎯 Aap wedding, product, social-media ya commercial photography mein se kis area mein kaam karte hain?",
    english:
      "📸 For a photographer or photo editor, the program helps with AI image ideation, mood-board research, prompt-based visuals, background and creative concepts, captions, client presentations and content workflows. Full camera, lighting, Lightroom or Photoshop mastery is not the primary focus.\n\n🎯 Do you work in wedding, product, social-media or commercial photography?",
  },
  {
    id: "audio-voice-podcast",
    heading: "Voice, audio aur podcast creator",
    patterns: [
      /\bpodcast(?:er)?\b/,
      /\baudio\s+(?:editor|creator)\b/,
      /\bvoice\s*over\b/,
      /\bvoice\s+artist\b/,
      /\baudio\s+editing\b/,
    ],
    hinglish:
      "🎙️ Audio/podcast work ke liye program research, episode ideas, scripts, transcription, summaries, AI voice/audio workflows aur content repurposing mein help karta hai. Full sound engineering ya DAW specialization iska main focus nahi hai.\n\n🎯 Aap podcast, voice-over, educational audio ya client content mein se kis type ka work karte hain?",
    english:
      "🎙️ For audio and podcast work, the program helps with research, episode ideas, scripts, transcription, summaries, AI voice/audio workflows and content repurposing. Full sound engineering or DAW specialisation is not the main focus.\n\n🎯 Do you work mainly on podcasts, voice-overs, educational audio or client content?",
  },
  {
    id: "office-professional",
    heading: "Office professional, admin aur HR",
    patterns: [
      /\boffice\s+(?:work|professional|employee)\b/,
      /\badmin\s+(?:executive|work|professional)\b/,
      /\bhr\s+(?:executive|manager|professional)\b/,
      /\bhuman\s+resources\b/,
      /\bback\s+office\b/,
      /\bworking\s+professional\b/,
    ],
    hinglish:
      "💻 Office, admin ya HR role ke liye Become AI Expert emails, documents, presentations, meeting notes, research, Excel/data summaries, planning aur repetitive tasks ki automation basics cover karta hai. Isse daily productivity aur communication improve ki ja sakti hai.\n\n🎯 Aap email/document work, Excel/reporting, HR tasks ya presentations mein se kis area ko faster banana chahte hain?",
    english:
      "💻 For office, admin or HR roles, Become AI Expert covers emails, documents, presentations, meeting notes, research, Excel and data summaries, planning and basic automation of repetitive tasks. It can improve daily productivity and communication.\n\n🎯 Which area do you want to make faster: email and documents, Excel and reporting, HR tasks or presentations?",
  },
  {
    id: "excel-data-analyst",
    heading: "Excel, MIS aur data role",
    patterns: [
      /\bexcel\b/,
      /\bmis\s+(?:executive|analyst)\b/,
      /\bdata\s+(?:analyst|analysis|executive)\b/,
      /\breporting\s+(?:executive|analyst)\b/,
      /\bspreadsheet\b/,
    ],
    hinglish:
      "📊 Excel/MIS/data work ke liye program data cleaning support, formulas ki guidance, summaries, charts, reporting insights, document preparation aur AI-assisted analysis cover karta hai. Ye advanced statistics ya full data-science course nahi hai.\n\n🎯 Aap formulas, cleaning, reports, dashboards ya analysis mein se kis area mein help chahte hain?",
    english:
      "📊 For Excel, MIS and data work, the program covers support for data cleaning, formula guidance, summaries, charts, reporting insights, document preparation and AI-assisted analysis. It is not an advanced statistics or full data-science course.\n\n🎯 Which area do you need help with: formulas, cleaning, reports, dashboards or analysis?",
  },
  {
    id: "sales-customer-support",
    heading: "Sales, customer support aur CRM work",
    patterns: [
      /\bsales\s+(?:executive|manager|professional)\b/,
      /\bcustomer\s+(?:support|service|care)\b/,
      /\bcrm\s+(?:executive|manager)\b/,
      /\btelecaller\b/,
      /\brelationship\s+manager\b/,
    ],
    hinglish:
      "🤝 Sales aur customer-support role ke liye program customer research, personalised messages, follow-up drafts, call notes, objection-response preparation, CRM-style organisation aur reporting productivity mein help karta hai. Full enterprise CRM implementation iska primary focus nahi hai.\n\n🎯 Aap lead follow-up, customer replies, call preparation ya reporting mein se kya improve karna chahte hain?",
    english:
      "🤝 For sales and customer-support roles, the program helps with customer research, personalised messages, follow-up drafts, call notes, objection-response preparation, CRM-style organisation and reporting productivity. Full enterprise CRM implementation is not the primary focus.\n\n🎯 What do you want to improve most: lead follow-up, customer replies, call preparation or reporting?",
  },
  {
    id: "teacher-trainer",
    heading: "Teacher, trainer aur educator",
    patterns: [
      /\bteacher\b/,
      /\btrainer\b/,
      /\beducator\b/,
      /\bfaculty\b/,
      /\btutor\b/,
      /\bteaching\b/,
    ],
    hinglish:
      "🎓 Teacher/trainer ke liye Become AI Expert lesson research, notes, quizzes, presentations, worksheets, examples, feedback drafts aur educational content creation mein help karta hai. Responsible verification aur safe AI use bhi important part hai.\n\n🎯 Aap school teaching, coaching, corporate training ya online education mein se kis area mein hain?",
    english:
      "🎓 For teachers and trainers, Become AI Expert helps with lesson research, notes, quizzes, presentations, worksheets, examples, feedback drafts and educational content creation. Responsible verification and safe AI use are also important.\n\n🎯 Are you in school teaching, coaching, corporate training or online education?",
  },
  {
    id: "freelancer",
    heading: "Freelancer aur service professional",
    patterns: [
      /\bfreelancer\b/,
      /\bfreelancing\b/,
      /\bclient\s+work\b/,
      /\bservice\s+provider\b/,
    ],
    hinglish:
      "🧑‍💻 Freelancer ke liye program AI-assisted research, service delivery, content/design-media support, proposals, portfolio direction, client communication, productivity aur automation basics cover karta hai. Client ya income guarantee nahi hoti; focus market-ready workflow build karna hai.\n\n🎯 Aap design, editing, content, marketing ya office-support services mein se kya offer karna chahte hain?",
    english:
      "🧑‍💻 For freelancers, the program covers AI-assisted research, service delivery, content and design-media support, proposals, portfolio direction, client communication, productivity and automation basics. Clients or income are not guaranteed; the focus is building a market-ready workflow.\n\n🎯 Which service do you want to offer: design, editing, content, marketing or office support?",
  },
  {
    id: "student-fresher",
    heading: "Student, fresher aur job seeker",
    patterns: [
      /\bstudent\b/,
      /\bfresher\b/,
      /\bjob\s+seeker\b/,
      /\bcollege\s+student\b/,
      /\bgraduate\b/,
    ],
    hinglish:
      "🚀 Student ya fresher ke liye Become AI Expert AI basics se start karke prompting, research, office/Excel work, content, design-media, productivity, automation basics, portfolio direction aur freelancing foundations cover karta hai. Coding pehle se compulsory nahi hai.\n\n🎯 Aap job preparation, freelancing, college productivity ya content/design skills mein se kis goal par focus karna chahte hain?",
    english:
      "🚀 For students and freshers, Become AI Expert starts with AI basics and covers prompting, research, office and Excel work, content, design-media, productivity, automation basics, portfolio direction and freelancing foundations. Prior coding is not compulsory.\n\n🎯 Which goal matters most to you: job preparation, freelancing, college productivity or content and design skills?",
  },
  {
    id: "business-owner",
    heading: "Business owner aur entrepreneur",
    patterns: [
      /\bbusiness\s+owner\b/,
      /\bentrepreneur\b/,
      /\bshop\s+owner\b/,
      /\bsmall\s+business\b/,
      /\bown\s+business\b/,
    ],
    hinglish:
      "🏢 Business owner ke liye Become AI Expert research, content, presentations, customer communication, office productivity, reporting aur basic automation use cases samjhata hai. Advanced chatbot, voice agent, application building aur full business-automation implementation student program ka scope nahi hai.\n\n🎯 Aap marketing content, customer communication, reporting ya team productivity mein se kis area ko improve karna chahte hain?",
    english:
      "🏢 For a business owner, Become AI Expert explains practical use cases for research, content, presentations, customer communication, office productivity, reporting and basic automation. Advanced chatbots, voice agents, application building and full business-automation implementation are outside the student programme’s scope.\n\n🎯 Which area do you want to improve: marketing content, customer communication, reporting or team productivity?",
  },
  {
    id: "developer-coder",
    heading: "Developer, coder aur technical professional",
    patterns: [
      /\bsoftware\s+developer\b/,
      /\bweb\s+developer\b/,
      /\bapp\s+developer\b/,
      /\bprogrammer\b/,
      /\bcoder\b/,
      /\bdeveloper\b/,
    ],
    hinglish:
      "👨‍💻 Developer ke liye program prompting, research, documentation, debugging support, planning, data/productivity aur AI-tool workflows mein useful hai. Ye full coding, software engineering ya application-development course nahi hai.\n\n🎯 Aap coding productivity, research/documentation, career growth ya AI-tool usage mein se kya improve karna chahte hain?",
    english:
      "👨‍💻 For developers, the program is useful for prompting, research, documentation, debugging support, planning, data productivity and AI-tool workflows. It is not a full coding, software-engineering or application-development course.\n\n🎯 What do you want to improve most: coding productivity, research and documentation, career growth or AI-tool usage?",
  },
] as const;

export function searchSkillFitReplies(query: string): AgentKnowledgeReference[] {
  const normalized = normalize(query);
  if (!normalized) return [];

  const match = PROFILES.find((profile) =>
    profile.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (!match) return [];

  return [
    {
      chunkId: `skill-fit:${match.id}`,
      documentId: "sikhadenge-skill-fit-replies-v1",
      title: "SikhaDenge Become AI Expert Skill Fit Replies",
      heading: match.heading,
      content: isHinglish(query) ? match.hinglish : match.english,
      score: 1,
    },
  ];
}

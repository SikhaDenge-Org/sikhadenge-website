import type { AgentKnowledgeReference } from "./types";

function isHinglish(query: string): boolean {
  return /[\u0900-\u097F]/.test(query) ||
    /\b(kya|hai|hain|hoga|hogi|ho\s+sakta|milegi|milega|chahiye|baad|mein|me|bhai|ji|placement|job)\b/i.test(
      query,
    );
}

function normalize(query: string): string {
  return query
    .toLocaleLowerCase("en-IN")
    .replace(/assist[e|a]nt|assis?tence|assistnce|assitance/g, "assistance")
    .replace(/plesment|placment|plcement/g, "placement")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesJobAssistance(query: string): boolean {
  const value = normalize(query);
  if (!value) return false;

  if (/\b(salary|package|income|earning)\b/.test(value)) return false;
  if (/\b(job|placement)\s+guarantee\b/.test(value)) return false;

  return [
    /\bjob\s+(assistance|support|help)\b/,
    /\bplacement\s+(assistance|support|help)\b/,
    /\bplacement\s+(ho\s+sakta|hoga|hogi|milegi|milega)\b/,
    /\bjob\s+(ho\s+sakta|hoga|hogi|milegi|milega)\b/,
    /\bcourse\s+ke\s+baad\s+(job|placement)\b/,
    /\b(job|placement).*(support|help|guide|guidance)\b/,
    /\b(do\s+you\s+provide|is\s+there).*(job|placement).*(assistance|support|help)\b/,
  ].some((pattern) => pattern.test(value));
}

export function searchJobAssistanceReplies(
  query: string,
): AgentKnowledgeReference[] {
  if (!matchesJobAssistance(query)) return [];

  const hinglish = isHinglish(query);
  const content = hinglish
    ? "💼 Haan, Become AI Expert Program mein job assistance milegi. Aapko suitable AI roles samajhne, profile aur portfolio direction, interview preparation aur job-search guidance mein support diya jayega. Placement learner ki skills, performance aur available opportunities par depend karta hai, isliye job guarantee nahi hai.\n\n🎯 Aap job, freelancing ya current career growth mein se kis goal par focus kar rahe hain?"
    : "💼 Yes, the Become AI Expert Program includes job assistance. Learners receive guidance on suitable AI roles, profile and portfolio direction, interview preparation and job-search strategy. Placement depends on skills, performance and available opportunities, so a job is not guaranteed.\n\n🎯 Are you focusing on a job, freelancing or growth in your current career?";

  return [
    {
      chunkId: "job-assistance:approved-reply",
      documentId: "sikhadenge-job-assistance-replies-v1",
      title: "SikhaDenge Job Assistance Reply",
      heading: "Job assistance aur placement support",
      content,
      score: 1,
    },
  ];
}

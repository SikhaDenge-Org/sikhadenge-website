import { isOptOutKeyword } from "./sa2-contracts";
import { APPROVED_COURSES, extractSignals } from "./sa4-sales-agent";
import { calculateFollowUpDelayHours } from "./sa5-followup-engine";
import { calculateLeadPriority, determineNextBestAction } from "./sa6-counsellor-routing";
import { generateCoursePaymentLink } from "./sa7-enrollment-automation";
import { extractCTWAReferral } from "./sa8-ctwa-attribution";
import { getSalesEngineHealth } from "./sa9-observability";

export interface VerificationCheck {
  phase: string;
  name: string;
  passed: boolean;
  message?: string;
}

/**
 * Runs deterministic end-to-end audit assertions across all Sales OS layers (SA2 - SA9).
 */
export async function runSalesOSVerification(): Promise<{
  allPassed: boolean;
  totalChecks: number;
  checks: VerificationCheck[];
}> {
  const checks: VerificationCheck[] = [];

  // SA2: Opt-out recognition
  const stopMatches = isOptOutKeyword("STOP") && isOptOutKeyword("message mat karo");
  checks.push({
    phase: "SA2",
    name: "Consent & Suppression Opt-Out Matcher",
    passed: stopMatches,
    message: stopMatches ? "Opt-out keywords accurately detected" : "Failed opt-out detection"
  });

  // SA4: Course Catalog Integrity
  const catalogValid = APPROVED_COURSES["ai-mastery"]?.workshopPrice === 9 && APPROVED_COURSES["ai-mastery"]?.regularPrice === 4999;
  checks.push({
    phase: "SA4",
    name: "Course Catalog & Pricing Immutability",
    passed: catalogValid,
    message: catalogValid ? "Approved course pricing catalog locked" : "Catalog mismatch"
  });

  // SA4: Intent extraction
  const signal = extractSignals("Mujhe AI course ki fees kitni hai?");
  const intentExtracted = signal.detectedIntent === "FEES_QUERY" && signal.interestedCourse === "AI & Generative AI Mastery";
  checks.push({
    phase: "SA4",
    name: "AI Intent & Course Qualification",
    passed: intentExtracted,
    message: intentExtracted ? "Intent and course extraction verified" : "Signal extraction failed"
  });

  // SA5: Follow-up cadence
  const delayHours = calculateFollowUpDelayHours("HOT", false);
  checks.push({
    phase: "SA5",
    name: "Intelligent Follow-Up Cadence Timing",
    passed: delayHours === 1,
    message: delayHours === 1 ? "Hot lead 1-hour follow-up window verified" : "Cadence mismatch"
  });

  // SA6: Priority & Next-Best-Action
  const priority = calculateLeadPriority({ temperature: "HOT", score: 60, counselorRequested: true, feeUnderstood: false });
  const nextAction = determineNextBestAction({ temperature: "HOT", counselorRequested: true, feeUnderstood: false, score: 60 });
  const sa6Passed = priority.isUrgent && priority.slaMinutes === 15 && nextAction === "CALL_IMMEDIATELY";
  checks.push({
    phase: "SA6",
    name: "Counsellor Priority SLA & Action Gate",
    passed: sa6Passed,
    message: sa6Passed ? "15-min urgent SLA & immediate callback recommended" : "Routing gate failed"
  });

  // SA7: Payment Link Catalog Guardrail
  const order = generateCoursePaymentLink({ courseKey: "ai-mastery", isWorkshopPass: true });
  const orderValid = order?.amount === 9 && order?.currency === "INR";
  checks.push({
    phase: "SA7",
    name: "Authoritative Payment Link Pricing Lock",
    passed: orderValid,
    message: orderValid ? "Workshop Rs.9 pass bound to catalog" : "Price tampering detected"
  });

  // SA8: CTWA Attribution Parser
  const referral = extractCTWAReferral({ source_type: "ad", source_id: "meta_ad_9988", headline: "Learn AI" });
  const attributionValid = referral?.sourceType === "ad" && referral?.sourceId === "meta_ad_9988";
  checks.push({
    phase: "SA8",
    name: "Meta CTWA Attribution Referral Extractor",
    passed: attributionValid,
    message: attributionValid ? "Meta Ad ID attribution successfully extracted" : "CTWA parse failed"
  });

  // SA9: Live Engine Diagnostics
  try {
    const health = await getSalesEngineHealth();
    checks.push({
      phase: "SA9",
      name: "Observability Health Metrics Engine",
      passed: typeof health.totalContacts === "number",
      message: `Active Contacts: ${health.totalContacts}, Open Convs: ${health.activeConversations}`
    });
  } catch (err: any) {
    checks.push({
      phase: "SA9",
      name: "Observability Health Metrics Engine",
      passed: false,
      message: err.message
    });
  }

  const allPassed = checks.every(c => c.passed);
  return {
    allPassed,
    totalChecks: checks.length,
    checks
  };
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const campaign = readFileSync(
  "modules/email-automation/campaigns/campaign-service.ts",
  "utf8",
);
const sequence = readFileSync(
  "modules/email-automation/sequences/sequence-service.ts",
  "utf8",
);
const scheduler = readFileSync(
  "modules/email-automation/automation/scheduler.ts",
  "utf8",
);
const campaignUi = readFileSync(
  "modules/email-automation/ui/EmailCampaignsWorkspace.tsx",
  "utf8",
);
const sequenceUi = readFileSync(
  "modules/email-automation/ui/EmailSequencesWorkspace.tsx",
  "utf8",
);
const nav = readFileSync(
  "modules/email-automation/ui/EmailWorkspaceNav.tsx",
  "utf8",
);
const campaignPage = readFileSync("app/email/campaigns/page.tsx", "utf8");
const sequencePage = readFileSync("app/email/sequences/page.tsx", "utf8");

// E6 exit gate: bulk campaign delivery must honor suppression, consent and frequency policy.
assert.match(campaign, /engageCustomerSuppression\.findMany/);
assert.match(campaign, /engageCustomerConsentEvent\.findFirst/);
assert.match(campaign, /Affirmative EMAIL marketing consent is required/);
assert.match(campaign, /Recipient frequency cap reached/);
assert.match(campaign, /unsubscribe_url/);

// Campaign pause/cancel state must make the campaign ineligible for new dispatch.
assert.match(campaign, /\["SCHEDULED",\s*"ACTIVE"\]\.includes\(campaign\.status\)/);
assert.match(campaign, /status:\s*\{\s*in:\s*\["ACTIVE",\s*"SCHEDULED"\]/);
assert.match(campaign, /status:\s*"ACTIVE"\s*\|\s*"PAUSED"\s*\|\s*"CANCELLED"/);
assert.match(campaign, /throttlePerHour/);
assert.match(campaign, /senderPool/);
assert.match(campaign, /dailyLimit/);
assert.match(campaign, /Sender daily limit reached/);

// Sequence pause must prevent new due-step execution, while marketing journeys re-check policy.
assert.match(
  sequence,
  /sequence:\s*\{\s*status:\s*"ACTIVE"\s*\}/,
);
assert.match(sequence, /assertEmailBulkRecipientAllowed/);
assert.match(sequence, /createEmailUnsubscribeUrl/);
assert.match(sequence, /Marketing sequence contactId is required/);

// Sender overrides must be verified at creation and the effective sender must respect daily limits.
assert.match(sequence, /validateSequenceSenderOverrides/);
assert.match(sequence, /Sequence sender .* is not verified and active/);
assert.match(sequence, /resolveEmailSender/);
assert.match(sequence, /templateSenderIdentityId:\s*version\.defaultSenderIdentityId/);
assert.match(sequence, /externalRequestSent:\s*true/);
assert.match(sequence, /senderIdentityId:\s*resolved\.sender\.id/);
assert.match(sequence, /Sender daily limit reached/);
assert.match(sequence, /automationSenderIdentityId:\s*sender\.id/);

// Scheduler must execute the canonical hardened sequence service, never the legacy finalization copy.
assert.match(
  scheduler,
  /processDueEmailSequences\s*\}\s*from\s*"\.\.\/sequences\/sequence-service"/,
);
assert.doesNotMatch(
  scheduler,
  /processDueEmailSequences\s*\}\s*from\s*"\.\.\/finalization\/platform-service"/,
);
assert.match(scheduler, /processDueEmailCampaigns\(20\)/);
assert.match(scheduler, /processDueEmailSequences\(50\)/);

// E6 operator surfaces must be first-class and wired to the real APIs.
assert.match(nav, /\["Campaigns",\s*"\/email\/campaigns"/);
assert.match(nav, /\["Sequences",\s*"\/email\/sequences"/);
assert.match(campaignPage, /EmailCampaignsWorkspace/);
assert.match(sequencePage, /EmailSequencesWorkspace/);
assert.match(campaignUi, /\/api\/email\/campaigns/);
assert.match(campaignUi, /\/api\/email\/templates/);
assert.match(campaignUi, /\/api\/email\/connections/);
assert.match(campaignUi, /\/api\/email\/runtime/);
assert.match(campaignUi, /action:\s*"DISPATCH"/);
assert.match(campaignUi, /"PAUSED"/);
assert.match(campaignUi, /"CANCELLED"/);
assert.match(sequenceUi, /\/api\/email\/sequences/);
assert.match(sequenceUi, /action:\s*"ENROLL"/);
assert.match(sequenceUi, /"PAUSED"/);
assert.match(sequenceUi, /"ARCHIVED"/);

console.log("email E6 campaigns/sequences exit-gate contracts: PASS");

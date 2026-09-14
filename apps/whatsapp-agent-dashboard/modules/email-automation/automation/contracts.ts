export const EMAIL_AUTOMATION_TRIGGERS = [
  "NEW_LEAD",
  "CONTACT_CREATED",
  "FORM_SUBMITTED",
  "STAGE_CHANGED",
  "TAG_ADDED",
  "FOLLOW_UP_DUE",
  "PAYMENT_PENDING",
  "PAYMENT_PAID",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_REMINDER",
  "NO_REPLY",
  "SCHEDULE",
  "WEBHOOK",
  "EMAIL_RECEIVED",
  "EMAIL_REPLIED",
  "EMAIL_BOUNCED",
] as const;
export type EmailAutomationTrigger = (typeof EMAIL_AUTOMATION_TRIGGERS)[number];

export const EMAIL_AUTOMATION_ACTIONS = [
  "SEND_EMAIL",
  "WAIT",
  "CONDITION",
  "ADD_TAG",
  "REMOVE_TAG",
  "UPDATE_STAGE",
  "ASSIGN_COUNSELOR",
  "CREATE_TASK",
  "HUMAN_HANDOFF",
  "END",
] as const;
export type EmailAutomationAction = (typeof EMAIL_AUTOMATION_ACTIONS)[number];

export type SendEmailActionConfig = {
  templateVersionId: string;
  senderIdentityId?: string | null;
  subjectOverride?: string | null;
  replyToOverride?: string | null;
  cc?: readonly string[];
  bcc?: readonly string[];
  attachmentAssetIds?: readonly string[];
  variableBindings: Readonly<Record<string, string>>;
};

export function buildEmailAutomationIdempotencyKey(input: {
  workspaceId: string;
  automationId: string;
  automationVersion: number;
  triggerEventId: string;
  contactId: string;
  actionNodeId: string;
}): string {
  const values = [
    input.workspaceId,
    input.automationId,
    input.automationVersion,
    input.triggerEventId,
    input.contactId,
    input.actionNodeId,
  ].map((value) => String(value).trim().toLowerCase());

  if (values.some((value) => !value)) {
    throw new Error("Email automation idempotency key contains an empty component.");
  }
  return `email:auto:${values.join(":")}`;
}

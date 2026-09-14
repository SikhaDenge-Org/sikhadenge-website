export const EMAIL_PHASES = [
  {
    id: "E0",
    name: "Module Foundation and Governance",
    liveExternalDeliveryAllowed: false,
  },
  {
    id: "E1",
    name: "Gmail Connections and Multi-Sender",
    liveExternalDeliveryAllowed: false,
  },
  {
    id: "E2",
    name: "Advanced Email Template Studio",
    liveExternalDeliveryAllowed: false,
  },
  {
    id: "E3",
    name: "Manual Transactional Email",
    liveExternalDeliveryAllowed: false,
  },
  {
    id: "E4",
    name: "Lead and CRM Automation",
    liveExternalDeliveryAllowed: true,
  },
  {
    id: "E5",
    name: "Inbound Email and Unified Inbox",
    liveExternalDeliveryAllowed: true,
  },
  {
    id: "E6",
    name: "Campaigns and Lifecycle Sequences",
    liveExternalDeliveryAllowed: true,
  },
  {
    id: "E7",
    name: "Analytics and Deliverability",
    liveExternalDeliveryAllowed: true,
  },
  {
    id: "E8",
    name: "Multi-Provider Expansion",
    liveExternalDeliveryAllowed: true,
  },
] as const;

export type EmailPhaseId = (typeof EMAIL_PHASES)[number]["id"];

export const EMAIL_PHASE_DEPENDENCIES: Readonly<Record<EmailPhaseId, readonly EmailPhaseId[]>> = {
  E0: [],
  E1: ["E0"],
  E2: ["E0", "E1"],
  E3: ["E0", "E1", "E2"],
  E4: ["E0", "E1", "E2", "E3"],
  E5: ["E0", "E1", "E3"],
  E6: ["E0", "E1", "E2", "E3", "E4"],
  E7: ["E0", "E1", "E2", "E3", "E4", "E5", "E6"],
  E8: ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7"],
};

export function missingEmailPhaseDependencies(
  phase: EmailPhaseId,
  completed: ReadonlySet<EmailPhaseId>,
): EmailPhaseId[] {
  return EMAIL_PHASE_DEPENDENCIES[phase].filter((dependency) => !completed.has(dependency));
}

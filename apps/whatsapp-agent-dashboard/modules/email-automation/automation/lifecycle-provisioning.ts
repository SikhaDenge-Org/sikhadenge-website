import { prisma } from "@/lib/db/prisma";
import {
  createAutomationFlow,
  listAutomationFlowsForWorkspace,
  type AutomationTriggerType,
} from "@/lib/automation/automation-service";
import { buildEmailTemplateRuntime } from "../infrastructure/template-runtime";
import type { EmailTemplateDocument } from "../templates/blocks";

const WORKSPACE_SLUG = "sikhadenge-default";
const SUPPORT_URL = "https://sikhadenge.in/contact-us";

type LifecycleDefinition = {
  key: string;
  name: string;
  category: "LEAD_WELCOME" | "FOLLOW_UP" | "PAYMENT";
  trigger: AutomationTriggerType;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta: string;
};const DEFINITIONS: readonly LifecycleDefinition[] = [
  {
    key: "new-lead",
    name: "Lifecycle — New Lead Welcome",
    category: "LEAD_WELCOME",
    trigger: "NEW_LEAD",
    subject: "Thanks for reaching out to SikhaDenge, {{contactName}}",
    preheader: "We received your details and our team can help with the next step.",
    heading: "Your SikhaDenge journey has started",
    body: "Hi {{contactName}}, thanks for connecting with SikhaDenge. Your details have been received. If you need course, batch, admission, or payment guidance, our support team is available to help.",
    cta: "Get support",
  },
  {
    key: "form-abandoned",
    name: "Lifecycle — Form Abandonment Recovery",
    category: "FOLLOW_UP",
    trigger: "FORM_ABANDONED",
    subject: "Complete your SikhaDenge registration",
    preheader: "Your registration was started but not completed.",
    heading: "You’re almost done",
    body: "Hi {{contactName}}, you started a SikhaDenge form but did not complete it. If you faced any issue or need help choosing the right option, our team can assist you.",
    cta: "Continue with support",
  },  {
    key: "payment-pending",
    name: "Lifecycle — Payment Pending",
    category: "PAYMENT",
    trigger: "PAYMENT_PENDING",
    subject: "Your SikhaDenge payment is pending",
    preheader: "We have your payment request, but it is not marked paid yet.",
    heading: "Payment is still pending",
    body: "Hi {{contactName}}, your SikhaDenge payment is currently pending. If you already paid, please allow the payment status to update. If you need help, contact our support team before trying again.",
    cta: "Get payment help",
  },
  {
    key: "payment-abandoned",
    name: "Lifecycle — Payment Recovery",
    category: "PAYMENT",
    trigger: "PAYMENT_ABANDONED",
    subject: "Need help completing your SikhaDenge payment?",
    preheader: "Your payment was started but has not completed.",
    heading: "We can help you complete the payment",
    body: "Hi {{contactName}}, your payment process was started but is still incomplete. If you faced a technical issue or need assistance, contact SikhaDenge support and we’ll guide you through the next step.",
    cta: "Contact support",
  },  {
    key: "payment-paid",
    name: "Lifecycle — Payment Success",
    category: "PAYMENT",
    trigger: "PAYMENT_PAID",
    subject: "Payment received — welcome to SikhaDenge",
    preheader: "Your payment has been marked as received.",
    heading: "Payment received successfully",
    body: "Hi {{contactName}}, your SikhaDenge payment has been marked as received. Our team will use the confirmed payment record for the next admission or access step associated with your enrollment.",
    cta: "Contact support",
  },
];

function documentFor(item: LifecycleDefinition): EmailTemplateDocument {
  return {
    subject: item.subject,
    preheader: item.preheader,
    variables: [
      { key: "contactName", label: "Contact name", required: false, fallback: "Learner" },
    ],
    blocks: [
      { id: `${item.key}-heading`, type: "HEADING", text: item.heading, level: 1 },
      { id: `${item.key}-body`, type: "TEXT", text: item.body },
      { id: `${item.key}-button`, type: "BUTTON", label: item.cta, url: SUPPORT_URL },
      { id: `${item.key}-footer`, type: "TEXT", text: "Team SikhaDenge · support@sikhadenge.in" },
    ],
  };
}export async function provisionLifecycleEmailAutomation() {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default SikhaDenge workspace is unavailable.");

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: { workspaceId: workspace.id, isActive: true, user: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) throw new Error("No active workspace member is available for lifecycle provisioning.");

  const runtime = buildEmailTemplateRuntime();
  const existingTemplates = await runtime.service.list(workspace.id);
  const templateByName = new Map(existingTemplates.map((item) => [item.name, item]));
  const provisionedTemplates: Array<{ name: string; id: string; versionId: string; created: boolean }> = [];

  for (const item of DEFINITIONS) {
    let summary = templateByName.get(item.name);
    let created = false;
    if (!summary) {
      const detail = await runtime.service.create({
        workspaceId: workspace.id,
        name: item.name,
        category: item.category,
        document: documentFor(item),
        actorUserId: membership.userId,
      });
      summary = detail;
      created = true;
    }    const detail = await runtime.service.get({ workspaceId: workspace.id, templateId: summary.id });
    const version = detail.versions.find((candidate) => candidate.version === detail.currentVersion);
    if (!version) throw new Error(`Current template version missing for ${item.name}.`);
    provisionedTemplates.push({ name: item.name, id: detail.id, versionId: version.id, created });
  }

  const templateLookup = new Map(provisionedTemplates.map((item) => [item.name, item]));
  const existingFlows = await listAutomationFlowsForWorkspace(workspace.id, false);
  const flowNames = new Set(existingFlows.map((flow) => flow.name));
  const provisionedFlows: Array<{ name: string; flowId: string; created: boolean }> = [];

  for (const item of DEFINITIONS) {
    const template = templateLookup.get(item.name);
    if (!template) throw new Error(`Lifecycle template missing for ${item.name}.`);
    const existing = existingFlows.find((flow) => flow.name === item.name);
    if (existing || flowNames.has(item.name)) {
      const flow = existing ?? existingFlows.find((candidate) => candidate.name === item.name);
      if (flow) provisionedFlows.push({ name: item.name, flowId: flow.flowId, created: false });
      continue;
    }

    const created = await createAutomationFlow({
      workspaceId: workspace.id,
      name: item.name,
      description: `Lifecycle email flow for ${item.trigger}. Provisioned in DRAFT state.`,
      actorId: membership.userId,
      nodes: [
        { id: `${item.key}-trigger`, kind: "TRIGGER", type: item.trigger, label: item.trigger.replaceAll("_", " "), config: {} },
        { id: `${item.key}-email`, kind: "ACTION", type: "SEND_EMAIL", label: "Send lifecycle email", config: { templateId: template.id, templateVersionId: template.versionId } },
        { id: `${item.key}-end`, kind: "ACTION", type: "END", label: "End", config: {} },
      ],
    });
    flowNames.add(item.name);
    provisionedFlows.push({ name: item.name, flowId: created.flow.flowId, created: true });
  }
  return {
    workspaceId: workspace.id,
    actorUserId: membership.userId,
    templates: provisionedTemplates,
    flows: provisionedFlows,
    activated: false,
  };
}

export const LIFECYCLE_EMAIL_DEFINITIONS = DEFINITIONS;

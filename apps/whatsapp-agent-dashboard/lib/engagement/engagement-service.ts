import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";
import { listAutomationFlowsForWorkspace } from "../automation/automation-service";
import { enqueueEmailAutomationEvent, findActorEmailWorkspaceId, supersedePendingEmailAutomationEvents } from "../../modules/email-automation/automation/event-outbox";
import { enqueueWhatsAppAutomationEvent, findActorWhatsAppWorkspaceId, supersedePendingWhatsAppAutomationEvents } from "../../modules/automations/application/whatsapp-automation-event-outbox";

const FORM_EVENT = "engagement_form";
const SUBMISSION_EVENT = "engagement_submission";
const APPOINTMENT_EVENT = "engagement_appointment";
const PAYMENT_EVENT = "engagement_payment";
const FORM_ABANDON_AFTER_MINUTES = 20;
const PAYMENT_ABANDON_AFTER_MINUTES = 30;

function minutesFromNow(minutes: number) { return new Date(Date.now() + minutes * 60_000); }

export type EngagementField = {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "select" | "textarea" | "date";
  required: boolean;
  options: string[];
};

type StoredForm = {
  id: string;
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  fields: EngagementField[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type StoredSubmission = {
  id: string;
  formId: string;
  contactId: string | null;
  values: Record<string, string>;
  source: string;
  createdBy: string;
  createdAt: string;
};

type StoredAppointment = {
  id: string;
  contactId: string | null;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  ownerId: string | null;
  meetingUrl: string | null;
  notes: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type StoredPayment = {
  id: string;
  contactId: string | null;
  reference: string;
  course: string | null;
  amountMinor: number;
  currency: "INR";
  provider: string;
  providerPaymentId: string | null;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function nullable(value: unknown, maximum: number): string | null {
  const result = clean(value, maximum);
  return result || null;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function validDate(value: unknown, label: string): Date {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}

function formFields(value: unknown): EngagementField[] {
  if (!Array.isArray(value)) return [];
  const fields = value.slice(0, 30).map((item, index) => {
    const source = item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
    const allowedTypes: EngagementField["type"][] = [
      "text",
      "email",
      "phone",
      "select",
      "textarea",
      "date",
    ];
    const type = clean(source.type, 20) as EngagementField["type"];
    const options = Array.isArray(source.options)
      ? source.options.map((option) => clean(option, 80)).filter(Boolean).slice(0, 30)
      : [];
    return {
      id: clean(source.id, 80) || `field-${index + 1}`,
      label: clean(source.label, 120),
      type: allowedTypes.includes(type) ? type : "text",
      required: source.required === true,
      options,
    };
  });
  if (fields.some((field) => !field.label)) throw new Error("Every form field needs a label.");
  return fields;
}

function parseForm(payload: Prisma.JsonValue): StoredForm | null {
  const source = record(payload);
  const id = clean(source.id, 80);
  const name = clean(source.name, 120);
  if (!id || !name) return null;
  const status = clean(source.status, 20).toUpperCase() as StoredForm["status"];
  return {
    id,
    name,
    description: clean(source.description, 600),
    status: ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(status) ? status : "DRAFT",
    fields: formFields(source.fields),
    createdBy: clean(source.createdBy, 100),
    createdAt: clean(source.createdAt, 40),
    updatedAt: clean(source.updatedAt, 40),
  };
}

function parseSubmission(payload: Prisma.JsonValue): StoredSubmission | null {
  const source = record(payload);
  const id = clean(source.id, 80);
  const formId = clean(source.formId, 80);
  if (!id || !formId) return null;
  const rawValues = record(source.values as Prisma.JsonValue);
  const values = Object.fromEntries(
    Object.entries(rawValues)
      .slice(0, 50)
      .map(([key, value]) => [clean(key, 80), clean(value, 2_000)])
      .filter(([key]) => Boolean(key)),
  );
  return {
    id,
    formId,
    contactId: nullable(source.contactId, 100),
    values,
    source: clean(source.source, 100),
    createdBy: clean(source.createdBy, 100),
    createdAt: clean(source.createdAt, 40),
  };
}

function parseAppointment(payload: Prisma.JsonValue): StoredAppointment | null {
  const source = record(payload);
  const id = clean(source.id, 80);
  const title = clean(source.title, 160);
  if (!id || !title) return null;
  const status = clean(source.status, 20).toUpperCase() as StoredAppointment["status"];
  return {
    id,
    contactId: nullable(source.contactId, 100),
    title,
    scheduledAt: clean(source.scheduledAt, 40),
    durationMinutes: integer(source.durationMinutes, 30, 10, 480),
    ownerId: nullable(source.ownerId, 100),
    meetingUrl: nullable(source.meetingUrl, 500),
    notes: nullable(source.notes, 2_000),
    status: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(status)
      ? status
      : "SCHEDULED",
    createdBy: clean(source.createdBy, 100),
    createdAt: clean(source.createdAt, 40),
    updatedAt: clean(source.updatedAt, 40),
  };
}

function parsePayment(payload: Prisma.JsonValue): StoredPayment | null {
  const source = record(payload);
  const id = clean(source.id, 80);
  const reference = clean(source.reference, 160);
  if (!id || !reference) return null;
  const status = clean(source.status, 20).toUpperCase() as StoredPayment["status"];
  return {
    id,
    contactId: nullable(source.contactId, 100),
    reference,
    course: nullable(source.course, 160),
    amountMinor: integer(source.amountMinor, 0, 0, 100_000_000_00),
    currency: "INR",
    provider: clean(source.provider, 80) || "Manual",
    providerPaymentId: nullable(source.providerPaymentId, 160),
    status: ["PENDING", "PAID", "FAILED", "REFUNDED"].includes(status) ? status : "PENDING",
    notes: nullable(source.notes, 2_000),
    createdBy: clean(source.createdBy, 100),
    createdAt: clean(source.createdAt, 40),
    updatedAt: clean(source.updatedAt, 40),
  };
}

async function listEvents(eventType: string, take = 200) {
  return prisma.webhookEvent.findMany({
    where: { eventType },
    orderBy: { receivedAt: "desc" },
    take,
    select: { id: true, eventKey: true, payload: true, receivedAt: true },
  });
}

export async function getEngagementOverview() {
  const [formEvents, submissionEvents, appointmentEvents, paymentEvents, contacts, users] =
    await Promise.all([
      listEvents(FORM_EVENT),
      listEvents(SUBMISSION_EVENT),
      listEvents(APPOINTMENT_EVENT),
      listEvents(PAYMENT_EVENT),
      prisma.whatsAppContact.findMany({
        orderBy: { updatedAt: "desc" },
        take: 500,
        select: { id: true, displayName: true, profileName: true, phone: true },
      }),
      prisma.dashboardUser.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      }),
    ]);
  const forms = formEvents.map((event) => parseForm(event.payload)).filter(Boolean) as StoredForm[];
  const submissions = submissionEvents
    .map((event) => parseSubmission(event.payload))
    .filter(Boolean) as StoredSubmission[];
  const appointments = appointmentEvents
    .map((event) => parseAppointment(event.payload))
    .filter(Boolean) as StoredAppointment[];
  const payments = paymentEvents
    .map((event) => parsePayment(event.payload))
    .filter(Boolean) as StoredPayment[];
  const paidMinor = payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  return {
    forms,
    submissions,
    appointments,
    payments,
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.displayName || contact.profileName || contact.phone,
      phone: contact.phone,
    })),
    users,
    metrics: {
      activeForms: forms.filter((form) => form.status === "ACTIVE").length,
      submissions: submissions.length,
      upcomingAppointments: appointments.filter(
        (appointment) => appointment.status === "SCHEDULED" && new Date(appointment.scheduledAt) > new Date(),
      ).length,
      pendingPayments: payments.filter((payment) => payment.status === "PENDING").length,
      paidMinor,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function createEngagementForm(input: {
  name: unknown;
  description?: unknown;
  status?: unknown;
  fields?: unknown;
  actorId: string;
}) {
  const name = clean(input.name, 120);
  if (name.length < 3) throw new Error("Form name must contain at least 3 characters.");
  const statusRaw = clean(input.status, 20).toUpperCase();
  const status: StoredForm["status"] = ["DRAFT", "ACTIVE", "PAUSED"].includes(statusRaw)
    ? (statusRaw as StoredForm["status"])
    : "DRAFT";
  const now = new Date().toISOString();
  const form: StoredForm = {
    id: randomUUID(),
    name,
    description: clean(input.description, 600),
    status,
    fields: formFields(input.fields),
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
  };
  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: `engagement-form:${form.id}`,
        eventType: FORM_EVENT,
        payload: toJson(form),
        processedAt: new Date(),
        attemptCount: 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "ENGAGEMENT_FORM_CREATED",
        entityType: "EngagementForm",
        entityId: form.id,
        after: toJson({ name: form.name, status: form.status, fieldCount: form.fields.length }),
      },
    }),
  ]);
  return form;
}

export async function recordFormStarted(input: {
  formId: unknown; contactId: unknown; sessionId: unknown; source?: unknown; actorId: string;
}) {
  const formId = clean(input.formId, 80); const contactId = clean(input.contactId, 100); const sessionId = clean(input.sessionId, 120);
  if (!formId || !contactId || !sessionId) throw new Error("Form lifecycle identifiers are required.");
  const [formEvent, contact, emailWorkspaceId, whatsappWorkspaceId] = await Promise.all([
    prisma.webhookEvent.findUnique({ where: { eventKey: `engagement-form:${formId}` } }),
    prisma.whatsAppContact.findUnique({ where: { id: contactId }, select: { id: true, email: true } }),
    findActorEmailWorkspaceId(input.actorId),
    findActorWhatsAppWorkspaceId(input.actorId),
  ]);
  const form = formEvent ? parseForm(formEvent.payload) : null; if (!form || !contact) throw new Error("Form session context is invalid.");
  if (!emailWorkspaceId && !whatsappWorkspaceId) return { tracked: false, reason: "WORKSPACE_NOT_FOUND" };
  const source = clean(input.source, 100) || "Website";
  return prisma.$transaction(async (tx) => {
    let recoveryEventId: string | null = null;
    let recoveryAvailableAt: Date | null = null;
    if (emailWorkspaceId) {
      await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-form-start:${formId}:${sessionId}`,trigger:"FORM_STARTED",contactId,payload:{formId,sessionId,source,email:contact.email}});
      const recovery=await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-form-abandon:${formId}:${sessionId}`,trigger:"FORM_ABANDONED",contactId,availableAt:minutesFromNow(FORM_ABANDON_AFTER_MINUTES),payload:{formId,sessionId,source,email:contact.email,abandonAfterMinutes:FORM_ABANDON_AFTER_MINUTES}});
      recoveryEventId = recovery.id;
      recoveryAvailableAt = recovery.availableAt;
    }
    if (whatsappWorkspaceId) {
      await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-form-start:${formId}:${sessionId}`,trigger:"FORM_STARTED",contactId,payload:{formId,sessionId,source}});
      const recovery=await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-form-abandon:${formId}:${sessionId}`,trigger:"FORM_ABANDONED",contactId,availableAt:minutesFromNow(FORM_ABANDON_AFTER_MINUTES),payload:{formId,sessionId,source,abandonAfterMinutes:FORM_ABANDON_AFTER_MINUTES}});
      recoveryEventId = recoveryEventId ?? recovery.id;
      recoveryAvailableAt = recoveryAvailableAt ?? recovery.availableAt;
    }
    await tx.auditLog.create({data:{actorId:input.actorId,action:"ENGAGEMENT_FORM_STARTED",entityType:"EngagementFormSession",entityId:sessionId,after:toJson({formId,contactId,source,recoveryEventId})}});
    return { tracked:true, recoveryEventId, availableAt:recoveryAvailableAt };
  });
}

export async function createFormSubmission(input: {
  formId: unknown;
  contactId?: unknown;
  values?: unknown;
  source?: unknown;
  actorId: string;
}) {
  const formId = clean(input.formId, 80);
  const formEvent = await prisma.webhookEvent.findUnique({
    where: { eventKey: `engagement-form:${formId}` },
  });
  const form = formEvent ? parseForm(formEvent.payload) : null;
  if (!form || form.status === "ARCHIVED") throw new Error("Form is not available.");
  const sourceValues = record(input.values as Prisma.JsonValue);
  const values = Object.fromEntries(
    Object.entries(sourceValues)
      .slice(0, 50)
      .map(([key, value]) => [clean(key, 80), clean(value, 2_000)])
      .filter(([key]) => Boolean(key)),
  );
  for (const field of form.fields.filter((item) => item.required)) {
    if (!values[field.id]) throw new Error(`${field.label} is required.`);
  }
  const emailWorkspaceId = await findActorEmailWorkspaceId(input.actorId);
  const whatsappWorkspaceId = await findActorWhatsAppWorkspaceId(input.actorId);
  const submission: StoredSubmission = {
    id: randomUUID(),
    formId,
    contactId: nullable(input.contactId, 100),
    values,
    source: clean(input.source, 100) || "Dashboard",
    createdBy: input.actorId,
    createdAt: new Date().toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({
      data: {
        eventKey: `engagement-submission:${submission.id}`,
        eventType: SUBMISSION_EVENT,
        payload: toJson(submission),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    if (emailWorkspaceId) {
      if (submission.contactId) await supersedePendingEmailAutomationEvents(tx,{workspaceId:emailWorkspaceId,trigger:"FORM_ABANDONED",contactId:submission.contactId,sourceEventIdPrefix:`engagement-form-abandon:${formId}:`});
      await enqueueEmailAutomationEvent(tx, {
        workspaceId: emailWorkspaceId,
        sourceEventId: `engagement-submission:${submission.id}`,
        trigger: "FORM_SUBMITTED",
        contactId: submission.contactId,
        submissionId: submission.id,
        payload: { formId, contactId: submission.contactId, values, source: submission.source },
      });
    }
    if (whatsappWorkspaceId) {
      if (submission.contactId) await supersedePendingWhatsAppAutomationEvents(tx,{workspaceId:whatsappWorkspaceId,trigger:"FORM_ABANDONED",contactId:submission.contactId,sourceEventIdPrefix:`engagement-form-abandon:${formId}:`});
      await enqueueWhatsAppAutomationEvent(tx, {
        workspaceId: whatsappWorkspaceId,
        sourceEventId: `engagement-submission:${submission.id}`,
        trigger: "FORM_SUBMITTED",
        contactId: submission.contactId,
        payload: { formId, contactId: submission.contactId, values, source: submission.source },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "ENGAGEMENT_FORM_SUBMITTED",
        entityType: "EngagementSubmission",
        entityId: submission.id,
        after: toJson({ formId, contactId: submission.contactId, fieldCount: Object.keys(values).length }),
      },
    });
  });
  return submission;
}

export async function createAppointment(input: {
  contactId?: unknown;
  title: unknown;
  scheduledAt: unknown;
  durationMinutes?: unknown;
  ownerId?: unknown;
  meetingUrl?: unknown;
  notes?: unknown;
  actorId: string;
}) {
  const title = clean(input.title, 160);
  if (title.length < 3) throw new Error("Appointment title is required.");
  const scheduledAt = validDate(input.scheduledAt, "Appointment time");
  const ownerId = nullable(input.ownerId, 100);
  if (ownerId) {
    const owner = await prisma.dashboardUser.findFirst({ where: { id: ownerId, isActive: true }, select: { id: true } });
    if (!owner) throw new Error("Appointment owner is invalid.");
  }
  const now = new Date().toISOString();
  const appointment: StoredAppointment = {
    id: randomUUID(),
    contactId: nullable(input.contactId, 100),
    title,
    scheduledAt: scheduledAt.toISOString(),
    durationMinutes: integer(input.durationMinutes, 30, 10, 480),
    ownerId,
    meetingUrl: nullable(input.meetingUrl, 500),
    notes: nullable(input.notes, 2_000),
    status: "SCHEDULED",
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
  };
  const emailWorkspaceId = appointment.contactId ? await findActorEmailWorkspaceId(input.actorId) : null;
  const whatsappWorkspaceId = appointment.contactId ? await findActorWhatsAppWorkspaceId(input.actorId) : null;
  const reminderFlows = emailWorkspaceId
    ? (await listAutomationFlowsForWorkspace(emailWorkspaceId, false)).filter((flow) => {
        if (flow.status !== "ACTIVE") return false;
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
        if (!trigger || trigger.type !== "APPOINTMENT_REMINDER") return false;
        const minutes = Number(trigger.config.reminderMinutesBefore);
        return Number.isFinite(minutes) && minutes >= 1 && minutes <= 43_200;
      })
    : [];
  const whatsappReminderFlows = whatsappWorkspaceId
    ? (await listAutomationFlowsForWorkspace(whatsappWorkspaceId, false)).filter((flow) => {
        if (flow.status !== "ACTIVE") return false;
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
        if (!trigger || trigger.type !== "APPOINTMENT_REMINDER") return false;
        const minutes = Number(trigger.config.reminderMinutesBefore);
        return Number.isFinite(minutes) && minutes >= 1 && minutes <= 43_200;
      })
    : [];
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({
      data: {
        eventKey: `engagement-appointment:${appointment.id}`,
        eventType: APPOINTMENT_EVENT,
        payload: toJson(appointment),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "APPOINTMENT_CREATED",
        entityType: "EngagementAppointment",
        entityId: appointment.id,
        after: toJson({ title, scheduledAt: appointment.scheduledAt, ownerId }),
      },
    });
    if (emailWorkspaceId && appointment.contactId) {
      await enqueueEmailAutomationEvent(tx, {
        workspaceId: emailWorkspaceId,
        sourceEventId: `engagement-appointment:${appointment.id}`,
        trigger: "APPOINTMENT_CREATED",
        contactId: appointment.contactId,
        payload: { appointmentId: appointment.id, title: appointment.title, scheduledAt: appointment.scheduledAt, ownerId: appointment.ownerId },
      });
    }
    if (emailWorkspaceId && appointment.contactId) {
      for (const flow of reminderFlows) {
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER" && node.type === "APPOINTMENT_REMINDER");
        const minutes = Number(trigger?.config.reminderMinutesBefore);
        if (!trigger || !Number.isFinite(minutes) || minutes < 1 || minutes > 43_200) continue;
        const requestedAt = new Date(scheduledAt.getTime() - minutes * 60_000);
        const availableAt = requestedAt.getTime() > Date.now() ? requestedAt : new Date();
        await enqueueEmailAutomationEvent(tx, {
          workspaceId: emailWorkspaceId,
          sourceEventId: `engagement-appointment-reminder:${appointment.id}:${flow.flowId}:${flow.version}`,
          trigger: "APPOINTMENT_REMINDER",
          contactId: appointment.contactId,
          availableAt,
          payload: {
            appointmentId: appointment.id,
            title: appointment.title,
            scheduledAt: appointment.scheduledAt,
            ownerId: appointment.ownerId,
            reminderMinutesBefore: minutes,
            targetFlowId: flow.flowId,
            targetFlowVersion: flow.version,
          },
        });
      }
    }
    if (whatsappWorkspaceId && appointment.contactId) {
      await enqueueWhatsAppAutomationEvent(tx, {
        workspaceId: whatsappWorkspaceId,
        sourceEventId: `engagement-appointment:${appointment.id}`,
        trigger: "APPOINTMENT_CREATED",
        contactId: appointment.contactId,
        payload: { appointmentId: appointment.id, title: appointment.title, scheduledAt: appointment.scheduledAt, ownerId: appointment.ownerId },
      });
      for (const flow of whatsappReminderFlows) {
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER" && node.type === "APPOINTMENT_REMINDER");
        const minutes = Number(trigger?.config.reminderMinutesBefore);
        if (!trigger || !Number.isFinite(minutes) || minutes < 1 || minutes > 43_200) continue;
        const requestedAt = new Date(scheduledAt.getTime() - minutes * 60_000);
        const availableAt = requestedAt.getTime() > Date.now() ? requestedAt : new Date();
        await enqueueWhatsAppAutomationEvent(tx, {
          workspaceId: whatsappWorkspaceId,
          sourceEventId: `engagement-appointment-reminder:${appointment.id}:${flow.flowId}:${flow.version}`,
          trigger: "APPOINTMENT_REMINDER",
          contactId: appointment.contactId,
          availableAt,
          payload: {
            appointmentId: appointment.id,
            title: appointment.title,
            scheduledAt: appointment.scheduledAt,
            ownerId: appointment.ownerId,
            reminderMinutesBefore: minutes,
            targetFlowId: flow.flowId,
            targetFlowVersion: flow.version,
          },
        });
      }
    }
  });
  return appointment;
}

export async function updateAppointment(input: {
  appointmentId: string;
  status: unknown;
  actorId: string;
}) {
  const event = await prisma.webhookEvent.findUnique({
    where: { eventKey: `engagement-appointment:${input.appointmentId}` },
  });
  const appointment = event ? parseAppointment(event.payload) : null;
  if (!event || !appointment) throw new Error("Appointment not found.");
  const status = clean(input.status, 20).toUpperCase() as StoredAppointment["status"];
  if (!["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(status)) {
    throw new Error("Appointment status is invalid.");
  }
  const updated = { ...appointment, status, updatedAt: new Date().toISOString() };
  const emailWorkspaceId = appointment.contactId ? await findActorEmailWorkspaceId(input.actorId) : null;
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "APPOINTMENT_STATUS_UPDATED",
        entityType: "EngagementAppointment",
        entityId: appointment.id,
        before: toJson({ status: appointment.status }),
        after: toJson({ status }),
      },
    });
    if (emailWorkspaceId && status !== "SCHEDULED") {
      await supersedePendingEmailAutomationEvents(tx, {
        workspaceId: emailWorkspaceId,
        trigger: "APPOINTMENT_REMINDER",
        sourceEventIdPrefix: `engagement-appointment-reminder:${appointment.id}:`,
      });
    }
  });
  return updated;
}

export async function createPaymentRecord(input: {
  contactId?: unknown;
  reference: unknown;
  course?: unknown;
  amount?: unknown;
  provider?: unknown;
  providerPaymentId?: unknown;
  status?: unknown;
  notes?: unknown;
  actorId: string;
}) {
  const reference = clean(input.reference, 160);
  if (reference.length < 3) throw new Error("Payment reference is required.");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    throw new Error("Payment amount is invalid.");
  }
  const statusRaw = clean(input.status, 20).toUpperCase();
  const status: StoredPayment["status"] = ["PENDING", "PAID", "FAILED", "REFUNDED"].includes(statusRaw)
    ? (statusRaw as StoredPayment["status"])
    : "PENDING";
  const now = new Date().toISOString();
  const payment: StoredPayment = {
    id: randomUUID(),
    contactId: nullable(input.contactId, 100),
    reference,
    course: nullable(input.course, 160),
    amountMinor: Math.round(amount * 100),
    currency: "INR",
    provider: clean(input.provider, 80) || "Manual",
    providerPaymentId: nullable(input.providerPaymentId, 160),
    status,
    notes: nullable(input.notes, 2_000),
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
  };
  const emailWorkspaceId = payment.contactId ? await findActorEmailWorkspaceId(input.actorId) : null;
  const whatsappWorkspaceId = payment.contactId ? await findActorWhatsAppWorkspaceId(input.actorId) : null;
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({
      data: {
        eventKey: `engagement-payment:${payment.id}`,
        eventType: PAYMENT_EVENT,
        payload: toJson(payment),
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_RECORD_CREATED",
        entityType: "EngagementPayment",
        entityId: payment.id,
        after: toJson({ reference, amountMinor: payment.amountMinor, status, provider: payment.provider }),
      },
    });
    if (emailWorkspaceId && payment.contactId && (status === "PENDING" || status === "PAID")) {
      if(status === "PAID") await supersedePendingEmailAutomationEvents(tx,{workspaceId:emailWorkspaceId,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId});
      if(status === "PENDING") await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-checkout:${payment.id}:created`,trigger:"CHECKOUT_STARTED",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider}});
      await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-payment:${payment.id}:created`,trigger:status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_PENDING",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,status:payment.status,provider:payment.provider}});
      if(status === "PENDING") await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-payment-abandon:${payment.id}`,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId,availableAt:minutesFromNow(PAYMENT_ABANDON_AFTER_MINUTES),payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider,abandonAfterMinutes:PAYMENT_ABANDON_AFTER_MINUTES}});
    }
    if (whatsappWorkspaceId && payment.contactId && (status === "PENDING" || status === "PAID")) {
      if(status === "PAID") await supersedePendingWhatsAppAutomationEvents(tx,{workspaceId:whatsappWorkspaceId,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId});
      if(status === "PENDING") await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-checkout:${payment.id}:created`,trigger:"CHECKOUT_STARTED",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider}});
      await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-payment:${payment.id}:created`,trigger:status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_PENDING",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,status:payment.status,provider:payment.provider}});
      if(status === "PENDING") await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-payment-abandon:${payment.id}`,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId,availableAt:minutesFromNow(PAYMENT_ABANDON_AFTER_MINUTES),payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider,abandonAfterMinutes:PAYMENT_ABANDON_AFTER_MINUTES}});
    }
  });
  return payment;
}

export async function updatePaymentRecord(input: {
  paymentId: string;
  status: unknown;
  providerPaymentId?: unknown;
  actorId: string;
}) {
  const event = await prisma.webhookEvent.findUnique({
    where: { eventKey: `engagement-payment:${input.paymentId}` },
  });
  const payment = event ? parsePayment(event.payload) : null;
  if (!event || !payment) throw new Error("Payment record not found.");
  const status = clean(input.status, 20).toUpperCase() as StoredPayment["status"];
  if (!["PENDING", "PAID", "FAILED", "REFUNDED"].includes(status)) {
    throw new Error("Payment status is invalid.");
  }
  const updated = {
    ...payment,
    status,
    providerPaymentId: nullable(input.providerPaymentId, 160) ?? payment.providerPaymentId,
    updatedAt: new Date().toISOString(),
  };
  const emailWorkspaceId = payment.contactId && status !== payment.status ? await findActorEmailWorkspaceId(input.actorId) : null;
  const whatsappWorkspaceId = payment.contactId && status !== payment.status ? await findActorWhatsAppWorkspaceId(input.actorId) : null;
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_STATUS_UPDATED",
        entityType: "EngagementPayment",
        entityId: payment.id,
        before: toJson({ status: payment.status }),
        after: toJson({ status, providerPaymentId: updated.providerPaymentId }),
      },
    });
    if (emailWorkspaceId && payment.contactId && (status === "PENDING" || status === "PAID")) {
      if(status === "PAID") await supersedePendingEmailAutomationEvents(tx,{workspaceId:emailWorkspaceId,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId});
      await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-payment:${payment.id}:status:${payment.updatedAt}:${status}`,trigger:status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_PENDING",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,previousStatus:payment.status,status,provider:payment.provider,providerPaymentId:updated.providerPaymentId}});
      if(status === "PENDING") await enqueueEmailAutomationEvent(tx,{workspaceId:emailWorkspaceId,sourceEventId:`engagement-payment-abandon:${payment.id}:${updated.updatedAt}`,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId,availableAt:minutesFromNow(PAYMENT_ABANDON_AFTER_MINUTES),payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider,abandonAfterMinutes:PAYMENT_ABANDON_AFTER_MINUTES}});
    }
    if (whatsappWorkspaceId && payment.contactId && (status === "PENDING" || status === "PAID")) {
      if(status === "PAID") await supersedePendingWhatsAppAutomationEvents(tx,{workspaceId:whatsappWorkspaceId,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId});
      await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-payment:${payment.id}:status:${payment.updatedAt}:${status}`,trigger:status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_PENDING",contactId:payment.contactId,payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,previousStatus:payment.status,status,provider:payment.provider,providerPaymentId:updated.providerPaymentId}});
      if(status === "PENDING") await enqueueWhatsAppAutomationEvent(tx,{workspaceId:whatsappWorkspaceId,sourceEventId:`engagement-payment-abandon:${payment.id}:${updated.updatedAt}`,trigger:"PAYMENT_ABANDONED",contactId:payment.contactId,availableAt:minutesFromNow(PAYMENT_ABANDON_AFTER_MINUTES),payload:{paymentId:payment.id,reference:payment.reference,course:payment.course,amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider,abandonAfterMinutes:PAYMENT_ABANDON_AFTER_MINUTES}});
    }
  });
  return updated;
}

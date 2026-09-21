import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma";

const FORM_EVENT = "engagement_form";
const SUBMISSION_EVENT = "engagement_submission";
const APPOINTMENT_EVENT = "engagement_appointment";
const PAYMENT_EVENT = "engagement_payment";

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
  const submission: StoredSubmission = {
    id: randomUUID(),
    formId,
    contactId: nullable(input.contactId, 100),
    values,
    source: clean(input.source, 100) || "Dashboard",
    createdBy: input.actorId,
    createdAt: new Date().toISOString(),
  };
  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: `engagement-submission:${submission.id}`,
        eventType: SUBMISSION_EVENT,
        payload: toJson(submission),
        processedAt: new Date(),
        attemptCount: 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "ENGAGEMENT_FORM_SUBMITTED",
        entityType: "EngagementSubmission",
        entityId: submission.id,
        after: toJson({ formId, contactId: submission.contactId, fieldCount: Object.keys(values).length }),
      },
    }),
  ]);
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
  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: `engagement-appointment:${appointment.id}`,
        eventType: APPOINTMENT_EVENT,
        payload: toJson(appointment),
        processedAt: new Date(),
        attemptCount: 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "APPOINTMENT_CREATED",
        entityType: "EngagementAppointment",
        entityId: appointment.id,
        after: toJson({ title, scheduledAt: appointment.scheduledAt, ownerId }),
      },
    }),
  ]);
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
  await prisma.$transaction([
    prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "APPOINTMENT_STATUS_UPDATED",
        entityType: "EngagementAppointment",
        entityId: appointment.id,
        before: toJson({ status: appointment.status }),
        after: toJson({ status }),
      },
    }),
  ]);
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
  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: {
        eventKey: `engagement-payment:${payment.id}`,
        eventType: PAYMENT_EVENT,
        payload: toJson(payment),
        processedAt: new Date(),
        attemptCount: 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_RECORD_CREATED",
        entityType: "EngagementPayment",
        entityId: payment.id,
        after: toJson({ reference, amountMinor: payment.amountMinor, status, provider: payment.provider }),
      },
    }),
  ]);
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
  await prisma.$transaction([
    prisma.webhookEvent.update({ where: { id: event.id }, data: { payload: toJson(updated) } }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_STATUS_UPDATED",
        entityType: "EngagementPayment",
        entityId: payment.id,
        before: toJson({ status: payment.status }),
        after: toJson({ status, providerPaymentId: updated.providerPaymentId }),
      },
    }),
  ]);
  return updated;
}

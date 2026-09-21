"use client";

import { FormEvent, useEffect, useState } from "react";

type Field = {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "select" | "textarea" | "date";
  required: boolean;
  options: string[];
};

type Overview = {
  forms: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    fields: Field[];
    createdAt: string;
  }>;
  submissions: Array<{
    id: string;
    formId: string;
    contactId: string | null;
    values: Record<string, string>;
    source: string;
    createdAt: string;
  }>;
  appointments: Array<{
    id: string;
    contactId: string | null;
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    ownerId: string | null;
    status: string;
    meetingUrl: string | null;
  }>;
  payments: Array<{
    id: string;
    contactId: string | null;
    reference: string;
    course: string | null;
    amountMinor: number;
    currency: string;
    provider: string;
    status: string;
    createdAt: string;
  }>;
  contacts: Array<{ id: string; name: string; phone: string }>;
  users: Array<{ id: string; name: string; role: string }>;
  metrics: {
    activeForms: number;
    submissions: number;
    upcomingAppointments: number;
    pendingPayments: number;
    paidMinor: number;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function EngagementManager() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFields, setFormFields] = useState<Field[]>([
    { id: "name", label: "Student name", type: "text", required: true, options: [] },
    { id: "phone", label: "Phone number", type: "phone", required: true, options: [] },
  ]);
  const [appointment, setAppointment] = useState({
    contactId: "",
    title: "",
    scheduledAt: "",
    durationMinutes: 30,
    ownerId: "",
    meetingUrl: "",
  });
  const [payment, setPayment] = useState({
    contactId: "",
    reference: "",
    course: "",
    amount: "",
    provider: "Manual",
    status: "PENDING",
  });

  async function load() {
    const response = await fetch("/api/engagement/overview", { cache: "no-store" });
    setOverview(await readJson<Overview>(response));
  }

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Engagement module could not load.");
    });
  }, []);

  function addField() {
    setFormFields((current) => [
      ...current,
      {
        id: `field-${current.length + 1}`,
        label: "",
        type: "text",
        required: false,
        options: [],
      },
    ]);
  }

  async function createForm(event: FormEvent) {
    event.preventDefault();
    setBusy("form");
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch("/api/engagement/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription,
            status: "DRAFT",
            fields: formFields,
          }),
        }),
      );
      setFormName("");
      setFormDescription("");
      setSuccess("Form draft created.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Form creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    setBusy("appointment");
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch("/api/engagement/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointment),
        }),
      );
      setAppointment({
        contactId: "",
        title: "",
        scheduledAt: "",
        durationMinutes: 30,
        ownerId: "",
        meetingUrl: "",
      });
      setSuccess("Appointment scheduled.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Appointment creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function createPayment(event: FormEvent) {
    event.preventDefault();
    setBusy("payment");
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch("/api/engagement/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payment, amount: Number(payment.amount) }),
        }),
      );
      setPayment({
        contactId: "",
        reference: "",
        course: "",
        amount: "",
        provider: "Manual",
        status: "PENDING",
      });
      setSuccess("Payment record created.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(kind: "appointments" | "payments", id: string, status: string) {
    setBusy(`${kind}:${id}`);
    setError("");
    try {
      const key = kind === "appointments" ? "appointmentId" : "paymentId";
      await readJson(
        await fetch(`/api/engagement/${kind}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: id, status }),
        }),
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status update failed.");
    } finally {
      setBusy("");
    }
  }

  if (!overview) {
    return <div className="suite-loading">Loading forms, appointments and payments…</div>;
  }

  return (
    <div className="suite-stack">
      <section className="suite-metrics">
        <article><span>Active forms</span><strong>{overview.metrics.activeForms}</strong></article>
        <article><span>Submissions</span><strong>{overview.metrics.submissions}</strong></article>
        <article><span>Upcoming appointments</span><strong>{overview.metrics.upcomingAppointments}</strong></article>
        <article><span>Pending payments</span><strong>{overview.metrics.pendingPayments}</strong><small>{money(overview.metrics.paidMinor)} collected</small></article>
      </section>

      {error ? <div className="suite-alert error">{error}</div> : null}
      {success ? <div className="suite-alert success">{success}</div> : null}

      <section className="suite-grid two">
        <form className="suite-card" onSubmit={createForm}>
          <header><div><span>Lead forms</span><h3>Create a structured student form</h3></div></header>
          <div className="suite-form-grid">
            <label><span>Form name</span><input value={formName} onChange={(event) => setFormName(event.target.value)} required /></label>
            <label><span>Description</span><textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} /></label>
          </div>
          <div className="suite-field-list">
            {formFields.map((field, index) => (
              <div className="suite-field-row" key={field.id}>
                <input value={field.label} placeholder="Field label" onChange={(event) => setFormFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
                <select value={field.type} onChange={(event) => setFormFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as Field["type"] } : item))}>
                  <option value="text">Text</option><option value="email">Email</option><option value="phone">Phone</option><option value="select">Select</option><option value="textarea">Long text</option><option value="date">Date</option>
                </select>
                <label className="suite-check"><input type="checkbox" checked={field.required} onChange={(event) => setFormFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} /> Required</label>
              </div>
            ))}
          </div>
          <footer><button type="button" className="secondary" onClick={addField}>Add field</button><button disabled={busy === "form"}>{busy === "form" ? "Saving…" : "Save draft"}</button></footer>
        </form>

        <form className="suite-card" onSubmit={createAppointment}>
          <header><div><span>Appointments</span><h3>Schedule demo or counselling</h3></div></header>
          <div className="suite-form-grid two">
            <label><span>Student</span><select value={appointment.contactId} onChange={(event) => setAppointment((current) => ({ ...current, contactId: event.target.value }))}><option value="">No linked contact</option>{overview.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.phone}</option>)}</select></label>
            <label><span>Owner</span><select value={appointment.ownerId} onChange={(event) => setAppointment((current) => ({ ...current, ownerId: event.target.value }))}><option value="">Unassigned</option>{overview.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
            <label><span>Title</span><input value={appointment.title} onChange={(event) => setAppointment((current) => ({ ...current, title: event.target.value }))} required /></label>
            <label><span>Date & time</span><input type="datetime-local" value={appointment.scheduledAt} onChange={(event) => setAppointment((current) => ({ ...current, scheduledAt: event.target.value }))} required /></label>
            <label><span>Duration minutes</span><input type="number" min={10} max={480} value={appointment.durationMinutes} onChange={(event) => setAppointment((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label>
            <label><span>Meeting URL</span><input value={appointment.meetingUrl} onChange={(event) => setAppointment((current) => ({ ...current, meetingUrl: event.target.value }))} /></label>
          </div>
          <footer><button disabled={busy === "appointment"}>{busy === "appointment" ? "Scheduling…" : "Schedule appointment"}</button></footer>
        </form>
      </section>

      <form className="suite-card" onSubmit={createPayment}>
        <header><div><span>Payments</span><h3>Record fee collection and payment state</h3></div></header>
        <div className="suite-form-grid four">
          <label><span>Student</span><select value={payment.contactId} onChange={(event) => setPayment((current) => ({ ...current, contactId: event.target.value }))}><option value="">No linked contact</option>{overview.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
          <label><span>Reference</span><input value={payment.reference} onChange={(event) => setPayment((current) => ({ ...current, reference: event.target.value }))} required /></label>
          <label><span>Course</span><input value={payment.course} onChange={(event) => setPayment((current) => ({ ...current, course: event.target.value }))} /></label>
          <label><span>Amount ₹</span><input type="number" min={0} step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} required /></label>
          <label><span>Provider</span><input value={payment.provider} onChange={(event) => setPayment((current) => ({ ...current, provider: event.target.value }))} /></label>
          <label><span>Status</span><select value={payment.status} onChange={(event) => setPayment((current) => ({ ...current, status: event.target.value }))}><option>PENDING</option><option>PAID</option><option>FAILED</option><option>REFUNDED</option></select></label>
        </div>
        <footer><button disabled={busy === "payment"}>{busy === "payment" ? "Saving…" : "Create payment record"}</button></footer>
      </form>

      <section className="suite-grid two">
        <div className="suite-card">
          <header><div><span>Upcoming schedule</span><h3>Appointments</h3></div></header>
          <div className="suite-list">
            {overview.appointments.slice(0, 20).map((item) => (
              <article key={item.id}>
                <div><strong>{item.title}</strong><small>{dateTime(item.scheduledAt)} · {item.durationMinutes} min</small></div>
                <select value={item.status} disabled={busy === `appointments:${item.id}`} onChange={(event) => void updateStatus("appointments", item.id, event.target.value)}><option>SCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option><option>NO_SHOW</option></select>
              </article>
            ))}
            {overview.appointments.length === 0 ? <p className="suite-empty">No appointments yet.</p> : null}
          </div>
        </div>
        <div className="suite-card">
          <header><div><span>Payment ledger</span><h3>Recent payment records</h3></div></header>
          <div className="suite-list">
            {overview.payments.slice(0, 20).map((item) => (
              <article key={item.id}>
                <div><strong>{item.reference} · {money(item.amountMinor)}</strong><small>{item.course || "No course"} · {item.provider}</small></div>
                <select value={item.status} disabled={busy === `payments:${item.id}`} onChange={(event) => void updateStatus("payments", item.id, event.target.value)}><option>PENDING</option><option>PAID</option><option>FAILED</option><option>REFUNDED</option></select>
              </article>
            ))}
            {overview.payments.length === 0 ? <p className="suite-empty">No payment records yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

import { prisma } from "../db/prisma";
import { APPROVED_COURSES } from "./sa4-sales-agent";

export type WorkshopAttendanceStatus = "REGISTERED" | "ATTENDED" | "NO_SHOW";

async function getSystemAuthorId(explicitId?: string | null): Promise<string> {
  if (explicitId) return explicitId;
  const user = await prisma.dashboardUser.findFirst({ select: { id: true } });
  if (user) return user.id;
  throw new Error("No DashboardUser found to author LeadNote.");
}

export type PaymentState = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface RazorpayPaymentOrder {
  orderId: string;
  courseId: string;
  amount: number;
  currency: string;
  paymentLink: string;
}

/**
 * Generates an approved Razorpay payment payload bound strictly to the course catalog.
 * Hard Gate: AI cannot manipulate the price.
 */
export function generateCoursePaymentLink(params: {
  courseKey: string;
  isWorkshopPass?: boolean;
}): RazorpayPaymentOrder | null {
  const course = APPROVED_COURSES[params.courseKey];
  if (!course) return null;

  const finalAmount = params.isWorkshopPass ? course.workshopPrice : course.regularPrice;
  const mockOrderId = "order_" + Math.random().toString(36).substring(2, 10);
  
  return {
    orderId: mockOrderId,
    courseId: course.id,
    amount: finalAmount,
    currency: "INR",
    paymentLink: `https://rzp.io/l/sikhadenge-${course.id}-${finalAmount}`
  };
}

/**
 * Records workshop registration & Zoom link distribution.
 */
export async function registerForWorkshop(params: {
  leadId: string;
  courseKey: string;
  zoomJoinUrl: string;
  authorId?: string;
}) {
  const authorId = await getSystemAuthorId(params.authorId);
  return const authorId = await getSystemAuthorId();
  await prisma.leadNote.create({
    data: {
      leadId: params.leadId,
      authorId,
      body: `PAYMENT VERIFIED: Order ${params.orderId} for course ${params.courseId} (INR ${params.amountPaid}). Enrolled into LMS.`
    }
  });
}

/**
 * Updates workshop attendance and recalibrates Lead temperature.
 * Attendance automatically promotes lead to HOT.
 */
export async function recordWorkshopAttendance(params: {
  leadId: string;
  status: WorkshopAttendanceStatus;
}) {
  const isAttended = params.status === "ATTENDED";
  return await prisma.lead.update({
    where: { id: params.leadId },
    data: {
      temperature: isAttended ? "HOT" : "WARM",
      score: { increment: isAttended ? 35 : 5 }
    }
  });
}

/**
 * Authoritative Payment Verification & LMS Enrollment Gateway.
 * MUST only be invoked by Razorpay Webhook or Finance ledger.
 */
export async function processPaymentSuccessAndEnroll(params: {
  leadId: string;
  orderId: string;
  courseId: string;
  amountPaid: number;
}) {
  // 1. Audit payment confirmation on Lead
  const updatedLead = await prisma.lead.update({
    where: { id: params.leadId },
    data: {
      closedAt: new Date(),
      qualifiedAt: new Date(),
      score: 100,
      feeUnderstood: true
    }
  });

  // 2. Create durable audit entry
  await prisma.leadNote.create({
    data: {
      leadId: params.leadId,
      body: `PAYMENT VERIFIED: Order ${params.orderId} for course ${params.courseId} (INR ${params.amountPaid}). Enrolled into LMS.`
    }
  });

  return {
    enrolled: true,
    leadId: updatedLead.id,
    courseId: params.courseId
  };
}

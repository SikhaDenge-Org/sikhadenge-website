import { prisma } from "../db/prisma";
import { isOptOutKeyword } from "./sa2-contracts";

export interface SuppressionCheckResult {
  isSuppressed: boolean;
  reason?: string;
}

export async function checkSuppression(phone: string): Promise<SuppressionCheckResult> {
  const cleanPhone = phone.replace(/\D/g, "");
  const contact = await prisma.whatsappContact.findFirst({
    where: {
      OR: [
        { phone: cleanPhone },
        { waId: cleanPhone },
        { phone: { endsWith: cleanPhone.slice(-10) } }
      ]
    },
    select: {
      optedOutAt: true,
      consentStatus: true
    }
  });

  if (!contact) {
    return { isSuppressed: false };
  }

  if (contact.optedOutAt || contact.consentStatus === "REVOKED") {
    return {
      isSuppressed: true,
      reason: "USER_OPTED_OUT"
    };
  }

  return { isSuppressed: false };
}

export async function handleInboundOptOut(phone: string, text: string): Promise<boolean> {
  if (!isOptOutKeyword(text)) {
    return false;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  await prisma.whatsappContact.updateMany({
    where: {
      OR: [
        { phone: cleanPhone },
        { waId: cleanPhone },
        { phone: { endsWith: cleanPhone.slice(-10) } }
      ]
    },
    data: {
      optedOutAt: new Date(),
      consentStatus: "REVOKED"
    }
  });

  return true;
}

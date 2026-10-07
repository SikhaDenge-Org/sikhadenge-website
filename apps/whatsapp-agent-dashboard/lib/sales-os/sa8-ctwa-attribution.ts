import { prisma } from "../db/prisma";

export interface CTWAReferralPayload {
  sourceType: "ad" | "post" | "organic";
  sourceId?: string | null;      // Meta Ad ID or Post ID
  sourceUrl?: string | null;     // Ad click URL
  headline?: string | null;
  body?: string | null;
  campaignId?: string | null;    // Extracted campaign ID or UTM campaign
}

/**
 * Extracts and standardizes Meta CTWA referral object from incoming webhook payload.
 */
export function extractCTWAReferral(referral: Record<string, any> | null | undefined): CTWAReferralPayload | null {
  if (!referral) return null;

  const sourceType = referral.source_type === "ad" ? "ad" : referral.source_type === "post" ? "post" : "organic";
  const sourceId = referral.source_id || referral.ad_id || null;
  const sourceUrl = referral.source_url || null;
  const headline = referral.headline || null;
  const body = referral.body || null;

  let campaignId: string | null = referral.campaign_id || null;
  if (!campaignId && sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      campaignId = url.searchParams.get("utm_campaign") || url.searchParams.get("campaign_id");
    } catch {
      // Ignore URL parse failures
    }
  }

  return {
    sourceType,
    sourceId,
    sourceUrl,
    headline,
    body,
    campaignId
  };
}

/**
 * Attaches CTWA referral data to WhatsAppConversation.
 */
export async function attachAttributionToConversation(params: {
  conversationId: string;
  referral: CTWAReferralPayload;
}) {
  const { conversationId, referral } = params;

  return await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      source: referral.sourceType.toUpperCase(),
      campaign: referral.campaignId || referral.sourceId || "CTWA_META_DIRECT"
    },
    select: {
      id: true,
      source: true,
      campaign: true
    }
  });
}

/**
 * Aggregates revenue and conversion stats for a specific CTWA Campaign.
 */
export async function getCampaignAttributionStats(campaignKey: string) {
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { campaign: campaignKey },
    select: {
      id: true,
      lead: {
        select: {
          id: true,
          closedAt: true,
          score: true
        }
      }
    }
  });

  const totalLeads = conversations.length;
  const convertedLeads = conversations.filter(c => c.lead && c.lead.closedAt).length;

  return {
    campaign: campaignKey,
    totalLeads,
    convertedLeads,
    conversionRatePercent: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) : "0.00"
  };
}

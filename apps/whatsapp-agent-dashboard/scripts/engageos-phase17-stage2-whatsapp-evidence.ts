import { prisma } from "@/lib/db/prisma";
import { verifyMetaProviderReadOnly } from "@/lib/integrations/read-only-verifier";
import {
  listPersistedIntegrationHealth,
  persistMetaApiVerification,
  recordMetaPermissionEvidence,
} from "@/modules/integrations/infrastructure/prisma-integration-health";

const COMMIT_PHRASE = "RECORD_VERIFIED_WHATSAPP_EVIDENCE";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function graphUrl(version: string, path: string): URL {
  return new URL(`https://graph.facebook.com/${encodeURIComponent(version)}/${path}`);
}

async function getJson(url: URL, accessToken?: string): Promise<{ status: number; ok: boolean; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      body: payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {},
    };
  } finally {
    clearTimeout(timer);
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

async function main() {
  const token = required("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const businessAccountId = required("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const graphVersion = required("WHATSAPP_GRAPH_VERSION");
  const appId = required("WHATSAPP_APP_ID");
  const appSecret = required("WHATSAPP_APP_SECRET");

  const identity = await verifyMetaProviderReadOnly("META_WHATSAPP");
  console.log(`PHASE17_STAGE2_WHATSAPP_IDENTITY_HTTP=${identity.statusCode ?? "none"}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_IDENTITY_VERIFIED=${identity.verified}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_EXTERNAL_WRITE_SENT=${identity.externalWriteSent}`);
  if (!identity.verified || identity.accountReference !== phoneNumberId) {
    throw new Error(`WhatsApp identity verification failed: ${identity.reason}`);
  }

  const debugUrl = graphUrl(graphVersion, "debug_token");
  debugUrl.searchParams.set("input_token", token);
  debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const debug = await getJson(debugUrl);
  const data = debug.body.data && typeof debug.body.data === "object" && !Array.isArray(debug.body.data)
    ? debug.body.data as Record<string, unknown>
    : {};
  const scopes = stringList(data.scopes);
  const granularScopes = Array.isArray(data.granular_scopes)
    ? data.granular_scopes.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const scope = (item as Record<string, unknown>).scope;
        return typeof scope === "string" && scope.trim() ? [scope.trim()] : [];
      })
    : [];
  const allScopes = new Set([...scopes, ...granularScopes]);
  const tokenValid = debug.ok && data.is_valid === true && String(data.app_id ?? "") === appId;
  const messagingScope = allScopes.has("whatsapp_business_messaging");
  const managementScope = allScopes.has("whatsapp_business_management");
  console.log(`PHASE17_STAGE2_WHATSAPP_DEBUG_TOKEN_HTTP=${debug.status}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_TOKEN_VALID=${tokenValid}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_SCOPE_MESSAGING=${messagingScope}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_SCOPE_MANAGEMENT=${managementScope}`);
  if (!tokenValid || !messagingScope || !managementScope) {
    throw new Error("WhatsApp token does not prove the required messaging and management permissions.");
  }

  const subscriptionUrl = graphUrl(graphVersion, `${encodeURIComponent(businessAccountId)}/subscribed_apps`);
  const subscription = await getJson(subscriptionUrl, token);
  const apps = Array.isArray(subscription.body.data) ? subscription.body.data : [];
  const expectedAppSubscribed = apps.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return String((item as Record<string, unknown>).id ?? "") === appId;
  });
  console.log(`PHASE17_STAGE2_WHATSAPP_SUBSCRIBED_APPS_HTTP=${subscription.status}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_EXPECTED_APP_SUBSCRIBED=${expectedAppSubscribed}`);
  console.log("PHASE17_STAGE2_WHATSAPP_PROVIDER_WRITE_SENT=false");
  if (!subscription.ok || !expectedAppSubscribed) {
    throw new Error("WhatsApp WABA does not prove the expected Meta app webhook subscription.");
  }

  const dryRun = process.env.PHASE17_STAGE2_EVIDENCE_COMMIT?.trim() !== COMMIT_PHRASE;
  if (dryRun) {
    console.log("PHASE17_STAGE2_WHATSAPP_EVIDENCE_MODE=DRY_RUN");
    console.log("PASS: PHASE17_STAGE2_WHATSAPP_EVIDENCE_PROVIDER_GATES_VERIFIED");
    return;
  }

  await persistMetaApiVerification({
    provider: "META_WHATSAPP",
    verified: true,
    checkedAt: new Date(identity.checkedAt),
    externalAccountId: phoneNumberId,
  });
  await recordMetaPermissionEvidence({
    channel: "WHATSAPP",
    externalAccountId: phoneNumberId,
  });

  const persisted = (await listPersistedIntegrationHealth()).find(
    (item) => item.provider === "META_WHATSAPP" && item.externalAccountId === phoneNumberId,
  );
  if (!persisted) throw new Error("Persisted WhatsApp integration health was not found after evidence reconciliation.");
  if (!persisted.evidence.apiVerifiedAt || !persisted.evidence.permissionsVerified) {
    throw new Error("WhatsApp API/permission evidence failed post-write verification.");
  }

  console.log("PHASE17_STAGE2_WHATSAPP_EVIDENCE_MODE=COMMIT");
  console.log(`PHASE17_STAGE2_WHATSAPP_PERSISTED_STATUS=${persisted.status}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_WEBHOOK_REQUIRED=${persisted.evidence.webhookRequired}`);
  console.log(`PHASE17_STAGE2_WHATSAPP_WEBHOOK_VERIFIED=${Boolean(persisted.evidence.webhookVerifiedAt)}`);
  console.log("PASS: PHASE17_STAGE2_WHATSAPP_API_PERMISSION_EVIDENCE_RECORDED");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

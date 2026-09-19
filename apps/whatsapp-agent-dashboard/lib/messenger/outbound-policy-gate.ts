import { MessageDirection } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertMessengerPageIsolation } from "@/modules/channels/messenger/policy/messenger-policy";
import { evaluateMessengerResponseWindow } from "@/modules/channels/messenger/policy/messenger-window-policy";
import { listPersistedIntegrationHealth } from "@/modules/integrations/infrastructure/prisma-integration-health";

type Environment = Readonly<Record<string, string | undefined>>;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function messengerPolicyEnforcementEnabled(
  env: Environment = process.env,
): boolean {
  return enabled(env.ENGAGEOS_MESSENGER_POLICY_ENFORCED) || messengerOutboundLive(env);
}

function messengerOutboundLive(env: Environment): boolean {
  const mode = env.MESSENGER_OUTBOUND_MODE?.trim().toLowerCase();
  const killed = env.MESSENGER_OUTBOUND_KILL_SWITCH?.trim().toLowerCase() === "on";
  return mode === "live" && !killed;
}

export async function assertMessengerControlledOutboundAllowed(input: {
  conversationId: string;
  conversationPageId: string | null;
  env?: Environment;
  now?: Date;
}): Promise<void> {
  const env = input.env ?? process.env;
  if (!messengerPolicyEnforcementEnabled(env)) return;

  const configuredPageId = env.MESSENGER_PAGE_ID?.trim() || "";
  const conversationPageId = input.conversationPageId?.trim() || "";
  assertMessengerPageIsolation({
    configuredPageId,
    conversationPageId,
    outboundTextVerified: true,
    outboundPaused: false,
  });

  const health = await listPersistedIntegrationHealth();
  const capabilityVerified = health.some(
    (item) =>
      item.channel === "MESSENGER" &&
      item.externalAccountId === configuredPageId &&
      item.status === "CONNECTED",
  );

  const latestInbound = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: MessageDirection.INBOUND,
    },
    orderBy: { messageTimestamp: "desc" },
    select: { messageTimestamp: true },
  });

  const decision = evaluateMessengerResponseWindow({
    now: input.now ?? new Date(),
    lastCustomerMessageAt: latestInbound?.messageTimestamp ?? null,
    pageIsolationVerified: true,
    messagingCapabilityVerified: capabilityVerified,
    outboundPaused: !messengerOutboundLive(env),
  });
  if (!decision.allowed) throw new Error(decision.reason);
}

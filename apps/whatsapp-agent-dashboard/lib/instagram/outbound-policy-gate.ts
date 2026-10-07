import { listPersistedIntegrationHealth } from "@/modules/integrations/infrastructure/prisma-integration-health";

type Environment = Readonly<Record<string, string | undefined>>;

function live(env: Environment): boolean {
  const mode = env.INSTAGRAM_OUTBOUND_MODE?.trim().toLowerCase();
  const killed = env.INSTAGRAM_OUTBOUND_KILL_SWITCH?.trim().toLowerCase() === "on";
  return mode === "live" && !killed;
}

export async function assertInstagramControlledOutboundAllowed(input: {
  conversationAccountId: string | null;
  env?: Environment;
}): Promise<void> {
  const env = input.env ?? process.env;
  if (!live(env)) return;

  const configuredAccountId =
    env.INSTAGRAM_ACCOUNT_ID?.trim() ||
    env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    "";
  const conversationAccountId = input.conversationAccountId?.trim() || "";

  if (!configuredAccountId) {
    throw new Error("Instagram controlled outbound requires a configured account ID.");
  }
  if (!conversationAccountId || conversationAccountId !== configuredAccountId) {
    throw new Error("Instagram conversation account does not match the configured account.");
  }

  const health = await listPersistedIntegrationHealth();
  const connected = health.some(
    (item) =>
      item.provider === "META_INSTAGRAM" &&
      item.externalAccountId === configuredAccountId &&
      item.status === "CONNECTED",
  );
  if (!connected) {
    throw new Error("Instagram integration is not verified CONNECTED for controlled outbound.");
  }
}


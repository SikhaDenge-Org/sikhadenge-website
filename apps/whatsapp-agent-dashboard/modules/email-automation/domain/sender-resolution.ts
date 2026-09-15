import type { EmailSenderIdentity } from "./contracts";

export type SenderResolutionInput = {
  availableSenders: readonly EmailSenderIdentity[];
  manualSenderIdentityId?: string | null;
  automationSenderIdentityId?: string | null;
  templateSenderIdentityId?: string | null;
};

export type SenderResolutionSource =
  | "MANUAL_OVERRIDE"
  | "AUTOMATION_OVERRIDE"
  | "TEMPLATE_DEFAULT"
  | "WORKSPACE_DEFAULT";

export type SenderResolution = {
  sender: EmailSenderIdentity;
  source: SenderResolutionSource;
};

function usable(sender: EmailSenderIdentity | undefined): sender is EmailSenderIdentity {
  return Boolean(
    sender &&
      sender.isActive &&
      sender.verificationStatus === "VERIFIED",
  );
}

export function resolveEmailSender(input: SenderResolutionInput): SenderResolution {
  const byId = new Map(input.availableSenders.map((sender) => [sender.id, sender]));
  const candidates: Array<[string | null | undefined, SenderResolutionSource]> = [
    [input.manualSenderIdentityId, "MANUAL_OVERRIDE"],
    [input.automationSenderIdentityId, "AUTOMATION_OVERRIDE"],
    [input.templateSenderIdentityId, "TEMPLATE_DEFAULT"],
  ];

  for (const [id, source] of candidates) {
    if (!id) continue;
    const sender = byId.get(id);
    if (!sender) throw new Error(`Configured email sender ${id} does not exist.`);
    if (!usable(sender)) {
      throw new Error(`Configured email sender ${id} is not verified and active.`);
    }
    return { sender, source };
  }

  const workspaceDefaults = input.availableSenders.filter(
    (sender) => sender.isWorkspaceDefault && usable(sender),
  );
  if (workspaceDefaults.length !== 1) {
    throw new Error(
      workspaceDefaults.length === 0
        ? "No verified active workspace default email sender is available."
        : "Multiple verified workspace default email senders are configured.",
    );
  }

  return { sender: workspaceDefaults[0], source: "WORKSPACE_DEFAULT" };
}

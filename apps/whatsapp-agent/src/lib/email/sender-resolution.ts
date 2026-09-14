export type SenderCandidate = {
  id: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  verificationStatus: string;
  isActive: boolean;
  isDefault: boolean;
};

export type SenderResolutionInput = {
  manualSenderId?: string | null;
  automationSenderId?: string | null;
  templateSenderId?: string | null;
  workspaceDefaultSenderId?: string | null;
  senders: SenderCandidate[];
};

export type SenderResolutionResult = {
  sender: SenderCandidate;
  source: "MANUAL" | "AUTOMATION" | "TEMPLATE" | "WORKSPACE_DEFAULT";
};

export function resolveEmailSender(input: SenderResolutionInput): SenderResolutionResult {
  const ordered: Array<[string | null | undefined, SenderResolutionResult["source"]]> = [
    [input.manualSenderId, "MANUAL"],
    [input.automationSenderId, "AUTOMATION"],
    [input.templateSenderId, "TEMPLATE"],
    [input.workspaceDefaultSenderId, "WORKSPACE_DEFAULT"],
  ];

  for (const [id, source] of ordered) {
    if (!id) continue;
    const sender = input.senders.find((candidate) => candidate.id === id);
    if (!sender) throw new Error(`Configured ${source.toLowerCase()} email sender was not found.`);
    if (!sender.isActive) throw new Error(`Configured ${source.toLowerCase()} email sender is inactive.`);
    if (sender.verificationStatus !== "VERIFIED") {
      throw new Error(`Configured ${source.toLowerCase()} email sender is not verified.`);
    }
    return { sender, source };
  }

  const fallback = input.senders.find(
    (candidate) => candidate.isDefault && candidate.isActive && candidate.verificationStatus === "VERIFIED",
  );
  if (fallback) return { sender: fallback, source: "WORKSPACE_DEFAULT" };

  throw new Error("No verified active email sender is available for this workspace.");
}

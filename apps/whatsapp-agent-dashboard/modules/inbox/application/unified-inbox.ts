export type UnifiedInboxFilter = {
  channels?: readonly string[];
  assigneeIds?: readonly string[];
  unreadOnly?: boolean;
  modes?: readonly ("AI" | "HUMAN")[];
  riskLevels?: readonly ("LOW" | "MEDIUM" | "HIGH")[];
  slaBreachedOnly?: boolean;
};

export type ComposerCapability = {
  outboundText: boolean;
  outboundMedia: boolean;
  outboundTemplate: boolean;
  paused: boolean;
};

export type ComposerAction = "TEXT" | "MEDIA" | "TEMPLATE";

export function canUseComposerAction(
  capability: ComposerCapability,
  action: ComposerAction,
): boolean {
  if (capability.paused) return false;
  if (action === "TEXT") return capability.outboundText;
  if (action === "MEDIA") return capability.outboundMedia;
  return capability.outboundTemplate;
}

export type ActiveConversationEditor = {
  userId: string;
  displayName: string;
  lastSeenAt: Date;
};

export function activeCollisionWarning(input: {
  currentUserId: string;
  editors: readonly ActiveConversationEditor[];
  now?: Date;
  activeWithinMs?: number;
}): string | null {
  const now = input.now ?? new Date();
  const activeWithinMs = input.activeWithinMs ?? 30_000;
  const other = input.editors.find(
    (editor) =>
      editor.userId !== input.currentUserId &&
      now.getTime() - editor.lastSeenAt.getTime() <= activeWithinMs,
  );
  return other ? `${other.displayName} is currently viewing this conversation.` : null;
}

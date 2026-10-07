export type CounselorDraft = {
  conversationId: string;
  body: string;
  revision: number;
  savedAt: Date;
  deviceId: string;
};

export type DraftRecoveryDecision =
  | { action: "NONE" }
  | { action: "RESTORE_LOCAL"; draft: CounselorDraft }
  | { action: "RESTORE_SERVER"; draft: CounselorDraft }
  | { action: "REVIEW_CONFLICT"; local: CounselorDraft; server: CounselorDraft };

export function decideDraftRecovery(input: {
  local?: CounselorDraft;
  server?: CounselorDraft;
}): DraftRecoveryDecision {
  const { local, server } = input;
  if (!local && !server) return { action: "NONE" };
  if (local && !server) return { action: "RESTORE_LOCAL", draft: local };
  if (!local && server) return { action: "RESTORE_SERVER", draft: server };
  if (!local || !server) return { action: "NONE" };
  if (local.conversationId !== server.conversationId) {
    return { action: "REVIEW_CONFLICT", local, server };
  }
  if (local.body === server.body) {
    return local.savedAt.getTime() >= server.savedAt.getTime()
      ? { action: "RESTORE_LOCAL", draft: local }
      : { action: "RESTORE_SERVER", draft: server };
  }
  if (local.revision === server.revision) {
    return { action: "REVIEW_CONFLICT", local, server };
  }
  return local.revision > server.revision
    ? { action: "RESTORE_LOCAL", draft: local }
    : { action: "RESTORE_SERVER", draft: server };
}

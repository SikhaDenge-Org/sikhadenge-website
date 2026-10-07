export type MessengerConversationScope = {
  configuredPageId: string;
  conversationPageId: string;
  outboundTextVerified: boolean;
  outboundPaused: boolean;
};

export function assertMessengerPageIsolation(scope: MessengerConversationScope): void {
  if (!scope.configuredPageId.trim() || !scope.conversationPageId.trim()) {
    throw new Error("Messenger Page identity is required.");
  }
  if (scope.configuredPageId !== scope.conversationPageId) {
    throw new Error("Messenger conversation belongs to a different Page connection.");
  }
}

export function canSendMessengerText(scope: MessengerConversationScope): boolean {
  assertMessengerPageIsolation(scope);
  return scope.outboundTextVerified && !scope.outboundPaused;
}

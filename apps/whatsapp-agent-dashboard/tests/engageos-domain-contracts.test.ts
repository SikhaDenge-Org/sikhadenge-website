import assert from "node:assert/strict";

import {
  assertValidMessageContent,
  assertValidPageRequest,
  assertWorkspaceAccess,
  channelConnectionId,
  channelEventKey,
  conversationId,
  createChannelEvent,
  customerId,
  emptyChannelCapabilities,
  externalIdentityKey,
  mapLegacyWhatsAppConversation,
  mapLegacyWhatsAppMessage,
  rawChannelEventId,
  supportsCapability,
  WorkspaceScopeError,
  workspaceId,
  type ChannelConnection,
  type Conversation,
  type ConversationListFilter,
  type ConversationRepository,
  type PageRequest,
  type PageResult,
  type WorkspaceContext,
} from "../modules";

class InMemoryConversationRepository implements ConversationRepository {
  private readonly records = new Map<string, Conversation>();

  async findById(
    context: WorkspaceContext,
    id: Conversation["id"],
  ): Promise<Conversation | null> {
    const record = this.records.get(id) ?? null;
    if (record) assertWorkspaceAccess(context, record);
    return record;
  }

  async list(
    context: WorkspaceContext,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<PageResult<Conversation>> {
    assertValidPageRequest(page);

    const items = [...this.records.values()]
      .filter((record) => record.workspaceId === context.workspaceId)
      .filter((record) => !filter.status || record.status === filter.status)
      .filter((record) => !filter.channel || record.channel === filter.channel)
      .slice(0, page.limit);

    return { items };
  }

  async save(
    context: WorkspaceContext,
    conversation: Conversation,
  ): Promise<void> {
    assertWorkspaceAccess(context, conversation);
    this.records.set(conversation.id, conversation);
  }
}

async function main() {
  const workspaceA = workspaceId("workspace-a");
  const workspaceB = workspaceId("workspace-b");
  const contextA: WorkspaceContext = { workspaceId: workspaceA };
  const contextB: WorkspaceContext = { workspaceId: workspaceB };
  const connectionId = channelConnectionId("wa-connection-1");
  const mappedCustomerId = customerId("customer-1");

  assert.throws(() => workspaceId("   "), /workspaceId must be/);
  assert.throws(() => channelConnectionId(""), /channelConnectionId must be/);

  const capabilities = {
    ...emptyChannelCapabilities(),
    WEBHOOK_VERIFY: true,
    INBOUND_MESSAGE: true,
    OUTBOUND_TEXT: true,
  } as const;

  const connection: ChannelConnection = {
    id: connectionId,
    workspaceId: workspaceA,
    channel: "WHATSAPP",
    externalAccountId: "phone-number-id-1",
    status: "CONNECTED",
    capabilities,
  };

  assert.equal(supportsCapability(connection, "OUTBOUND_TEXT"), true);
  assert.equal(supportsCapability(connection, "COMMENT_EVENTS"), false);

  const identityKey = externalIdentityKey({
    workspaceId: workspaceA,
    connectionId,
    channel: "WHATSAPP",
    externalUserId: "+91 99990 00001",
  });
  assert.equal(
    identityKey,
    "workspace-a:wa-connection-1:WHATSAPP:%2B91%2099990%2000001",
  );

  const now = new Date("2026-08-02T09:30:00.000Z");
  const conversation = mapLegacyWhatsAppConversation({
    context: contextA,
    connectionId,
    customerId: mappedCustomerId,
    record: {
      id: "legacy-conversation-1",
      status: "OPEN",
      agentMode: "HUMAN",
      unreadCount: 2,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  assert.equal(conversation.workspaceId, workspaceA);
  assert.equal(conversation.channel, "WHATSAPP");
  assert.equal(conversation.id, conversationId("legacy-conversation-1"));

  const message = mapLegacyWhatsAppMessage({
    context: contextA,
    connectionId,
    record: {
      id: "legacy-message-1",
      conversationId: "legacy-conversation-1",
      metaMessageId: "wamid.1",
      direction: "INBOUND",
      actor: "CUSTOMER",
      type: "TEXT",
      status: "RECEIVED",
      text: "Please share the course details.",
      messageTimestamp: now,
      createdAt: now,
    },
  });

  assert.equal(message.workspaceId, workspaceA);
  assert.equal(message.externalMessageId, "wamid.1");
  assert.equal(message.kind, "TEXT");

  assert.throws(
    () => assertValidMessageContent({ kind: "TEXT", text: "", media: undefined }),
    /TEXT messages require/,
  );
  assert.throws(
    () =>
      assertValidMessageContent({ kind: "IMAGE", text: undefined, media: {} }),
    /IMAGE messages require/,
  );

  const event = createChannelEvent({
    id: "channel-event-1",
    workspaceId: workspaceA,
    connectionId,
    channel: "WHATSAPP",
    type: "MESSAGE_RECEIVED",
    externalEventId: "wamid.1",
    occurredAt: now,
    receivedAt: new Date(now.getTime() + 1_000),
    payload: { text: "Please share the course details." },
    rawEventId: rawChannelEventId("raw-event-1"),
    schemaVersion: 1,
  });

  assert.equal(
    channelEventKey(event),
    "workspace-a:wa-connection-1:MESSAGE_RECEIVED:wamid.1",
  );
  assert.throws(
    () =>
      createChannelEvent({
        ...event,
        id: "invalid-time-event",
        occurredAt: new Date(now.getTime() + 2_000),
        receivedAt: now,
      }),
    /receivedAt cannot be earlier/,
  );

  const repository = new InMemoryConversationRepository();
  await repository.save(contextA, conversation);
  assert.equal(
    (await repository.findById(contextA, conversation.id))?.id,
    conversation.id,
  );
  await assert.rejects(
    () => repository.findById(contextB, conversation.id),
    WorkspaceScopeError,
  );
  await assert.rejects(
    () => repository.save(contextB, conversation),
    WorkspaceScopeError,
  );

  const page = await repository.list(
    contextA,
    { channel: "WHATSAPP", status: "OPEN" },
    { limit: 20 },
  );
  assert.equal(page.items.length, 1);
  assert.throws(() => assertValidPageRequest({ limit: 0 }), /between 1 and 200/);
  assert.throws(() => assertValidPageRequest({ limit: 201 }), /between 1 and 200/);

  console.log("EngageOS Phase 1 domain contract tests passed: 20 assertions.");
}

void main();

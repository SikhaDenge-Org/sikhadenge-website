import type {
  Conversation,
  ConversationId,
  Message,
  MessageId,
} from "@/modules/inbox/domain/conversation";
import type { WorkspaceContext } from "@/modules/workspaces/domain/workspace";

export type PageRequest = {
  limit: number;
  cursor?: string;
};

export type PageResult<TItem> = {
  items: readonly TItem[];
  nextCursor?: string;
};

export type ConversationListFilter = {
  status?: Conversation["status"];
  channel?: Conversation["channel"];
  assignedActorId?: string;
};

export interface ConversationRepository {
  findById(
    context: WorkspaceContext,
    id: ConversationId,
  ): Promise<Conversation | null>;

  list(
    context: WorkspaceContext,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<PageResult<Conversation>>;

  save(
    context: WorkspaceContext,
    conversation: Conversation,
  ): Promise<void>;
}

export interface MessageRepository {
  findById(
    context: WorkspaceContext,
    id: MessageId,
  ): Promise<Message | null>;

  listByConversation(
    context: WorkspaceContext,
    conversationId: ConversationId,
    page: PageRequest,
  ): Promise<PageResult<Message>>;

  save(context: WorkspaceContext, message: Message): Promise<void>;
}

export function assertValidPageRequest(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 200) {
    throw new Error("Page limit must be an integer between 1 and 200.");
  }
}

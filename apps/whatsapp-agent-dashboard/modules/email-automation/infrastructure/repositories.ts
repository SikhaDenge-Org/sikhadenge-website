import type { EmailConnection, EmailSenderIdentity } from "../domain/contracts";

export interface EmailConnectionRepository {
  getById(input: { workspaceId: string; connectionId: string }): Promise<EmailConnection | null>;
  listByWorkspace(workspaceId: string): Promise<readonly EmailConnection[]>;
  save(connection: EmailConnection): Promise<void>;
}

export interface EmailSenderRepository {
  listByWorkspace(workspaceId: string): Promise<readonly EmailSenderIdentity[]>;
  listByConnection(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<readonly EmailSenderIdentity[]>;
  replaceConnectionSenders(input: {
    workspaceId: string;
    connectionId: string;
    senders: readonly EmailSenderIdentity[];
  }): Promise<readonly EmailSenderIdentity[]>;
  setWorkspaceDefault(input: {
    workspaceId: string;
    senderIdentityId: string;
  }): Promise<void>;
}

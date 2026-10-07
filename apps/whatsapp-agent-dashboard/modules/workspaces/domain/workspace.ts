import {
  asNonEmptyStringBrand,
  type Brand,
} from "@/shared/types/brand";

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type WorkspaceActorId = Brand<string, "WorkspaceActorId">;

export type WorkspaceContext = {
  workspaceId: WorkspaceId;
  actorId?: WorkspaceActorId;
  requestId?: string;
};

export type WorkspaceScopedEntity = {
  workspaceId: WorkspaceId;
};

export class WorkspaceScopeError extends Error {
  readonly code = "WORKSPACE_SCOPE_VIOLATION";

  constructor() {
    super("The requested record does not belong to the active workspace.");
    this.name = "WorkspaceScopeError";
  }
}

export function workspaceId(value: string): WorkspaceId {
  return asNonEmptyStringBrand<"WorkspaceId">(value, "workspaceId");
}

export function workspaceActorId(value: string): WorkspaceActorId {
  return asNonEmptyStringBrand<"WorkspaceActorId">(value, "actorId");
}

export function assertWorkspaceAccess(
  context: WorkspaceContext,
  entity: WorkspaceScopedEntity,
): void {
  if (context.workspaceId !== entity.workspaceId) {
    throw new WorkspaceScopeError();
  }
}

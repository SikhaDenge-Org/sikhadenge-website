export type GovernanceScopeSummary = {
  workspaceId: string;
  connectedAccountIds: string[];
  enabledChannels: string[];
  maxRealLeads: number;
  externalWritesRequested: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseGovernanceScope(value: unknown): GovernanceScopeSummary | null {
  const scope = asRecord(value);
  if (typeof scope.workspaceId !== "string" || !scope.workspaceId.trim()) return null;
  if (!Array.isArray(scope.connectedAccountIds) || scope.connectedAccountIds.some((v) => typeof v !== "string")) return null;
  if (!Array.isArray(scope.enabledChannels) || scope.enabledChannels.some((v) => typeof v !== "string")) return null;
  if (typeof scope.maxRealLeads !== "number" || !Number.isInteger(scope.maxRealLeads) || scope.maxRealLeads < 0) return null;
  if (typeof scope.externalWritesRequested !== "boolean") return null;
  return {
    workspaceId: scope.workspaceId.trim(),
    connectedAccountIds: (scope.connectedAccountIds as string[]).map((v) => v.trim()).filter(Boolean),
    enabledChannels: (scope.enabledChannels as string[]).map((v) => v.trim().toUpperCase()).filter(Boolean),
    maxRealLeads: scope.maxRealLeads,
    externalWritesRequested: scope.externalWritesRequested,
  };
}
export function governanceStateIsInternallyConsistent(input: {
  workspaceId: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  scope: GovernanceScopeSummary | null;
}): boolean {
  if (!input.scope || input.scope.workspaceId !== input.workspaceId) return false;
  if (input.mode === "SHADOW") {
    return input.writePolicy === "NO_EXTERNAL_WRITES" &&
      !input.externalWritesAllowed &&
      !input.scope.externalWritesRequested;
  }
  if (input.writePolicy === "NO_EXTERNAL_WRITES") {
    return !input.externalWritesAllowed && !input.scope.externalWritesRequested;
  }
  return input.externalWritesAllowed === input.scope.externalWritesRequested;
}

export function computeAutopilotCapUsage(maxRealLeads: number, distinctRecipients: number) {
  const remaining = Math.max(0, maxRealLeads - distinctRecipients);
  return {
    limit: maxRealLeads,
    used: distinctRecipients,
    remaining,
    exhausted: maxRealLeads > 0 && remaining === 0,
    withinCap: distinctRecipients <= maxRealLeads,
  };
}
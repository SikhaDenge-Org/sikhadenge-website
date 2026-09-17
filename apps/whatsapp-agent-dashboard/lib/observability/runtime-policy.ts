export type AgentRuntimePolicy = {
  enabled: boolean;
  killSwitchActive: boolean;
  modelCallsEnabled: boolean;
  maximumOutputTokens: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function boundedNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getAgentRuntimePolicy(): AgentRuntimePolicy {
  const killSwitchActive = booleanEnvironment("AGENT_KILL_SWITCH", false);
  return {
    enabled: booleanEnvironment("AGENT_ENABLED", true) && !killSwitchActive,
    killSwitchActive,
    modelCallsEnabled: booleanEnvironment("AGENT_MODEL_CALLS_ENABLED", true),
    maximumOutputTokens: Math.floor(
      boundedNumber("OPENAI_MAX_OUTPUT_TOKENS", 1_200, 200, 4_000),
    ),
    inputCostPerMillionUsd: boundedNumber(
      "OPENAI_INPUT_COST_PER_1M_USD",
      0,
      0,
      10_000,
    ),
    outputCostPerMillionUsd: boundedNumber(
      "OPENAI_OUTPUT_COST_PER_1M_USD",
      0,
      0,
      10_000,
    ),
  };
}

export function estimateModelCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillionUsd?: number;
  outputCostPerMillionUsd?: number;
}): number | null {
  const policy = getAgentRuntimePolicy();
  const inputRate =
    input.inputCostPerMillionUsd ?? policy.inputCostPerMillionUsd;
  const outputRate =
    input.outputCostPerMillionUsd ?? policy.outputCostPerMillionUsd;

  if (inputRate <= 0 && outputRate <= 0) return null;
  const cost =
    (Math.max(0, input.inputTokens) / 1_000_000) * inputRate +
    (Math.max(0, input.outputTokens) / 1_000_000) * outputRate;
  return Number(cost.toFixed(8));
}

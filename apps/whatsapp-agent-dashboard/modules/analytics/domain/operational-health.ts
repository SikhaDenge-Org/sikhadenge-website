export type OperationalHealthInput = {
  webhookReceived: number;
  webhookFailed: number;
  outboundSent: number;
  outboundFailed: number;
  queueLagSamplesMs: readonly number[];
  deadLetterCount: number;
};

export type OperationalHealthSnapshot = {
  webhookFailureRate?: number;
  outboundFailureRate?: number;
  queueLagP95Ms?: number;
  deadLetterCount: number;
  degraded: boolean;
};

function safeRate(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) return undefined;
  return numerator / denominator;
}

function percentile95(values: readonly number[]): number | undefined {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return undefined;
  const index = Math.max(0, Math.ceil(clean.length * 0.95) - 1);
  return clean[index];
}

export function computeOperationalHealth(
  input: OperationalHealthInput,
): OperationalHealthSnapshot {
  const webhookFailureRate = safeRate(input.webhookFailed, input.webhookReceived);
  const outboundFailureRate = safeRate(input.outboundFailed, input.outboundSent);
  const queueLagP95Ms = percentile95(input.queueLagSamplesMs);
  return {
    webhookFailureRate,
    outboundFailureRate,
    queueLagP95Ms,
    deadLetterCount: Math.max(0, Math.floor(input.deadLetterCount)),
    degraded:
      (webhookFailureRate ?? 0) > 0.05 ||
      (outboundFailureRate ?? 0) > 0.05 ||
      (queueLagP95Ms ?? 0) > 60_000 ||
      input.deadLetterCount > 0,
  };
}

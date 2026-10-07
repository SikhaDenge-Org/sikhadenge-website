import {
  AUTHORITATIVE_METRICS,
  countMetricEvents,
  type AnalyticsEventFact,
} from "@/modules/analytics/domain/metric-definitions";

export type AnalyticsSnapshot = {
  workspaceId: string;
  from: Date;
  to: Date;
  eventCount: number;
  metrics: Record<string, { numerator: number; denominator?: number; rate?: number }>;
  byType: Record<string, number>;
};

export function buildAnalyticsSnapshot(input: {
  workspaceId: string;
  from: Date;
  to: Date;
  facts: readonly AnalyticsEventFact[];
}): AnalyticsSnapshot {
  if (!input.workspaceId.trim()) throw new Error("Workspace id is required.");
  if (input.from.getTime() >= input.to.getTime()) throw new Error("Analytics time range is invalid.");

  const scoped = input.facts.filter(
    (fact) =>
      fact.workspaceId === input.workspaceId &&
      fact.occurredAt.getTime() >= input.from.getTime() &&
      fact.occurredAt.getTime() < input.to.getTime(),
  );
  const byType: Record<string, number> = {};
  for (const fact of scoped) byType[fact.type] = (byType[fact.type] ?? 0) + 1;

  const metrics: AnalyticsSnapshot["metrics"] = {};
  for (const definition of AUTHORITATIVE_METRICS) {
    metrics[definition.key] = countMetricEvents(scoped, definition, input.workspaceId);
  }
  return {
    workspaceId: input.workspaceId,
    from: input.from,
    to: input.to,
    eventCount: scoped.length,
    metrics,
    byType,
  };
}

export type MetricDefinition = {
  key: string;
  name: string;
  numeratorEvent: string;
  denominatorEvent?: string;
  description: string;
};

export const AUTHORITATIVE_METRICS: readonly MetricDefinition[] = Object.freeze([
  {
    key: "comment_to_private_reply_rate",
    name: "Comment to private reply rate",
    numeratorEvent: "PRIVATE_REPLY_SENT",
    denominatorEvent: "COMMENT_CREATED",
    description: "Private replies divided by eligible comment events under the selected filters.",
  },
  {
    key: "message_failure_rate",
    name: "Message failure rate",
    numeratorEvent: "MESSAGE_FAILED",
    denominatorEvent: "MESSAGE_SENT",
    description: "Failed outbound messages divided by authoritative outbound message events.",
  },
  {
    key: "message_read_rate",
    name: "Message read rate",
    numeratorEvent: "MESSAGE_READ",
    denominatorEvent: "MESSAGE_SENT",
    description: "Read message events divided by authoritative outbound message events.",
  },
]);

export type AnalyticsEventFact = {
  type: string;
  workspaceId: string;
  occurredAt: Date;
};

export function countMetricEvents(
  facts: readonly AnalyticsEventFact[],
  definition: MetricDefinition,
  workspaceId: string,
): { numerator: number; denominator?: number; rate?: number } {
  const scoped = facts.filter((fact) => fact.workspaceId === workspaceId);
  const numerator = scoped.filter((fact) => fact.type === definition.numeratorEvent).length;
  if (!definition.denominatorEvent) return { numerator };
  const denominator = scoped.filter((fact) => fact.type === definition.denominatorEvent).length;
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? undefined : numerator / denominator,
  };
}

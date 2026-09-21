import {
  AgentMode,
  KnowledgeStatus,
  LearningStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { getAgentRuntimePolicy } from "./runtime-policy";

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const bounded = Math.min(1, Math.max(0, percentileValue));
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * bounded) - 1);
  return sorted[Math.max(0, index)];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4),
  );
}

export async function getAgentObservabilitySummary(days = 7) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1_000);

  const [
    analyses,
    outboundStatuses,
    pendingLearning,
    approvedKnowledge,
    queuedOutbound,
    reviewRequired,
  ] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: "AGENT_CONVERSATION_ANALYZED",
        createdAt: { gte: since },
      },
      select: { after: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 20_000,
    }),
    prisma.whatsAppMessage.groupBy({
      by: ["status"],
      where: {
        direction: MessageDirection.OUTBOUND,
        createdAt: { gte: since },
      },
      _count: { _all: true },
    }),
    prisma.learningSuggestion.count({
      where: { status: LearningStatus.PENDING },
    }),
    prisma.knowledgeDocument.count({
      where: { status: KnowledgeStatus.APPROVED },
    }),
    prisma.whatsAppMessage.count({
      where: {
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.QUEUED,
      },
    }),
    prisma.whatsAppConversation.count({
      where: { agentMode: AgentMode.REVIEW_REQUIRED },
    }),
  ]);

  const confidences: number[] = [];
  const latencies: number[] = [];
  const modelLatencies: number[] = [];
  let modelRuns = 0;
  let fallbackRuns = 0;
  let ruleRuns = 0;
  let handoffs = 0;
  let promptInjections = 0;
  let sensitiveDataSignals = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  let pricedRuns = 0;

  for (const analysis of analyses) {
    const after = record(analysis.after);
    const confidence = numeric(after.aiConfidence);
    if (confidence !== null) confidences.push(confidence);
    if (boolean(after.requiresHuman) === true) handoffs += 1;

    const telemetry = record(
      after.telemetry as Prisma.JsonValue | null,
    );
    const source = typeof telemetry.source === "string" ? telemetry.source : null;
    if (source === "model") modelRuns += 1;
    else if (source === "fallback") fallbackRuns += 1;
    else if (source === "rule") ruleRuns += 1;

    const latency = numeric(telemetry.totalLatencyMs);
    if (latency !== null) latencies.push(latency);
    const modelLatency = numeric(telemetry.modelLatencyMs);
    if (modelLatency !== null) modelLatencies.push(modelLatency);

    inputTokens += numeric(telemetry.inputTokens) ?? 0;
    outputTokens += numeric(telemetry.outputTokens) ?? 0;
    totalTokens += numeric(telemetry.totalTokens) ?? 0;
    const cost = numeric(telemetry.estimatedCostUsd);
    if (cost !== null) {
      estimatedCostUsd += cost;
      pricedRuns += 1;
    }

    const safety = record(after.safety as Prisma.JsonValue | null);
    if (boolean(safety.promptInjectionDetected) === true) promptInjections += 1;
    if (boolean(safety.sensitiveDataDetected) === true) sensitiveDataSignals += 1;
  }

  const outboundByStatus = Object.fromEntries(
    Object.values(MessageStatus).map((status) => [status, 0]),
  ) as Record<MessageStatus, number>;
  for (const row of outboundStatuses) {
    outboundByStatus[row.status] = row._count._all;
  }

  const totalRuns = analyses.length;
  return {
    window: {
      days: safeDays,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
    },
    runtime: getAgentRuntimePolicy(),
    agent: {
      totalRuns,
      modelRuns,
      fallbackRuns,
      ruleRuns,
      handoffs,
      handoffRate: totalRuns > 0 ? Number((handoffs / totalRuns).toFixed(4)) : 0,
      averageConfidence: average(confidences),
      averageLatencyMs: average(latencies),
      p95LatencyMs: percentile(latencies, 0.95),
      averageModelLatencyMs: average(modelLatencies),
      p95ModelLatencyMs: percentile(modelLatencies, 0.95),
      promptInjections,
      sensitiveDataSignals,
    },
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd:
        pricedRuns > 0 ? Number(estimatedCostUsd.toFixed(8)) : null,
      pricedRuns,
    },
    operations: {
      reviewRequired,
      pendingLearning,
      approvedKnowledge,
      queuedOutbound,
      outboundByStatus,
    },
  };
}

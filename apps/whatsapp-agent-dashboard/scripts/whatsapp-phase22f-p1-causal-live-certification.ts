import { prisma } from "../lib/db/prisma";
import { runWhatsAppAutomationSchedulerCycle } from "../modules/automations/application/whatsapp-automation-scheduler";

function fail(message: string): never {
  throw new Error(`PHASE22F_P1_CERT_FAILED: ${message}`);
}

function requireEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) fail(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

async function main() {
  const prefix = process.env.PHASE22F_P1_PREFIX?.trim() || "";
  if (!/^phase22f-p1-cert:[A-Za-z0-9._:-]{1,160}:$/u.test(prefix)) {
    fail("PHASE22F_P1_PREFIX must be a unique phase22f-p1-cert:*: prefix.");
  }

  requireEqual(process.env.WHATSAPP_AUTOMATION_SCHEDULER_ENABLED, "true", "scheduler enabled");
  requireEqual(process.env.AUTOMATION_RUNTIME_ENABLED, "true", "automation runtime enabled");
  requireEqual(process.env.AUTOMATION_ACTIONS_ENABLED, "true", "automation actions enabled");
  requireEqual(process.env.WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX, prefix, "event source prefix");
  requireEqual(process.env.WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED, "true", "causal outbound dispatch enabled");
  requireEqual(process.env.WHATSAPP_AUTOMATION_ALLOW_GLOBAL_QUEUED_DISPATCH, "false", "global queued dispatch disabled");
  requireEqual(process.env.WHATSAPP_OUTBOUND_MODE, "live", "outbound mode requested live");
  requireEqual(process.env.WHATSAPP_CUTOVER_APPROVED, "true", "live cutover acknowledgement gate");
  requireEqual(process.env.WHATSAPP_OUTBOUND_LIVE_ACK, "I_UNDERSTAND_LIVE_WHATSAPP_SENDS", "live acknowledgement");
  requireEqual(process.env.WHATSAPP_OUTBOUND_KILL_SWITCH, "off", "ephemeral live-mode kill switch override");
  requireEqual(process.env.JOURNEY_RUNTIME_ENABLED, "false", "journey runtime disabled");
  requireEqual(process.env.JOURNEY_ACTIONS_ENABLED, "false", "journey actions disabled");
  requireEqual(process.env.WHATSAPP_CAMPAIGNS_ENABLED, "false", "campaigns disabled");
  requireEqual(process.env.INTEGRATION_EXTERNAL_WRITES_ENABLED, "false", "integration external writes disabled");
  requireEqual(process.env.AGENT_AUTO_REPLY_ENABLED, "false", "agent auto reply disabled");
  requireEqual(process.env.AGENT_IMMEDIATE_DISPATCH_ENABLED, "false", "agent immediate dispatch disabled");

  const matchingBefore = await prisma.engageWhatsAppAutomationEvent.count({
    where: { sourceEventId: { startsWith: prefix } },
  });
  requireEqual(matchingBefore, 0, "matching automation events before cycle");

  const originalFetch = globalThis.fetch;
  let providerFetchAttempts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (/graph\.facebook\.com/iu.test(url)) {
      providerFetchAttempts += 1;
      throw new Error("PHASE22F_P1_PROVIDER_NETWORK_CALL_FORBIDDEN");
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const result = await runWhatsAppAutomationSchedulerCycle({ limit: 20 });
    if (result.paused) fail(`scheduler unexpectedly paused: ${String((result as { reason?: unknown }).reason ?? "unknown")}`);

    const active = result as typeof result & {
      timeTriggers: { skipped?: boolean; reason?: string };
      automationEvents: { inspected: number; processed: number; matched: number; executed: number; failed: number; queuedMessageIds: string[] };
      resumedRuns: { skipped?: boolean; reason?: string };
      outbound: { mode?: string; inspected?: number; processed?: number; sent?: number; results?: unknown[] };
    };

    requireEqual(active.status.schedulerEnabled, true, "scheduler status enabled");
    requireEqual(active.status.automation.runtimeEnabled, true, "automation status runtime enabled");
    requireEqual(active.status.automation.actionExecutionEnabled, true, "automation status actions enabled");
    requireEqual(active.status.outboundDispatchEnabled, true, "scheduler causal outbound enabled");
    requireEqual(active.status.allowGlobalQueuedDispatch, false, "scheduler global queued dispatch disabled");
    requireEqual(active.status.eventSourcePrefix, prefix, "scheduler targeted prefix");
    requireEqual(active.status.automation.outboundMode, "live", "effective outbound mode");

    requireEqual(active.timeTriggers.skipped, true, "time triggers skipped");
    requireEqual(active.timeTriggers.reason, "TARGETED_EVENT_COHORT", "time trigger targeted cohort reason");
    requireEqual(active.resumedRuns.skipped, true, "resume scan skipped");
    requireEqual(active.resumedRuns.reason, "TARGETED_EVENT_COHORT", "resume targeted cohort reason");

    requireEqual(active.automationEvents.inspected, 0, "causal events inspected");
    requireEqual(active.automationEvents.processed, 0, "causal events processed");
    requireEqual(active.automationEvents.matched, 0, "causal flows matched");
    requireEqual(active.automationEvents.executed, 0, "causal flows executed");
    requireEqual(active.automationEvents.failed, 0, "causal events failed");
    requireEqual(active.automationEvents.queuedMessageIds.length, 0, "causal queued message ids");

    requireEqual(active.outbound.mode, "live", "outbound batch effective mode");
    requireEqual(active.outbound.inspected, 0, "outbound inspected");
    requireEqual(active.outbound.processed, 0, "outbound processed");
    requireEqual(active.outbound.sent, 0, "outbound sent");
    requireEqual(Array.isArray(active.outbound.results) ? active.outbound.results.length : -1, 0, "outbound results");
    requireEqual(providerFetchAttempts, 0, "provider fetch attempts");

    const matchingAfter = await prisma.engageWhatsAppAutomationEvent.count({
      where: { sourceEventId: { startsWith: prefix } },
    });
    requireEqual(matchingAfter, 0, "matching automation events after cycle");

    console.log(JSON.stringify({
      certification: "WHATSAPP_PHASE22F_P1_CAUSAL_LIVE_CERTIFICATION_PASS",
      prefix,
      effectiveOutboundMode: active.status.automation.outboundMode,
      globalQueuedDispatch: active.status.allowGlobalQueuedDispatch,
      causalEventsInspected: active.automationEvents.inspected,
      causalQueuedMessageIds: active.automationEvents.queuedMessageIds.length,
      outboundInspected: active.outbound.inspected,
      outboundProcessed: active.outbound.processed,
      outboundSent: active.outbound.sent,
      providerFetchAttempts,
      externalWhatsAppWriteSent: false,
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvironmentFile(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvironmentFile();

const INTERVAL_MS = 60_000;
let stopping = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let gateNoticeLogged = false;

function log(event: string, detail: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      service: "sikhadenge-masterclass-flow",
      event,
      at: new Date().toISOString(),
      ...detail,
    }),
  );
}

function automationActionsEnabled(): boolean {
  return process.env.AUTOMATION_ACTIONS_ENABLED?.trim().toLowerCase() === "true";
}

async function runCycle(): Promise<void> {
  if (running || stopping) return;
  if (!automationActionsEnabled()) {
    if (!gateNoticeLogged) {
      log("paused", { reason: "AUTOMATION_ACTIONS_ENABLED is not true" });
      gateNoticeLogged = true;
    }
    return;
  }
  gateNoticeLogged = false;
  running = true;
  try {
    const [{ dispatchDueMasterclassFollowUps }, { dispatchQueuedOutboundBatch }] =
      await Promise.all([
        import("../lib/automation/masterclass-registration-flow"),
        import("../lib/outbound/outbound-service"),
      ]);
    const reminders = await dispatchDueMasterclassFollowUps({ limit: 100 });
    const outbound = await dispatchQueuedOutboundBatch(50, {
      idempotencyPrefix: "masterclass:",
    });
    if (
      reminders.due > 0 ||
      reminders.failed > 0 ||
      outbound.processed > 0
    ) {
      log("cycle", {
        reminders: {
          inspected: reminders.inspected,
          due: reminders.due,
          queued: reminders.queued,
          skipped: reminders.skipped,
          failed: reminders.failed,
        },
        outbound: {
          mode: outbound.mode,
          inspected: outbound.inspected,
          processed: outbound.processed,
          sent: outbound.sent,
        },
      });
    }
  } catch (error) {
    log("cycle_error", {
      error:
        error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
    });
  } finally {
    running = false;
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  log("shutdown", { signal });
  const deadline = Date.now() + 15_000;
  while (running && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  log("unhandled_rejection", { reason: String(reason).slice(0, 1_000) });
});
process.on("uncaughtException", (error) => {
  log("uncaught_exception", { error: error.message.slice(0, 1_000) });
  void shutdown("UNCAUGHT_EXCEPTION");
});

log("started", { intervalSeconds: INTERVAL_MS / 1_000 });
void runCycle();
timer = setInterval(() => void runCycle(), INTERVAL_MS);
// Keep the interval referenced so the standalone PM2 worker stays alive.

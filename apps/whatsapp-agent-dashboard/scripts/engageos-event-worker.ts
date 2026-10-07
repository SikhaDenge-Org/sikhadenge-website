import { processDurableWhatsAppEvent } from "@/lib/meta/durable-webhook-runtime";
import { createPrismaEventRuntimePersistence } from "@/modules/events/infrastructure/prisma-event-runtime";
import { RedisEventQueue } from "@/modules/events/infrastructure/redis-event-queue";
import { createNodeRedisTransportFromEnv } from "@/modules/events/infrastructure/node-redis-transport";
import { runEventWorkerLoop } from "@/workers/event-worker";

function requiredEnabled(name: string): void {
  if (process.env[name]?.trim().toLowerCase() !== "true") {
    throw new Error(`${name}=true is required to start the EngageOS event worker.`);
  }
}

async function main() {
  requiredEnabled("ENGAGEOS_EVENT_RUNTIME_ENABLED");
  requiredEnabled("ENGAGEOS_EVENT_WORKER_ENABLED");

  const redis = createNodeRedisTransportFromEnv();
  if (!(await redis.ping())) throw new Error("Redis health check failed.");

  const queue = new RedisEventQueue(redis);
  const persistence = createPrismaEventRuntimePersistence();
  const controller = new AbortController();

  const shutdown = () => controller.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await runEventWorkerLoop({
      store: persistence.store,
      queue,
      deadLetters: persistence.deadLetters,
      processor: processDurableWhatsAppEvent,
      retryPolicy: {
        maxAttempts: 5,
        baseDelayMs: 1_000,
        maxDelayMs: 60_000,
      },
      idleDelayMs: 250,
      signal: controller.signal,
    });
  } finally {
    await redis.close();
  }
}

main().catch((error) => {
  console.error("EngageOS event worker failed:", error);
  process.exitCode = 1;
});

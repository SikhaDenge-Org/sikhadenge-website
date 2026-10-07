import type { EventJob, EventQueue } from "@/modules/events/application/event-runtime";

export interface RedisCommandTransport {
  command<T = unknown>(...args: string[]): Promise<T>;
}

const CLAIM_DUE_JOB_LUA = `
local rows = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 1)
if #rows == 0 then return nil end
if redis.call('ZREM', KEYS[1], rows[1]) == 1 then return rows[1] end
return nil
`;

export class RedisEventQueue implements EventQueue {
  constructor(
    private readonly redis: RedisCommandTransport,
    private readonly key = "engageos:event-queue:v1",
  ) {}

  async enqueue(job: EventJob): Promise<void> {
    const score = Date.parse(job.availableAt);
    if (!Number.isFinite(score)) throw new Error("Event job availableAt is invalid.");
    await this.redis.command("ZADD", this.key, String(score), JSON.stringify(job));
  }

  async dequeueDue(now: Date): Promise<EventJob | null> {
    const raw = await this.redis.command<string | null>(
      "EVAL",
      CLAIM_DUE_JOB_LUA,
      "1",
      this.key,
      String(now.getTime()),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EventJob;
    if (!parsed.eventId || !parsed.eventKey || !parsed.correlationId) {
      throw new Error("Redis queue returned an invalid event job.");
    }
    return parsed;
  }
}

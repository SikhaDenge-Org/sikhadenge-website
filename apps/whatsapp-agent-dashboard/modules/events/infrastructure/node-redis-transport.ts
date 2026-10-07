import { createClient, type RedisClientType } from "redis";

import type { RedisCommandTransport } from "@/modules/events/infrastructure/redis-event-queue";

type Environment = Readonly<Record<string, string | undefined>>;

export class NodeRedisCommandTransport implements RedisCommandTransport {
  private client: RedisClientType | null = null;
  private connectPromise: Promise<RedisClientType> | null = null;

  constructor(private readonly url: string) {
    if (!url.trim()) throw new Error("REDIS_URL must be configured.");
  }

  private async connectedClient(): Promise<RedisClientType> {
    if (this.client?.isReady) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      const client = createClient({ url: this.url });
      client.on("error", () => undefined);
      await client.connect();
      this.client = client;
      return client;
    })();

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async command<T = unknown>(...args: string[]): Promise<T> {
    const client = await this.connectedClient();
    return (await client.sendCommand(args)) as T;
  }

  async ping(): Promise<boolean> {
    const client = await this.connectedClient();
    return (await client.ping()) === "PONG";
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client?.isOpen) return;
    await client.quit();
  }
}

export function createNodeRedisTransportFromEnv(
  env: Environment = process.env,
): NodeRedisCommandTransport {
  const url = env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL is required when EngageOS event runtime is enabled.");
  return new NodeRedisCommandTransport(url);
}

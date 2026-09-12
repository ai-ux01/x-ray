// Minimal job queue abstraction.
//
// Uses Redis (via ioredis) when REDIS_URL is set, otherwise an in-process
// fallback for local development. The audit pipeline runs asynchronously so
// the browser never waits for a full audit — users can leave and return.

import { env } from "@/lib/env";

export interface AuditJob {
  auditId: string;
  url: string;
}

export interface Queue {
  enqueue(job: AuditJob): Promise<void>;
  process(handler: (job: AuditJob) => Promise<void>): void;
}

const QUEUE_KEY = "wxr:audit:queue";

class RedisQueue implements Queue {
  // Lazily import ioredis so it isn't bundled into the client.
  private clientPromise: Promise<import("ioredis").Redis> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("ioredis").then(
        ({ default: Redis }) => new Redis(env.redisUrl!),
      );
    }
    return this.clientPromise;
  }

  async enqueue(job: AuditJob): Promise<void> {
    const c = await this.client();
    await c.lpush(QUEUE_KEY, JSON.stringify(job));
  }

  process(handler: (job: AuditJob) => Promise<void>): void {
    void this.loop(handler);
  }

  private async loop(handler: (job: AuditJob) => Promise<void>) {
    const c = await this.client();
    // Blocking pop loop for a dedicated worker process.
    for (;;) {
      try {
        const res = await c.brpop(QUEUE_KEY, 5);
        if (!res) continue;
        const job = JSON.parse(res[1]) as AuditJob;
        await handler(job).catch((err) => console.error("[queue] job failed", err));
      } catch (err) {
        console.error("[queue] loop error", err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

class MemoryQueue implements Queue {
  private jobs: AuditJob[] = [];
  private handler: ((job: AuditJob) => Promise<void>) | null = null;

  async enqueue(job: AuditJob): Promise<void> {
    this.jobs.push(job);
    // Fire-and-forget so the API responds immediately.
    queueMicrotask(() => void this.drain());
  }

  process(handler: (job: AuditJob) => Promise<void>): void {
    this.handler = handler;
    void this.drain();
  }

  private async drain() {
    if (!this.handler) return;
    while (this.jobs.length) {
      const job = this.jobs.shift()!;
      await this.handler(job).catch((err) => console.error("[queue] job failed", err));
    }
  }
}

let queue: Queue | null = null;

export function getQueue(): Queue {
  if (queue) return queue;
  queue = env.redisUrl ? new RedisQueue() : new MemoryQueue();
  return queue;
}

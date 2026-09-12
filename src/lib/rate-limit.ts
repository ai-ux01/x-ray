// Lightweight fixed-window rate limiter.
// Uses Redis when available; otherwise an in-memory map (dev/single instance).

import { env } from "@/lib/env";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

const memoryBuckets = new Map<string, { count: number; expires: number }>();

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (env.redisUrl) {
    try {
      const { default: Redis } = await import("ioredis");
      // Reuse a singleton across calls.
      const client = (globalThis as any).__wxrRedis ?? new Redis(env.redisUrl);
      (globalThis as any).__wxrRedis = client;

      const redisKey = `wxr:rl:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) await client.expire(redisKey, windowSeconds);
      const ttl = await client.ttl(redisKey);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: ttl,
      };
    } catch {
      // Fall through to memory on Redis failure.
    }
  }

  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.expires < now) {
    memoryBuckets.set(key, { count: 1, expires: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetSeconds: Math.ceil((bucket.expires - now) / 1000),
  };
}

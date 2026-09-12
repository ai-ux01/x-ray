import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env, validateEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight health check. Reports database connectivity and non-sensitive
 * configuration status (never secret values). Returns 200 when the database is
 * reachable, 503 otherwise, so it can double as a readiness probe.
 */
export async function GET() {
  let database: "up" | "down" = "down";
  let dbError: string | undefined;

  try {
    // Cheapest possible round-trip to confirm the connection + that the schema
    // was pushed (an empty DB still answers SELECT 1).
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch (err) {
    dbError =
      err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "unknown error";
  }

  // Config warnings (booleans/flags only — no secret values are exposed).
  const configWarnings = validateEnv();

  const body = {
    status: database === "up" ? "ok" : "degraded",
    database,
    ...(dbError ? { dbError } : {}),
    ai: {
      provider: env.ai.provider,
      configured: env.ai.provider !== "disabled",
    },
    config: {
      hasDatabaseUrl: Boolean(env.databaseUrl),
      hasRedis: Boolean(env.redisUrl),
      allowPrivateIps: env.crawler.allowPrivateIps,
      artifactDir: process.env.ARTIFACT_DIR ?? "(default local dirs)",
      warnings: configWarnings,
    },
    time: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: database === "up" ? 200 : 503 });
}

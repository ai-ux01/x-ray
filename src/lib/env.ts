// Centralized, validated environment access.
// Never hard-code secrets. All AI keys/URLs come from here.

function bool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,

  ai: {
    provider: (process.env.AI_PROVIDER ?? "disabled") as
      | "ollama"
      | "openai"
      | "disabled",
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: process.env.OLLAMA_MODEL ?? "llama3.1",
    },
    openai: {
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
  },

  crawler: {
    maxPages: int(process.env.CRAWLER_MAX_PAGES, 10),
    maxDepth: int(process.env.CRAWLER_MAX_DEPTH, 2),
    requestTimeoutMs: int(process.env.CRAWLER_REQUEST_TIMEOUT_MS, 15000),
    maxResponseBytes: int(process.env.CRAWLER_MAX_RESPONSE_BYTES, 10 * 1024 * 1024),
    userAgent:
      process.env.CRAWLER_USER_AGENT ??
      "WebsiteX-RayBot/1.0 (+https://websitexray.app/bot)",
    allowPrivateIps: bool(process.env.CRAWLER_ALLOW_PRIVATE_IPS, false),
  },
} as const;

export type AppEnv = typeof env;

/**
 * Validates production-critical configuration. Returns a list of problems
 * (empty when healthy). Call at server/worker startup — never at module import,
 * which would break Next.js build-time page-data collection.
 */
export function validateEnv(): string[] {
  const problems: string[] = [];
  const isProd = env.nodeEnv === "production";

  if (!env.databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  }
  if (isProd) {
    if (!env.redisUrl) {
      problems.push(
        "REDIS_URL is not set — the in-memory queue is single-instance and not durable. Set REDIS_URL and run `npm run worker` in production.",
      );
    }
    if (env.crawler.allowPrivateIps) {
      problems.push(
        "CRAWLER_ALLOW_PRIVATE_IPS is enabled in production — this weakens SSRF protection. Set it to false.",
      );
    }
    if (env.appUrl.startsWith("http://localhost")) {
      problems.push("NEXT_PUBLIC_APP_URL still points at localhost.");
    }
  }
  if (env.ai.provider === "openai" && !env.ai.openai.apiKey) {
    problems.push("AI_PROVIDER is 'openai' but OPENAI_API_KEY is empty.");
  }
  return problems;
}

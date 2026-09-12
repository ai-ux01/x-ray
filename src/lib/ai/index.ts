import { env } from "@/lib/env";
import { AIProvider } from "@/lib/ai/types";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { OpenAICompatibleProvider } from "@/lib/ai/providers/openai";

// A no-op provider so the platform's core technical metrics work with AI
// completely disabled (product principle: the system must work without AI).
class DisabledProvider implements AIProvider {
  readonly name = "disabled";
  readonly model = "none";
  isConfigured() {
    return false;
  }
  async complete(): Promise<never> {
    throw new Error("AI provider is disabled.");
  }
}

let cached: AIProvider | null = null;

/**
 * Returns the configured AI provider. The analysis engine calls this and
 * depends only on the `AIProvider` interface, so providers are swappable via
 * the `AI_PROVIDER` env var without any engine changes.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  switch (env.ai.provider) {
    case "ollama":
      cached = new OllamaProvider();
      break;
    case "openai":
      cached = new OpenAICompatibleProvider();
      break;
    default:
      cached = new DisabledProvider();
  }
  return cached;
}

export function isAIEnabled(): boolean {
  return getAIProvider().isConfigured();
}

export * from "@/lib/ai/types";

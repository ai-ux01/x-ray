import { env } from "@/lib/env";
import {
  AICompletionOptions,
  AICompletionResult,
  AIProvider,
  AIUnavailableError,
} from "@/lib/ai/types";

// Local AI via Ollama's /api/chat endpoint.
export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = env.ai.ollama.baseUrl.replace(/\/$/, "");
    this.model = env.ai.ollama.model;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.model);
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new AIUnavailableError("Ollama is not configured.");
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: options.signal,
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          stream: false,
          format: options.json ? "json" : undefined,
          options: {
            temperature: options.temperature ?? 0.3,
            num_predict: options.maxTokens ?? 1024,
          },
        }),
      });
    } catch {
      throw new AIUnavailableError("Could not reach the local Ollama server.");
    }

    if (!res.ok) {
      throw new AIUnavailableError(`Ollama returned an error (${res.status}).`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: data.message?.content ?? "",
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      },
      provider: this.name,
      model: this.model,
    };
  }
}

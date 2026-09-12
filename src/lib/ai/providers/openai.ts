import { env } from "@/lib/env";
import {
  AICompletionOptions,
  AICompletionResult,
  AIProvider,
  AIUnavailableError,
} from "@/lib/ai/types";

// Works with any OpenAI-compatible /chat/completions endpoint
// (OpenAI, Together, Groq, OpenRouter, vLLM, LM Studio, ...).
// The API key is read from the environment only.
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = env.ai.openai.baseUrl.replace(/\/$/, "");
    this.apiKey = env.ai.openai.apiKey;
    this.model = env.ai.openai.model;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new AIUnavailableError("The AI provider is not configured.");
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: options.signal,
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1024,
          response_format: options.json ? { type: "json_object" } : undefined,
        }),
      });
    } catch {
      throw new AIUnavailableError("Could not reach the AI provider.");
    }

    if (!res.ok) {
      throw new AIUnavailableError(`The AI provider returned an error (${res.status}).`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
      provider: this.name,
      model: this.model,
    };
  }
}

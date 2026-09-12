// AI provider abstraction.
//
// The analysis engine depends ONLY on these interfaces. Concrete providers
// (Ollama, OpenAI-compatible) implement `AIProvider`. Swapping providers is a
// config change (AI_PROVIDER env var) and never touches the engine.

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  /** Ask the provider to return strict JSON when supported. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Abort signal for timeouts. */
  signal?: AbortSignal;
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface AICompletionResult {
  text: string;
  usage?: AIUsage;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** Whether the provider is configured and usable. */
  isConfigured(): boolean;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
}

export class AIUnavailableError extends Error {
  constructor(message = "AI analysis is currently unavailable.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

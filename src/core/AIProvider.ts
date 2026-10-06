/**
 * Single abstraction point for all AI inference in Dev Companion AI.
 *
 * No feature module may import a provider implementation (e.g. OllamaProvider)
 * or talk to a model backend directly. Every feature depends only on the
 * `AIProvider` interface exported here, obtained via `createAIProvider()`.
 */

export interface CompletionOptions {
  /** Overrides the configured model for this call only. */
  model?: string;
  /** Sampling temperature, 0-1. Provider-specific defaults apply if omitted. */
  temperature?: number;
  /** Optional system prompt prepended to the conversation. */
  systemPrompt?: string;
}

export interface CompletionResult {
  text: string;
  model: string;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIProviderUnavailableError extends AIProviderError {
  constructor(providerName: string, endpoint: string, cause?: unknown) {
    super(
      `Dev Companion AI could not reach the "${providerName}" provider at ${endpoint}. ` +
        `Make sure it is running and reachable, then try again. ` +
        `(e.g. for Ollama: run "ollama serve" and confirm Settings → Dev Companion AI → Ollama URL)`,
      cause
    );
    this.name = 'AIProviderUnavailableError';
  }
}

/**
 * Every AI-dependent feature module talks to this interface only.
 */
export interface AIProvider {
  readonly name: string;
  /** Sends a single prompt and returns the full completion (non-streaming). */
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>;
  /** Checks whether the provider is reachable right now. Never throws. */
  isAvailable(): Promise<boolean>;
  /** Whether the configured model is installed. Optional; absent or uncertain means "assume yes". */
  isModelAvailable?(): Promise<boolean>;
}

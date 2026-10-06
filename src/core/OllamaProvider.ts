import { AIProvider, AIProviderError, AIProviderUnavailableError, CompletionOptions, CompletionResult } from './AIProvider';

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  /** Milliseconds before a request is aborted. Defaults to 300s for local generation. */
  timeoutMs?: number;
  /** Injectable fetch implementation, primarily for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface OllamaGenerateChunk {
  model: string;
  response: string;
  done: boolean;
  /** Ollama reports mid-stream failures (e.g. out of memory) as `{"error": "..."}` lines. */
  error?: string;
}

/**
 * The ONLY module in this codebase allowed to speak Ollama's HTTP API
 * directly. Every other module must go through the `AIProvider` interface.
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = normalizeOllamaBaseUrl(options.baseUrl);
    this.defaultModel = options.model;
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new AIProviderError(
        'No fetch implementation available. Node.js 18+ is required, or pass options.fetchImpl.'
      );
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    const model = options?.model ?? this.defaultModel;
    const body = {
      model,
      prompt,
      system: options?.systemPrompt,
      // Streamed rather than `stream: false`: Ollama otherwise holds the
      // connection open with zero bytes sent until the *entire* completion
      // is ready, which lets Node's own independent ~300s fetch header
      // timeout kill long generations regardless of this class's own
      // (much larger) timeoutMs. Streaming means headers arrive as soon as
      // the first token does, so that unrelated timeout is never hit; the
      // timeoutMs below still governs the actual total time allowed.
      stream: true,
      // Disabled for models that support it (e.g. qwen3): every caller here
      // wants a direct, structured answer (code, docs, an explanation) —
      // not a visible chain-of-thought. Measured 4-5x faster on qwen3:8b
      // (728s -> 185s for the same prompt) with no loss in output quality.
      // Ollama ignores this field for models that don't support thinking.
      think: false,
      options: options?.temperature !== undefined ? { temperature: options.temperature } : undefined
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (isAbortError(err)) {
        throw new AIProviderError(
          `Ollama did not finish within ${Math.round(this.timeoutMs / 1000)}s at ${this.baseUrl}. ` +
            'The model may still be loading — wait a moment and try again.',
          err
        );
      }
      throw new AIProviderUnavailableError('ollama', this.baseUrl, err);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const text = await safeReadText(response);
      throw new AIProviderError(
        `Ollama returned an error (HTTP ${response.status}) at ${this.baseUrl}. ${text ?? ''}`.trim()
      );
    }

    try {
      return await this.readStreamedCompletion(response, model);
    } catch (err) {
      if (isAbortError(err)) {
        throw new AIProviderError(
          `Ollama did not finish within ${Math.round(this.timeoutMs / 1000)}s at ${this.baseUrl}. ` +
            'The model may still be loading — wait a moment and try again.',
          err
        );
      }
      if (err instanceof AIProviderError) {
        throw err;
      }
      throw new AIProviderError('Ollama returned a response that could not be parsed as JSON.', err);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Reads Ollama's newline-delimited JSON stream and concatenates it into one completion. */
  private async readStreamedCompletion(response: Response, requestedModel: string): Promise<CompletionResult> {
    if (!response.body) {
      throw new AIProviderError('Ollama returned an empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let model = requestedModel;

    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const chunk = JSON.parse(trimmed) as OllamaGenerateChunk;
      if (chunk.error) {
        throw new AIProviderError(`Ollama reported an error: ${chunk.error}`);
      }
      text += chunk.response ?? '';
      model = chunk.model ?? model;
    };

    let chunk = await reader.read();
    while (!chunk.done) {
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
      chunk = await reader.read();
    }
    if (buffer.trim()) {
      consumeLine(buffer);
    }

    if (!text.trim()) {
      throw new AIProviderError(
        `Ollama returned an empty response from model "${model}". Check that the model is installed (ollama pull ${model}).`
      );
    }

    return { text, model };
  }

  /**
   * True when the configured model is installed locally. Resolves true when
   * the answer can't be determined, so a flaky tags endpoint never produces a
   * false "model missing" warning.
   */
  async isModelAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      if (!response.ok) {
        return true;
      }
      const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      if (!Array.isArray(body.models)) {
        return true;
      }
      const wanted = this.defaultModel.includes(':') ? this.defaultModel : `${this.defaultModel}:latest`;
      return body.models.some((m) => (m.name ?? m.model) === wanted);
    } catch {
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * On macOS, `localhost` often resolves to IPv6 (::1) first, while Ollama
 * listens only on IPv4. Node's fetch then fails even though Ollama is up.
 */
export function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      return parsed.toString().replace(/\/+$/, '');
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
  );
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

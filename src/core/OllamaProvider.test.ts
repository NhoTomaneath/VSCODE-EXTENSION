import { OllamaProvider } from './OllamaProvider';
import { AIProviderUnavailableError, AIProviderError } from './AIProvider';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

/** Simulates Ollama's newline-delimited JSON stream over /api/generate. */
function streamedResponse(
  chunks: Array<{ model: string; response: string; done: boolean }>,
  ok = true,
  status = 200
): Response {
  const encoder = new TextEncoder();
  const lines = chunks.map((chunk) => JSON.stringify(chunk) + '\n');
  let index = 0;

  const body = {
    getReader() {
      return {
        async read() {
          if (index < lines.length) {
            const value = encoder.encode(lines[index]);
            index += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }
      };
    }
  };

  return { ok, status, body, text: async () => lines.join('') } as unknown as Response;
}

describe('OllamaProvider', () => {
  it('sends prompts to /api/generate (streamed) and returns the completion text', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(streamedResponse([{ model: 'qwen3:8b', response: 'hello', done: true }]));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.complete('say hi');

    expect(result).toEqual({ text: 'hello', model: 'qwen3:8b' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/generate',
      expect.objectContaining({ method: 'POST' })
    );
    const requestBody = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody).toMatchObject({ stream: true, think: false });
  });

  it('concatenates multiple streamed chunks into the final completion text', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      streamedResponse([
        { model: 'qwen3:8b', response: 'Hello, ', done: false },
        { model: 'qwen3:8b', response: 'world!', done: true }
      ])
    );
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.complete('say hi');

    expect(result).toEqual({ text: 'Hello, world!', model: 'qwen3:8b' });
  });

  it('strips trailing slashes from the base URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(streamedResponse([{ model: 'qwen3:8b', response: 'hi', done: true }]));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434/', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.complete('hi');

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:11434/api/generate', expect.anything());
  });

  it('rewrites localhost to 127.0.0.1 so macOS IPv6 does not miss Ollama', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(streamedResponse([{ model: 'qwen3:8b', response: 'ok', done: true }]));
    const provider = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await provider.complete('hi');

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:11434/api/generate', expect.anything());
  });

  it('throws a timeout error instead of "could not reach" when the request is aborted', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = jest.fn().mockRejectedValue(abort);
    const provider = new OllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      timeoutMs: 50,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(provider.complete('hi')).rejects.toThrow(/did not finish/i);
  });

  it('throws AIProviderUnavailableError with an actionable message when the network call fails', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.complete('hi')).rejects.toThrow(AIProviderUnavailableError);
    await expect(provider.complete('hi')).rejects.toThrow(/could not reach/i);
  });

  it('throws AIProviderError (not a crash) on a non-OK HTTP response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'model not found' }, false, 404));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.complete('hi')).rejects.toThrow(AIProviderError);
  });

  it('isAvailable() returns false rather than throwing when unreachable', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns true when /api/tags responds OK', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ models: [] }));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('throws when Ollama reports an error mid-stream instead of returning empty text', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(streamedResponse([{ error: 'model requires more system memory' } as never]));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.complete('hi')).rejects.toThrow(/more system memory/);
  });

  it('throws on an empty completion', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(streamedResponse([{ model: 'qwen3:8b', response: '', done: true }]));
    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.complete('hi')).rejects.toThrow(/empty response/);
  });

  it('isModelAvailable() reflects whether the configured model is installed', async () => {
    const tags = jsonResponse({ models: [{ name: 'llama3:latest' }] });
    const fetchImpl = jest.fn().mockResolvedValue(tags);
    const missing = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b', fetchImpl: fetchImpl as unknown as typeof fetch });
    const present = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(missing.isModelAvailable()).resolves.toBe(false);
    await expect(present.isModelAvailable()).resolves.toBe(true);
  });
});

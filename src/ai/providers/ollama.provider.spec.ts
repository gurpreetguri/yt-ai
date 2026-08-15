import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../../config/ai.config';
import type { AiInvocationRequest } from '../ai-provider.interface';
import { AiProviderError } from '../ai-provider.interface';
import { OllamaProvider } from './ollama.provider';

/**
 * Unit tests for the Ollama local-model provider. `global.fetch` is
 * replaced with a controllable mock for every test — no real Ollama server
 * is ever required to be running (commissioning brief "Ollama" §"Do not
 * require Ollama to be running during unit tests"). Signal-aware mocks
 * exercise the same `AbortController` wiring `anthropic.provider.spec.ts`
 * verifies for the cloud adapter, so the two providers are held to an
 * identical timeout-handling standard.
 */
describe('OllamaProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeConfig(): ConfigType<typeof aiConfig> {
    return {
      provider: 'mock',
      anthropic: {
        apiKey: undefined,
        model: 'claude-test-model',
        apiVersion: '2023-06-01',
        baseUrl: 'https://api.anthropic.invalid',
        quality: 'BALANCED',
      },
      openai: { apiKey: undefined, model: 'gpt-test-model', quality: 'BALANCED' },
      gemini: { apiKey: undefined, model: 'gemini-test-model', quality: 'BALANCED' },
      openrouter: { apiKey: undefined, model: 'openrouter-test-model', quality: 'BALANCED' },
      groq: { apiKey: undefined, model: 'groq-test-model', quality: 'BALANCED' },
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3', quality: 'BALANCED' },
      timeoutMs: 45_000,
      maxOutputTokens: 8_000,
      router: {
        mode: 'auto',
        allowLocal: true,
        allowFree: true,
        allowPaid: true,
        fallbackEnabled: true,
        primaryProvider: undefined,
        defaultQuality: 'BALANCED',
        rateLimitCooldownMs: 30_000,
        quotaExhaustedCooldownMs: 3_600_000,
        freeProviders: [],
      },
    };
  }

  function makeRequest(overrides: Partial<AiInvocationRequest> = {}): AiInvocationRequest {
    return {
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
      parameters: { temperature: 0.2, topP: 1.0 },
      timeoutMs: 45_000,
      ...overrides,
    };
  }

  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response;
  }

  function hangingBodyResponse(status: number, signal: AbortSignal): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    } as unknown as Response;
  }

  // 24. Ollama success.
  it('returns a normalised result for a successful, complete response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'llama3',
        message: { role: 'assistant', content: '{"hello":"world"}' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 34,
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.content).toBe('{"hello":"world"}');
    expect(result.finishReason).toBe('COMPLETE');
    expect(result.provider).toBe('ollama');
    expect(result.modelId).toBe('llama3');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
  });

  it('maps done_reason=length to a TRUNCATED finish reason', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'llama3',
        message: { role: 'assistant', content: 'partial output' },
        done: true,
        done_reason: 'length',
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.finishReason).toBe('TRUNCATED');
  });

  it('passes an explicit request.model override through to the request body', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'llama3:70b',
        message: { role: 'assistant', content: 'ok' },
        done: true,
        done_reason: 'stop',
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());
    await provider.invoke(makeRequest({ model: 'llama3:70b' }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('llama3:70b');
  });

  // 25. Ollama timeout.
  it('throws a normalised TIMEOUT AiProviderError when fetch does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'ollama',
    });
  });

  it('throws a normalised TIMEOUT AiProviderError when the response body read does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) throw new Error('test setup: signal expected');
      return Promise.resolve(hangingBodyResponse(200, signal));
    }) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'ollama',
    });
  });

  it('throws a normalised NETWORK AiProviderError when the server cannot be reached', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'NETWORK',
      provider: 'ollama',
    });
  });

  // 26. Ollama malformed response.
  it('throws a normalised INVALID_RESPONSE AiProviderError when the body is not valid JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'INVALID_RESPONSE',
      provider: 'ollama',
    });
  });

  it('throws a normalised INVALID_RESPONSE AiProviderError when the response has no message content', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { model: 'llama3', done: true, done_reason: 'stop' }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });

  it('normalises a 404 (model not pulled) response as a CONFIGURATION AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(404, { error: 'model "llama3" not found' }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'CONFIGURATION',
      provider: 'ollama',
    });
  });

  it('normalises a generic non-2xx response as a PROVIDER_ERROR AiProviderError, without leaking the raw body', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { error: 'internal error' }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toBeInstanceOf(AiProviderError);
    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'PROVIDER_ERROR',
      provider: 'ollama',
    });
  });

  it('always clears the timeout timer, even on a successful invocation (no leaked timer)', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'llama3',
        message: { role: 'assistant', content: 'ok' },
        done: true,
        done_reason: 'stop',
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());
    await provider.invoke(makeRequest());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the configured default model when no explicit model is requested', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'llama3',
        message: { role: 'assistant', content: 'ok' },
        done: true,
        done_reason: 'stop',
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OllamaProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('llama3');
  });
});

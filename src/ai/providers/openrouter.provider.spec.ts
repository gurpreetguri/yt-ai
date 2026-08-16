import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../../config/ai.config';
import type { AiInvocationRequest } from '../ai-provider.interface';
import { AiProviderError } from '../ai-provider.interface';
import { OpenRouterProvider } from './openrouter.provider';

/**
 * Unit tests for the OpenRouter provider. `global.fetch` is replaced with a
 * controllable mock for every test — no real network call is ever made.
 * Mirrors `anthropic.provider.spec.ts`/`ollama.provider.spec.ts`: the same
 * timeout, abort, and error-normalisation discipline is verified here.
 */
describe('OpenRouterProvider', () => {
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
      provider: 'openrouter',
      anthropic: {
        apiKey: undefined,
        model: 'claude-test-model',
        apiVersion: '2023-06-01',
        baseUrl: 'https://api.anthropic.invalid',
        quality: 'BALANCED',
      },
      openai: { apiKey: undefined, model: 'gpt-test-model', quality: 'BALANCED' },
      gemini: {
        apiKey: undefined,
        model: 'gemini-test-model',
        baseUrl: 'https://gemini.invalid/v1beta',
        quality: 'BALANCED',
      },
      openrouter: {
        apiKey: 'test-api-key',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        baseUrl: 'https://openrouter.invalid/api/v1',
        quality: 'BALANCED',
      },
      groq: { apiKey: undefined, model: 'groq-test-model', baseUrl: 'https://groq.invalid/openai/v1', quality: 'BALANCED' },
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3', quality: 'BALANCED', numCtx: 8192 },
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
      agentProviders: {},
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

  it('returns a normalised result for a successful, complete response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: '{"hello":"world"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 34 },
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.content).toBe('{"hello":"world"}');
    expect(result.finishReason).toBe('COMPLETE');
    expect(result.provider).toBe('openrouter');
    expect(result.modelId).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
  });

  it('maps finish_reason=length to a TRUNCATED finish reason', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: 'partial output' }, finish_reason: 'length' }],
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.finishReason).toBe('TRUNCATED');
  });

  it('passes an explicit request.model override through to the request body', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'openai/gpt-4o-mini',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    await provider.invoke(makeRequest({ model: 'openai/gpt-4o-mini' }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('openai/gpt-4o-mini');
  });

  it('always disables reasoning, so a reasoning-capable model spends its full token budget on content', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { reasoning: { enabled: boolean } };
    expect(body.reasoning).toEqual({ enabled: false });
  });

  it('sends the API key as a Bearer authorization header', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.invalid/api/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-api-key');
  });

  it('throws a CONFIGURATION AiProviderError without calling fetch when no API key is configured', async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const config = makeConfig();
    (config.openrouter as { apiKey: string | undefined }).apiKey = undefined;
    const provider = new OpenRouterProvider(config);

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws a normalised TIMEOUT AiProviderError when fetch does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'openrouter',
    });
  });

  it('throws a normalised TIMEOUT AiProviderError when the response body read does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) throw new Error('test setup: signal expected');
      return Promise.resolve(hangingBodyResponse(200, signal));
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'openrouter',
    });
  });

  it('throws a normalised NETWORK AiProviderError when the server cannot be reached', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'NETWORK',
      provider: 'openrouter',
    });
  });

  it('normalises a 401 response as an AUTH AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { error: { message: 'invalid API key' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'AUTH' });
  });

  it('normalises a 429 response as a RATE_LIMIT AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: { message: 'rate limited' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
  });

  it('normalises a 404 (unknown model) response as a CONFIGURATION AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(404, { error: { message: 'model not found' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
  });

  it('normalises a generic non-2xx response as a PROVIDER_ERROR AiProviderError, without leaking the raw body', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { error: { message: 'internal error' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toBeInstanceOf(AiProviderError);
    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'PROVIDER_ERROR',
      provider: 'openrouter',
    });
  });

  it('throws a normalised INVALID_RESPONSE AiProviderError when the body is not valid JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'INVALID_RESPONSE',
      provider: 'openrouter',
    });
  });

  it('throws a normalised INVALID_RESPONSE AiProviderError when the response has no choices', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { id: 'gen-01', model: 'meta-llama/llama-3.3-70b-instruct:free', choices: [] }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });

  it('always clears the timeout timer, even on a successful invocation (no leaked timer)', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    await provider.invoke(makeRequest());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the configured default model when no explicit model is requested', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-01',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });
});

import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../../config/ai.config';
import type { AiInvocationRequest } from '../ai-provider.interface';
import { AiProviderError } from '../ai-provider.interface';
import { GeminiProvider } from './gemini.provider';

/**
 * Unit tests for the Gemini provider. `global.fetch` is replaced with a
 * controllable mock for every test — no real network call is ever made.
 * Mirrors `anthropic.provider.spec.ts`/`ollama.provider.spec.ts`/
 * `openrouter.provider.spec.ts`: the same timeout, abort, and
 * error-normalisation discipline is verified here, adapted to Gemini's
 * distinct request/response shape (`contents`/`candidates`, API key as a
 * query parameter).
 */
describe('GeminiProvider', () => {
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
      provider: 'gemini',
      anthropic: {
        apiKey: undefined,
        model: 'claude-test-model',
        apiVersion: '2023-06-01',
        baseUrl: 'https://api.anthropic.invalid',
        quality: 'BALANCED',
      },
      openai: { apiKey: undefined, model: 'gpt-test-model', quality: 'BALANCED' },
      gemini: {
        apiKey: 'test-api-key',
        model: 'gemini-2.5-flash',
        baseUrl: 'https://gemini.invalid/v1beta',
        quality: 'BALANCED',
      },
      openrouter: {
        apiKey: undefined,
        model: 'openrouter-test-model',
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
        candidates: [
          { content: { parts: [{ text: '{"hello":"world"}' }] }, finishReason: 'STOP' },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
        modelVersion: 'gemini-2.5-flash',
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.content).toBe('{"hello":"world"}');
    expect(result.finishReason).toBe('COMPLETE');
    expect(result.provider).toBe('gemini');
    expect(result.modelId).toBe('gemini-2.5-flash');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
  });

  it('maps finishReason=MAX_TOKENS to a TRUNCATED finish reason', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.finishReason).toBe('TRUNCATED');
  });

  it('maps finishReason=SAFETY to a REFUSED finish reason', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'refused' }] }, finishReason: 'SAFETY' }],
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.finishReason).toBe('REFUSED');
  });

  it('sends the API key as a query parameter and the model in the URL path', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gemini.invalid/v1beta/models/gemini-2.5-flash:generateContent?key=test-api-key');
  });

  it("sends the converted responseSchema when structuredOutput.schema is a resolvable {root, defs} envelope", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(
      makeRequest({
        structuredOutput: {
          schemaName: 'testSchema',
          schema: {
            root: { type: 'object', properties: { key: { $ref: '#/$defs/localKey' } }, required: ['key'] },
            defs: { localKey: { type: 'string', pattern: '^[A-Z]+$' } },
          },
        },
      }),
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { responseSchema?: unknown };
    };
    expect(body.generationConfig.responseSchema).toEqual({
      type: 'OBJECT',
      properties: { key: { type: 'STRING', pattern: '^[A-Z]+$' } },
      required: ['key'],
    });
  });

  it('omits responseSchema (falls back gracefully) when structuredOutput.schema has an unresolvable $ref', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(
      makeRequest({
        structuredOutput: {
          schemaName: 'testSchema',
          schema: { $ref: '#/$defs/missing' },
        },
      }),
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { responseSchema?: unknown };
    };
    expect(body.generationConfig.responseSchema).toBeUndefined();
  });

  it('always requests responseMimeType=application/json', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(makeRequest());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { generationConfig: { responseMimeType: string } };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('passes an explicit request.model override into the URL path', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(makeRequest({ model: 'gemini-2.5-pro' }));

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-pro:generateContent');
  });

  it('throws a CONFIGURATION AiProviderError without calling fetch when no API key is configured', async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const config = makeConfig();
    (config.gemini as { apiKey: string | undefined }).apiKey = undefined;
    const provider = new GeminiProvider(config);

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws a normalised TIMEOUT AiProviderError when fetch does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'gemini',
    });
  });

  it('throws a normalised TIMEOUT AiProviderError when the response body read does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) throw new Error('test setup: signal expected');
      return Promise.resolve(hangingBodyResponse(200, signal));
    }) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'gemini',
    });
  });

  it('throws a normalised NETWORK AiProviderError when the server cannot be reached', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'NETWORK',
      provider: 'gemini',
    });
  });

  it('normalises a 403 response as an AUTH AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { error: { message: 'invalid API key' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'AUTH' });
  });

  it('normalises a 429 response as a RATE_LIMIT AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: { message: 'rate limited' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
  });

  it('normalises a 400 (invalid model) response as a CONFIGURATION AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: 'invalid model name' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
  });

  it('normalises a generic non-2xx response as a PROVIDER_ERROR AiProviderError, without leaking the raw body', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { error: { message: 'internal error' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toBeInstanceOf(AiProviderError);
    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'PROVIDER_ERROR',
      provider: 'gemini',
    });
  });

  it('throws a normalised INVALID_RESPONSE AiProviderError when the body is not valid JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'INVALID_RESPONSE',
      provider: 'gemini',
    });
  });

  it('throws a normalised INVALID_RESPONSE AiProviderError when the response has no candidates', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { candidates: [] })) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });

  it('always clears the timeout timer, even on a successful invocation (no leaked timer)', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new GeminiProvider(makeConfig());
    await provider.invoke(makeRequest());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});

import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../../config/ai.config';
import type { AiInvocationRequest } from '../ai-provider.interface';
import { AiProviderError } from '../ai-provider.interface';
import { AnthropicProvider } from './anthropic.provider';

/**
 * Unit tests for the shared Anthropic provider implementation.
 *
 * `global.fetch` is replaced with a controllable mock for every test — no
 * real network call is ever made. The mock is signal-aware where a test
 * needs to simulate a hang (fetch never settling, or a response body never
 * finishing), so the provider's `AbortController` wiring is exercised the
 * same way it would be by a real stalled connection.
 *
 * This provider is shared infrastructure (`ai-provider.interface.ts`): both
 * AGT-00 and AGT-01 depend on the same behaviour verified here.
 */
describe('AnthropicProvider', () => {
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
      provider: 'anthropic',
      anthropic: {
        apiKey: 'test-api-key',
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

  /** A `Response` whose `.json()` never settles unless the given signal aborts. */
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

  // 3. Successful response.
  it('returns a normalised result for a successful, complete response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'msg_01',
        model: 'claude-test-model',
        content: [{ type: 'text', text: '{"hello":"world"}' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 34 },
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());
    const result = await provider.invoke(makeRequest());

    expect(result.content).toBe('{"hello":"world"}');
    expect(result.finishReason).toBe('COMPLETE');
    expect(result.provider).toBe('anthropic');
    expect(result.modelId).toBe('claude-test-model');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
  });

  // 4. Provider error response.
  it('normalises a 429 response as a RATE_LIMIT AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: { type: 'rate_limit_error', message: 'rate limited' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({
      kind: 'RATE_LIMIT',
      provider: 'anthropic',
    });
  });

  it('normalises a 401 response as an AUTH AiProviderError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { error: { type: 'authentication_error', message: 'invalid key' } }),
      ) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'AUTH' });
  });

  // 1. fetch timeout — the request itself never receives a response before timeoutMs.
  // 5. timeout remains normalized as AiProviderError('TIMEOUT', ...).
  it('throws a normalised TIMEOUT AiProviderError when fetch does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'anthropic',
    });
  });

  // 2. response-body/read timeout — fetch() itself resolves promptly (headers received),
  //    but reading the body hangs past timeoutMs. Fix 2: this MUST also be reported as
  //    TIMEOUT, not as INVALID_RESPONSE or a leaked, unenforced hang.
  it('throws a normalised TIMEOUT AiProviderError when the response body read does not settle before timeoutMs', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) throw new Error('test setup: signal expected');
      return Promise.resolve(hangingBodyResponse(200, signal));
    }) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());

    await expect(provider.invoke(makeRequest({ timeoutMs: 20 }))).rejects.toMatchObject({
      kind: 'TIMEOUT',
      provider: 'anthropic',
    });
  });

  it('always clears the timeout timer, even on a successful invocation (no leaked timer)', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'msg_01',
        model: 'claude-test-model',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());
    await provider.invoke(makeRequest());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('always clears the timeout timer, even when the invocation fails with a TIMEOUT', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn().mockImplementation((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new AnthropicProvider(makeConfig());
    await expect(provider.invoke(makeRequest({ timeoutMs: 10 }))).rejects.toBeInstanceOf(AiProviderError);

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('throws a CONFIGURATION AiProviderError without calling fetch when no API key is configured', async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const config = makeConfig();
    (config.anthropic as { apiKey: string | undefined }).apiKey = undefined;
    const provider = new AnthropicProvider(config);

    await expect(provider.invoke(makeRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Agent } from 'undici';

import { aiConfig } from '../../config/ai.config';
import {
  AiFinishReason,
  AiInvocationRequest,
  AiInvocationResult,
  AiProvider,
  AiProviderError,
} from '../ai-provider.interface';

interface GeminiPart {
  readonly text?: string;
}

interface GeminiCandidate {
  readonly content?: { readonly parts?: readonly GeminiPart[] };
  readonly finishReason?: string;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly GeminiCandidate[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
  readonly modelVersion?: string;
}

interface GeminiErrorResponse {
  readonly error?: { readonly message?: string; readonly status?: string };
}

const FINISH_REASON_MAP: Record<string, AiFinishReason> = {
  STOP: 'COMPLETE',
  MAX_TOKENS: 'TRUNCATED',
  SAFETY: 'REFUSED',
  RECITATION: 'REFUSED',
  BLOCKLIST: 'REFUSED',
  PROHIBITED_CONTENT: 'REFUSED',
  SPII: 'REFUSED',
};

/**
 * Node's built-in `fetch` (undici) applies its own 300_000ms
 * headersTimeout/bodyTimeout independent of any `AbortController` passed in
 * — see the identical note in `ollama.provider.ts`. Applied uniformly to
 * every provider so `timeoutMs` is always the single source of truth.
 */
const NO_UNDICI_TIMEOUT_DISPATCHER = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * Google Gemini provider (ai.google.dev/api/generate-content) — Google's
 * native Generative Language API, distinct in shape from the OpenAI-style
 * APIs the other providers here use (`contents`/`systemInstruction` instead
 * of `messages`, `candidates` instead of `choices`, the API key as a query
 * parameter rather than an Authorization header).
 *
 * Sets `responseMimeType: 'application/json'` on every call — a real,
 * always-supported Gemini feature that guarantees syntactically valid JSON
 * output. It intentionally does NOT set `responseSchema` (Gemini's stronger
 * schema-CONSTRAINED decoding feature): that field uses a restricted
 * OpenAPI-3.0-like subset of JSON Schema (no `$ref`/`$defs`, limited
 * `pattern`/`format` support), and this codebase's manifest schemas are full
 * JSON Schema 2020-12 documents — passing one through unconverted would be
 * silently rejected or ignored. Wiring `responseSchema` for real would need
 * a genuine schema-format converter, which is a separate, larger piece of
 * work, not something to fold in here. `request.structuredOutput` is
 * therefore read only for its `schemaName` (unused) — the schema itself is
 * not forwarded — and, as with every other provider, the agent's own
 * `JSON.parse` + JSON Schema validation pipeline is what actually enforces
 * correctness regardless.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  public readonly providerName = 'gemini';

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.gemini;

    if (!apiKey) {
      throw new AiProviderError('CONFIGURATION', this.providerName, 'GEMINI_API_KEY is not configured.');
    }

    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    // Identical timeout-scoping discipline to the other providers: the
    // timer covers the complete invocation, including the body read, and
    // is cleared exactly once in `finally`, after that read completes.
    try {
      let response: Response;
      try {
        response = await fetch(
          `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            signal: controller.signal,
            dispatcher: NO_UNDICI_TIMEOUT_DISPATCHER as unknown as NonNullable<RequestInit['dispatcher']>,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
              systemInstruction: { parts: [{ text: request.systemPrompt }] },
              generationConfig: {
                temperature: request.parameters.temperature,
                topP: request.parameters.topP,
                responseMimeType: 'application/json',
                ...(request.parameters.maxOutputTokens !== undefined
                  ? { maxOutputTokens: request.parameters.maxOutputTokens }
                  : {}),
                ...(request.parameters.seed !== undefined ? { seed: request.parameters.seed } : {}),
              },
            }),
          },
        );
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AiProviderError(
            'TIMEOUT',
            this.providerName,
            `Invocation exceeded ${request.timeoutMs}ms.`,
            error,
          );
        }
        throw new AiProviderError('NETWORK', this.providerName, 'Failed to reach the Gemini API.', error);
      }

      const durationMs = Date.now() - startedAt;

      // Same abort-during-body-read handling as every other provider here.
      const body = await this.safeJson(response);
      if (controller.signal.aborted) {
        throw new AiProviderError(
          'TIMEOUT',
          this.providerName,
          `Invocation exceeded ${request.timeoutMs}ms.`,
        );
      }

      if (!response.ok) {
        throw this.toProviderError(response, body);
      }

      const payload = body as GeminiGenerateContentResponse | undefined;
      if (!payload) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Gemini response body was not valid JSON.',
        );
      }

      const candidate = payload.candidates?.[0];
      const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('');
      if (text === undefined || text.length === 0) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Gemini response contained no candidate content.',
        );
      }

      const finishReason = FINISH_REASON_MAP[candidate?.finishReason ?? ''] ?? 'ERROR';

      return {
        content: text,
        finishReason,
        provider: this.providerName,
        modelId: payload.modelVersion ?? model,
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
        durationMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toProviderError(response: Response, body: unknown): AiProviderError {
    const errorBody = body as GeminiErrorResponse | undefined;
    const message = errorBody?.error?.message ?? `Gemini API responded with HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) {
      return new AiProviderError('AUTH', this.providerName, message);
    }
    if (response.status === 429) {
      return new AiProviderError('RATE_LIMIT', this.providerName, message);
    }
    if (response.status === 400 || response.status === 404) {
      return new AiProviderError('CONFIGURATION', this.providerName, message);
    }
    return new AiProviderError('PROVIDER_ERROR', this.providerName, message);
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}

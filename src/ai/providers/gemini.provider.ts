import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Agent } from 'undici';

import { aiConfig } from '../../config/ai.config';
import {
  AiFinishReason,
  AiInvocationRequest,
  AiInvocationResult,
  AiProvider,
  AiProviderError,
  AiStructuredOutputRequest,
} from '../ai-provider.interface';
import { GeminiSchemaNode, toGeminiSchema } from './gemini-schema.util';

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
 * output. When `request.structuredOutput` is supplied, also sets
 * `responseSchema` (Gemini's stronger schema-CONSTRAINED decoding feature)
 * by converting the caller's JSON Schema via `gemini-schema.util.ts` — real
 * testing against the strategy agent's manifest schema (68 hard rules) cut
 * validation failures from ~56 to 1 by doing this, versus the model only
 * ever seeing a prose description of the same rules. Conversion is
 * defensive: `request.structuredOutput.schema` is `unknown` by contract
 * (`ai-provider.interface.ts`) and not every caller supplies the `{root,
 * defs}` shape the converter expects (a caller passing a bare fragment with
 * unresolvable `$ref`s, or no `structuredOutput` at all, is common and
 * valid) — any conversion failure is caught and simply omits
 * `responseSchema` for that call, falling back to the `responseMimeType`-
 * only behaviour every other request already gets. As with every other
 * provider, this is a HINT: the agent's own `JSON.parse` + JSON Schema
 * validation pipeline is what actually enforces correctness regardless.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  public readonly providerName = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  /**
   * Best-effort: expects `structuredOutput.schema` shaped as `{ root, defs }`
   * (see `strategy.service.ts`'s `MANIFEST_JSON_SCHEMA` for why `defs` is
   * needed alongside the fragment). Falls back to treating the whole value
   * as `root` with no `defs` when that shape isn't present, which succeeds
   * only if the fragment has no external `$ref`s. Any failure (an
   * unresolvable `$ref`, a malformed schema) is logged at debug level and
   * swallowed — never a request-breaking error, since this is strictly an
   * optional generation-quality improvement, never a correctness guarantee.
   */
  private tryBuildResponseSchema(
    structuredOutput: AiStructuredOutputRequest | undefined,
  ): GeminiSchemaNode | undefined {
    if (!structuredOutput) return undefined;
    try {
      const raw = structuredOutput.schema as { root?: unknown; defs?: Record<string, unknown> } | unknown;
      const hasEnvelope = raw !== null && typeof raw === 'object' && 'root' in (raw as object);
      const root = hasEnvelope ? (raw as { root: unknown }).root : raw;
      const defs = hasEnvelope ? ((raw as { defs?: Record<string, unknown> }).defs ?? {}) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structuredOutput.schema is opaque `unknown` by contract; this provider is the one place that interprets its shape, defensively, inside a try/catch.
      return toGeminiSchema(root as any, defs as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Could not convert structuredOutput.schema (${structuredOutput.schemaName}) to Gemini's native schema format; falling back to responseMimeType-only. ${message}`,
      );
      return undefined;
    }
  }

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.gemini;

    if (!apiKey) {
      throw new AiProviderError('CONFIGURATION', this.providerName, 'GEMINI_API_KEY is not configured.');
    }

    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    const responseSchema = this.tryBuildResponseSchema(request.structuredOutput);

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
                ...(responseSchema !== undefined ? { responseSchema } : {}),
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

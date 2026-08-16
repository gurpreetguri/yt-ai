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

interface GroqChoice {
  readonly message?: { readonly role: string; readonly content: string | null };
  readonly finish_reason: string | null;
}

interface GroqChatResponse {
  readonly id: string;
  readonly model: string;
  readonly choices: readonly GroqChoice[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

interface GroqErrorResponse {
  readonly error?: { readonly message?: string; readonly code?: string | number };
}

const FINISH_REASON_MAP: Record<string, AiFinishReason> = {
  stop: 'COMPLETE',
  length: 'TRUNCATED',
  content_filter: 'REFUSED',
};

/**
 * Node's built-in `fetch` (undici) applies its own 300_000ms
 * headersTimeout/bodyTimeout independent of any `AbortController` passed in
 * — see the identical note in `ollama.provider.ts`/`openrouter.provider.ts`.
 * Applied here too so `timeoutMs` is the single source of truth for every
 * provider, not just the one where it was first noticed.
 */
const NO_UNDICI_TIMEOUT_DISPATCHER = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * Groq provider (console.groq.com/docs/api-reference#chat-create) — an
 * OpenAI-compatible `/chat/completions` endpoint served on Groq's own LPU
 * inference hardware (fast, free-tier open-weight models like Llama 3.3).
 * Uses the platform `fetch` global, matching every other provider here — no
 * vendor SDK dependency.
 *
 * Does NOT set a structured-output `response_format` yet — unlike
 * `GeminiProvider`, no schema-conversion/testing has been done for Groq's
 * specific `response_format: {type: 'json_schema', ...}` support and limits
 * (a separate, real piece of work if this provider needs the same
 * compliance boost Gemini got). `request.structuredOutput` is therefore
 * read only implicitly (ignored) here, exactly like `AnthropicProvider`;
 * the agent's own JSON.parse + JSON Schema validation pipeline still
 * enforces correctness regardless.
 */
@Injectable()
export class GroqProvider implements AiProvider {
  public readonly providerName = 'groq';

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.groq;

    if (!apiKey) {
      throw new AiProviderError('CONFIGURATION', this.providerName, 'GROQ_API_KEY is not configured.');
    }

    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          dispatcher: NO_UNDICI_TIMEOUT_DISPATCHER as unknown as NonNullable<RequestInit['dispatcher']>,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            temperature: request.parameters.temperature,
            top_p: request.parameters.topP,
            ...(request.parameters.maxOutputTokens !== undefined
              ? { max_tokens: request.parameters.maxOutputTokens }
              : {}),
            ...(request.parameters.seed !== undefined ? { seed: request.parameters.seed } : {}),
          }),
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AiProviderError(
            'TIMEOUT',
            this.providerName,
            `Invocation exceeded ${request.timeoutMs}ms.`,
            error,
          );
        }
        throw new AiProviderError('NETWORK', this.providerName, 'Failed to reach the Groq API.', error);
      }

      const durationMs = Date.now() - startedAt;

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

      const payload = body as GroqChatResponse | undefined;
      if (!payload) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Groq response body was not valid JSON.',
        );
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (content === undefined || content === null) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Groq response contained no message content.',
        );
      }

      const finishReason = FINISH_REASON_MAP[choice?.finish_reason ?? ''] ?? 'ERROR';

      return {
        content,
        finishReason,
        provider: this.providerName,
        modelId: payload.model,
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        durationMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toProviderError(response: Response, body: unknown): AiProviderError {
    const errorBody = body as GroqErrorResponse | undefined;
    const message = errorBody?.error?.message ?? `Groq API responded with HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) {
      return new AiProviderError('AUTH', this.providerName, message);
    }
    if (response.status === 429) {
      return new AiProviderError('RATE_LIMIT', this.providerName, message);
    }
    if (response.status === 404 || response.status === 400) {
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

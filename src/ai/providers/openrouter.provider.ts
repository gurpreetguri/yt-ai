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

interface OpenRouterChoice {
  readonly message?: { readonly role: string; readonly content: string | null };
  readonly finish_reason: string | null;
}

interface OpenRouterChatResponse {
  readonly id: string;
  readonly model: string;
  readonly choices: readonly OpenRouterChoice[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

interface OpenRouterErrorResponse {
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
 * — see the identical note in `ollama.provider.ts`, where this silently cut
 * off long local-model generations regardless of a much higher configured
 * `AI_TIMEOUT_MS`. Applied here too so `timeoutMs` is the single source of
 * truth for every provider, not just the one where it was first noticed.
 */
const NO_UNDICI_TIMEOUT_DISPATCHER = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * OpenRouter provider (openrouter.ai/docs/api-reference/chat-completion) —
 * an OpenAI-compatible `/chat/completions` endpoint that proxies many
 * vendors' models, including free-tier (`:free`-suffixed) models, behind a
 * single API key. Uses the platform `fetch` global, matching
 * `AnthropicProvider`/`OllamaProvider` — no vendor SDK dependency.
 */
@Injectable()
export class OpenRouterProvider implements AiProvider {
  public readonly providerName = 'openrouter';

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.openrouter;

    if (!apiKey) {
      throw new AiProviderError('CONFIGURATION', this.providerName, 'OPENROUTER_API_KEY is not configured.');
    }

    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    // Identical timeout-scoping discipline to `AnthropicProvider`/
    // `OllamaProvider`: the timer covers the complete invocation, including
    // the body read, and is cleared exactly once in `finally`, after that
    // read completes.
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
            // Some OpenRouter-routed models are "reasoning" models that spend
            // a large, variable share of `max_tokens` on an internal
            // reasoning trace before ever writing the actual content — one
            // real run against a 120B free model spent 8127 of 8000 nominal
            // tokens on reasoning alone, truncating the JSON output entirely.
            // `max_tokens`/`maxOutputTokens` is a per-agent contractual
            // ceiling on CONTENT (system-prompt.md "Max output tokens"), not
            // on hidden reasoning; disabling reasoning here is what makes
            // that ceiling mean what it says for every model, reasoning or
            // not. Non-reasoning models silently ignore this field.
            reasoning: { enabled: false },
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
        throw new AiProviderError('NETWORK', this.providerName, 'Failed to reach the OpenRouter API.', error);
      }

      const durationMs = Date.now() - startedAt;

      // Same abort-during-body-read handling as `AnthropicProvider`/
      // `OllamaProvider`: check the abort state immediately after the
      // (possibly-rejected) body read, before an `undefined` body from
      // `safeJson` is ever misread as an ordinary malformed response
      // instead of a timeout.
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

      const payload = body as OpenRouterChatResponse | undefined;
      if (!payload) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'OpenRouter response body was not valid JSON.',
        );
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (content === undefined || content === null) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'OpenRouter response contained no message content.',
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
    const errorBody = body as OpenRouterErrorResponse | undefined;
    const message = errorBody?.error?.message ?? `OpenRouter API responded with HTTP ${response.status}.`;
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

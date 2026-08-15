import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { aiConfig } from '../../config/ai.config';
import {
  AiFinishReason,
  AiInvocationRequest,
  AiInvocationResult,
  AiProvider,
  AiProviderError,
} from '../ai-provider.interface';

interface AnthropicContentBlock {
  readonly type: string;
  readonly text?: string;
}

interface AnthropicMessagesResponse {
  readonly id: string;
  readonly model: string;
  readonly content: readonly AnthropicContentBlock[];
  readonly stop_reason: string | null;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

interface AnthropicErrorResponse {
  readonly error?: { readonly type?: string; readonly message?: string };
}

const STOP_REASON_MAP: Record<string, AiFinishReason> = {
  end_turn: 'COMPLETE',
  stop_sequence: 'COMPLETE',
  max_tokens: 'TRUNCATED',
  refusal: 'REFUSED',
  tool_use: 'COMPLETE',
};

/**
 * Anthropic Messages API provider (docs.anthropic.com/en/api/messages).
 * Uses the platform `fetch` global — no vendor SDK dependency, so the
 * abstraction boundary in `ai-provider.interface.ts` stays the only place
 * that knows the vendor's request/response shape.
 *
 * Structured-output limitation (implementation-checklist.md §4,
 * `AiInvocationRequest.structuredOutput`): the Anthropic Messages API used
 * here has no direct equivalent of OpenAI's `response_format: json_schema`
 * or Gemini's `responseSchema` — the only way to get schema-constrained
 * decoding from Claude today is forced tool-use (a `tools` + `tool_choice`
 * request that returns a `tool_use` content block instead of a `text`
 * block), which is a materially different request/response shape than the
 * plain-text call this provider makes. Adopting it is a real, scoped change
 * (request construction AND response parsing both change), not something to
 * fold into a narrow fix — so this provider intentionally does not act on
 * `request.structuredOutput` yet and always requests plain-text completion.
 * This is safe: the field is a hint (see `ai-provider.interface.ts`), the
 * agent still runs full `JSON.parse` + `validateStrategyManifest` schema
 * validation on whatever text comes back regardless, and prompting for
 * strict JSON-only output (system-prompt.md §5) is what currently carries
 * first-pass compliance. A future change can wire forced tool-use here
 * without any caller of `AiProvider` needing to change.
 */
@Injectable()
export class AnthropicProvider implements AiProvider {
  public readonly providerName = 'anthropic';

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { apiKey, baseUrl, apiVersion, model: defaultModel } = this.config.anthropic;

    if (!apiKey) {
      throw new AiProviderError('CONFIGURATION', this.providerName, 'ANTHROPIC_API_KEY is not configured.');
    }

    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    // `request.structuredOutput` is intentionally not read here — see the
    // class-level doc comment on why this provider cannot yet safely honour
    // it. Runtime schema validation (never removed, never weakened) is what
    // guarantees correctness regardless.
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': apiVersion,
        },
        body: JSON.stringify({
          model,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
          temperature: request.parameters.temperature,
          top_p: request.parameters.topP,
          max_tokens: request.parameters.maxOutputTokens ?? 4096,
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
      throw new AiProviderError('NETWORK', this.providerName, 'Failed to reach the Anthropic API.', error);
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      throw this.toProviderError(response, await this.safeJson(response));
    }

    const payload = (await this.safeJson(response)) as AnthropicMessagesResponse | undefined;
    if (!payload) {
      throw new AiProviderError(
        'INVALID_RESPONSE',
        this.providerName,
        'Anthropic response body was not valid JSON.',
      );
    }

    const text = payload.content.find((block) => block.type === 'text')?.text;
    if (text === undefined) {
      throw new AiProviderError(
        'INVALID_RESPONSE',
        this.providerName,
        'Anthropic response contained no text content block.',
      );
    }

    const finishReason = STOP_REASON_MAP[payload.stop_reason ?? ''] ?? 'ERROR';

    return {
      content: text,
      finishReason,
      provider: this.providerName,
      modelId: payload.model,
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens,
      durationMs,
    };
  }

  private toProviderError(response: Response, body: unknown): AiProviderError {
    const errorBody = body as AnthropicErrorResponse | undefined;
    const message = errorBody?.error?.message ?? `Anthropic API responded with HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) {
      return new AiProviderError('AUTH', this.providerName, message);
    }
    if (response.status === 429) {
      return new AiProviderError('RATE_LIMIT', this.providerName, message);
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

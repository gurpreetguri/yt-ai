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

/**
 * Node's built-in `fetch` is powered by undici, which applies its own
 * `headersTimeout`/`bodyTimeout` (300_000ms each, independent of any
 * `AbortController` passed in) unless a custom dispatcher overrides them.
 * A local Ollama generation on modest hardware can legitimately exceed 5
 * minutes, so those defaults silently cancelled the request underneath us
 * — Ollama's own log showed the client disconnecting a task at ~5m even
 * though `request.timeoutMs` (from `AI_TIMEOUT_MS`) was configured far
 * higher. Disabling undici's own timeouts here makes `timeoutMs`, enforced
 * via the `AbortController` below, the single source of truth.
 */
const NO_UNDICI_TIMEOUT_DISPATCHER = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

interface OllamaChatMessage {
  readonly role: string;
  readonly content: string;
}

interface OllamaChatResponse {
  readonly model: string;
  readonly message?: OllamaChatMessage;
  readonly done: boolean;
  readonly done_reason?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

interface OllamaErrorResponse {
  readonly error?: string;
}

/**
 * Ollama local model server provider (Ollama's `/api/chat` HTTP endpoint —
 * github.com/ollama/ollama/blob/main/docs/api.md). Uses the platform
 * `fetch` global — no vendor SDK dependency, matching `AnthropicProvider`'s
 * own convention, so the abstraction boundary in `ai-provider.interface.ts`
 * stays the only place that knows any vendor's request/response shape.
 *
 * Local, so there is no API key and no `AUTH` failure mode; every other
 * failure mode (`NETWORK`, `TIMEOUT`, `INVALID_RESPONSE`, `PROVIDER_ERROR`)
 * still applies exactly as it does for a cloud provider — a local server
 * that is not running produces `NETWORK` (connection refused), not a
 * special case, so the router's ordinary failover logic treats it no
 * differently than a cloud outage. Never requires a real Ollama instance to
 * be running for tests; `ollama.provider.spec.ts` mocks `fetch` throughout,
 * exactly like `anthropic.provider.spec.ts`.
 *
 * Structured-output limitation: like `AnthropicProvider`,
 * `request.structuredOutput` is not yet acted on here — this minimal
 * adapter always requests plain-text chat completion, and the caller's own
 * `JSON.parse` + schema validation is what guarantees correctness
 * regardless (see `AnthropicProvider`'s own doc comment for the full
 * rationale, identical here).
 */
@Injectable()
export class OllamaProvider implements AiProvider {
  public readonly providerName = 'ollama';

  constructor(@Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const { baseUrl, model: defaultModel, numCtx } = this.config.ollama;
    const model = request.model ?? defaultModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    // Identical timeout-scoping discipline to `AnthropicProvider`: the timer
    // covers the complete invocation, including the body read, and is
    // cleared exactly once in `finally`, after that read completes.
    try {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          signal: controller.signal,
          // `dispatcher` is a Node/undici extension not present in the DOM
          // `RequestInit` type that `lib.dom.d.ts` supplies for `fetch`. The
          // separately-installed `undici` package's `Agent` is structurally
          // compatible with Node's own bundled `undici-types` dispatcher at
          // runtime; the two only disagree at the type level because they're
          // duplicate declarations, hence the cast through `unknown`.
          dispatcher: NO_UNDICI_TIMEOUT_DISPATCHER as unknown as NonNullable<RequestInit['dispatcher']>,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            options: {
              temperature: request.parameters.temperature,
              top_p: request.parameters.topP,
              // Explicitly requested on every call — never left to the model's own Modelfile
              // default (commonly 2048-4096), which silently truncates a long system prompt
              // plus a large structured-JSON response and is invisible until output degrades.
              num_ctx: numCtx,
              ...(request.parameters.maxOutputTokens !== undefined
                ? { num_predict: request.parameters.maxOutputTokens }
                : {}),
              ...(request.parameters.seed !== undefined ? { seed: request.parameters.seed } : {}),
            },
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
        throw new AiProviderError(
          'NETWORK',
          this.providerName,
          `Failed to reach the Ollama server at ${baseUrl}. Is Ollama running?`,
          error,
        );
      }

      const durationMs = Date.now() - startedAt;

      // Same abort-during-body-read handling as `AnthropicProvider`: check
      // the abort state immediately after the (possibly-rejected) body read,
      // before an `undefined` body from `safeJson` is ever misread as an
      // ordinary malformed response instead of a timeout.
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

      const payload = body as OllamaChatResponse | undefined;
      if (payload === undefined) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Ollama response body was not valid JSON.',
        );
      }

      const text = payload.message?.content;
      if (text === undefined) {
        throw new AiProviderError(
          'INVALID_RESPONSE',
          this.providerName,
          'Ollama response contained no message content.',
        );
      }

      return {
        content: text,
        finishReason: this.toFinishReason(payload),
        provider: this.providerName,
        modelId: payload.model,
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
        durationMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toFinishReason(payload: OllamaChatResponse): AiFinishReason {
    if (payload.done_reason === 'length') return 'TRUNCATED';
    if (payload.done) return 'COMPLETE';
    return 'ERROR';
  }

  private toProviderError(response: Response, body: unknown): AiProviderError {
    const errorBody = body as OllamaErrorResponse | undefined;
    const message = errorBody?.error ?? `Ollama server responded with HTTP ${response.status}.`;
    if (response.status === 404) {
      return new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        `${message} (is the model pulled locally? "ollama pull <model>")`,
      );
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

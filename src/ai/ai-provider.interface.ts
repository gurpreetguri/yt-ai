/**
 * AI Abstraction Layer (ARC-001 §4.9) — the vendor containment line.
 *
 * No code above this boundary may name a provider or a model, except when
 * recording provenance it received back from this interface. Agents depend
 * only on `AiProvider`; they never instantiate a vendor SDK client directly.
 */

/** Provider-neutral sampling parameters (STD-000 §14.3). Set by the agent's class, not the call site. */
export interface AiInvocationParameters {
  readonly temperature: number;
  readonly topP: number;
  readonly seed?: number;
  readonly maxOutputTokens?: number;
}

/**
 * A single model invocation. `systemPrompt` and `userPrompt` are already fully
 * rendered — the provider never sees template variables, only final text.
 */
export interface AiInvocationRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly parameters: AiInvocationParameters;
  /** Hard ceiling for this call; the provider MUST abort and report TIMEOUT beyond it. */
  readonly timeoutMs: number;
  /** Optional model override. Absent means the provider's configured default. */
  readonly model?: string;
}

/**
 * Normalised stop/finish reason (STD-000 §6.7). Providers MUST map their own
 * vocabulary (`finish_reason`, `stop_reason`, `finishReason`, ...) onto this
 * closed set; callers never inspect a vendor-specific value.
 */
export type AiFinishReason = 'COMPLETE' | 'TRUNCATED' | 'REFUSED' | 'ERROR';

/** Provider metadata returned alongside the raw text, when the provider makes it available. */
export interface AiInvocationResult {
  /** The raw, unparsed model output. The caller owns parsing and validation. */
  readonly content: string;
  readonly finishReason: AiFinishReason;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costMicroUsd?: number;
  readonly durationMs: number;
}

/** The closed set of ways a provider invocation can fail before any content is available to parse. */
export type AiProviderErrorKind =
  'TIMEOUT' | 'RATE_LIMIT' | 'AUTH' | 'NETWORK' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE' | 'CONFIGURATION';

/**
 * Normalised provider failure. Callers branch on `kind`, never on a
 * provider-specific status code or error class.
 */
export class AiProviderError extends Error {
  public readonly kind: AiProviderErrorKind;
  public readonly provider: string;
  public readonly cause?: unknown;

  constructor(kind: AiProviderErrorKind, provider: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.provider = provider;
    this.cause = cause;
  }
}

/**
 * The AI provider abstraction. Every concrete provider (Anthropic, OpenAI,
 * Gemini, a local model server, ...) implements this and nothing above this
 * boundary depends on which one is wired up.
 */
export interface AiProvider {
  readonly providerName: string;
  invoke(request: AiInvocationRequest): Promise<AiInvocationResult>;
}

/** DI token. Injected wherever an agent needs a provider, never a concrete class. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

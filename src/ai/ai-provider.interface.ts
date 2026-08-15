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
 * A provider-neutral request for schema-constrained ("structured") output
 * (implementation-checklist.md §4: "Request schema-constrained generation
 * where the provider supports it — then validate anyway"). This is a HINT,
 * never a substitute for runtime validation:
 *
 *  - A provider that can honor it is free to use whatever native mechanism
 *    it has (OpenAI-style `response_format`, Gemini's `responseSchema`,
 *    Claude's forced tool-use, ...) — that mechanism is entirely internal to
 *    the provider implementation and never crosses this interface.
 *  - A provider that cannot honor it MUST silently ignore it and return
 *    ordinary text content, exactly as if it had not been supplied.
 *  - Either way, the caller still runs the same JSON.parse + JSON Schema
 *    validation pipeline on the result. Constrained decoding guarantees
 *    shape, not semantic validity (`implementation-checklist.md` §4).
 */
export interface AiStructuredOutputRequest {
  /** A stable name for the target shape, for provider-side logging/caching only. Never parsed for meaning. */
  readonly schemaName: string;
  /** The JSON Schema the output must conform to. Passed through opaquely — this interface never inspects it. */
  readonly schema: unknown;
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
  /** Optional structured-output hint. See `AiStructuredOutputRequest`. Absent means no hint is given. */
  readonly structuredOutput?: AiStructuredOutputRequest;
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

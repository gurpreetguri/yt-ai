/**
 * Runtime-only types for the Strategy Agent NestJS module.
 *
 * These are ADDITIVE to the frozen contract in
 * `agents/agent-00-strategy/interfaces.ts` — nothing here redefines a
 * contract field, error code, or response shape. `interfaces.ts` and the two
 * JSON schemas remain the single source of truth for the wire contract; this
 * file exists only for concerns the contract intentionally leaves to the
 * runtime (ARC-001 §4.8): how a caller invokes the service and what
 * transport-layer information it needs to decide whether to retry.
 */

import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  StandardError,
  StrategyAgentErrorCode,
  StrategyAgentRequest,
  StrategyAgentResponse,
} from '@agents/agent-00-strategy/interfaces';

/**
 * Transport/provider-layer failure codes.
 *
 * `StrategyAgentErrorCode` (interfaces.ts) is the closed set of codes AGT-00
 * registers for its OWN generation-domain failures (bad input, bad model
 * output, prompt injection). It intentionally has no member for "the
 * provider timed out" or "the network was unreachable" — those are AI
 * Abstraction Layer (ARC-001 §4.9) concerns, not agent-domain concerns, and
 * the agent's registered vocabulary does not own them.
 *
 * These codes are additive, follow the same `CATEGORY.SUBJECT.CONDITION`
 * shape the platform's error catalogue requires (STD-000 §8.4), and use only
 * categories already present in the frozen `ErrorCategory` enum. They are
 * never substituted for a registered `StrategyAgentErrorCode` and never
 * appear anywhere the contract requires `StrategyAgentErrorCode` specifically.
 */
export type StrategyProviderErrorCode =
  | 'AI_PROVIDER.INVOCATION.REQUEST_FAILED'
  | 'NETWORK.INVOCATION.UNREACHABLE'
  | 'TIMEOUT.INVOCATION.EXCEEDED'
  | 'RATE_LIMIT.PROVIDER.EXCEEDED'
  | 'AUTH.PROVIDER.UNAUTHORIZED'
  | 'CONFIGURATION.PROVIDER.MISSING_CREDENTIAL';

export type StrategyRuntimeErrorCode = StrategyAgentErrorCode | StrategyProviderErrorCode;

/**
 * Structurally identical to `StandardError` (interfaces.ts) but widened to
 * accept a provider-layer code alongside the registered agent vocabulary.
 * This is the type the service builds internally; it is narrowed back down
 * before being placed in a wire-format `StrategyAgentErrorResponse`
 * whenever the code is a registered `StrategyAgentErrorCode`. See
 * `strategy.service.ts` for the one place this distinction matters.
 */
export interface StrategyRuntimeError extends Omit<StandardError, 'code'> {
  readonly code: StrategyRuntimeErrorCode;
}

/** Whether the workflow/runtime layer above this service should consider retrying. Never acted on here. */
export interface StrategyRetryHint {
  readonly retryable: boolean;
  /** Present only when `retryable` is true. A hint, not an instruction — the workflow owns backoff and attempt budgets. */
  readonly suggestedNextAttemptType?: 'REPAIR' | 'REGENERATION';
}

/**
 * What `StrategyService.execute` returns. A discriminated union so callers
 * cannot accidentally read `.data` off a failure or `.issues` off a success.
 * The `response` field carries the exact wire-format contract object
 * (`StrategyAgentResponse`) the workflow forwards on; `retry` is orchestration
 * metadata the workflow uses to decide what happens next, kept out of the
 * wire contract because retry orchestration is not this agent's concern
 * (STD-000 §13, GDE-005 §7.3).
 */
export type StrategyExecutionOutcome =
  | { readonly ok: true; readonly response: StrategyAgentResponse & { readonly contractType: 'RESPONSE' } }
  | {
      readonly ok: false;
      readonly response: StrategyAgentResponse & { readonly contractType: 'ERROR' };
      readonly retry: StrategyRetryHint;
    };

/** Everything the service needs to know beyond the request payload. Supplied by the caller (agent runtime), never invented here. */
export interface StrategyExecutionContext {
  readonly request: StrategyAgentRequest;
  /** Correlates every error/log line back to the run; always present (STD-000 Rule 22). */
  readonly correlationId: PrefixedId;
}

export interface ErrorClassification {
  readonly category: ErrorCategory;
  readonly stage: ErrorStage;
  readonly retryable: boolean;
}

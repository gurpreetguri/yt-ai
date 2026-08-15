/**
 * Runtime-only types for the Fact Verification Agent NestJS module.
 *
 * These are ADDITIVE to the frozen contract in
 * `agents/agent-03-fact-verification/interfaces.ts` — nothing here redefines
 * a contract field, error code, or response shape. `interfaces.ts` and the
 * two JSON schemas remain the single source of truth for the wire contract;
 * this file exists only for concerns the contract intentionally leaves to
 * the runtime (ARC-001 §4.8).
 *
 * Mirrors `src/agents/research/research.types.ts`,
 * `src/agents/topic-discovery/topic-discovery.types.ts`, and
 * `src/agents/strategy/strategy.types.ts` structurally — the same
 * architectural pattern (an AGT-nn NestJS runtime) applied to a different
 * frozen contract.
 */

import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  FactVerificationAgentErrorCode,
  FactVerificationAgentRequest,
  FactVerificationAgentResponse,
  StandardError,
} from '@agents/agent-03-fact-verification/interfaces';

/**
 * Transport/provider-layer failure codes. Additive to
 * `FactVerificationAgentErrorCode` — the closed set of codes AGT-03
 * registers for its OWN generation-domain failures. These follow the same
 * `CATEGORY.SUBJECT.CONDITION` shape and are identical in spelling to the
 * ones AGT-00/01/02 already register for the same transport concerns — one
 * error taxonomy applied per agent, not a second one invented for AGT-03.
 */
export type FactVerificationProviderErrorCode =
  | 'AI_PROVIDER.INVOCATION.REQUEST_FAILED'
  | 'NETWORK.INVOCATION.UNREACHABLE'
  | 'TIMEOUT.INVOCATION.EXCEEDED'
  | 'RATE_LIMIT.PROVIDER.EXCEEDED'
  | 'AUTH.PROVIDER.UNAUTHORIZED'
  | 'CONFIGURATION.PROVIDER.MISSING_CREDENTIAL'
  /**
   * The runtime itself constructed a response envelope that fails structural
   * validation against `output.schema.json` (checked once, at the very end
   * of `FactVerificationService.execute`, before anything is returned).
   * Always a defect in this codebase; non-retryable.
   */
  | 'CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID';

export type FactVerificationRuntimeErrorCode = FactVerificationAgentErrorCode | FactVerificationProviderErrorCode;

/**
 * Structurally identical to `StandardError` (interfaces.ts) but widened to
 * accept a provider-layer code alongside the registered agent vocabulary.
 */
export interface FactVerificationRuntimeError extends Omit<StandardError, 'code'> {
  readonly code: FactVerificationRuntimeErrorCode;
}

/** Whether the workflow/runtime layer above this service should consider retrying. Never acted on here. */
export interface FactVerificationRetryHint {
  readonly retryable: boolean;
  /** Present only when `retryable` is true. A hint, not an instruction — the workflow owns backoff and attempt budgets. */
  readonly suggestedNextAttemptType?: 'REPAIR' | 'REGENERATION';
}

/**
 * What `FactVerificationService.execute` returns. A discriminated union so
 * callers cannot accidentally read `.data` off a failure or `.issues` off a
 * success. `retry` is orchestration metadata kept out of the wire contract
 * because retry orchestration is not this agent's concern — this agent never
 * retries itself, never orchestrates the workflow, never calls Agent 02, and
 * never calls Agent 04 (README §3).
 */
export type FactVerificationExecutionOutcome =
  | { readonly ok: true; readonly response: FactVerificationAgentResponse & { readonly contractType: 'RESPONSE' } }
  | {
      readonly ok: false;
      readonly response: FactVerificationAgentResponse & { readonly contractType: 'ERROR' };
      readonly retry: FactVerificationRetryHint;
    };

/** Everything the service needs to know beyond the request payload. Supplied by the caller (agent runtime), never invented here. */
export interface FactVerificationExecutionContext {
  readonly request: FactVerificationAgentRequest;
  /** Correlates every error/log line back to the run; always present (STD-000 Rule 22). */
  readonly correlationId: PrefixedId;
}

export interface ErrorClassification {
  readonly category: ErrorCategory;
  readonly stage: ErrorStage;
  readonly retryable: boolean;
}

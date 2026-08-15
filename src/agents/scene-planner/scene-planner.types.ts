/**
 * Runtime-only types for the Scene Planner Agent NestJS module.
 *
 * These are ADDITIVE to the frozen contract in
 * `agents/agent-07-scene-planner/interfaces.ts` — nothing here redefines a
 * contract field, error code, or response shape. `interfaces.ts` and the two
 * JSON schemas remain the single source of truth for the wire contract; this
 * file exists only for concerns the contract intentionally leaves to the
 * runtime (ARC-001 §4.8).
 *
 * Mirrors `src/agents/script-reviewer/script-reviewer.types.ts` structurally
 * — the same architectural pattern (an AGT-nn NestJS runtime) applied to a
 * different frozen contract.
 */

import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  ScenePlannerAgentErrorCode,
  ScenePlannerAgentRequest,
  ScenePlannerAgentResponse,
  StandardError,
} from '@agents/agent-07-scene-planner/interfaces';

/**
 * Transport/provider-layer failure codes. Additive to
 * `ScenePlannerAgentErrorCode` — the closed set of codes AGT-07 registers
 * for its OWN generation-domain failures. Identical in spelling to the codes
 * every prior agent registers for the same transport concerns — one error
 * taxonomy applied per agent, not a second one invented for AGT-07.
 */
export type ScenePlannerProviderErrorCode =
  | 'AI_PROVIDER.INVOCATION.REQUEST_FAILED'
  | 'NETWORK.INVOCATION.UNREACHABLE'
  | 'TIMEOUT.INVOCATION.EXCEEDED'
  | 'RATE_LIMIT.PROVIDER.EXCEEDED'
  | 'AUTH.PROVIDER.UNAUTHORIZED'
  | 'CONFIGURATION.PROVIDER.MISSING_CREDENTIAL'
  /**
   * The runtime itself constructed a response envelope that fails structural
   * validation against `output.schema.json` (checked once, at the very end
   * of `ScenePlannerService.execute`, before anything is returned). Always a
   * defect in this codebase; non-retryable.
   */
  | 'CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID';

export type ScenePlannerRuntimeErrorCode = ScenePlannerAgentErrorCode | ScenePlannerProviderErrorCode;

/**
 * Structurally identical to `StandardError` (interfaces.ts) but widened to
 * accept a provider-layer code alongside the registered agent vocabulary.
 */
export interface ScenePlannerRuntimeError extends Omit<StandardError, 'code'> {
  readonly code: ScenePlannerRuntimeErrorCode;
}

/** Whether the workflow/runtime layer above this service should consider retrying. Never acted on here. */
export interface ScenePlannerRetryHint {
  readonly retryable: boolean;
  /** Present only when `retryable` is true. A hint, not an instruction — the workflow owns backoff and attempt budgets. */
  readonly suggestedNextAttemptType?: 'REPAIR' | 'REGENERATION';
}

/**
 * What `ScenePlannerService.execute` returns. A discriminated union so
 * callers cannot accidentally read `.data` off a failure or `.issues` off a
 * success. `retry` is orchestration metadata kept out of the wire contract —
 * this agent never retries itself, never orchestrates the workflow, never
 * calls Agent 06, and never calls Agent 08 (README §2).
 */
export type ScenePlannerExecutionOutcome =
  | { readonly ok: true; readonly response: ScenePlannerAgentResponse & { readonly contractType: 'RESPONSE' } }
  | {
      readonly ok: false;
      readonly response: ScenePlannerAgentResponse & { readonly contractType: 'ERROR' };
      readonly retry: ScenePlannerRetryHint;
    };

/** Everything the service needs to know beyond the request payload. Supplied by the caller (agent runtime), never invented here. */
export interface ScenePlannerExecutionContext {
  readonly request: ScenePlannerAgentRequest;
  /** Correlates every error/log line back to the run; always present (STD-000 Rule 22). */
  readonly correlationId: PrefixedId;
}

export interface ErrorClassification {
  readonly category: ErrorCategory;
  readonly stage: ErrorStage;
  readonly retryable: boolean;
}

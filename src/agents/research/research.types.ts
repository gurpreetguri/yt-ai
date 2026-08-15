/**
 * Runtime-only types for the Research Agent NestJS module.
 *
 * These are ADDITIVE to the frozen contract in
 * `agents/agent-02-research/interfaces.ts` — nothing here redefines a
 * contract field, error code, or response shape. `interfaces.ts` and the two
 * JSON schemas remain the single source of truth for the wire contract; this
 * file exists only for concerns the contract intentionally leaves to the
 * runtime (ARC-001 §4.8): how a caller invokes the service and what
 * transport-layer information it needs to decide whether to retry.
 *
 * Mirrors `src/agents/topic-discovery/topic-discovery.types.ts` and
 * `src/agents/strategy/strategy.types.ts` structurally — same runtime
 * concerns, same shape of solution — because all three are the same
 * architectural pattern (an AGT-nn NestJS runtime) applied to a different
 * frozen contract, not three different patterns.
 */

import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  ResearchAgentErrorCode,
  ResearchAgentRequest,
  ResearchAgentResponse,
  StandardError,
} from '@agents/agent-02-research/interfaces';

/**
 * Transport/provider-layer failure codes.
 *
 * `ResearchAgentErrorCode` (interfaces.ts) is the closed set of codes AGT-02
 * registers for its OWN generation-domain failures (bad input, bad model
 * output, prompt injection). It intentionally has no member for "the
 * provider timed out" or "the network was unreachable" — those are AI
 * Abstraction Layer (ARC-001 §4.9) concerns, not agent-domain concerns, and
 * the agent's registered vocabulary does not own them.
 *
 * These codes are additive, follow the same `CATEGORY.SUBJECT.CONDITION`
 * shape the platform's error catalogue requires (STD-000 §8.4), use only
 * categories already present in the frozen `ErrorCategory` enum, and are
 * identical in spelling to the ones AGT-00 and AGT-01 already register for
 * the same transport concerns (`strategy.types.ts`, `topic-discovery.types.ts`)
 * — this is one error taxonomy applied per agent, not a second one invented
 * for AGT-02. They are never substituted for a registered
 * `ResearchAgentErrorCode` and never appear anywhere the contract requires
 * `ResearchAgentErrorCode` specifically.
 */
export type ResearchProviderErrorCode =
  | 'AI_PROVIDER.INVOCATION.REQUEST_FAILED'
  | 'NETWORK.INVOCATION.UNREACHABLE'
  | 'TIMEOUT.INVOCATION.EXCEEDED'
  | 'RATE_LIMIT.PROVIDER.EXCEEDED'
  | 'AUTH.PROVIDER.UNAUTHORIZED'
  | 'CONFIGURATION.PROVIDER.MISSING_CREDENTIAL'
  /**
   * The runtime itself constructed a response envelope that fails structural
   * validation against `output.schema.json` (checked once, at the very end
   * of `ResearchService.execute`, before anything is returned). This is
   * always a defect in this codebase, never a symptom of bad input or a bad
   * model response — both of those are already reported through the codes
   * above by the time this check runs. Non-retryable: retrying invokes the
   * same defective code path again.
   */
  | 'CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID';

export type ResearchRuntimeErrorCode = ResearchAgentErrorCode | ResearchProviderErrorCode;

/**
 * Structurally identical to `StandardError` (interfaces.ts) but widened to
 * accept a provider-layer code alongside the registered agent vocabulary.
 * This is the type the service builds internally; it is narrowed back down
 * before being placed in a wire-format `ResearchAgentErrorResponse` whenever
 * the code is a registered `ResearchAgentErrorCode`. See `research.service.ts`
 * for the one place this distinction matters.
 */
export interface ResearchRuntimeError extends Omit<StandardError, 'code'> {
  readonly code: ResearchRuntimeErrorCode;
}

/** Whether the workflow/runtime layer above this service should consider retrying. Never acted on here. */
export interface ResearchRetryHint {
  readonly retryable: boolean;
  /** Present only when `retryable` is true. A hint, not an instruction — the workflow owns backoff and attempt budgets. */
  readonly suggestedNextAttemptType?: 'REPAIR' | 'REGENERATION';
}

/**
 * What `ResearchService.execute` returns. A discriminated union so callers
 * cannot accidentally read `.data` off a failure or `.issues` off a success.
 * The `response` field carries the exact wire-format contract object
 * (`ResearchAgentResponse`) the workflow forwards on; `retry` is
 * orchestration metadata the workflow uses to decide what happens next, kept
 * out of the wire contract because retry orchestration is not this agent's
 * concern (STD-000 §13, GDE-005 §7.3) — this agent never retries itself
 * (GDE-002 §10.1) and never orchestrates the workflow, never calls Agent 01,
 * and never calls Agent 03 (README §3).
 */
export type ResearchExecutionOutcome =
  | { readonly ok: true; readonly response: ResearchAgentResponse & { readonly contractType: 'RESPONSE' } }
  | {
      readonly ok: false;
      readonly response: ResearchAgentResponse & { readonly contractType: 'ERROR' };
      readonly retry: ResearchRetryHint;
    };

/** Everything the service needs to know beyond the request payload. Supplied by the caller (agent runtime), never invented here. */
export interface ResearchExecutionContext {
  readonly request: ResearchAgentRequest;
  /** Correlates every error/log line back to the run; always present (STD-000 Rule 22). */
  readonly correlationId: PrefixedId;
}

export interface ErrorClassification {
  readonly category: ErrorCategory;
  readonly stage: ErrorStage;
  readonly retryable: boolean;
}

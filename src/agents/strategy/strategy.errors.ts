/**
 * Error construction and classification for the Strategy Agent runtime.
 *
 * Everything here is pure and deterministic: given a validation finding or a
 * provider failure, it returns a fully-formed `StrategyRuntimeError`. No I/O,
 * no retries, no logging — those belong to the service and to the caller.
 */

import type { ValidationFinding } from '@agents/agent-00-strategy/interfaces';
import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  StrategyAgentErrorCode,
} from '@agents/agent-00-strategy/interfaces';

import { AiProviderError, AiProviderErrorKind } from '../../ai/ai-provider.interface';
import { StrategyProviderErrorCode, StrategyRuntimeError, StrategyRuntimeErrorCode } from './strategy.types';

export const AGENT_ID = 'strategy-agent';
export const AGENT_VERSION = '1.0.0';

interface ErrorSourceVersion {
  readonly component: string;
  readonly version: string;
  readonly stage: ErrorStage;
}

interface BuildErrorInput {
  readonly code: StrategyRuntimeErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
  readonly userMessage?: string;
  readonly stage: ErrorStage;
  readonly correlationId: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly details?: StrategyRuntimeError['details'];
  readonly remediation?: string;
  readonly causeChain?: StrategyRuntimeError['causeChain'];
}

/** The one place `occurredAt`, `source`, and `context` are assembled, so every error has an identical shape. */
export function buildRuntimeError(input: BuildErrorInput): StrategyRuntimeError {
  const source: ErrorSourceVersion = { component: AGENT_ID, version: AGENT_VERSION, stage: input.stage };
  return {
    code: input.code,
    category: input.category,
    severity: input.category === 'SECURITY' ? 'FATAL' : 'ERROR',
    retryable: input.retryable,
    message: input.message,
    ...(input.userMessage !== undefined ? { userMessage: input.userMessage } : {}),
    source,
    context: {
      correlationId: input.correlationId,
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
      ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    },
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.remediation !== undefined ? { remediation: input.remediation } : {}),
    occurredAt: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z'),
    ...(input.causeChain !== undefined ? { causeChain: input.causeChain } : {}),
  };
}

/**
 * Maps an INPUT validation finding (structural or R-IN-*) onto the closed
 * `StrategyAgentErrorCode` vocabulary declared in `interfaces.ts`.
 *
 * The frozen contract fixes the code catalogue and each code's category and
 * retryability; it does not fix an algorithm for choosing among them from a
 * raw Ajv/business-rule finding, since that mapping is an agent-runtime
 * concern (ARC-001 §4.8), not part of the wire contract. This function is
 * that (documented, deterministic, unit-tested) policy:
 *
 *  - Business rules (`R-IN-*`) map one-to-one per the table below, which is
 *    exactly the mapping the approved package's own `examples/failure.json`
 *    demonstrates (R-IN-001 -> LOCALE_MISMATCH, R-IN-005 -> OBJECTIVES_CONTRADICTORY).
 *  - Structural findings (`R-STRUCT-001`, from Ajv) are classified from the
 *    finding's own `path` and `expected` text, which `structuralValidate`
 *    already renders in a stable, inspectable form.
 */
export function mapInputFindingToErrorCode(finding: ValidationFinding): StrategyAgentErrorCode {
  const businessRuleCode = INPUT_RULE_TO_ERROR_CODE[finding.ruleId];
  if (businessRuleCode !== undefined) return businessRuleCode;

  // Structural (R-STRUCT-001): classify from path/expected text.
  if (finding.path.startsWith('$.audienceDefinition')) {
    return 'VALIDATION.INPUT.AUDIENCE_UNRESOLVABLE';
  }
  if (finding.expected?.startsWith('one of ') || finding.expected?.startsWith('the constant ')) {
    return 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED';
  }
  return 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING';
}

const INPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, StrategyAgentErrorCode>> = {
  'R-IN-001': 'VALIDATION.INPUT.LOCALE_MISMATCH',
  'R-IN-002': 'VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE',
  'R-IN-003': 'VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY',
  'R-IN-004': 'VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY',
  'R-IN-005': 'VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY',
  'R-IN-006': 'VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY',
  'R-IN-007': 'VALIDATION.INPUT.DERIVATION_INCOMPLETE',
  'R-IN-008': 'VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE',
};

/** Every OUTPUT business-rule violation (R-BUS-*) shares the one registered code for content-level defects. */
export function mapOutputFindingToErrorCode(_finding: ValidationFinding): StrategyAgentErrorCode {
  return 'AI_OUTPUT.BUSINESS.RULE_VIOLATED';
}

/** Maps a provider-layer failure kind onto the additive provider error vocabulary (`strategy.types.ts`). */
export function mapProviderErrorKindToCode(kind: AiProviderErrorKind): StrategyProviderErrorCode {
  switch (kind) {
    case 'TIMEOUT':
      return 'TIMEOUT.INVOCATION.EXCEEDED';
    case 'RATE_LIMIT':
      return 'RATE_LIMIT.PROVIDER.EXCEEDED';
    case 'AUTH':
      return 'AUTH.PROVIDER.UNAUTHORIZED';
    case 'NETWORK':
      return 'NETWORK.INVOCATION.UNREACHABLE';
    case 'CONFIGURATION':
      return 'CONFIGURATION.PROVIDER.MISSING_CREDENTIAL';
    case 'PROVIDER_ERROR':
    case 'INVALID_RESPONSE':
    default:
      return 'AI_PROVIDER.INVOCATION.REQUEST_FAILED';
  }
}

export function classifyProviderErrorKind(kind: AiProviderErrorKind): {
  category: ErrorCategory;
  retryable: boolean;
} {
  switch (kind) {
    case 'TIMEOUT':
      return { category: 'TIMEOUT', retryable: true };
    case 'RATE_LIMIT':
      return { category: 'RATE_LIMIT', retryable: true };
    case 'NETWORK':
      return { category: 'NETWORK', retryable: true };
    case 'AUTH':
      return { category: 'AUTH', retryable: false };
    case 'CONFIGURATION':
      return { category: 'CONFIGURATION', retryable: false };
    case 'INVALID_RESPONSE':
      return { category: 'AI_PROVIDER', retryable: true };
    case 'PROVIDER_ERROR':
    default:
      return { category: 'AI_PROVIDER', retryable: true };
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

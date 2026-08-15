/**
 * Error construction and classification for the Fact Verification Agent
 * runtime.
 *
 * Everything here is pure and deterministic: given a validation finding or a
 * provider failure, it returns a fully-formed `FactVerificationRuntimeError`.
 * No I/O, no retries, no logging — those belong to the service and to the
 * caller.
 */

import type { ValidationFinding } from '@agents/agent-03-fact-verification/interfaces';
import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  FactVerificationAgentErrorCode,
} from '@agents/agent-03-fact-verification/interfaces';

import { AiProviderError, AiProviderErrorKind } from '../../ai/ai-provider.interface';
import {
  FactVerificationProviderErrorCode,
  FactVerificationRuntimeError,
  FactVerificationRuntimeErrorCode,
} from './fact-verification.types';

export const AGENT_ID = 'fact-verification-agent';
export const AGENT_VERSION = '1.0.0';

interface ErrorSourceVersion {
  readonly component: string;
  readonly version: string;
  readonly stage: ErrorStage;
}

interface BuildErrorInput {
  readonly code: FactVerificationRuntimeErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
  readonly userMessage?: string;
  readonly stage: ErrorStage;
  readonly correlationId: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly details?: FactVerificationRuntimeError['details'];
  readonly remediation?: string;
  readonly causeChain?: FactVerificationRuntimeError['causeChain'];
}

/** The one place `occurredAt`, `source`, and `context` are assembled, so every error has an identical shape. */
export function buildRuntimeError(input: BuildErrorInput): FactVerificationRuntimeError {
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
 * `FactVerificationAgentErrorCode` vocabulary declared in `interfaces.ts`.
 *
 * The frozen contract fixes the code catalogue and each code's category and
 * retryability; this function is the documented, deterministic, unit-tested
 * policy for choosing among them from a raw Ajv/business-rule finding —
 * exactly the mapping the approved package's own `examples/failure.json`
 * demonstrates (R-IN-001 -> DUPLICATE_EVIDENCE_ID,
 * R-IN-003 -> EVIDENCE_REFERENCE_UNRESOLVABLE).
 */
export function mapInputFindingToErrorCode(finding: ValidationFinding): FactVerificationAgentErrorCode {
  const businessRuleCode = INPUT_RULE_TO_ERROR_CODE[finding.ruleId];
  if (businessRuleCode !== undefined) return businessRuleCode;

  // Structural (R-STRUCT-001): classify from the finding's own expected text.
  if (finding.expected?.startsWith('one of ') || finding.expected?.startsWith('the constant ')) {
    return 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED';
  }
  return 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING';
}

const INPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, FactVerificationAgentErrorCode>> = {
  'R-IN-001': 'VALIDATION.INPUT.DUPLICATE_EVIDENCE_ID',
  'R-IN-002': 'VALIDATION.INPUT.DUPLICATE_SOURCE_ID',
  'R-IN-003': 'VALIDATION.INPUT.EVIDENCE_REFERENCE_UNRESOLVABLE',
  'R-IN-004': 'VALIDATION.INPUT.EVIDENCE_REFERENCE_UNRESOLVABLE',
};

/**
 * Maps an OUTPUT business-rule violation (R-BUS-*) onto the closed
 * `FactVerificationAgentErrorCode` vocabulary, per the documented mapping in
 * `README.md` §19 and `implementation-checklist.md` §5:
 *
 *  - `R-BUS-003` (a claim's evidence reference resolves to nothing supplied)
 *    -> `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM`.
 *  - `R-BUS-004` (declared `sourceIds` does not match the resolved set)
 *    -> `AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE`.
 *  - `R-BUS-005`, `R-BUS-006`, `R-BUS-007`, `R-BUS-008`, `R-BUS-009`,
 *    `R-BUS-013`, `R-BUS-014` (a claim asserts `VERIFIED`, `CONTRADICTED`, or
 *    `CONFLICTING` without the evidence the rule requires — an unearned
 *    certainty upgrade) -> `AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY`.
 *  - Every other output rule -> the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`,
 *    following the same simplification precedent Agent 02 documents for its
 *    own multi-branch rules (`research.errors.ts`).
 */
export function mapOutputFindingToErrorCode(finding: ValidationFinding): FactVerificationAgentErrorCode {
  return OUTPUT_RULE_TO_ERROR_CODE[finding.ruleId] ?? 'AI_OUTPUT.BUSINESS.RULE_VIOLATED';
}

const OUTPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, FactVerificationAgentErrorCode>> = {
  'R-BUS-003': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-004': 'AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE',
  'R-BUS-005': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-006': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-007': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-008': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-009': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-013': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
  'R-BUS-014': 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY',
};

/** Maps a provider-layer failure kind onto the additive provider error vocabulary (`fact-verification.types.ts`). */
export function mapProviderErrorKindToCode(kind: AiProviderErrorKind): FactVerificationProviderErrorCode {
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

/**
 * The ONLY sanitized, user-facing text for a provider-layer failure.
 *
 * `AiProviderError.message` (and any raw `Error.message` from an
 * unrecognised failure) is a diagnostic string that may legitimately
 * originate from the provider's own error body or from a network stack. It
 * is suitable ONLY for `StandardError.message` — "for engineers, specific"
 * (interfaces.ts) — and MUST NEVER be forwarded into `userMessage`. This
 * function is the single place that produces the safe alternative, so no
 * call site can accidentally leak a raw provider payload, an API key, a
 * filesystem path, or research-package content into a user-facing field.
 */
const PROVIDER_SAFE_USER_MESSAGE: Readonly<Record<AiProviderErrorKind, string>> = {
  TIMEOUT: 'The AI provider request timed out.',
  RATE_LIMIT: 'The AI provider temporarily rejected the request.',
  AUTH: 'AI provider authentication failed.',
  NETWORK: 'The AI provider could not be reached.',
  PROVIDER_ERROR: 'The AI provider could not complete the request.',
  INVALID_RESPONSE: 'The AI provider returned an unexpected response.',
  CONFIGURATION: 'The AI provider is not configured.',
};

export function providerSafeUserMessage(kind: AiProviderErrorKind): string {
  return PROVIDER_SAFE_USER_MESSAGE[kind];
}

/**
 * Redacts every occurrence of a known secret value (e.g. the configured
 * provider API key) from a diagnostic string before it is stored in
 * `StandardError.message`.
 */
export function redactKnownSecret(text: string, secret: string | undefined): string {
  if (secret === undefined || secret.length < 6) return text;
  return text.split(secret).join('[REDACTED]');
}

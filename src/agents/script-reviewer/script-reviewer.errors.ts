/**
 * Error construction and classification for the Script Reviewer Agent
 * runtime.
 *
 * Everything here is pure and deterministic: given a validation finding or a
 * provider failure, it returns a fully-formed `ScriptReviewerRuntimeError`.
 * No I/O, no retries, no logging — those belong to the service and to the
 * caller. Structurally identical to `script-writer.errors.ts`.
 */

import type { ValidationFinding } from '@agents/agent-06-script-reviewer/interfaces';
import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  ScriptReviewerAgentErrorCode,
} from '@agents/agent-06-script-reviewer/interfaces';

import { AiProviderError, AiProviderErrorKind } from '../../ai/ai-provider.interface';
import {
  ScriptReviewerProviderErrorCode,
  ScriptReviewerRuntimeError,
  ScriptReviewerRuntimeErrorCode,
} from './script-reviewer.types';

export const AGENT_ID = 'script-reviewer-agent';
export const AGENT_VERSION = '1.0.0';

interface ErrorSourceVersion {
  readonly component: string;
  readonly version: string;
  readonly stage: ErrorStage;
}

interface BuildErrorInput {
  readonly code: ScriptReviewerRuntimeErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
  readonly userMessage?: string;
  readonly stage: ErrorStage;
  readonly correlationId: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly details?: ScriptReviewerRuntimeError['details'];
  readonly remediation?: string;
  readonly causeChain?: ScriptReviewerRuntimeError['causeChain'];
}

/** The one place `occurredAt`, `source`, and `context` are assembled, so every error has an identical shape. */
export function buildRuntimeError(input: BuildErrorInput): ScriptReviewerRuntimeError {
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
 * `ScriptReviewerAgentErrorCode` vocabulary declared in `interfaces.ts`.
 */
export function mapInputFindingToErrorCode(finding: ValidationFinding): ScriptReviewerAgentErrorCode {
  const businessRuleCode = INPUT_RULE_TO_ERROR_CODE[finding.ruleId];
  if (businessRuleCode !== undefined) return businessRuleCode;

  // Structural (R-STRUCT-001): classify from the finding's own expected text.
  if (finding.expected?.startsWith('one of ') || finding.expected?.startsWith('the constant ')) {
    return 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED';
  }
  return 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING';
}

const INPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, ScriptReviewerAgentErrorCode>> = {
  'R-IN-001': 'VALIDATION.INPUT.SCRIPT_NOT_READY',
  'R-IN-002': 'VALIDATION.INPUT.STORY_NOT_READY',
  'R-IN-003': 'VALIDATION.INPUT.TOPIC_ID_MISMATCH',
  'R-IN-004': 'VALIDATION.INPUT.TOPIC_ID_MISMATCH',
  'R-IN-005': 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID',
};

/**
 * Maps an OUTPUT business-rule violation (R-BUS-*) onto the closed
 * `ScriptReviewerAgentErrorCode` vocabulary, per the documented mapping in
 * `README.md` §14 and `implementation-checklist.md` §5.
 */
export function mapOutputFindingToErrorCode(finding: ValidationFinding): ScriptReviewerAgentErrorCode {
  return OUTPUT_RULE_TO_ERROR_CODE[finding.ruleId] ?? 'AI_OUTPUT.BUSINESS.RULE_VIOLATED';
}

const OUTPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, ScriptReviewerAgentErrorCode>> = {
  'R-BUS-002': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-003': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-004': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-005': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-006': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-007': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-008': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-009': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-010': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-011': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-012': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-013': 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION',
  'R-BUS-014': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-015': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-016': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-017': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-018': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-019': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-020': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-021': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
  'R-BUS-022': 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE',
};

/** Maps a provider-layer failure kind onto the additive provider error vocabulary (`script-reviewer.types.ts`). */
export function mapProviderErrorKindToCode(kind: AiProviderErrorKind): ScriptReviewerProviderErrorCode {
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
 * The ONLY sanitized, user-facing text for a provider-layer failure. See
 * `script-writer.errors.ts` for the full rationale — identical here.
 */
const PROVIDER_SAFE_USER_MESSAGE: Readonly<Record<AiProviderErrorKind, string>> = {
  TIMEOUT: 'The AI provider request timed out.',
  RATE_LIMIT: 'The AI provider temporarily rejected the request.',
  QUOTA_EXHAUSTED: 'The AI provider usage quota is exhausted.',
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

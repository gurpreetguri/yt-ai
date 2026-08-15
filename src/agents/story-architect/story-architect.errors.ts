/**
 * Error construction and classification for the Story Architect Agent
 * runtime.
 *
 * Everything here is pure and deterministic: given a validation finding or a
 * provider failure, it returns a fully-formed `StoryArchitectRuntimeError`.
 * No I/O, no retries, no logging — those belong to the service and to the
 * caller.
 */

import type { ValidationFinding } from '@agents/agent-04-story-architect/interfaces';
import type {
  ErrorCategory,
  ErrorStage,
  PrefixedId,
  StoryArchitectAgentErrorCode,
} from '@agents/agent-04-story-architect/interfaces';

import { AiProviderError, AiProviderErrorKind } from '../../ai/ai-provider.interface';
import {
  StoryArchitectProviderErrorCode,
  StoryArchitectRuntimeError,
  StoryArchitectRuntimeErrorCode,
} from './story-architect.types';

export const AGENT_ID = 'story-architect-agent';
export const AGENT_VERSION = '1.0.0';

interface ErrorSourceVersion {
  readonly component: string;
  readonly version: string;
  readonly stage: ErrorStage;
}

interface BuildErrorInput {
  readonly code: StoryArchitectRuntimeErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
  readonly userMessage?: string;
  readonly stage: ErrorStage;
  readonly correlationId: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly details?: StoryArchitectRuntimeError['details'];
  readonly remediation?: string;
  readonly causeChain?: StoryArchitectRuntimeError['causeChain'];
}

/** The one place `occurredAt`, `source`, and `context` are assembled, so every error has an identical shape. */
export function buildRuntimeError(input: BuildErrorInput): StoryArchitectRuntimeError {
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
 * `StoryArchitectAgentErrorCode` vocabulary declared in `interfaces.ts`.
 *
 * The frozen contract fixes the code catalogue and each code's category and
 * retryability; this function is the documented, deterministic, unit-tested
 * policy for choosing among them from a raw Ajv/business-rule finding —
 * exactly the mapping the approved package's own `examples/failure.json`
 * demonstrates (R-IN-001 -> DUPLICATE_CLAIM_ID).
 */
export function mapInputFindingToErrorCode(finding: ValidationFinding): StoryArchitectAgentErrorCode {
  const businessRuleCode = INPUT_RULE_TO_ERROR_CODE[finding.ruleId];
  if (businessRuleCode !== undefined) return businessRuleCode;

  // Structural (R-STRUCT-001): classify from the finding's own expected text.
  if (finding.expected?.startsWith('one of ') || finding.expected?.startsWith('the constant ')) {
    return 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED';
  }
  return 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING';
}

const INPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, StoryArchitectAgentErrorCode>> = {
  'R-IN-001': 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID',
  'R-IN-002': 'VALIDATION.INPUT.TOPIC_ID_MISMATCH',
};

/**
 * Maps an OUTPUT business-rule violation (R-BUS-*) onto the closed
 * `StoryArchitectAgentErrorCode` vocabulary, per the documented mapping in
 * `README.md` §19 and `implementation-checklist.md` §5:
 *
 *  - `R-BUS-003`, `R-BUS-004` (a claim/evidence reference resolves to
 *    nothing supplied) -> `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM`.
 *  - `R-BUS-005` (a DO_NOT_USE claim was used as factual story content, via
 *    claimRefs or via evidenceRefs belonging to it) ->
 *    `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE`. This is the single highest-value
 *    code in this catalogue — see `implementation-checklist.md` §9.
 *  - `R-BUS-006` (a USE_WITH_QUALIFICATION claim lost its qualification) ->
 *    `AI_OUTPUT.CONTENT.QUALIFICATION_LOST`.
 *  - Every other output rule -> the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`,
 *    following the same simplification precedent Agent 02/03 document for
 *    their own multi-branch rules.
 */
export function mapOutputFindingToErrorCode(finding: ValidationFinding): StoryArchitectAgentErrorCode {
  return OUTPUT_RULE_TO_ERROR_CODE[finding.ruleId] ?? 'AI_OUTPUT.BUSINESS.RULE_VIOLATED';
}

const OUTPUT_RULE_TO_ERROR_CODE: Readonly<Record<string, StoryArchitectAgentErrorCode>> = {
  'R-BUS-003': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-004': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  'R-BUS-005': 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE',
  'R-BUS-006': 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST',
  // A beat's evidenceRefs must belong to a claim the SAME beat itself cites
  // via claimRefs (README §7 provenance integrity) — the same "cites
  // something not properly grounded" family as R-BUS-003/R-BUS-004.
  'R-BUS-022': 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM',
  // Hook/payoff qualification loss is semantically identical to a beat
  // losing its qualification (R-BUS-006) — the same code applies.
  'R-BUS-023': 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST',
  'R-BUS-024': 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST',
};

/** Maps a provider-layer failure kind onto the additive provider error vocabulary (`story-architect.types.ts`). */
export function mapProviderErrorKindToCode(kind: AiProviderErrorKind): StoryArchitectProviderErrorCode {
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
 * filesystem path, or verified-research content into a user-facing field.
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

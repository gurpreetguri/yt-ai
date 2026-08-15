/**
 * AGT-06 — Script Reviewer Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither
 * reviews, scores, rewrites, repairs, normalises, defaults, nor mutates any
 * artifact. It answers one question — "is this contract acceptable?" — and
 * returns findings. No network requests, no web searches, no AI calls, no
 * database operations, no retries.
 *
 * Division of responsibility (GDE-002 §9.1), identical to every prior
 * agent's own validator.ts:
 *   - Agent author (design time) → the schemas, which make invalid output
 *     unrepresentable. Enforced here by `structuralValidate`.
 *   - Agent runtime (invocation) → structural validation of input and output.
 *   - Validation plane (between stages) → the named business rules below.
 *
 * A distinguishing feature of THIS agent's business rules (README §9,
 * system-prompt.md's "deterministic vs AI review" split): several output
 * rules (`R-BUS-014`–`022`) are GROUND-TRUTH DETECTION rules. They
 * independently re-derive, from the request data alone, every defect this
 * validator itself can prove exists (a DO_NOT_USE claim used, a missing
 * qualification, an ungrounded number, a fabricated quote, a missing
 * hook/conclusion, an out-of-tolerance duration, an uncovered beat, a beat
 * order violation) and then check that the model's own review REPORTED it.
 * A model that misses a deterministically-provable defect fails business
 * validation exactly as if it had reported something structurally invalid —
 * this agent's whole purpose is catching what Agent 05 got wrong, so a
 * reviewer that itself misses a provable defect is a reviewer that failed.
 *
 * Invariants held by this module:
 *   - Pure. No I/O, no clock reads, no randomness, no logging, no DI, no state.
 *   - Total. Every rule reports ALL violations it finds, never only the first
 *     (STD-000 §6.2).
 *   - Non-mutating. A validator never modifies its subject (GDE-003 §8.6 rule 4).
 *   - Deterministic. `basis` is `DETERMINISTIC` on every finding emitted here.
 *
 * @contract script-reviewer-agent-input/v1  1.0.0
 * @contract script-reviewer-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  IssueCategory,
  IssueSeverity,
  NarrationScriptRef,
  ReviewIssue,
  ReviewReport,
  ScriptReviewerAgentRequest,
  ScriptReviewerAgentResponse,
  ScriptReviewerRequestData,
  ScriptSegmentRef,
  ValidationFinding,
  ValidationOutcome,
  ValidationReport,
} from './interfaces';

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Structural validation — closed schemas, strict readers (GDE-003 §13.1)
 * ──────────────────────────────────────────────────────────────────────────── */

export function createContractValidator(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: true,
    removeAdditional: false,
    useDefaults: false,
    coerceTypes: false,
    validateFormats: true,
  });
  addFormats(ajv);
  ajv.addSchema(inputSchema, INPUT_SCHEMA_ID);
  ajv.addSchema(outputSchema, OUTPUT_SCHEMA_ID);
  return ajv;
}

export const INPUT_SCHEMA_ID = 'urn:contract:script-reviewer-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:script-reviewer-agent-output:v1' as const;
export const REVIEW_REPORT_SCHEMA_POINTER =
  'urn:contract:script-reviewer-agent-output:v1#/$defs/reviewReport' as const;

/** Rule identifier carried on every structural finding, so failure rate is measurable per rule. */
export const STRUCTURAL_RULE_ID = 'R-STRUCT-001' as const;

export function structuralValidate(
  validate: ValidateFunction,
  subject: unknown,
): readonly ValidationFinding[] {
  const isValid = validate(subject);
  if (isValid) return [];
  return (validate.errors ?? []).map(toStructuralFinding);
}

function toStructuralFinding(error: ErrorObject): ValidationFinding {
  return {
    ruleId: STRUCTURAL_RULE_ID,
    severity: 'BLOCKER',
    path: instancePathToJsonPath(error.instancePath, error.params),
    expected: describeExpectation(error),
    actual: describeActual(error),
    message: `Schema violation at ${error.instancePath || '$'}: ${error.message ?? 'constraint not satisfied'}.`,
    basis: 'DETERMINISTIC',
  };
}

function describeExpectation(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return `property "${String(params.missingProperty)}" present`;
    case 'additionalProperties':
      return 'no properties beyond those declared by the closed schema';
    case 'enum':
      return `one of ${JSON.stringify(params.allowedValues)}`;
    case 'const':
      return `the constant ${JSON.stringify(params.allowedValue)}`;
    case 'minItems':
    case 'maxItems':
      return `array cardinality ${error.keyword === 'minItems' ? '>=' : '<='} ${String(params.limit)}`;
    case 'minLength':
    case 'maxLength':
      return `string length ${error.keyword === 'minLength' ? '>=' : '<='} ${String(params.limit)} code points`;
    case 'minimum':
    case 'maximum':
      return `value ${error.keyword === 'minimum' ? '>=' : '<='} ${String(params.limit)}`;
    case 'pattern':
      return `value matching ${String(params.pattern)}`;
    case 'uniqueItems':
      return 'all array items distinct';
    case 'oneOf':
      return 'exactly one discriminated variant to match';
    default:
      return error.schemaPath;
  }
}

function describeActual(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === 'additionalProperties') return `unknown property "${String(params.additionalProperty)}"`;
  if (error.keyword === 'required') return 'property absent';
  return error.message ?? 'constraint not satisfied';
}

/** `/issues/2/severity` → `$.issues[2].severity` (STD-000 §8.1 path form). */
export function instancePathToJsonPath(instancePath: string, params?: unknown): string {
  const missing = (params as { missingProperty?: string } | undefined)?.missingProperty;
  const segments = instancePath.split('/').filter((segment) => segment.length > 0);
  let path = '$';
  for (const segment of segments) {
    path += /^\d+$/.test(segment) ? `[${segment}]` : `.${decodePointerSegment(segment)}`;
  }
  return missing ? `${path}.${missing}` : path;
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Finding construction helpers
 * ──────────────────────────────────────────────────────────────────────────── */

interface FindingSpec {
  readonly ruleId: string;
  readonly path: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly suggestion?: string;
  readonly severity?: ValidationFinding['severity'];
}

function finding(spec: FindingSpec): ValidationFinding {
  return {
    ruleId: spec.ruleId,
    severity: spec.severity ?? 'ERROR',
    path: spec.path,
    ...(spec.expected === undefined ? {} : { expected: spec.expected }),
    ...(spec.actual === undefined ? {} : { actual: spec.actual }),
    message: spec.message,
    ...(spec.suggestion === undefined ? {} : { suggestion: spec.suggestion }),
    basis: 'DETERMINISTIC',
  };
}

function duplicatesOf<T>(values: readonly T[], keyOf: (value: T) => string): readonly number[] {
  const seen = new Map<string, number>();
  const duplicateIndexes: number[] = [];
  values.forEach((value, index) => {
    const key = keyOf(value);
    if (seen.has(key)) duplicateIndexes.push(index);
    else seen.set(key, index);
  });
  return duplicateIndexes;
}

const NUMERIC_TOKEN_PATTERN = /\d[\d,.]*%?/g;

function extractNumericTokens(text: string): readonly string[] {
  return [...text.matchAll(NUMERIC_TOKEN_PATTERN)].map((match) => match[0]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Input business rules (R-IN-*)
 *    Evaluated before dispatch. A violation is a WORKFLOW defect: the engine
 *    assembled the input, so it fails fast and does not retry (GDE-005 §7.3).
 * ──────────────────────────────────────────────────────────────────────────── */

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<ScriptReviewerRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'script.downstreamReadiness is READY_FOR_REVIEW',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.script.downstreamReadiness === 'READY_FOR_REVIEW'
        ? []
        : [finding({
            ruleId: 'R-IN-001',
            path: '$.script.downstreamReadiness',
            expected: 'READY_FOR_REVIEW',
            actual: data.script.downstreamReadiness,
            message: 'A script that is NOT_READY_FOR_REVIEW cannot be dispatched to the script reviewer; the workflow must resolve it first.',
          })],
  },
  {
    ruleId: 'R-IN-002',
    title: 'storyArchitecture.downstreamReadiness is READY_FOR_SCRIPT',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.storyArchitecture.downstreamReadiness === 'READY_FOR_SCRIPT'
        ? []
        : [finding({
            ruleId: 'R-IN-002',
            path: '$.storyArchitecture.downstreamReadiness',
            expected: 'READY_FOR_SCRIPT',
            actual: data.storyArchitecture.downstreamReadiness,
            message: 'A story architecture that is NOT_READY_FOR_SCRIPT cannot ground a review; the workflow must resolve it first.',
          })],
  },
  {
    ruleId: 'R-IN-003',
    title: 'verificationPackage.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.verificationPackage.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-003',
            path: '$.storyArchitecture.topicId',
            expected: `"${data.verificationPackage.topicId}" (verificationPackage.topicId)`,
            actual: data.storyArchitecture.topicId,
            message: 'verificationPackage.topicId and storyArchitecture.topicId disagree; the supplied verified claims and story architecture do not represent the same topic.',
          })],
  },
  {
    ruleId: 'R-IN-004',
    title: 'script.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.script.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-004',
            path: '$.script.topicId',
            expected: `"${data.storyArchitecture.topicId}" (storyArchitecture.topicId)`,
            actual: data.script.topicId,
            message: 'script.topicId and storyArchitecture.topicId disagree; the supplied script and story architecture do not represent the same topic.',
          })],
  },
  {
    ruleId: 'R-IN-005',
    title: 'Supplied verified claim IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.verificationPackage.claims, (claim) => claim.claimId).map((index) => {
        const claim = data.verificationPackage.claims[index];
        return finding({
          ruleId: 'R-IN-005',
          path: `$.verificationPackage.claims[${index}].claimId`,
          expected: 'a claimId unique within verificationPackage.claims',
          actual: claim?.claimId ?? '',
          message: 'Two supplied verified claims share the same claimId.',
        });
      }),
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fixed tolerance, identical to Agent 04's and Agent 05's own duration tolerance (README §12). Never a new tolerance. */
export const SCRIPT_REVIEWER_DURATION_TOLERANCE_RATIO = 0.15;

interface ClaimIndex {
  readonly claimSafety: ReadonlyMap<string, 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE'>;
  readonly claimType: ReadonlyMap<string, string>;
  readonly claimText: ReadonlyMap<string, string>;
  readonly quoteSpeaker: ReadonlyMap<string, string>;
  readonly knownClaimIds: ReadonlySet<string>;
  readonly knownEvidenceIds: ReadonlySet<string>;
  readonly evidenceOwner: ReadonlyMap<string, string>;
  readonly supportingEvidenceIdsByClaim: ReadonlyMap<string, readonly string[]>;
}

function buildClaimIndex(request: ScriptReviewerRequestData): ClaimIndex {
  const claimSafety = new Map<string, 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE'>();
  const claimType = new Map<string, string>();
  const claimText = new Map<string, string>();
  const quoteSpeaker = new Map<string, string>();
  const knownEvidenceIds = new Set<string>();
  const evidenceOwner = new Map<string, string>();
  const supportingEvidenceIdsByClaim = new Map<string, readonly string[]>();
  for (const claim of request.verificationPackage.claims) {
    claimSafety.set(claim.claimId, claim.downstreamSafety);
    claimType.set(claim.claimId, claim.claimType);
    claimText.set(claim.claimId, claim.claimText);
    if (claim.quoteProvenance !== undefined) {
      quoteSpeaker.set(claim.claimId, claim.quoteProvenance.speaker);
    }
    supportingEvidenceIdsByClaim.set(claim.claimId, claim.supportingEvidenceIds);
    for (const evidenceId of claim.supportingEvidenceIds) {
      knownEvidenceIds.add(evidenceId);
      evidenceOwner.set(evidenceId, claim.claimId);
    }
  }
  return {
    claimSafety,
    claimType,
    claimText,
    quoteSpeaker,
    knownClaimIds: new Set(claimSafety.keys()),
    knownEvidenceIds,
    evidenceOwner,
    supportingEvidenceIdsByClaim,
  };
}

function evidenceReachableFromSegmentClaims(
  segmentClaimRefs: readonly string[],
  index: ClaimIndex,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  for (const claimId of segmentClaimRefs) {
    for (const evidenceId of index.supportingEvidenceIdsByClaim.get(claimId) ?? []) {
      reachable.add(evidenceId);
    }
  }
  return reachable;
}

function beatOrderById(request: ScriptReviewerRequestData): ReadonlyMap<string, number> {
  return new Map(request.storyArchitecture.beats.map((beat) => [beat.beatId, beat.order]));
}

function sortedByOrder(segments: readonly ScriptSegmentRef[]): readonly ScriptSegmentRef[] {
  return [...segments].sort((a, b) => a.order - b.order);
}

/**
 * The exact semantics a ground-truth-detected defect requires from a
 * matching issue. `category` is always required; every other field is
 * checked only when supplied, so each `R-BUS-014`–`022` rule states
 * precisely which properties the fixed contract demands for THAT defect
 * (README §9) — never only "an issue with the right category exists,
 * however weak." This is what closes the severity/blocking downgrade
 * bypass: a model cannot satisfy a ground-truth rule by reporting the
 * correct category at LOW severity or with `blocking: false`.
 */
interface IssueMatchCriteria {
  readonly category: IssueCategory;
  readonly affectedSegmentId?: string;
  readonly affectedBeatId?: string;
  /** Exact severity required, when the defect's severity is fixed by contract. */
  readonly severity?: IssueSeverity;
  /** Severities that never satisfy this defect, when only a floor is fixed (e.g. "never LOW"). */
  readonly severityNot?: readonly IssueSeverity[];
  /** When true, a matching issue MUST have `blocking === true`. */
  readonly blockingRequired?: boolean;
}

/** Finds the first reported issue satisfying every supplied criterion — the "did the model catch THIS SPECIFIC defect, correctly classified?" check every ground-truth rule performs. */
function findMatchingIssue(report: ReviewReport, criteria: IssueMatchCriteria): ReviewIssue | undefined {
  return report.issues.find((issue) => {
    if (issue.category !== criteria.category) return false;
    if (criteria.affectedSegmentId !== undefined && issue.affectedSegmentId !== criteria.affectedSegmentId) return false;
    if (criteria.affectedBeatId !== undefined && issue.affectedBeatId !== criteria.affectedBeatId) return false;
    if (criteria.severity !== undefined && issue.severity !== criteria.severity) return false;
    if (criteria.severityNot !== undefined && criteria.severityNot.includes(issue.severity)) return false;
    if (criteria.blockingRequired === true && !issue.blocking) return false;
    return true;
  });
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  ReviewReport,
  ScriptReviewerRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Issue IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) =>
      duplicatesOf(report.issues, (issue) => issue.issueId).map((index) => {
        const issue = report.issues[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.issues[${index}].issueId`,
          expected: 'an issueId unique within issues',
          actual: issue?.issueId ?? '',
          message: 'Two issues share the same issueId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Issue affectedSegmentId resolves to a supplied script segment',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const segmentIds = new Set(request.script.segments.map((segment) => segment.segmentId));
      return report.issues.flatMap((issue, index) =>
        issue.affectedSegmentId === undefined || segmentIds.has(issue.affectedSegmentId)
          ? []
          : [finding({
              ruleId: 'R-BUS-002',
              path: `$.issues[${index}].affectedSegmentId`,
              expected: 'a segmentId present in the request script.segments, or absent',
              actual: issue.affectedSegmentId,
              message: 'Issue references a script segment that was never supplied; the reference is orphaned.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Issue affectedBeatId resolves to a supplied story beat',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const beatIds = new Set(request.storyArchitecture.beats.map((beat) => beat.beatId));
      return report.issues.flatMap((issue, index) =>
        issue.affectedBeatId === undefined || beatIds.has(issue.affectedBeatId)
          ? []
          : [finding({
              ruleId: 'R-BUS-003',
              path: `$.issues[${index}].affectedBeatId`,
              expected: 'a beatId present in the request storyArchitecture.beats, or absent',
              actual: issue.affectedBeatId,
              message: 'Issue references a story beat that was never supplied; the reference is orphaned.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Issue affectedClaimIds resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      return report.issues.flatMap((issue, issueIndex) =>
        issue.affectedClaimIds.flatMap((claimId) =>
          index.knownClaimIds.has(claimId)
            ? []
            : [finding({
                ruleId: 'R-BUS-004',
                path: `$.issues[${issueIndex}].affectedClaimIds`,
                expected: 'a claimId present in the supplied verificationPackage.claims',
                actual: claimId,
                message: 'Issue references a claim that was never supplied; the reviewer must not invent a claimId.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Issue affectedEvidenceIds resolve to a supplied claim\'s supportingEvidenceIds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      return report.issues.flatMap((issue, issueIndex) =>
        issue.affectedEvidenceIds.flatMap((evidenceId) =>
          index.knownEvidenceIds.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-005',
                path: `$.issues[${issueIndex}].affectedEvidenceIds`,
                expected: "an evidenceId present in a supplied claim's supportingEvidenceIds",
                actual: evidenceId,
                message: 'Issue references evidence that was never supplied; the reviewer must not fabricate an evidenceId.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'summary.blockingIssueCount matches the actual count of blocking issues',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) => {
      const actual = report.issues.filter((issue) => issue.blocking).length;
      return actual === report.summary.blockingIssueCount
        ? []
        : [finding({
            ruleId: 'R-BUS-006',
            path: '$.summary.blockingIssueCount',
            expected: String(actual),
            actual: String(report.summary.blockingIssueCount),
            message: 'Declared blockingIssueCount does not match the actual number of issues with blocking=true.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'summary.highSeverityIssueCount matches the actual count of HIGH-severity issues',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) => {
      const actual = report.issues.filter((issue) => issue.severity === 'HIGH').length;
      return actual === report.summary.highSeverityIssueCount
        ? []
        : [finding({
            ruleId: 'R-BUS-007',
            path: '$.summary.highSeverityIssueCount',
            expected: String(actual),
            actual: String(report.summary.highSeverityIssueCount),
            message: 'Declared highSeverityIssueCount does not match the actual number of HIGH-severity issues.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'summary.repairableIssueCount matches the actual count of repairable issues',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) => {
      const actual = report.issues.filter((issue) => issue.repairability === 'REPAIRABLE').length;
      return actual === report.summary.repairableIssueCount
        ? []
        : [finding({
            ruleId: 'R-BUS-008',
            path: '$.summary.repairableIssueCount',
            expected: String(actual),
            actual: String(report.summary.repairableIssueCount),
            message: 'Declared repairableIssueCount does not match the actual number of REPAIRABLE issues.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-009',
    title: 'summary.readyForScenePlanning matches the decision',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) => {
      const expected = report.summary.decision === 'APPROVED';
      return report.summary.readyForScenePlanning === expected
        ? []
        : [finding({
            ruleId: 'R-BUS-009',
            path: '$.summary.readyForScenePlanning',
            expected: String(expected),
            actual: String(report.summary.readyForScenePlanning),
            message: 'readyForScenePlanning must be true if and only if decision is APPROVED.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'APPROVED requires zero blocking issues',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) =>
      report.summary.decision === 'APPROVED' && report.summary.blockingIssueCount > 0
        ? [finding({
            ruleId: 'R-BUS-010',
            path: '$.summary.decision',
            expected: 'a decision other than APPROVED, because blockingIssueCount > 0',
            actual: 'APPROVED',
            message: 'A script with at least one blocking issue cannot be declared APPROVED.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-011',
    title: 'A CRITICAL issue is incompatible with APPROVED',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) =>
      report.summary.decision === 'APPROVED' && report.issues.some((issue) => issue.severity === 'CRITICAL')
        ? [finding({
            ruleId: 'R-BUS-011',
            path: '$.summary.decision',
            expected: 'a decision other than APPROVED, because a CRITICAL issue is present',
            actual: 'APPROVED',
            message: 'A script with a CRITICAL issue cannot be declared APPROVED.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-012',
    title: 'Every CRITICAL issue is blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) =>
      report.issues.flatMap((issue, index) =>
        issue.severity === 'CRITICAL' && !issue.blocking
          ? [finding({
              ruleId: 'R-BUS-012',
              path: `$.issues[${index}].blocking`,
              expected: 'true, because this issue is CRITICAL',
              actual: 'false',
              message: 'A CRITICAL issue must always be blocking — a safety/factual/provenance violation cannot be non-blocking.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-013',
    title: 'nextAction matches the fixed decision → nextAction mapping',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report) => {
      const expected = DECISION_TO_NEXT_ACTION[report.summary.decision];
      return report.nextAction === expected
        ? []
        : [finding({
            ruleId: 'R-BUS-013',
            path: '$.nextAction',
            expected,
            actual: report.nextAction,
            message: `nextAction must be ${expected} when decision is ${report.summary.decision}; the mapping is fixed and never chosen freely.`,
          })];
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Every DO_NOT_USE claim used by the script is reported as CRITICAL and blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      request.script.segments.forEach((segment) => {
        const usesDoNotUse =
          segment.claimRefs.some((claimId) => index.claimSafety.get(claimId) === 'DO_NOT_USE') ||
          segment.evidenceRefs.some((evidenceId) => {
            const owner = index.evidenceOwner.get(evidenceId);
            return owner !== undefined && index.claimSafety.get(owner) === 'DO_NOT_USE';
          });
        if (!usesDoNotUse) return;
        const matched = findMatchingIssue(report, {
          category: 'DO_NOT_USE_VIOLATION',
          affectedSegmentId: segment.segmentId,
          severity: 'CRITICAL',
          blockingRequired: true,
        });
        if (matched === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-014',
            path: '$.issues',
            expected: `a DO_NOT_USE_VIOLATION issue referencing segment "${segment.segmentId}" with severity CRITICAL and blocking=true`,
            actual: 'no matching issue reported',
            message: 'The script uses a DO_NOT_USE claim as factual narration; the review either failed to report it, reported the wrong segment, or downgraded its severity/blocking status. A DO_NOT_USE violation is always CRITICAL and always blocking.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'Every missing required qualification is reported as blocking and above LOW severity',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      request.script.segments.forEach((segment) => {
        const requiresQualification = segment.claimRefs.some(
          (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
        );
        const hasQualification = segment.qualification !== undefined && segment.qualification.trim().length > 0;
        if (!requiresQualification || hasQualification) return;
        const matched = findMatchingIssue(report, {
          category: 'QUALIFICATION_MISSING',
          affectedSegmentId: segment.segmentId,
          severityNot: ['LOW'],
          blockingRequired: true,
        });
        if (matched === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-015',
            path: '$.issues',
            expected: `a QUALIFICATION_MISSING issue referencing segment "${segment.segmentId}" with blocking=true and severity above LOW`,
            actual: 'no matching issue reported',
            message: 'The script cites a USE_WITH_QUALIFICATION claim without preserving its qualification; the review either failed to report it, reported the wrong segment, or downgraded it to LOW/non-blocking. A lost qualification is never LOW severity and always blocking.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-016',
    title: 'Every ungrounded number in the script is reported as blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      request.script.segments.forEach((segment) => {
        const referencedText = segment.claimRefs
          .map((claimId) => index.claimText.get(claimId))
          .filter((text): text is string => text !== undefined);
        const ungrounded = extractNumericTokens(segment.narration).some(
          (token) => !referencedText.some((text) => text.includes(token)),
        );
        if (!ungrounded) return;
        const matched = findMatchingIssue(report, {
          category: 'NUMERIC_DRIFT',
          affectedSegmentId: segment.segmentId,
          blockingRequired: true,
        });
        if (matched === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-016',
            path: '$.issues',
            expected: `a NUMERIC_DRIFT issue referencing segment "${segment.segmentId}" with blocking=true`,
            actual: 'no matching issue reported',
            message: 'The script narration contains a number that does not trace to any claim the segment cites; the review either failed to report it, reported the wrong segment, or left it non-blocking. Numeric drift is always publication-blocking.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-017',
    title: 'Every fabricated or mismatched quotation is reported as CRITICAL and blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      request.script.segments.forEach((segment) => {
        const quotation = segment.quotation;
        if (quotation === undefined) return;
        const claimText = index.claimText.get(quotation.claimId);
        const claimType = index.claimType.get(quotation.claimId);
        const speaker = index.quoteSpeaker.get(quotation.claimId);
        const isFabricated =
          !segment.claimRefs.includes(quotation.claimId) ||
          claimType !== 'QUOTE' ||
          (claimText !== undefined && quotation.quotedText !== claimText) ||
          (speaker !== undefined && quotation.speaker !== speaker);
        if (!isFabricated) return;
        const matched = findMatchingIssue(report, {
          category: 'UNSUPPORTED_QUOTE',
          affectedSegmentId: segment.segmentId,
          severity: 'CRITICAL',
          blockingRequired: true,
        });
        if (matched === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-017',
            path: '$.issues',
            expected: `an UNSUPPORTED_QUOTE issue referencing segment "${segment.segmentId}" with severity CRITICAL and blocking=true`,
            actual: 'no matching issue reported',
            message: 'The script contains a quotation not supported by Agent 03\'s verified claim; the review either failed to report it, reported the wrong segment, or downgraded its severity/blocking status. A fabricated or mismatched quote is always CRITICAL and always blocking.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-018',
    title: 'A missing hook opening is reported against the actual first segment, blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const first = sortedByOrder(request.script.segments)[0];
      if (first === undefined || first.segmentType === 'HOOK') return [];
      const matched = findMatchingIssue(report, {
        category: 'STRUCTURAL_COMPLETENESS',
        affectedSegmentId: first.segmentId,
        blockingRequired: true,
      });
      return matched !== undefined
        ? []
        : [finding({
            ruleId: 'R-BUS-018',
            path: '$.issues',
            expected: `a STRUCTURAL_COMPLETENESS issue referencing segment "${first.segmentId}" with blocking=true, reporting the missing hook`,
            actual: 'no matching issue reported',
            message: 'The script does not open with a HOOK segment; the review either failed to report it, reported an unrelated STRUCTURAL_COMPLETENESS issue, or left it non-blocking.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-019',
    title: 'A missing conclusion/CTA close is reported against the actual last segment, blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const ordered = sortedByOrder(request.script.segments);
      const last = ordered[ordered.length - 1];
      if (last === undefined || last.segmentType === 'CONCLUSION' || last.segmentType === 'CTA') return [];
      const matched = findMatchingIssue(report, {
        category: 'STRUCTURAL_COMPLETENESS',
        affectedSegmentId: last.segmentId,
        blockingRequired: true,
      });
      return matched !== undefined
        ? []
        : [finding({
            ruleId: 'R-BUS-019',
            path: '$.issues',
            expected: `a STRUCTURAL_COMPLETENESS issue referencing segment "${last.segmentId}" with blocking=true, reporting the missing conclusion/CTA`,
            actual: 'no matching issue reported',
            message: 'The script does not close with a CONCLUSION or CTA segment; the review either failed to report it, reported an unrelated STRUCTURAL_COMPLETENESS issue, or left it non-blocking.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-020',
    title: 'An out-of-tolerance duration is reported as blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const { targetDurationSeconds, totalEstimatedDurationSeconds } = request.script.scriptDuration;
      const withinTolerance =
        Math.abs(totalEstimatedDurationSeconds - targetDurationSeconds) / targetDurationSeconds <=
        SCRIPT_REVIEWER_DURATION_TOLERANCE_RATIO;
      if (withinTolerance) return [];
      const matched = findMatchingIssue(report, { category: 'DURATION', blockingRequired: true });
      return matched !== undefined
        ? []
        : [finding({
            ruleId: 'R-BUS-020',
            path: '$.issues',
            expected: 'a DURATION issue with blocking=true reporting the out-of-tolerance duration',
            actual: 'no matching issue reported',
            message: `The script's estimated duration falls outside the fixed ±${SCRIPT_REVIEWER_DURATION_TOLERANCE_RATIO * 100}% tolerance; the review either failed to report it or left it non-blocking.`,
          })];
    },
  },
  {
    ruleId: 'R-BUS-021',
    title: 'Every unnarrated story beat is individually reported, blocking, against its own beatId',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const covered = new Set(request.script.segments.map((segment) => segment.beatRef));
      const uncoveredBeats = request.storyArchitecture.beats.filter((beat) => !covered.has(beat.beatId));
      return uncoveredBeats.flatMap((beat) => {
        const matched = findMatchingIssue(report, {
          category: 'STORY_ALIGNMENT',
          affectedBeatId: beat.beatId,
          blockingRequired: true,
        });
        return matched !== undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-021',
              path: '$.issues',
              expected: `a STORY_ALIGNMENT issue with affectedBeatId "${beat.beatId}" and blocking=true`,
              actual: 'no matching issue reported',
              message: `Story beat "${beat.beatId}" from the approved architecture was never narrated by any segment; the review either failed to report it specifically, reported a generic STORY_ALIGNMENT issue for a different beat, or left it non-blocking.`,
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-022',
    title: 'A narrative order violation is reported against the offending segment, blocking',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) => {
      const orderByBeat = beatOrderById(request);
      const ordered = sortedByOrder(request.script.segments);
      const offendingSegmentIds: string[] = [];
      let previousBeatOrder = -Infinity;
      for (const segment of ordered) {
        const beatOrder = orderByBeat.get(segment.beatRef);
        if (beatOrder === undefined) continue;
        if (beatOrder < previousBeatOrder) offendingSegmentIds.push(segment.segmentId);
        previousBeatOrder = Math.max(previousBeatOrder, beatOrder);
      }
      if (offendingSegmentIds.length === 0) return [];
      const matched = offendingSegmentIds.some(
        (segmentId) =>
          findMatchingIssue(report, {
            category: 'STORY_ALIGNMENT',
            affectedSegmentId: segmentId,
            blockingRequired: true,
          }) !== undefined,
      );
      return matched
        ? []
        : [finding({
            ruleId: 'R-BUS-022',
            path: '$.issues',
            expected: `a STORY_ALIGNMENT issue with blocking=true referencing one of the offending segments (${offendingSegmentIds.join(', ')})`,
            actual: 'no matching issue reported',
            message: 'A segment narrates an earlier-ordered beat after a later-ordered beat was already narrated; the review either failed to report it, reported an unrelated STORY_ALIGNMENT issue, or left it non-blocking.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-023',
    title: 'topicId echoes the request\'s script.topicId',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (report, request) =>
      report.topicId === request.script.topicId
        ? []
        : [finding({
            ruleId: 'R-BUS-023',
            path: '$.topicId',
            expected: request.script.topicId,
            actual: report.topicId,
            message: 'Declared topicId does not match the request\'s script.topicId; the report does not identify itself as being for the reviewed script\'s topic.',
          })],
  },
];

const DECISION_TO_NEXT_ACTION: Readonly<Record<ReviewReport['summary']['decision'], ReviewReport['nextAction']>> = {
  APPROVED: 'CONTINUE',
  REPAIR_REQUIRED: 'REPAIR_SCRIPT',
  REGENERATION_REQUIRED: 'REGENERATE_SCRIPT',
  REJECTED: 'REJECT',
};

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Aggregation
 * ──────────────────────────────────────────────────────────────────────────── */

/** Most severe stage outcome wins; never an average, never a majority (GDE-003 §8.2). */
export function aggregateOutcome(findings: readonly ValidationFinding[]): ValidationOutcome {
  if (findings.some((item) => item.severity === 'BLOCKER' || item.severity === 'ERROR')) return 'FAILED';
  if (findings.some((item) => item.severity === 'WARNING')) return 'PASSED_WITH_WARNINGS';
  return 'PASSED';
}

/**
 * Input acceptance: structural first, then business rules.
 * Business rules run only when the subject is structurally valid — running them
 * on a malformed object produces findings about the wrong thing.
 */
export function validateScriptReviewerRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as ScriptReviewerAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the
 * review report and the request that produced it.
 */
export function validateScriptReviewerResponse(
  validate: ValidateFunction,
  response: unknown,
  request: ScriptReviewerRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as ScriptReviewerAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare review report emitted by the model, before the runtime
 * wraps it. `validate` MUST be compiled from `REVIEW_REPORT_SCHEMA_POINTER`.
 */
export function validateReviewReport(
  validate: ValidateFunction,
  reviewReport: unknown,
  request: ScriptReviewerRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, reviewReport);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(reviewReport as ReviewReport, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

/** Exported for tests/tools that need to reason about a single segment in isolation. */
export type { NarrationScriptRef, ScriptSegmentRef };

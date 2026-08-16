/**
 * AGT-05 — Script Writer Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither writes
 * narration, resolves claims, repairs, normalises, defaults, nor mutates any
 * artifact. It answers one question — "is this contract acceptable?" — and
 * returns findings. No network requests, no web searches, no AI calls, no
 * database operations, no retries.
 *
 * Division of responsibility (GDE-002 §9.1), identical to AGT-04's own
 * validator.ts:
 *   - Agent author (design time) → the schemas, which make invalid output
 *     unrepresentable. Enforced here by `structuralValidate`.
 *   - Agent runtime (invocation) → structural validation of input and output.
 *   - Validation plane (between stages) → the named business rules below.
 *
 * Invariants held by this module:
 *   - Pure. No I/O, no clock reads, no randomness, no logging, no DI, no state.
 *   - Total. Every rule reports ALL violations it finds, never only the first
 *     (STD-000 §6.2), each with a machine-readable path so repair can be
 *     targeted rather than a full regeneration (GDE-002 §10.3).
 *   - Non-mutating. A validator never modifies its subject (GDE-003 §8.6 rule 4).
 *   - Deterministic. `basis` is `DETERMINISTIC` on every finding emitted here;
 *     no rule in this file is a model judgement. The numeric-provenance rule
 *     (R-BUS-016) is a deterministic STRING check (does this digit sequence
 *     appear in a referenced claim's text?) — it is not semantic analysis and
 *     does not attempt to understand units, magnitude, or meaning.
 *
 * @contract script-writer-agent-input/v1  1.0.0
 * @contract script-writer-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  NarrationScript,
  ScriptSegment,
  ScriptWriterAgentRequest,
  ScriptWriterAgentResponse,
  ScriptWriterRequestData,
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

export const INPUT_SCHEMA_ID = 'urn:contract:script-writer-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:script-writer-agent-output:v1' as const;
export const NARRATION_SCRIPT_SCHEMA_POINTER =
  'urn:contract:script-writer-agent-output:v1#/$defs/narrationScript' as const;

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

/** `/segments/2/segmentType` → `$.segments[2].segmentType` (STD-000 §8.1 path form). */
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

/** Placeholder residue detection (STD-000 §6.7). Applied to every prose field. */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bTBD\b/i,
  /lorem ipsum/i,
  /\[insert[^\]]*\]/i,
  /\{\{[^}]*\}\}/,
  /<[a-z_]+>\s*$/i,
  /\.\.\.$/,
];

function collectStrings(value: unknown, path: string, sink: Array<{ path: string; value: string }>): void {
  if (typeof value === 'string') {
    sink.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, sink));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(child, `${path}.${key}`, sink);
    }
  }
}

/** Extracts standalone numeric tokens (percentages, currency, plain numbers) from prose, for R-BUS-016. */
const NUMERIC_TOKEN_PATTERN = /\d[\d,.]*%?/g;

function extractNumericTokens(text: string): readonly string[] {
  return [...text.matchAll(NUMERIC_TOKEN_PATTERN)].map((match) => match[0]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Input business rules (R-IN-*)
 *    Evaluated before dispatch. A violation is a WORKFLOW defect: the engine
 *    assembled the input, so it fails fast and does not retry (GDE-005 §7.3).
 * ──────────────────────────────────────────────────────────────────────────── */

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<ScriptWriterRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'storyArchitecture.downstreamReadiness is READY_FOR_SCRIPT',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.storyArchitecture.downstreamReadiness === 'READY_FOR_SCRIPT'
        ? []
        : [finding({
            ruleId: 'R-IN-001',
            path: '$.storyArchitecture.downstreamReadiness',
            expected: 'READY_FOR_SCRIPT',
            actual: data.storyArchitecture.downstreamReadiness,
            message: 'A story architecture that is NOT_READY_FOR_SCRIPT cannot be dispatched to the script writer; the workflow must resolve it first.',
          })],
  },
  {
    ruleId: 'R-IN-002',
    title: 'verificationPackage.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.verificationPackage.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-002',
            path: '$.storyArchitecture.topicId',
            expected: `"${data.verificationPackage.topicId}" (verificationPackage.topicId)`,
            actual: data.storyArchitecture.topicId,
            message: 'verificationPackage.topicId and storyArchitecture.topicId disagree; the supplied verified claims and story architecture do not represent the same topic.',
          })],
  },
  {
    ruleId: 'R-IN-003',
    title: 'Supplied verified claim IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.verificationPackage.claims, (claim) => claim.claimId).map((index) => {
        const claim = data.verificationPackage.claims[index];
        return finding({
          ruleId: 'R-IN-003',
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

/** Fixed tolerance for duration reconciliation, identical to Agent 04's own tolerance (README §13). */
export const SCRIPT_DURATION_TOLERANCE_RATIO = 0.15;

/** Fixed, deterministic speech rate this script's timing is derived from (README §14). Not sourced from shared configuration: none exists yet project-wide, so this contract fixes its own value, exactly as Agent 04 fixes its own duration tolerance. */
export const SCRIPT_WORDS_PER_MINUTE = 150;

interface ClaimIndex {
  readonly claimSafety: ReadonlyMap<string, 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE'>;
  readonly claimType: ReadonlyMap<string, string>;
  readonly claimText: ReadonlyMap<string, string>;
  readonly quoteSpeaker: ReadonlyMap<string, string>;
  readonly knownClaimIds: ReadonlySet<string>;
  readonly knownEvidenceIds: ReadonlySet<string>;
  readonly evidenceOwner: ReadonlyMap<string, string>;
  /** Each claim's own supportingEvidenceIds, for per-segment provenance union checks (R-BUS-008). */
  readonly supportingEvidenceIdsByClaim: ReadonlyMap<string, readonly string[]>;
}

function buildClaimIndex(request: ScriptWriterRequestData): ClaimIndex {
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

/**
 * The union of supportingEvidenceIds across every claim a segment actually
 * references via claimRefs — the ONLY evidence a segment may cite (R-BUS-008).
 * Mirrors AGT-04's `evidenceReachableFromBeatClaims` exactly, applied to
 * segments instead of beats.
 */
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

function beatOrderById(request: ScriptWriterRequestData): ReadonlyMap<string, number> {
  return new Map(request.storyArchitecture.beats.map((beat) => [beat.beatId, beat.order]));
}

function sortedByOrder(segments: readonly ScriptSegment[]): readonly ScriptSegment[] {
  return [...segments].sort((a, b) => a.order - b.order);
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  NarrationScript,
  ScriptWriterRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Segment IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) =>
      duplicatesOf(script.segments, (segment) => segment.segmentId).map((index) => {
        const segment = script.segments[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.segments[${index}].segmentId`,
          expected: 'a segmentId unique within segments',
          actual: segment?.segmentId ?? '',
          message: 'Two segments share the same segmentId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Segment order values are unique and contiguous from 1',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const orders = script.segments.map((segment) => segment.order).sort((a, b) => a - b);
      const expected = script.segments.map((_, index) => index + 1);
      const matches = orders.length === expected.length && orders.every((value, index) => value === expected[index]);
      return matches
        ? []
        : [finding({
            ruleId: 'R-BUS-002',
            path: '$.segments[*].order',
            expected: `a contiguous set {1..${script.segments.length}} with no repeats`,
            actual: JSON.stringify(orders),
            message: 'Segment order values are not a contiguous, non-repeating sequence starting at 1.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Segment beatRef resolves to a supplied story beat',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const beatIds = new Set(request.storyArchitecture.beats.map((beat) => beat.beatId));
      return script.segments.flatMap((segment, index) =>
        beatIds.has(segment.beatRef)
          ? []
          : [finding({
              ruleId: 'R-BUS-003',
              path: `$.segments[${index}].beatRef`,
              expected: 'a beatId present in the request storyArchitecture.beats',
              actual: segment.beatRef,
              message: 'Segment cites a story beat that was never supplied; the segment is ungrounded.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Segment claimRefs resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) =>
        segment.claimRefs.flatMap((claimId) =>
          index.knownClaimIds.has(claimId)
            ? []
            : [finding({
                ruleId: 'R-BUS-004',
                path: `$.segments[${segmentIndex}].claimRefs`,
                expected: 'a claimId present in the supplied verificationPackage.claims',
                actual: claimId,
                message: 'Segment cites a claim that was never supplied; the segment is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Segment evidenceRefs resolve to a supplied claim\'s supportingEvidenceIds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) =>
        segment.evidenceRefs.flatMap((evidenceId) =>
          index.knownEvidenceIds.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-005',
                path: `$.segments[${segmentIndex}].evidenceRefs`,
                expected: "an evidenceId present in a supplied claim's supportingEvidenceIds",
                actual: evidenceId,
                message: 'Segment cites evidence that was never supplied for any claim; the segment is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'DO_NOT_USE claims never appear as factual script content',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      script.segments.forEach((segment, segmentIndex) => {
        segment.claimRefs.forEach((claimId) => {
          if (index.claimSafety.get(claimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-006',
              path: `$.segments[${segmentIndex}].claimRefs`,
              expected: 'no reference to a claim whose downstreamSafety is DO_NOT_USE',
              actual: claimId,
              message: 'A DO_NOT_USE claim was used as factual script content; the Verification Package\'s determination was not respected.',
            }));
          }
        });
        segment.evidenceRefs.forEach((evidenceId) => {
          const ownerClaimId = index.evidenceOwner.get(evidenceId);
          if (ownerClaimId !== undefined && index.claimSafety.get(ownerClaimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-006',
              path: `$.segments[${segmentIndex}].evidenceRefs`,
              expected: 'no evidence reference belonging to a DO_NOT_USE claim',
              actual: `${evidenceId} (owned by DO_NOT_USE claim ${ownerClaimId})`,
              message: 'Evidence belonging to a DO_NOT_USE claim was cited directly, bypassing the claim-level protection.',
            }));
          }
        });
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'USE_WITH_QUALIFICATION claims preserve their qualification in every citing segment',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) => {
        const requiresQualification = segment.claimRefs.some(
          (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
        );
        if (!requiresQualification) return [];
        return segment.qualification !== undefined && segment.qualification.trim().length > 0
          ? []
          : [finding({
              ruleId: 'R-BUS-007',
              path: `$.segments[${segmentIndex}].qualification`,
              expected: 'present, because this segment cites a USE_WITH_QUALIFICATION claim',
              actual: 'absent',
              message: 'A segment cites a USE_WITH_QUALIFICATION claim (e.g. CONFLICTING or OUTDATED per the Verification Package) without preserving its qualification.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'Segment evidenceRefs are reachable only through that segment\'s own claimRefs',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) => {
        if (segment.claimRefs.length === 0) {
          return segment.evidenceRefs.length === 0
            ? []
            : [finding({
                ruleId: 'R-BUS-008',
                path: `$.segments[${segmentIndex}].evidenceRefs`,
                expected: 'an empty array, because this segment\'s claimRefs is empty',
                actual: JSON.stringify(segment.evidenceRefs),
                message: 'A segment with no claimRefs cannot cite any evidenceRefs — evidence must belong to a claim the segment itself references.',
              })];
        }
        const reachable = evidenceReachableFromSegmentClaims(segment.claimRefs, index);
        return segment.evidenceRefs.flatMap((evidenceId) =>
          reachable.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-008',
                path: `$.segments[${segmentIndex}].evidenceRefs`,
                expected: "an evidenceId present in the supportingEvidenceIds of one of this segment's own claimRefs",
                actual: `${evidenceId} (owned by ${index.evidenceOwner.get(evidenceId) ?? 'a claim not referenced by this segment'})`,
                message: 'Segment cites evidence belonging to a claim it does not itself reference via claimRefs; evidence must belong to a claim the same segment actually cites.',
              })],
        );
      });
    },
  },
  {
    ruleId: 'R-BUS-009',
    title: 'Every supplied story beat is covered by at least one segment',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const covered = new Set(script.segments.map((segment) => segment.beatRef));
      return request.storyArchitecture.beats.flatMap((beat) =>
        covered.has(beat.beatId)
          ? []
          : [finding({
              ruleId: 'R-BUS-009',
              path: '$.segments',
              expected: `at least one segment with beatRef "${beat.beatId}"`,
              actual: 'no segment references this beat',
              message: 'A story beat from the approved architecture was skipped entirely; the script does not follow the Story Architecture.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Segment order follows the referenced beats\' own order, non-decreasing',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const orderByBeat = beatOrderById(request);
      const ordered = sortedByOrder(script.segments);
      const findings: ValidationFinding[] = [];
      let previousBeatOrder = -Infinity;
      for (const segment of ordered) {
        const beatOrder = orderByBeat.get(segment.beatRef);
        if (beatOrder === undefined) continue; // unresolvable beatRef already reported by R-BUS-003
        if (beatOrder < previousBeatOrder) {
          findings.push(finding({
            ruleId: 'R-BUS-010',
            path: `$.segments[?(@.segmentId=='${segment.segmentId}')].beatRef`,
            expected: `a beat order >= ${previousBeatOrder}, matching the script's own narration order`,
            actual: String(beatOrder),
            message: 'This segment narrates a story beat that comes earlier in the approved architecture than a segment already spoken before it; the script does not follow the story\'s sequence.',
          }));
        }
        previousBeatOrder = Math.max(previousBeatOrder, beatOrder);
      }
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'The first segment opens with the hook',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const first = sortedByOrder(script.segments)[0];
      if (first === undefined) return [];
      const findings: ValidationFinding[] = [];
      if (first.segmentType !== 'HOOK') {
        findings.push(finding({
          ruleId: 'R-BUS-011',
          path: '$.segments[0].segmentType',
          expected: 'HOOK',
          actual: first.segmentType,
          message: 'The first segment in narration order is not segmentType HOOK; the script does not open with its hook.',
        }));
      }
      const hookBeat = request.storyArchitecture.beats.find((beat) => beat.beatType === 'HOOK');
      if (hookBeat !== undefined && first.beatRef !== hookBeat.beatId) {
        findings.push(finding({
          ruleId: 'R-BUS-011',
          path: '$.segments[0].beatRef',
          expected: hookBeat.beatId,
          actual: first.beatRef,
          message: 'The first segment does not reference the story architecture\'s HOOK beat.',
        }));
      }
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-012',
    title: 'The last segment closes with a conclusion or a call to action',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const ordered = sortedByOrder(script.segments);
      const last = ordered[ordered.length - 1];
      return last === undefined || last.segmentType === 'CONCLUSION' || last.segmentType === 'CTA'
        ? []
        : [finding({
            ruleId: 'R-BUS-012',
            path: `$.segments[${ordered.length - 1}].segmentType`,
            expected: 'CONCLUSION or CTA',
            actual: last.segmentType,
            message: 'The final segment in narration order is neither CONCLUSION nor CTA; the script does not end properly.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'A CTA segment is present if and only if ctaStrategy.ctaType is not NONE',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const hasCtaSegment = script.segments.some((segment) => segment.segmentType === 'CTA');
      const ctaRequested = request.storyArchitecture.ctaStrategy.ctaType !== 'NONE';
      if (ctaRequested && !hasCtaSegment) {
        return [finding({
          ruleId: 'R-BUS-013',
          path: '$.segments',
          expected: `at least one CTA segment, because ctaStrategy.ctaType is ${request.storyArchitecture.ctaStrategy.ctaType}`,
          actual: 'no CTA segment present',
          message: 'The story architecture requests a call to action but the script contains no CTA segment.',
        })];
      }
      if (!ctaRequested && hasCtaSegment) {
        return [finding({
          ruleId: 'R-BUS-013',
          path: '$.segments',
          expected: 'no CTA segment, because ctaStrategy.ctaType is NONE',
          actual: 'a CTA segment is present',
          message: 'The story architecture requests no call to action (ctaType NONE) but the script invents one.',
        })];
      }
      return [];
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Quotations reproduce the referenced claim\'s text and speaker exactly',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) => {
        const quotation = segment.quotation;
        if (quotation === undefined) return [];
        const findings: ValidationFinding[] = [];
        const claimText = index.claimText.get(quotation.claimId);
        if (claimText !== undefined && quotation.quotedText !== claimText) {
          findings.push(finding({
            ruleId: 'R-BUS-014',
            path: `$.segments[${segmentIndex}].quotation.quotedText`,
            expected: claimText,
            actual: quotation.quotedText,
            message: 'The quoted text does not exactly match the referenced claim\'s claimText; a quotation may never be paraphrased, shortened, or embellished.',
          }));
        }
        const speaker = index.quoteSpeaker.get(quotation.claimId);
        if (speaker !== undefined && quotation.speaker !== speaker) {
          findings.push(finding({
            ruleId: 'R-BUS-014',
            path: `$.segments[${segmentIndex}].quotation.speaker`,
            expected: speaker,
            actual: quotation.speaker,
            message: 'The quotation\'s speaker does not match the Verification Package\'s recorded quoteProvenance.speaker for this claim.',
          }));
        }
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'A quotation may only be attached to a QUOTE-type claim the segment itself cites',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) => {
        const quotation = segment.quotation;
        if (quotation === undefined) return [];
        if (!segment.claimRefs.includes(quotation.claimId)) {
          return [finding({
            ruleId: 'R-BUS-015',
            path: `$.segments[${segmentIndex}].quotation.claimId`,
            expected: 'a claimId present in this segment\'s own claimRefs',
            actual: quotation.claimId,
            message: 'A quotation cites a claim this segment never references via claimRefs.',
          })];
        }
        const claimType = index.claimType.get(quotation.claimId);
        if (claimType !== undefined && claimType !== 'QUOTE') {
          return [finding({
            ruleId: 'R-BUS-015',
            path: `$.segments[${segmentIndex}].quotation.claimId`,
            expected: 'a claimId whose claimType is QUOTE',
            actual: `${quotation.claimId} (claimType ${claimType})`,
            message: 'A quotation was attached to a claim that is not itself a QUOTE claim; a paraphrase or other claim type may never be presented in quotation marks.',
          })];
        }
        return [];
      });
    },
  },
  {
    ruleId: 'R-BUS-016',
    title: 'Numeric tokens in narration trace to a referenced claim\'s text',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) => {
      const index = buildClaimIndex(request);
      return script.segments.flatMap((segment, segmentIndex) => {
        const narrationNumbers = extractNumericTokens(segment.narration);
        if (narrationNumbers.length === 0) return [];
        const referencedText = segment.claimRefs
          .map((claimId) => index.claimText.get(claimId))
          .filter((text): text is string => text !== undefined);
        return narrationNumbers.flatMap((token) => {
          const grounded = referencedText.some((text) => text.includes(token));
          return grounded
            ? []
            : [finding({
                ruleId: 'R-BUS-016',
                path: `$.segments[${segmentIndex}].narration`,
                expected: 'every numeric token to appear verbatim in the claimText of a claim this segment references',
                actual: token,
                message: 'Narration contains a number that does not trace to any claim this segment cites; a number must never be invented, generalised, or narrowed beyond its verified source.',
              })];
        });
      });
    },
  },
  {
    ruleId: 'R-BUS-017',
    title: 'scriptDuration.totalEstimatedDurationSeconds matches the actual sum of segment durations',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const actual = script.segments.reduce((sum, segment) => sum + segment.estimatedDurationSeconds, 0);
      return actual === script.scriptDuration.totalEstimatedDurationSeconds
        ? []
        : [finding({
            ruleId: 'R-BUS-017',
            path: '$.scriptDuration.totalEstimatedDurationSeconds',
            expected: String(actual),
            actual: String(script.scriptDuration.totalEstimatedDurationSeconds),
            message: 'Declared totalEstimatedDurationSeconds does not match the actual sum of segments[].estimatedDurationSeconds.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-018',
    title: 'scriptDuration.targetDurationSeconds echoes the request\'s storyArchitecture.duration.targetDurationSeconds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) =>
      script.scriptDuration.targetDurationSeconds === request.storyArchitecture.duration.targetDurationSeconds
        ? []
        : [finding({
            ruleId: 'R-BUS-018',
            path: '$.scriptDuration.targetDurationSeconds',
            expected: String(request.storyArchitecture.duration.targetDurationSeconds),
            actual: String(script.scriptDuration.targetDurationSeconds),
            message: 'scriptDuration.targetDurationSeconds does not match the request\'s storyArchitecture.duration.targetDurationSeconds; the target cannot be altered to make an out-of-tolerance duration appear valid.',
          })],
  },
  {
    ruleId: 'R-BUS-019',
    title: 'scriptDuration.withinTolerance matches the deterministic tolerance comparison',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const { targetDurationSeconds, totalEstimatedDurationSeconds } = script.scriptDuration;
      const actualWithinTolerance =
        Math.abs(totalEstimatedDurationSeconds - targetDurationSeconds) / targetDurationSeconds <=
        SCRIPT_DURATION_TOLERANCE_RATIO;
      return script.scriptDuration.withinTolerance === actualWithinTolerance
        ? []
        : [finding({
            ruleId: 'R-BUS-019',
            path: '$.scriptDuration.withinTolerance',
            expected: String(actualWithinTolerance),
            actual: String(script.scriptDuration.withinTolerance),
            message: `withinTolerance does not match the deterministic comparison against toleranceRatio (${SCRIPT_DURATION_TOLERANCE_RATIO}).`,
          })];
    },
  },
  {
    ruleId: 'R-BUS-020',
    title: 'scriptDuration.wordsPerMinute equals the fixed platform speech rate',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) =>
      script.scriptDuration.wordsPerMinute === SCRIPT_WORDS_PER_MINUTE
        ? []
        : [finding({
            ruleId: 'R-BUS-020',
            path: '$.scriptDuration.wordsPerMinute',
            expected: String(SCRIPT_WORDS_PER_MINUTE),
            actual: String(script.scriptDuration.wordsPerMinute),
            message: 'wordsPerMinute does not equal the fixed, deterministic platform speech rate.',
          })],
  },
  {
    ruleId: 'R-BUS-021',
    title: 'wordCount matches the actual word count of every segment\'s narration',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const actual = calculateWordCount(script);
      return actual === script.wordCount
        ? []
        : [finding({
            ruleId: 'R-BUS-021',
            path: '$.wordCount',
            expected: String(actual),
            actual: String(script.wordCount),
            message: 'Declared wordCount does not match the actual word count of segments[].narration, concatenated; the declared value is never trusted over the calculated one.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-022',
    title: 'downstreamReadiness and readinessBlockers are consistent',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      if (script.downstreamReadiness === 'NOT_READY_FOR_REVIEW' && script.readinessBlockers.length === 0) {
        return [finding({
          ruleId: 'R-BUS-022',
          path: '$.readinessBlockers',
          expected: 'at least one blocker when downstreamReadiness is NOT_READY_FOR_REVIEW',
          actual: '0 blockers',
          message: 'NOT_READY_FOR_REVIEW is declared without any structured blocker explaining why.',
        })];
      }
      if (script.downstreamReadiness === 'READY_FOR_REVIEW' && script.readinessBlockers.length > 0) {
        return [finding({
          ruleId: 'R-BUS-022',
          path: '$.readinessBlockers',
          expected: 'zero blockers when downstreamReadiness is READY_FOR_REVIEW',
          actual: `${script.readinessBlockers.length} blocker(s)`,
          message: 'READY_FOR_REVIEW is declared while unresolved blockers remain listed.',
        })];
      }
      return [];
    },
  },
  {
    ruleId: 'R-BUS-023',
    title: 'READY_FOR_REVIEW requires the duration to be within tolerance',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) =>
      script.downstreamReadiness === 'READY_FOR_REVIEW' && !script.scriptDuration.withinTolerance
        ? [finding({
            ruleId: 'R-BUS-023',
            path: '$.downstreamReadiness',
            expected: 'NOT_READY_FOR_REVIEW when scriptDuration.withinTolerance is false',
            actual: 'READY_FOR_REVIEW',
            message: 'A script with an out-of-tolerance duration cannot be declared READY_FOR_REVIEW.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-024',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(script, '$', strings);
      return strings.flatMap(({ path, value }) => {
        const matched = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(value));
        return matched === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-024',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-025',
    title: 'topicId echoes the request\'s storyArchitecture.topicId',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (script, request) =>
      script.topicId === request.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-BUS-025',
            path: '$.topicId',
            expected: request.storyArchitecture.topicId,
            actual: script.topicId,
            message: 'Declared topicId does not match the request\'s storyArchitecture.topicId; the script does not identify itself as being for the requested topic.',
          })],
  },
];

/** Concatenates every segment's narration and counts whitespace-delimited words — never trusted from the model's own declared value (README §15). */
export function calculateWordCount(script: NarrationScript): number {
  const text = script.segments.map((segment) => segment.narration).join(' ');
  const words = text.trim().split(/\s+/).filter((token) => token.length > 0);
  return words.length;
}

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
export function validateScriptWriterRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as ScriptWriterAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the
 * narration script and the request that produced it.
 */
export function validateScriptWriterResponse(
  validate: ValidateFunction,
  response: unknown,
  request: ScriptWriterRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as ScriptWriterAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare narration script emitted by the model, before the
 * runtime wraps it. `validate` MUST be compiled from
 * `NARRATION_SCRIPT_SCHEMA_POINTER`.
 */
export function validateNarrationScript(
  validate: ValidateFunction,
  narrationScript: unknown,
  request: ScriptWriterRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, narrationScript);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(narrationScript as NarrationScript, request),
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
export type { ScriptSegment };

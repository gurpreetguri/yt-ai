/**
 * AGT-04 — Story Architect Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither
 * structures stories, builds beats, resolves claims, repairs, normalises,
 * defaults, nor mutates any artifact. It answers one question — "is this
 * contract acceptable?" — and returns findings. No network requests, no web
 * searches, no AI calls, no database operations, no retries.
 *
 * Division of responsibility (GDE-002 §9.1):
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
 *     no rule in this file is a model judgement.
 *
 * @contract story-architect-agent-input/v1  1.0.0
 * @contract story-architect-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  StoryArchitectAgentRequest,
  StoryArchitectAgentResponse,
  StoryArchitectRequestData,
  StoryArchitecture,
  StoryBeat,
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

export const INPUT_SCHEMA_ID = 'urn:contract:story-architect-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:story-architect-agent-output:v1' as const;
export const STORY_ARCHITECTURE_SCHEMA_POINTER =
  'urn:contract:story-architect-agent-output:v1#/$defs/storyArchitecture' as const;

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

/** `/beats/2/beatType` → `$.beats[2].beatType` (STD-000 §8.1 path form). */
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

/** Resolves `$.a.b[0].c` against a subject. Returns `undefined` for any unresolvable segment. */
export function resolveJsonPath(subject: unknown, path: string): unknown {
  if (!path.startsWith('$')) return undefined;
  const tokens = path.slice(1).match(/\.[A-Za-z0-9_]+|\[\d+\]/g) ?? [];
  let cursor: unknown = subject;
  for (const token of tokens) {
    if (cursor === undefined || cursor === null) return undefined;
    if (token.startsWith('[')) {
      const index = Number(token.slice(1, -1));
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[index];
    } else {
      const key = token.slice(1);
      if (typeof cursor !== 'object') return undefined;
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }
  return cursor;
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

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Input business rules (R-IN-*)
 *    Evaluated before dispatch. A violation is a WORKFLOW defect: the engine
 *    assembled the input, so it fails fast and does not retry (GDE-005 §7.3).
 * ──────────────────────────────────────────────────────────────────────────── */

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<StoryArchitectRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'Supplied verified claim IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.verificationPackage.claims, (claim) => claim.claimId).map((index) => {
        const claim = data.verificationPackage.claims[index];
        return finding({
          ruleId: 'R-IN-001',
          path: `$.verificationPackage.claims[${index}].claimId`,
          expected: 'a claimId unique within verificationPackage.claims',
          actual: claim?.claimId ?? '',
          message: 'Two supplied verified claims share the same claimId.',
        });
      }),
  },
  {
    ruleId: 'R-IN-002',
    title: 'verificationPackage.topicId and topicOpportunity.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.verificationPackage.topicId === data.topicOpportunity.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-002',
            path: '$.topicOpportunity.topicId',
            expected: `"${data.verificationPackage.topicId}" (verificationPackage.topicId)`,
            actual: data.topicOpportunity.topicId,
            message: 'verificationPackage.topicId and topicOpportunity.topicId disagree; the supplied verified research and topic opportunity do not represent the same topic.',
          })],
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fixed tolerance for duration reconciliation (README §12). */
export const STORY_DURATION_TOLERANCE_RATIO = 0.15;

interface ClaimIndex {
  readonly claimSafety: ReadonlyMap<string, 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE'>;
  readonly knownClaimIds: ReadonlySet<string>;
  readonly knownEvidenceIds: ReadonlySet<string>;
  readonly evidenceOwner: ReadonlyMap<string, string>;
  /** Each claim's own supportingEvidenceIds, for per-beat provenance union checks (R-BUS-022). */
  readonly supportingEvidenceIdsByClaim: ReadonlyMap<string, readonly string[]>;
}

function buildClaimIndex(request: StoryArchitectRequestData): ClaimIndex {
  const claimSafety = new Map<string, 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE'>();
  const knownEvidenceIds = new Set<string>();
  const evidenceOwner = new Map<string, string>();
  const supportingEvidenceIdsByClaim = new Map<string, readonly string[]>();
  for (const claim of request.verificationPackage.claims) {
    claimSafety.set(claim.claimId, claim.downstreamSafety);
    supportingEvidenceIdsByClaim.set(claim.claimId, claim.supportingEvidenceIds);
    for (const evidenceId of claim.supportingEvidenceIds) {
      knownEvidenceIds.add(evidenceId);
      evidenceOwner.set(evidenceId, claim.claimId);
    }
  }
  return {
    claimSafety,
    knownClaimIds: new Set(claimSafety.keys()),
    knownEvidenceIds,
    evidenceOwner,
    supportingEvidenceIdsByClaim,
  };
}

/**
 * The union of supportingEvidenceIds across every claim a beat actually
 * references via claimRefs — the ONLY evidence a beat may cite (R-BUS-022).
 * Unresolvable claimRefs entries (already reported by R-BUS-003) contribute
 * nothing here; this function does not re-report them.
 */
function evidenceReachableFromBeatClaims(
  beatClaimRefs: readonly string[],
  index: ClaimIndex,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  for (const claimId of beatClaimRefs) {
    for (const evidenceId of index.supportingEvidenceIdsByClaim.get(claimId) ?? []) {
      reachable.add(evidenceId);
    }
  }
  return reachable;
}

/** Every claimRefs-bearing location a rule needs to walk: hook, each beat, payoff. */
function collectClaimRefLocations(
  story: StoryArchitecture,
): ReadonlyArray<{ path: string; claimRefs: readonly string[] }> {
  return [
    { path: '$.hook.claimRefs', claimRefs: story.hook.claimRefs },
    ...story.beats.map((beat, index) => ({
      path: `$.beats[${index}].claimRefs`,
      claimRefs: beat.claimRefs,
    })),
    { path: '$.payoff.resolutionClaimRefs', claimRefs: story.payoff.resolutionClaimRefs },
  ];
}

function collectEvidenceRefLocations(
  story: StoryArchitecture,
): ReadonlyArray<{ path: string; evidenceRefs: readonly string[] }> {
  return story.beats.map((beat, index) => ({
    path: `$.beats[${index}].evidenceRefs`,
    evidenceRefs: beat.evidenceRefs,
  }));
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  StoryArchitecture,
  StoryArchitectRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Beat IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) =>
      duplicatesOf(story.beats, (beat) => beat.beatId).map((index) => {
        const beat = story.beats[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.beats[${index}].beatId`,
          expected: 'a beatId unique within beats',
          actual: beat?.beatId ?? '',
          message: 'Two beats share the same beatId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Beat order values are unique and contiguous from 1',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const orders = story.beats.map((beat) => beat.order).sort((a, b) => a - b);
      const expected = story.beats.map((_, index) => index + 1);
      const matches = orders.length === expected.length && orders.every((value, index) => value === expected[index]);
      return matches
        ? []
        : [finding({
            ruleId: 'R-BUS-002',
            path: '$.beats[*].order',
            expected: `a contiguous set {1..${story.beats.length}} with no repeats`,
            actual: JSON.stringify(orders),
            message: 'Beat order values are not a contiguous, non-repeating sequence starting at 1.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Beat claimRefs resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.beats.flatMap((beat, beatIndex) =>
        beat.claimRefs.flatMap((claimId) =>
          index.knownClaimIds.has(claimId)
            ? []
            : [finding({
                ruleId: 'R-BUS-003',
                path: `$.beats[${beatIndex}].claimRefs`,
                expected: 'a claimId present in the supplied verificationPackage.claims',
                actual: claimId,
                message: 'Beat cites a claim that was never supplied; the beat is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Beat evidenceRefs resolve to a supplied claim\'s supportingEvidenceIds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.beats.flatMap((beat, beatIndex) =>
        beat.evidenceRefs.flatMap((evidenceId) =>
          index.knownEvidenceIds.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-004',
                path: `$.beats[${beatIndex}].evidenceRefs`,
                expected: "an evidenceId present in a supplied claim's supportingEvidenceIds",
                actual: evidenceId,
                message: 'Beat cites evidence that was never supplied for any claim; the beat is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'DO_NOT_USE claims never appear as factual story content',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      for (const { path, claimRefs } of collectClaimRefLocations(story)) {
        claimRefs.forEach((claimId) => {
          if (index.claimSafety.get(claimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-005',
              path,
              expected: 'no reference to a claim whose downstreamSafety is DO_NOT_USE',
              actual: claimId,
              message: 'A DO_NOT_USE claim was used as factual story content; Agent 03\'s determination was not respected.',
            }));
          }
        });
      }
      for (const { path, evidenceRefs } of collectEvidenceRefLocations(story)) {
        evidenceRefs.forEach((evidenceId) => {
          const ownerClaimId = index.evidenceOwner.get(evidenceId);
          if (ownerClaimId !== undefined && index.claimSafety.get(ownerClaimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-005',
              path,
              expected: 'no evidence reference belonging to a DO_NOT_USE claim',
              actual: `${evidenceId} (owned by DO_NOT_USE claim ${ownerClaimId})`,
              message: 'Evidence belonging to a DO_NOT_USE claim was cited directly, bypassing the claim-level protection.',
            }));
          }
        });
      }
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'USE_WITH_QUALIFICATION claims preserve their qualification in every citing beat',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.beats.flatMap((beat, beatIndex) => {
        const requiresQualification = beat.claimRefs.some(
          (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
        );
        if (!requiresQualification) return [];
        return beat.qualification !== undefined && beat.qualification.trim().length > 0
          ? []
          : [finding({
              ruleId: 'R-BUS-006',
              path: `$.beats[${beatIndex}].qualification`,
              expected: 'present, because this beat cites a USE_WITH_QUALIFICATION claim',
              actual: 'absent',
              message: 'A beat cites a USE_WITH_QUALIFICATION claim (e.g. CONFLICTING or OUTDATED per Agent 03) without preserving its qualification.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'Hook claimRefs resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.hook.claimRefs.flatMap((claimId) =>
        index.knownClaimIds.has(claimId)
          ? []
          : [finding({
              ruleId: 'R-BUS-007',
              path: '$.hook.claimRefs',
              expected: 'a claimId present in the supplied verificationPackage.claims',
              actual: claimId,
              message: 'Hook cites a claim that was never supplied; the hook is ungrounded.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'Payoff resolutionClaimRefs resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.payoff.resolutionClaimRefs.flatMap((claimId) =>
        index.knownClaimIds.has(claimId)
          ? []
          : [finding({
              ruleId: 'R-BUS-008',
              path: '$.payoff.resolutionClaimRefs',
              expected: 'a claimId present in the supplied verificationPackage.claims',
              actual: claimId,
              message: 'Payoff cites a claim that was never supplied; the payoff is ungrounded.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-009',
    title: 'duration.totalBeatDurationSeconds matches the actual sum of beat durations',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const actual = story.beats.reduce((sum, beat) => sum + beat.approxDurationSeconds, 0);
      return actual === story.duration.totalBeatDurationSeconds
        ? []
        : [finding({
            ruleId: 'R-BUS-009',
            path: '$.duration.totalBeatDurationSeconds',
            expected: String(actual),
            actual: String(story.duration.totalBeatDurationSeconds),
            message: 'Declared totalBeatDurationSeconds does not match the actual sum of beats[].approxDurationSeconds.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'duration.withinTolerance matches the deterministic tolerance comparison',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const { targetDurationSeconds, totalBeatDurationSeconds } = story.duration;
      const actualWithinTolerance =
        Math.abs(totalBeatDurationSeconds - targetDurationSeconds) / targetDurationSeconds <=
        STORY_DURATION_TOLERANCE_RATIO;
      return story.duration.withinTolerance === actualWithinTolerance
        ? []
        : [finding({
            ruleId: 'R-BUS-010',
            path: '$.duration.withinTolerance',
            expected: String(actualWithinTolerance),
            actual: String(story.duration.withinTolerance),
            message: `withinTolerance does not match the deterministic comparison against toleranceRatio (${STORY_DURATION_TOLERANCE_RATIO}).`,
          })];
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'The narrative resolves: at least one PAYOFF or CONCLUSION beat exists',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) =>
      story.beats.some((beat) => beat.beatType === 'PAYOFF' || beat.beatType === 'CONCLUSION')
        ? []
        : [finding({
            ruleId: 'R-BUS-011',
            path: '$.beats',
            expected: 'at least one beat with beatType PAYOFF or CONCLUSION',
            actual: 'no PAYOFF or CONCLUSION beat present',
            message: 'The narrative never resolves; no beat delivers the payoff or conclusion.',
          })],
  },
  {
    ruleId: 'R-BUS-012',
    title: 'The lowest-ordered beat is the HOOK',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const first = [...story.beats].sort((a, b) => a.order - b.order)[0];
      return first === undefined || first.beatType === 'HOOK'
        ? []
        : [finding({
            ruleId: 'R-BUS-012',
            path: `$.beats[?(@.order==${first.order})].beatType`,
            expected: 'HOOK',
            actual: first.beatType,
            message: 'The first beat in narrative order is not a HOOK beat; the story does not open with its hook.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'The highest-ordered beat is CONCLUSION or CTA',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const last = [...story.beats].sort((a, b) => b.order - a.order)[0];
      return last === undefined || last.beatType === 'CONCLUSION' || last.beatType === 'CTA'
        ? []
        : [finding({
            ruleId: 'R-BUS-013',
            path: `$.beats[?(@.order==${last.order})].beatType`,
            expected: 'CONCLUSION or CTA',
            actual: last.beatType,
            message: 'The final beat in narrative order is neither CONCLUSION nor CTA; the story does not end properly.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Beat researchGapRef resolves to a declared research gap',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const gapIds = new Set(story.researchGaps.map((gap) => gap.gapId));
      return story.beats.flatMap((beat, index) =>
        beat.researchGapRef === undefined || gapIds.has(beat.researchGapRef)
          ? []
          : [finding({
              ruleId: 'R-BUS-014',
              path: `$.beats[${index}].researchGapRef`,
              expected: 'a gapId present in researchGaps, or absent',
              actual: beat.researchGapRef,
              message: 'Beat references a research gap that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'A CTA beat implies ctaStrategy.ctaType is not NONE',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (story) => {
      const hasCtaBeat = story.beats.some((beat) => beat.beatType === 'CTA');
      return hasCtaBeat && story.ctaStrategy.ctaType === 'NONE'
        ? [finding({
            ruleId: 'R-BUS-015',
            path: '$.ctaStrategy.ctaType',
            expected: 'a value other than NONE, because a CTA beat is present',
            actual: 'NONE',
            message: 'A CTA beat exists in the narrative but ctaStrategy.ctaType is NONE; the two are inconsistent.',
          })]
        : [];
    },
  },
  {
    ruleId: 'R-BUS-016',
    title: 'downstreamReadiness and readinessBlockers are consistent',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      if (story.downstreamReadiness === 'NOT_READY_FOR_SCRIPT' && story.readinessBlockers.length === 0) {
        return [finding({
          ruleId: 'R-BUS-016',
          path: '$.readinessBlockers',
          expected: 'at least one blocker when downstreamReadiness is NOT_READY_FOR_SCRIPT',
          actual: '0 blockers',
          message: 'NOT_READY_FOR_SCRIPT is declared without any structured blocker explaining why.',
        })];
      }
      if (story.downstreamReadiness === 'READY_FOR_SCRIPT' && story.readinessBlockers.length > 0) {
        return [finding({
          ruleId: 'R-BUS-016',
          path: '$.readinessBlockers',
          expected: 'zero blockers when downstreamReadiness is READY_FOR_SCRIPT',
          actual: `${story.readinessBlockers.length} blocker(s)`,
          message: 'READY_FOR_SCRIPT is declared while unresolved blockers remain listed.',
        })];
      }
      return [];
    },
  },
  {
    ruleId: 'R-BUS-017',
    title: 'READY_FOR_SCRIPT requires the duration to be within tolerance',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) =>
      story.downstreamReadiness === 'READY_FOR_SCRIPT' && !story.duration.withinTolerance
        ? [finding({
            ruleId: 'R-BUS-017',
            path: '$.downstreamReadiness',
            expected: 'NOT_READY_FOR_SCRIPT when duration.withinTolerance is false',
            actual: 'READY_FOR_SCRIPT',
            message: 'A story with an out-of-tolerance duration cannot be declared READY_FOR_SCRIPT.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-018',
    title: 'READY_FOR_SCRIPT requires no HIGH-severity research gap',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) =>
      story.downstreamReadiness === 'READY_FOR_SCRIPT' &&
      story.researchGaps.some((gap) => gap.severity === 'HIGH')
        ? [finding({
            ruleId: 'R-BUS-018',
            path: '$.downstreamReadiness',
            expected: 'NOT_READY_FOR_SCRIPT when a HIGH-severity research gap is present',
            actual: 'READY_FOR_SCRIPT',
            message: 'A story with an unresolved, critical (HIGH-severity) research gap cannot be declared READY_FOR_SCRIPT.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-019',
    title: 'Declared unknown paths address absent fields',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (story) =>
      story.declaredUnknowns.flatMap((declared, index) =>
        resolveJsonPath(story, declared.path) === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-019',
              path: `$.declaredUnknowns[${index}].path`,
              expected: 'a path addressing a field that is absent from this document',
              actual: declared.path,
              message: 'A value is declared unknown while the field is present; the declaration is false.',
            })],
      ),
  },
  {
    ruleId: 'R-BUS-020',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(story, '$', strings);
      return strings.flatMap(({ path, value }) => {
        const matched = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(value));
        return matched === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-020',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-021',
    title: 'topicId echoes the request\'s topicOpportunity.topicId',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) =>
      story.topicId === request.topicOpportunity.topicId
        ? []
        : [finding({
            ruleId: 'R-BUS-021',
            path: '$.topicId',
            expected: request.topicOpportunity.topicId,
            actual: story.topicId,
            message: 'Declared topicId does not match the request\'s topicOpportunity.topicId; the architecture does not identify itself as being for the requested topic.',
          })],
  },
  {
    ruleId: 'R-BUS-022',
    title: 'Beat evidenceRefs are reachable only through that beat\'s own claimRefs',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      return story.beats.flatMap((beat, beatIndex) => {
        if (beat.claimRefs.length === 0) {
          return beat.evidenceRefs.length === 0
            ? []
            : [finding({
                ruleId: 'R-BUS-022',
                path: `$.beats[${beatIndex}].evidenceRefs`,
                expected: 'an empty array, because this beat\'s claimRefs is empty',
                actual: JSON.stringify(beat.evidenceRefs),
                message: 'A beat with no claimRefs cannot cite any evidenceRefs — evidence must belong to a claim the beat itself references.',
              })];
        }
        const reachable = evidenceReachableFromBeatClaims(beat.claimRefs, index);
        return beat.evidenceRefs.flatMap((evidenceId) =>
          reachable.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-022',
                path: `$.beats[${beatIndex}].evidenceRefs`,
                expected: "an evidenceId present in the supportingEvidenceIds of one of this beat's own claimRefs",
                actual: `${evidenceId} (owned by ${index.evidenceOwner.get(evidenceId) ?? 'a claim not referenced by this beat'})`,
                message: 'Beat cites evidence belonging to a claim it does not itself reference via claimRefs; evidence must belong to a claim the same beat actually cites.',
              })],
        );
      });
    },
  },
  {
    ruleId: 'R-BUS-023',
    title: 'Hook preserves qualification for any USE_WITH_QUALIFICATION claim it cites',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      const requiresQualification = story.hook.claimRefs.some(
        (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
      );
      if (!requiresQualification) return [];
      return story.hook.qualification !== undefined && story.hook.qualification.trim().length > 0
        ? []
        : [finding({
            ruleId: 'R-BUS-023',
            path: '$.hook.qualification',
            expected: 'present, because the hook cites a USE_WITH_QUALIFICATION claim',
            actual: 'absent',
            message: 'The hook cites a USE_WITH_QUALIFICATION claim (e.g. CONFLICTING or OUTDATED per Agent 03) without preserving its qualification.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-024',
    title: 'Payoff preserves qualification for any USE_WITH_QUALIFICATION claim it cites',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) => {
      const index = buildClaimIndex(request);
      const requiresQualification = story.payoff.resolutionClaimRefs.some(
        (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
      );
      if (!requiresQualification) return [];
      return story.payoff.qualification !== undefined && story.payoff.qualification.trim().length > 0
        ? []
        : [finding({
            ruleId: 'R-BUS-024',
            path: '$.payoff.qualification',
            expected: 'present, because the payoff cites a USE_WITH_QUALIFICATION claim',
            actual: 'absent',
            message: 'The payoff cites a USE_WITH_QUALIFICATION claim (e.g. CONFLICTING or OUTDATED per Agent 03) without preserving its qualification.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-025',
    title: 'duration.targetDurationSeconds echoes the request\'s targetDurationSeconds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (story, request) =>
      story.duration.targetDurationSeconds === request.targetDurationSeconds
        ? []
        : [finding({
            ruleId: 'R-BUS-025',
            path: '$.duration.targetDurationSeconds',
            expected: String(request.targetDurationSeconds),
            actual: String(story.duration.targetDurationSeconds),
            message: 'duration.targetDurationSeconds does not match the request\'s targetDurationSeconds; the target cannot be altered to make an out-of-tolerance duration appear valid.',
          })],
  },
];

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
export function validateStoryArchitectRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as StoryArchitectAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the story
 * architecture and the request that produced it. Cross-artifact grounding
 * (claim/evidence references, DO_NOT_USE protection, qualification
 * preservation, duration reconciliation, readiness consistency) requires the
 * request's own data, which is why it is threaded through here.
 */
export function validateStoryArchitectResponse(
  validate: ValidateFunction,
  response: unknown,
  request: StoryArchitectRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as StoryArchitectAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare story architecture emitted by the model, before the
 * runtime wraps it. `validate` MUST be compiled from
 * `STORY_ARCHITECTURE_SCHEMA_POINTER`.
 */
export function validateStoryArchitecture(
  validate: ValidateFunction,
  storyArchitecture: unknown,
  request: StoryArchitectRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, storyArchitecture);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(storyArchitecture as StoryArchitecture, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

/** Exported for tests/tools that need to reason about a single beat in isolation. */
export type { StoryBeat };

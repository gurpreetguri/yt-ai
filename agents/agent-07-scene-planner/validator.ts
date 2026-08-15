/**
 * AGT-07 — Scene Planner Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither plans
 * scenes, selects visuals, resolves claims, repairs, normalises, defaults,
 * nor mutates any artifact. It answers one question — "is this contract
 * acceptable?" — and returns findings. No network requests, no web
 * searches, no AI calls, no database operations, no retries.
 *
 * Division of responsibility (GDE-002 §9.1), identical to every prior
 * agent's own validator.ts:
 *   - Agent author (design time) → the schemas, which make invalid output
 *     unrepresentable. Enforced here by `structuralValidate`.
 *   - Agent runtime (invocation) → structural validation of input and output.
 *   - Validation plane (between stages) → the named business rules below.
 *
 * Invariants held by this module:
 *   - Pure. No I/O, no clock reads, no randomness, no logging, no DI, no state.
 *   - Total. Every rule reports ALL violations it finds, never only the first
 *     (STD-000 §6.2).
 *   - Non-mutating. A validator never modifies its subject (GDE-003 §8.6 rule 4).
 *   - Deterministic. `basis` is `DETERMINISTIC` on every finding emitted here.
 *
 * @contract scene-planner-agent-input/v1  1.0.0
 * @contract scene-planner-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  Scene,
  ScenePlan,
  ScenePlannerAgentRequest,
  ScenePlannerAgentResponse,
  ScenePlannerRequestData,
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

export const INPUT_SCHEMA_ID = 'urn:contract:scene-planner-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:scene-planner-agent-output:v1' as const;
export const SCENE_PLAN_SCHEMA_POINTER =
  'urn:contract:scene-planner-agent-output:v1#/$defs/scenePlan' as const;

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
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
      return `value ${String(error.keyword).startsWith('exclusive') ? 'strictly ' : ''}${error.keyword.includes('inimum') ? '>=' : '<='} ${String(params.limit)}`;
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

/** `/scenes/2/sceneType` → `$.scenes[2].sceneType` (STD-000 §8.1 path form). */
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

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<ScenePlannerRequestData>[] = [
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
            message: 'A script that is NOT_READY_FOR_REVIEW cannot be dispatched to the scene planner; the workflow must resolve it first.',
          })],
  },
  {
    ruleId: 'R-IN-002',
    title: 'reviewResult.decision is APPROVED',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.reviewResult.decision === 'APPROVED'
        ? []
        : [finding({
            ruleId: 'R-IN-002',
            path: '$.reviewResult.decision',
            expected: 'APPROVED',
            actual: data.reviewResult.decision,
            message: 'The scene planner must not bypass Script Reviewer approval; a decision other than APPROVED cannot be dispatched for scene planning.',
          })],
  },
  {
    ruleId: 'R-IN-003',
    title: 'reviewResult.nextAction is CONTINUE',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.reviewResult.nextAction === 'CONTINUE'
        ? []
        : [finding({
            ruleId: 'R-IN-003',
            path: '$.reviewResult.nextAction',
            expected: 'CONTINUE',
            actual: data.reviewResult.nextAction,
            message: 'The scene planner must not bypass Script Reviewer approval; a nextAction other than CONTINUE cannot be dispatched for scene planning.',
          })],
  },
  {
    ruleId: 'R-IN-004',
    title: 'reviewResult.readyForScenePlanning is true',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.reviewResult.readyForScenePlanning
        ? []
        : [finding({
            ruleId: 'R-IN-004',
            path: '$.reviewResult.readyForScenePlanning',
            expected: 'true',
            actual: 'false',
            message: 'The scene planner must not bypass Script Reviewer approval; readyForScenePlanning=false cannot be dispatched for scene planning.',
          })],
  },
  {
    ruleId: 'R-IN-005',
    title: 'storyArchitecture.downstreamReadiness is READY_FOR_SCRIPT',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.storyArchitecture.downstreamReadiness === 'READY_FOR_SCRIPT'
        ? []
        : [finding({
            ruleId: 'R-IN-005',
            path: '$.storyArchitecture.downstreamReadiness',
            expected: 'READY_FOR_SCRIPT',
            actual: data.storyArchitecture.downstreamReadiness,
            message: 'A story architecture that is NOT_READY_FOR_SCRIPT cannot ground a scene plan; the workflow must resolve it first.',
          })],
  },
  {
    ruleId: 'R-IN-006',
    title: 'verificationPackage.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.verificationPackage.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-006',
            path: '$.storyArchitecture.topicId',
            expected: `"${data.verificationPackage.topicId}" (verificationPackage.topicId)`,
            actual: data.storyArchitecture.topicId,
            message: 'verificationPackage.topicId and storyArchitecture.topicId disagree; the supplied verified claims and story architecture do not represent the same topic.',
          })],
  },
  {
    ruleId: 'R-IN-007',
    title: 'script.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.script.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-007',
            path: '$.script.topicId',
            expected: `"${data.storyArchitecture.topicId}" (storyArchitecture.topicId)`,
            actual: data.script.topicId,
            message: 'script.topicId and storyArchitecture.topicId disagree; the supplied script and story architecture do not represent the same topic.',
          })],
  },
  {
    ruleId: 'R-IN-008',
    title: 'reviewResult.topicId and storyArchitecture.topicId name the same topic',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.reviewResult.topicId === data.storyArchitecture.topicId
        ? []
        : [finding({
            ruleId: 'R-IN-008',
            path: '$.reviewResult.topicId',
            expected: `"${data.storyArchitecture.topicId}" (storyArchitecture.topicId)`,
            actual: data.reviewResult.topicId,
            message: 'reviewResult.topicId and storyArchitecture.topicId disagree; the supplied review does not pertain to the same topic as this request.',
          })],
  },
  {
    ruleId: 'R-IN-009',
    title: 'Supplied verified claim IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.verificationPackage.claims, (claim) => claim.claimId).map((index) => {
        const claim = data.verificationPackage.claims[index];
        return finding({
          ruleId: 'R-IN-009',
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

/** Fixed tolerance, identical to Agent 04/05/06's own duration tolerance (README §9). Never a new tolerance. */
export const SCENE_PLANNER_DURATION_TOLERANCE_RATIO = 0.15;

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

function buildClaimIndex(request: ScenePlannerRequestData): ClaimIndex {
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

function evidenceReachableFromSceneClaims(
  sceneClaimRefs: readonly string[],
  index: ClaimIndex,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  for (const claimId of sceneClaimRefs) {
    for (const evidenceId of index.supportingEvidenceIdsByClaim.get(claimId) ?? []) {
      reachable.add(evidenceId);
    }
  }
  return reachable;
}

function segmentOrderById(request: ScenePlannerRequestData): ReadonlyMap<string, number> {
  return new Map(request.script.segments.map((segment) => [segment.segmentId, segment.order]));
}

function sortedByOrder(scenes: readonly Scene[]): readonly Scene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

/** Every text field a scene exposes that could carry a factual number (README §10). */
function sceneTextSurfaces(scene: Scene): readonly string[] {
  return [
    scene.visualPurpose,
    ...scene.informationToShow,
    ...scene.onScreenTextIntent.map((item) => item.text),
    ...scene.visualElements.map((element) => element.description),
  ];
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  ScenePlan,
  ScenePlannerRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Scene IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) =>
      duplicatesOf(plan.scenes, (scene) => scene.sceneId).map((index) => {
        const scene = plan.scenes[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.scenes[${index}].sceneId`,
          expected: 'a sceneId unique within scenes',
          actual: scene?.sceneId ?? '',
          message: 'Two scenes share the same sceneId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Scene order values are unique and contiguous from 1',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      const orders = plan.scenes.map((scene) => scene.order).sort((a, b) => a - b);
      const expected = plan.scenes.map((_, index) => index + 1);
      const matches = orders.length === expected.length && orders.every((value, index) => value === expected[index]);
      return matches
        ? []
        : [finding({
            ruleId: 'R-BUS-002',
            path: '$.scenes[*].order',
            expected: `a contiguous set {1..${plan.scenes.length}} with no repeats`,
            actual: JSON.stringify(orders),
            message: 'Scene order values are not a contiguous, non-repeating sequence starting at 1.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Scene segmentRefs resolve to supplied script segments',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const segmentIds = new Set(request.script.segments.map((segment) => segment.segmentId));
      return plan.scenes.flatMap((scene, sceneIndex) =>
        scene.segmentRefs.flatMap((segmentId, refIndex) =>
          segmentIds.has(segmentId)
            ? []
            : [finding({
                ruleId: 'R-BUS-003',
                path: `$.scenes[${sceneIndex}].segmentRefs[${refIndex}]`,
                expected: 'a segmentId present in the request script.segments',
                actual: segmentId,
                message: 'Scene cites a script segment that was never supplied; the scene is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Scene beatRef resolves to a supplied story beat',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const beatIds = new Set(request.storyArchitecture.beats.map((beat) => beat.beatId));
      return plan.scenes.flatMap((scene, index) =>
        scene.beatRef === undefined || beatIds.has(scene.beatRef)
          ? []
          : [finding({
              ruleId: 'R-BUS-004',
              path: `$.scenes[${index}].beatRef`,
              expected: 'a beatId present in the request storyArchitecture.beats, or absent',
              actual: scene.beatRef,
              message: 'Scene references a story beat that was never supplied; the reference is orphaned.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Scene claimRefs resolve to supplied verified claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) =>
        scene.claimRefs.flatMap((claimId) =>
          index.knownClaimIds.has(claimId)
            ? []
            : [finding({
                ruleId: 'R-BUS-005',
                path: `$.scenes[${sceneIndex}].claimRefs`,
                expected: 'a claimId present in the supplied verificationPackage.claims',
                actual: claimId,
                message: 'Scene cites a claim that was never supplied; the scene is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'Scene evidenceRefs resolve to a supplied claim\'s supportingEvidenceIds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) =>
        scene.evidenceRefs.flatMap((evidenceId) =>
          index.knownEvidenceIds.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-006',
                path: `$.scenes[${sceneIndex}].evidenceRefs`,
                expected: "an evidenceId present in a supplied claim's supportingEvidenceIds",
                actual: evidenceId,
                message: 'Scene cites evidence that was never supplied; the scene is ungrounded.',
              })],
        ),
      );
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'Scene evidenceRefs are reachable only through that scene\'s own claimRefs',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) => {
        if (scene.claimRefs.length === 0) {
          return scene.evidenceRefs.length === 0
            ? []
            : [finding({
                ruleId: 'R-BUS-007',
                path: `$.scenes[${sceneIndex}].evidenceRefs`,
                expected: 'an empty array, because this scene\'s claimRefs is empty',
                actual: JSON.stringify(scene.evidenceRefs),
                message: 'A scene with no claimRefs cannot cite any evidenceRefs — evidence must belong to a claim the scene itself references.',
              })];
        }
        const reachable = evidenceReachableFromSceneClaims(scene.claimRefs, index);
        return scene.evidenceRefs.flatMap((evidenceId) =>
          reachable.has(evidenceId)
            ? []
            : [finding({
                ruleId: 'R-BUS-007',
                path: `$.scenes[${sceneIndex}].evidenceRefs`,
                expected: "an evidenceId present in the supportingEvidenceIds of one of this scene's own claimRefs",
                actual: `${evidenceId} (owned by ${index.evidenceOwner.get(evidenceId) ?? 'a claim not referenced by this scene'})`,
                message: 'Scene cites evidence belonging to a claim it does not itself reference via claimRefs; evidence must belong to a claim the same scene actually cites.',
              })],
        );
      });
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'DO_NOT_USE claims never appear as factual visual content',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      const findings: ValidationFinding[] = [];
      plan.scenes.forEach((scene, sceneIndex) => {
        scene.claimRefs.forEach((claimId) => {
          if (index.claimSafety.get(claimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-008',
              path: `$.scenes[${sceneIndex}].claimRefs`,
              expected: 'no reference to a claim whose downstreamSafety is DO_NOT_USE',
              actual: claimId,
              message: 'A DO_NOT_USE claim was used as factual visual content; Agent 03\'s determination was not respected.',
            }));
          }
        });
        scene.evidenceRefs.forEach((evidenceId) => {
          const ownerClaimId = index.evidenceOwner.get(evidenceId);
          if (ownerClaimId !== undefined && index.claimSafety.get(ownerClaimId) === 'DO_NOT_USE') {
            findings.push(finding({
              ruleId: 'R-BUS-008',
              path: `$.scenes[${sceneIndex}].evidenceRefs`,
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
    ruleId: 'R-BUS-009',
    title: 'USE_WITH_QUALIFICATION claims preserve their qualification in every citing scene',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) => {
        const requiresQualification = scene.claimRefs.some(
          (claimId) => index.claimSafety.get(claimId) === 'USE_WITH_QUALIFICATION',
        );
        if (!requiresQualification) return [];
        return scene.qualification !== undefined && scene.qualification.trim().length > 0
          ? []
          : [finding({
              ruleId: 'R-BUS-009',
              path: `$.scenes[${sceneIndex}].qualification`,
              expected: 'present, because this scene cites a USE_WITH_QUALIFICATION claim',
              actual: 'absent',
              message: 'A scene cites a USE_WITH_QUALIFICATION claim (e.g. CONFLICTING or OUTDATED per Agent 03) without preserving its qualification.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Numeric tokens shown on screen trace to a referenced claim\'s text',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) => {
        const referencedText = scene.claimRefs
          .map((claimId) => index.claimText.get(claimId))
          .filter((text): text is string => text !== undefined);
        const surfaces = sceneTextSurfaces(scene).flatMap((text) => extractNumericTokens(text));
        return surfaces.flatMap((token) => {
          const grounded = referencedText.some((text) => text.includes(token));
          return grounded
            ? []
            : [finding({
                ruleId: 'R-BUS-010',
                path: `$.scenes[${sceneIndex}]`,
                expected: 'every numeric token to appear verbatim in the claimText of a claim this scene references',
                actual: token,
                message: 'Scene text contains a number that does not trace to any claim the scene cites; a number must never be invented, generalised, or narrowed beyond its verified source.',
              })];
        });
      });
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'Scene quotations reproduce the referenced claim\'s text and speaker exactly',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) => {
        const quotation = scene.quotation;
        if (quotation === undefined) return [];
        const findings: ValidationFinding[] = [];
        const claimText = index.claimText.get(quotation.claimId);
        if (claimText !== undefined && quotation.quotedText !== claimText) {
          findings.push(finding({
            ruleId: 'R-BUS-011',
            path: `$.scenes[${sceneIndex}].quotation.quotedText`,
            expected: claimText,
            actual: quotation.quotedText,
            message: 'The quoted text does not exactly match the referenced claim\'s claimText; a quotation may never be paraphrased, shortened, or embellished.',
          }));
        }
        const speaker = index.quoteSpeaker.get(quotation.claimId);
        if (speaker !== undefined && quotation.speaker !== speaker) {
          findings.push(finding({
            ruleId: 'R-BUS-011',
            path: `$.scenes[${sceneIndex}].quotation.speaker`,
            expected: speaker,
            actual: quotation.speaker,
            message: 'The quotation\'s speaker does not match Agent 03\'s recorded quoteProvenance.speaker for this claim.',
          }));
        }
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-012',
    title: 'A scene quotation may only be attached to a QUOTE-type claim the scene itself cites',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const index = buildClaimIndex(request);
      return plan.scenes.flatMap((scene, sceneIndex) => {
        const quotation = scene.quotation;
        if (quotation === undefined) return [];
        if (!scene.claimRefs.includes(quotation.claimId)) {
          return [finding({
            ruleId: 'R-BUS-012',
            path: `$.scenes[${sceneIndex}].quotation.claimId`,
            expected: 'a claimId present in this scene\'s own claimRefs',
            actual: quotation.claimId,
            message: 'A quotation cites a claim this scene never references via claimRefs.',
          })];
        }
        const claimType = index.claimType.get(quotation.claimId);
        if (claimType !== undefined && claimType !== 'QUOTE') {
          return [finding({
            ruleId: 'R-BUS-012',
            path: `$.scenes[${sceneIndex}].quotation.claimId`,
            expected: 'a claimId whose claimType is QUOTE',
            actual: `${quotation.claimId} (claimType ${claimType})`,
            message: 'A quotation was attached to a claim that is not itself a QUOTE claim; a paraphrase or other claim type may never be presented as a quote.',
          })];
        }
        return [];
      });
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'STATISTIC on-screen text is grounded in a claim the scene itself cites',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) =>
      plan.scenes.flatMap((scene, sceneIndex) =>
        scene.onScreenTextIntent.flatMap((item, itemIndex) => {
          if (item.kind === 'STATISTIC' && item.claimRef === undefined) {
            return [finding({
              ruleId: 'R-BUS-013',
              path: `$.scenes[${sceneIndex}].onScreenTextIntent[${itemIndex}].claimRef`,
              expected: 'present, because this on-screen text is a STATISTIC',
              actual: 'absent',
              message: 'A STATISTIC on-screen text element must carry a claimRef grounding the figure shown.',
            })];
          }
          if (item.claimRef !== undefined && !scene.claimRefs.includes(item.claimRef)) {
            return [finding({
              ruleId: 'R-BUS-013',
              path: `$.scenes[${sceneIndex}].onScreenTextIntent[${itemIndex}].claimRef`,
              expected: 'a claimId present in this scene\'s own claimRefs',
              actual: item.claimRef,
              message: 'An on-screen text element references a claim this scene does not itself cite via claimRefs.',
            })];
          }
          return [];
        }),
      ),
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Every non-TRANSITION script segment is covered by at least one scene',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const covered = new Set(plan.scenes.flatMap((scene) => scene.segmentRefs));
      return request.script.segments.flatMap((segment) => {
        if (segment.segmentType === 'TRANSITION' || covered.has(segment.segmentId)) return [];
        return [finding({
          ruleId: 'R-BUS-014',
          path: '$.scenes',
          expected: `at least one scene with segmentRefs including "${segment.segmentId}"`,
          actual: 'no scene references this segment',
          message: 'A script segment requiring visual treatment was skipped entirely; the scene plan does not follow the approved script.',
        })];
      });
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'Scene order follows the referenced segments\' own order, non-decreasing',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const orderBySegment = segmentOrderById(request);
      const ordered = sortedByOrder(plan.scenes);
      const findings: ValidationFinding[] = [];
      let previousMaxOrder = -Infinity;
      for (const scene of ordered) {
        const segmentOrders = scene.segmentRefs
          .map((segmentId) => orderBySegment.get(segmentId))
          .filter((value): value is number => value !== undefined);
        if (segmentOrders.length === 0) continue; // unresolvable segmentRefs already reported by R-BUS-003
        const minOrder = Math.min(...segmentOrders);
        const maxOrder = Math.max(...segmentOrders);
        if (minOrder < previousMaxOrder) {
          findings.push(finding({
            ruleId: 'R-BUS-015',
            path: `$.scenes[?(@.sceneId=='${scene.sceneId}')].segmentRefs`,
            expected: `segment order >= ${previousMaxOrder}, matching the scene plan's own narration order`,
            actual: String(minOrder),
            message: 'This scene covers a script segment that comes earlier than a segment already covered by a scene before it; the scene plan does not follow the script\'s sequence.',
          }));
        }
        previousMaxOrder = Math.max(previousMaxOrder, maxOrder);
      }
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-016',
    title: 'durationSeconds matches endTimeSeconds - startTimeSeconds for every scene',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) =>
      plan.scenes.flatMap((scene, index) => {
        const expected = scene.endTimeSeconds - scene.startTimeSeconds;
        return floatsEqual(expected, scene.durationSeconds)
          ? []
          : [finding({
              ruleId: 'R-BUS-016',
              path: `$.scenes[${index}].durationSeconds`,
              expected: String(expected),
              actual: String(scene.durationSeconds),
              message: 'durationSeconds does not equal endTimeSeconds - startTimeSeconds for this scene.',
            })];
      }),
  },
  {
    ruleId: 'R-BUS-017',
    title: 'The scene timeline is contiguous: starts at 0, never overlaps, never gaps',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      const ordered = sortedByOrder(plan.scenes);
      const findings: ValidationFinding[] = [];
      const first = ordered[0];
      if (first !== undefined && !floatsEqual(first.startTimeSeconds, 0)) {
        findings.push(finding({
          ruleId: 'R-BUS-017',
          path: `$.scenes[0].startTimeSeconds`,
          expected: '0',
          actual: String(first.startTimeSeconds),
          message: 'The first scene in the plan does not start at 0.',
        }));
      }
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (previous === undefined || current === undefined) continue;
        if (!floatsEqual(current.startTimeSeconds, previous.endTimeSeconds)) {
          findings.push(finding({
            ruleId: 'R-BUS-017',
            path: `$.scenes[?(@.sceneId=='${current.sceneId}')].startTimeSeconds`,
            expected: String(previous.endTimeSeconds),
            actual: String(current.startTimeSeconds),
            message: current.startTimeSeconds < previous.endTimeSeconds
              ? `Scene "${current.sceneId}" overlaps the preceding scene "${previous.sceneId}".`
              : `Scene "${current.sceneId}" leaves an unexplained timeline gap after the preceding scene "${previous.sceneId}".`,
          }));
        }
      }
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-018',
    title: 'The final scene ends within the approved target duration tolerance',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const ordered = sortedByOrder(plan.scenes);
      const last = ordered[ordered.length - 1];
      if (last === undefined) return [];
      const target = request.script.scriptDuration.targetDurationSeconds;
      const withinTolerance = Math.abs(last.endTimeSeconds - target) / target <= SCENE_PLANNER_DURATION_TOLERANCE_RATIO;
      return withinTolerance
        ? []
        : [finding({
            ruleId: 'R-BUS-018',
            path: `$.scenes[${ordered.length - 1}].endTimeSeconds`,
            expected: `within ±${SCENE_PLANNER_DURATION_TOLERANCE_RATIO * 100}% of ${target}`,
            actual: String(last.endTimeSeconds),
            message: 'The scene timeline does not cover the approved script duration within the fixed tolerance.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-020',
    title: 'planDuration.totalPlannedDurationSeconds matches the actual sum of scene durations',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      const actual = plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
      return floatsEqual(actual, plan.planDuration.totalPlannedDurationSeconds)
        ? []
        : [finding({
            ruleId: 'R-BUS-020',
            path: '$.planDuration.totalPlannedDurationSeconds',
            expected: String(actual),
            actual: String(plan.planDuration.totalPlannedDurationSeconds),
            message: 'Declared totalPlannedDurationSeconds does not match the actual sum of scenes[].durationSeconds.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-021',
    title: 'planDuration.targetDurationSeconds echoes the request\'s script.scriptDuration.targetDurationSeconds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) =>
      plan.planDuration.targetDurationSeconds === request.script.scriptDuration.targetDurationSeconds
        ? []
        : [finding({
            ruleId: 'R-BUS-021',
            path: '$.planDuration.targetDurationSeconds',
            expected: String(request.script.scriptDuration.targetDurationSeconds),
            actual: String(plan.planDuration.targetDurationSeconds),
            message: 'planDuration.targetDurationSeconds does not match the request\'s script.scriptDuration.targetDurationSeconds; the target cannot be altered to make an out-of-tolerance plan appear valid.',
          })],
  },
  {
    ruleId: 'R-BUS-022',
    title: 'planDuration.withinTolerance matches the deterministic tolerance comparison',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      const { targetDurationSeconds, totalPlannedDurationSeconds } = plan.planDuration;
      const actualWithinTolerance =
        Math.abs(totalPlannedDurationSeconds - targetDurationSeconds) / targetDurationSeconds <=
        SCENE_PLANNER_DURATION_TOLERANCE_RATIO;
      return plan.planDuration.withinTolerance === actualWithinTolerance
        ? []
        : [finding({
            ruleId: 'R-BUS-022',
            path: '$.planDuration.withinTolerance',
            expected: String(actualWithinTolerance),
            actual: String(plan.planDuration.withinTolerance),
            message: `withinTolerance does not match the deterministic comparison against toleranceRatio (${SCENE_PLANNER_DURATION_TOLERANCE_RATIO}).`,
          })];
    },
  },
  {
    ruleId: 'R-BUS-023',
    title: 'downstreamReadiness and readinessBlockers are consistent',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      if (plan.downstreamReadiness === 'NOT_READY_FOR_VISUAL_DIRECTION' && plan.readinessBlockers.length === 0) {
        return [finding({
          ruleId: 'R-BUS-023',
          path: '$.readinessBlockers',
          expected: 'at least one blocker when downstreamReadiness is NOT_READY_FOR_VISUAL_DIRECTION',
          actual: '0 blockers',
          message: 'NOT_READY_FOR_VISUAL_DIRECTION is declared without any structured blocker explaining why.',
        })];
      }
      if (plan.downstreamReadiness === 'READY_FOR_VISUAL_DIRECTION' && plan.readinessBlockers.length > 0) {
        return [finding({
          ruleId: 'R-BUS-023',
          path: '$.readinessBlockers',
          expected: 'zero blockers when downstreamReadiness is READY_FOR_VISUAL_DIRECTION',
          actual: `${plan.readinessBlockers.length} blocker(s)`,
          message: 'READY_FOR_VISUAL_DIRECTION is declared while unresolved blockers remain listed.',
        })];
      }
      return [];
    },
  },
  {
    ruleId: 'R-BUS-024',
    title: 'READY_FOR_VISUAL_DIRECTION requires the timeline to be within tolerance',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) =>
      plan.downstreamReadiness === 'READY_FOR_VISUAL_DIRECTION' && !plan.planDuration.withinTolerance
        ? [finding({
            ruleId: 'R-BUS-024',
            path: '$.downstreamReadiness',
            expected: 'NOT_READY_FOR_VISUAL_DIRECTION when planDuration.withinTolerance is false',
            actual: 'READY_FOR_VISUAL_DIRECTION',
            message: 'A scene plan with an out-of-tolerance timeline cannot be declared READY_FOR_VISUAL_DIRECTION.',
          })]
        : [],
  },
  {
    ruleId: 'R-BUS-025',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(plan, '$', strings);
      return strings.flatMap(({ path, value }) => {
        const matched = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(value));
        return matched === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-025',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-026',
    title: 'topicId echoes the request\'s script.topicId',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) =>
      plan.topicId === request.script.topicId
        ? []
        : [finding({
            ruleId: 'R-BUS-026',
            path: '$.topicId',
            expected: request.script.topicId,
            actual: plan.topicId,
            message: 'Declared topicId does not match the request\'s script.topicId; the plan does not identify itself as being for the reviewed script\'s topic.',
          })],
  },
  {
    ruleId: 'R-BUS-027',
    title: 'Scene beatRef must be consistent with referenced script segment beatRefs',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (plan, request) => {
      const beatRefBySegment = new Map(
        request.script.segments.map((segment) => [segment.segmentId, segment.beatRef]),
      );
      return plan.scenes.flatMap((scene, sceneIndex) => {
        // Unresolved segmentRefs are already reported by R-BUS-003; do not
        // create a misleading duplicate finding here (README §7).
        const resolvedBeatRefs = scene.segmentRefs
          .map((segmentId) => beatRefBySegment.get(segmentId))
          .filter((beatRef): beatRef is string => beatRef !== undefined);
        if (resolvedBeatRefs.length === 0) return [];

        const uniqueBeatRefs = [...new Set(resolvedBeatRefs)];

        if (uniqueBeatRefs.length === 1) {
          const expectedBeatRef = uniqueBeatRefs[0];
          return scene.beatRef === expectedBeatRef
            ? []
            : [finding({
                ruleId: 'R-BUS-027',
                path: `$.scenes[${sceneIndex}].beatRef`,
                expected: `"${expectedBeatRef}" (the single beat every referenced segment belongs to)`,
                actual: scene.beatRef ?? 'absent',
                message: 'This scene\'s segmentRefs all belong to a single story beat, but beatRef is absent or names a different beat; beatRef must equal the beat the scene\'s own segments actually belong to.',
              })];
        }

        // uniqueBeatRefs.length > 1: the scene spans more than one beat, so
        // no single beatRef can truthfully represent it (README §7).
        return scene.beatRef === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-027',
              path: `$.scenes[${sceneIndex}].beatRef`,
              expected: 'absent, because this scene\'s segmentRefs span more than one story beat',
              actual: scene.beatRef,
              message: `This scene's segments belong to multiple beats (${uniqueBeatRefs.join(', ')}); a single beatRef cannot truthfully represent all of them and must be omitted.`,
            })];
      });
    },
  },
];

/** Tolerant floating-point equality — scene timings are `number`, not always integers (README §9). */
function floatsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
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
export function validateScenePlannerRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as ScenePlannerAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the
 * scene plan and the request that produced it.
 */
export function validateScenePlannerResponse(
  validate: ValidateFunction,
  response: unknown,
  request: ScenePlannerRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as ScenePlannerAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare scene plan emitted by the model, before the runtime
 * wraps it. `validate` MUST be compiled from `SCENE_PLAN_SCHEMA_POINTER`.
 */
export function validateScenePlan(
  validate: ValidateFunction,
  scenePlan: unknown,
  request: ScenePlannerRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, scenePlan);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(scenePlan as ScenePlan, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

/** Exported for tests/tools that need to reason about a single scene in isolation. */
export type { Scene, ScriptSegmentRef };

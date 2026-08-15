/**
 * AGT-00 — Strategy Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither produces,
 * repairs, normalises, defaults, nor mutates any artifact. It answers one
 * question — "is this contract acceptable?" — and returns findings.
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
 * @contract strategy-agent-input/v1  1.0.0
 * @contract strategy-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  StrategyAgentRequest,
  StrategyAgentResponse,
  StrategyManifest,
  StrategyRequestData,
  ValidationFinding,
  ValidationOutcome,
  ValidationReport,
} from './interfaces';

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Structural validation — closed schemas, strict readers (GDE-003 §13.1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ajv configured for the platform's contract posture:
 *   allErrors      — report every violation, not the first (STD-000 §6.2)
 *   strict         — reject malformed schemas at compile time
 *   allowUnionTypes/discriminator off — variance is expressed by `oneOf` on a
 *                    const-discriminated branch, per GDE-003 §6.7
 *   removeAdditional / useDefaults / coerceTypes MUST remain off: silently
 *                    dropping, defaulting, or coercing is the exact liberal-reader
 *                    behaviour the platform rejects (GDE-003 §13.1, §6.8).
 */
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

export const INPUT_SCHEMA_ID = 'urn:contract:strategy-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:strategy-agent-output:v1' as const;
export const MANIFEST_SCHEMA_POINTER =
  'urn:contract:strategy-agent-output:v1#/$defs/strategyManifest' as const;

/** Rule identifier carried on every structural finding, so failure rate is measurable per rule. */
export const STRUCTURAL_RULE_ID = 'R-STRUCT-001' as const;

/**
 * Runs a compiled schema and maps Ajv errors onto platform findings.
 * The Ajv instance and compiled function are supplied by the caller so that this
 * function stays pure and compilation happens once at module wiring time.
 */
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
    case 'dependentRequired':
      return `property "${String(params.missingProperty)}" present because "${String(params.property)}" is present`;
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

/** `/contentPillars/2/name` → `$.contentPillars[2].name` (STD-000 §8.1 path form). */
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

/** Case- and whitespace-insensitive comparison key. Used for uniqueness rules only. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
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

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<StrategyRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'Audience languages include the production locale',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const locale = data.localeBinding.locale;
      return data.audienceDefinition.languages.includes(locale)
        ? []
        : [finding({
            ruleId: 'R-IN-001',
            path: '$.audienceDefinition.languages',
            expected: `an entry equal to "${locale}"`,
            actual: JSON.stringify(data.audienceDefinition.languages),
            message: 'The production locale is not among the declared audience languages.',
            suggestion: `Add "${locale}" to audienceDefinition.languages, or correct localeBinding.locale.`,
          })];
    },
  },
  {
    ruleId: 'R-IN-002',
    title: 'Duration bounds are ordered',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const { minVideoDurationMs, maxVideoDurationMs } = data.capacityConstraints;
      return minVideoDurationMs < maxVideoDurationMs
        ? []
        : [finding({
            ruleId: 'R-IN-002',
            path: '$.capacityConstraints.minVideoDurationMs',
            expected: `a value strictly less than ${maxVideoDurationMs}`,
            actual: String(minVideoDurationMs),
            message: 'Minimum video duration is not strictly less than the maximum.',
          })];
    },
  },
  {
    ruleId: 'R-IN-003',
    title: 'Business goal priorities are unique',
    dimension: 'INPUT',
    severity: 'ERROR',
    evaluate: (data) =>
      duplicatesOf(data.operatorIntent.businessGoals, (goal) => String(goal.priority)).map((index) =>
        finding({
          ruleId: 'R-IN-003',
          path: `$.operatorIntent.businessGoals[${index}].priority`,
          expected: 'a priority not used by another goal',
          actual: String(data.operatorIntent.businessGoals[index].priority),
          message: 'Two business goals declare the same priority, so their rank order is undefined.',
        }),
      ),
  },
  {
    ruleId: 'R-IN-004',
    title: 'Business goals are distinct',
    dimension: 'INPUT',
    severity: 'ERROR',
    evaluate: (data) =>
      duplicatesOf(data.operatorIntent.businessGoals, (goal) => goal.goal).map((index) =>
        finding({
          ruleId: 'R-IN-004',
          path: `$.operatorIntent.businessGoals[${index}].goal`,
          expected: 'a goal kind not already declared',
          actual: data.operatorIntent.businessGoals[index].goal,
          message: 'The same business goal kind is declared more than once.',
        }),
      ),
  },
  {
    ruleId: 'R-IN-005',
    title: 'Weekly video target is within production capacity',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const target = data.operatorIntent.weeklyVideoTarget;
      const capacity = data.capacityConstraints.weeklyProductionCapacityVideos;
      return target <= capacity
        ? []
        : [finding({
            ruleId: 'R-IN-005',
            path: '$.operatorIntent.weeklyVideoTarget',
            expected: `a value <= ${capacity}`,
            actual: String(target),
            message: 'The operator target exceeds declared production capacity; no feasible cadence exists.',
            suggestion: 'Lower weeklyVideoTarget or raise weeklyProductionCapacityVideos.',
          })];
    },
  },
  {
    ruleId: 'R-IN-006',
    title: 'Non-negotiables are disjoint from prohibited topics',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const prohibited = new Set((data.operatorIntent.prohibitedTopics ?? []).map(normalise));
      return (data.operatorIntent.nonNegotiables ?? []).flatMap((requirement, index) =>
        prohibited.has(normalise(requirement))
          ? [finding({
              ruleId: 'R-IN-006',
              path: `$.operatorIntent.nonNegotiables[${index}]`,
              expected: 'a requirement that is not also a prohibited topic',
              actual: requirement,
              message: 'The same subject is declared both required and prohibited; the intent is contradictory.',
            })]
          : [],
      );
    },
  },
  {
    ruleId: 'R-IN-007',
    title: 'Insight proposals require a prior strategy',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const hasProposals = (data.insightProposals ?? []).length > 0;
      return hasProposals && data.priorStrategy === undefined
        ? [finding({
            ruleId: 'R-IN-007',
            path: '$.priorStrategy',
            expected: 'priorStrategy present because insightProposals were supplied',
            actual: 'absent',
            message: 'Insight proposals adjust an existing strategy; none was supplied to adjust.',
          })]
        : [];
    },
  },
  {
    ruleId: 'R-IN-008',
    title: 'Untrusted market context is within size bounds',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const observations = data.marketContext?.observations;
      if (observations === undefined) return [];
      const findings: ValidationFinding[] = [];
      if (observations.length > MAX_MARKET_OBSERVATIONS) {
        findings.push(finding({
          ruleId: 'R-IN-008',
          path: '$.marketContext.observations',
          expected: `at most ${MAX_MARKET_OBSERVATIONS} observations`,
          actual: String(observations.length),
          message: 'Untrusted input exceeds its declared bound; unbounded untrusted input is a denial-of-wallet vector.',
        }));
      }
      observations.forEach((observation, index) => {
        if ([...observation.statement].length > MAX_OBSERVATION_LENGTH) {
          findings.push(finding({
            ruleId: 'R-IN-008',
            path: `$.marketContext.observations[${index}].statement`,
            expected: `at most ${MAX_OBSERVATION_LENGTH} code points`,
            actual: String([...observation.statement].length),
            message: 'Untrusted observation exceeds its declared length bound.',
          }));
        }
      });
      return findings;
    },
  },
];

export const MAX_MARKET_OBSERVATIONS = 30;
export const MAX_OBSERVATION_LENGTH = 500;

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 *    Every rule is named, individually testable, and evaluated against the
 *    manifest plus the request that produced it (STD-000 §6.3).
 * ──────────────────────────────────────────────────────────────────────────── */

export const PILLAR_SHARE_TOLERANCE = 0.01;

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  StrategyManifest,
  StrategyRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Content pillar names are unique after normalisation',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) =>
      duplicatesOf(manifest.contentPillars, (pillar) => normalise(pillar.name)).map((index) =>
        finding({
          ruleId: 'R-BUS-001',
          path: `$.contentPillars[${index}].name`,
          expected: 'a name distinct from every other pillar after case and whitespace normalisation',
          actual: manifest.contentPillars[index].name,
          message: 'Two content pillars carry the same name; per-pillar attribution would be ambiguous.',
          suggestion: 'Merge the pillars, or give the duplicate a distinct subject and name.',
        }),
      ),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Content pillar keys are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) =>
      duplicatesOf(manifest.contentPillars, (pillar) => pillar.pillarKey).map((index) =>
        finding({
          ruleId: 'R-BUS-002',
          path: `$.contentPillars[${index}].pillarKey`,
          expected: 'a key distinct from every other pillar key',
          actual: manifest.contentPillars[index].pillarKey,
          message: 'Duplicate pillar key; downstream joins on pillarKey would collide.',
        }),
      ),
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Content pillar shares sum to one',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) => {
      const sum = manifest.contentPillars.reduce((total, pillar) => total + pillar.targetShareRatio, 0);
      return Math.abs(sum - 1) <= PILLAR_SHARE_TOLERANCE
        ? []
        : [finding({
            ruleId: 'R-BUS-003',
            path: '$.contentPillars',
            expected: `sum of targetShareRatio within ${PILLAR_SHARE_TOLERANCE} of 1.0`,
            actual: sum.toFixed(4),
            message: 'Pillar shares do not describe a complete allocation of output.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Publishing cadence is within production capacity',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const capacity = request.capacityConstraints.weeklyProductionCapacityVideos;
      return manifest.publishingCadence.weeklyVideoCount <= capacity
        ? []
        : [finding({
            ruleId: 'R-BUS-005',
            path: '$.publishingCadence.weeklyVideoCount',
            expected: `a value <= ${capacity}`,
            actual: String(manifest.publishingCadence.weeklyVideoCount),
            message: 'Planned cadence exceeds declared production capacity.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'Slot count equals weekly video count',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) => {
      const { weeklyVideoCount, slots } = manifest.publishingCadence;
      return slots.length === weeklyVideoCount
        ? []
        : [finding({
            ruleId: 'R-BUS-006',
            path: '$.publishingCadence.slots',
            expected: `exactly ${weeklyVideoCount} slots`,
            actual: String(slots.length),
            message: 'Declared cadence and the number of publishing slots disagree.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'Publishing slots do not collide',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest) =>
      duplicatesOf(
        manifest.publishingCadence.slots,
        (slot) => `${slot.dayOfWeek}|${slot.publishLocalTime}|${slot.timezone}`,
      ).map((index) =>
        finding({
          ruleId: 'R-BUS-007',
          path: `$.publishingCadence.slots[${index}]`,
          expected: 'a day and local time not already used by another slot',
          actual: `${manifest.publishingCadence.slots[index].dayOfWeek} ${manifest.publishingCadence.slots[index].publishLocalTime}`,
          message: 'Two publishing slots occupy the same instant; one publication would be starved.',
        }),
      ),
  },
  {
    ruleId: 'R-BUS-008',
    title: 'Format durations lie within capacity bounds',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const { minVideoDurationMs, maxVideoDurationMs } = request.capacityConstraints;
      return manifest.formatStrategy.formats.flatMap((format, index) => {
        const violations: ValidationFinding[] = [];
        if (format.targetMinDurationMs < minVideoDurationMs) {
          violations.push(finding({
            ruleId: 'R-BUS-008',
            path: `$.formatStrategy.formats[${index}].targetMinDurationMs`,
            expected: `a value >= ${minVideoDurationMs}`,
            actual: String(format.targetMinDurationMs),
            message: 'Format minimum duration is below the channel capacity floor.',
          }));
        }
        if (format.targetMaxDurationMs > maxVideoDurationMs) {
          violations.push(finding({
            ruleId: 'R-BUS-008',
            path: `$.formatStrategy.formats[${index}].targetMaxDurationMs`,
            expected: `a value <= ${maxVideoDurationMs}`,
            actual: String(format.targetMaxDurationMs),
            message: 'Format maximum duration exceeds the channel capacity ceiling.',
          }));
        }
        if (format.targetMinDurationMs >= format.targetMaxDurationMs) {
          violations.push(finding({
            ruleId: 'R-BUS-008',
            path: `$.formatStrategy.formats[${index}].targetMinDurationMs`,
            expected: `a value strictly less than ${format.targetMaxDurationMs}`,
            actual: String(format.targetMinDurationMs),
            message: 'Format duration envelope is empty or inverted.',
          }));
        }
        return violations;
      });
    },
  },
  {
    ruleId: 'R-BUS-009',
    title: 'Aspect ratio matches format type',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest) =>
      manifest.formatStrategy.formats.flatMap((format, index) => {
        const required =
          format.formatType === 'SHORT_FORM' ? 'RATIO_9_16'
          : format.formatType === 'LONG_FORM' ? 'RATIO_16_9'
          : undefined;
        return required !== undefined && format.aspectRatio !== required
          ? [finding({
              ruleId: 'R-BUS-009',
              path: `$.formatStrategy.formats[${index}].aspectRatio`,
              expected: required,
              actual: format.aspectRatio,
              message: 'Aspect ratio is incompatible with the declared format type.',
            })]
          : [];
      }),
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Derivation cycle matches the request',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const expected = request.priorStrategy === undefined ? 'INITIAL' : 'REVISION';
      return manifest.derivation.cycle === expected
        ? []
        : [finding({
            ruleId: 'R-BUS-010',
            path: '$.derivation.cycle',
            expected,
            actual: manifest.derivation.cycle,
            message: 'Declared derivation cycle contradicts the presence or absence of a prior strategy.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'A revision supersedes the supplied prior version',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      if (manifest.derivation.cycle !== 'REVISION' || request.priorStrategy === undefined) return [];
      return manifest.derivation.supersedesStrategyVersion === request.priorStrategy.strategyVersion
        ? []
        : [finding({
            ruleId: 'R-BUS-011',
            path: '$.derivation.supersedesStrategyVersion',
            expected: request.priorStrategy.strategyVersion,
            actual: manifest.derivation.supersedesStrategyVersion,
            message: 'The superseded version does not match the prior strategy supplied in the request.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-012',
    title: 'Adopted proposals exist in the request',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      if (manifest.derivation.cycle !== 'REVISION') return [];
      const supplied = new Set((request.insightProposals ?? []).map((proposal) => proposal.proposalId));
      return manifest.derivation.adoptedProposalIds.flatMap((proposalId, index) =>
        supplied.has(proposalId)
          ? []
          : [finding({
              ruleId: 'R-BUS-012',
              path: `$.derivation.adoptedProposalIds[${index}]`,
              expected: 'an identifier present in the request insightProposals',
              actual: proposalId,
              message: 'Adopted proposal identifier does not resolve to any supplied proposal.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'Change evidence resolves to a supplied proposal',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest, request) => {
      if (manifest.derivation.cycle !== 'REVISION') return [];
      const supplied = new Set((request.insightProposals ?? []).map((proposal) => proposal.proposalId));
      return manifest.derivation.changeSummary.flatMap((entry, index) =>
        entry.evidenceProposalId !== undefined && !supplied.has(entry.evidenceProposalId)
          ? [finding({
              ruleId: 'R-BUS-013',
              path: `$.derivation.changeSummary[${index}].evidenceProposalId`,
              expected: 'an identifier present in the request insightProposals',
              actual: entry.evidenceProposalId,
              message: 'Change cites evidence that was not supplied; the claim is ungrounded.',
            })]
          : [],
      );
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Operator prohibited topics are preserved',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const emitted = new Set(manifest.prohibitedTopics.map(normalise));
      return (request.operatorIntent.prohibitedTopics ?? []).flatMap((topic) =>
        emitted.has(normalise(topic))
          ? []
          : [finding({
              ruleId: 'R-BUS-014',
              path: '$.prohibitedTopics',
              expected: `an entry equivalent to "${topic}"`,
              actual: 'absent',
              message: 'An operator prohibition was dropped from the manifest.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'Operator non-negotiables are carried into conformance rules',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest, request) => {
      const requirements = manifest.conformanceRules.map((rule) => normalise(rule.requirement));
      return (request.operatorIntent.nonNegotiables ?? []).flatMap((nonNegotiable, index) => {
        const tokens = normalise(nonNegotiable).split(' ').filter((token) => token.length > 3);
        const covered = requirements.some((requirement) =>
          tokens.length > 0 && tokens.every((token) => requirement.includes(token)),
        );
        return covered
          ? []
          : [finding({
              ruleId: 'R-BUS-015',
              path: `$.conformanceRules`,
              expected: `a conformance rule expressing operatorIntent.nonNegotiables[${index}]`,
              actual: 'no matching rule',
              message: 'An operator non-negotiable is not expressed as a checkable conformance rule.',
              suggestion: 'Add a conformanceRules entry stating the non-negotiable as one measurable condition.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-016',
    title: 'Production language matches the locale binding',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) =>
      manifest.audience.languages[0] === request.localeBinding.locale
        ? []
        : [finding({
            ruleId: 'R-BUS-016',
            path: '$.audience.languages[0]',
            expected: request.localeBinding.locale,
            actual: String(manifest.audience.languages[0]),
            message: 'The declared production language differs from the pinned locale binding.',
          })],
  },
  {
    ruleId: 'R-BUS-017',
    title: 'Tone descriptors are within the brand binding',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest, request) => {
      const permitted = new Set(request.brandBinding.toneDescriptors);
      return manifest.toneAndPersonality.toneDescriptors.flatMap((descriptor, index) =>
        permitted.has(descriptor)
          ? []
          : [finding({
              ruleId: 'R-BUS-017',
              path: `$.toneAndPersonality.toneDescriptors[${index}]`,
              expected: `one of ${JSON.stringify([...permitted])}`,
              actual: descriptor,
              message: 'Tone descriptor is outside the brand-permitted vocabulary.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-018',
    title: 'Brand vocabulary prohibitions are preserved',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const emitted = new Set(manifest.toneAndPersonality.vocabularyProhibitions.map(normalise));
      return (request.brandBinding.vocabularyProhibitions ?? []).flatMap((term) =>
        emitted.has(normalise(term))
          ? []
          : [finding({
              ruleId: 'R-BUS-018',
              path: '$.toneAndPersonality.vocabularyProhibitions',
              expected: `an entry equivalent to "${term}"`,
              actual: 'absent',
              message: 'A brand vocabulary prohibition was dropped from the manifest.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-019',
    title: 'Title pattern lengths respect the locale ceiling',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest, request) => {
      const ceiling = request.localeBinding.maxTitleLengthChars;
      return manifest.packagingDirection.titlePatterns.flatMap((pattern, index) =>
        pattern.maxLengthChars <= ceiling
          ? []
          : [finding({
              ruleId: 'R-BUS-019',
              path: `$.packagingDirection.titlePatterns[${index}].maxLengthChars`,
              expected: `a value <= ${ceiling}`,
              actual: String(pattern.maxLengthChars),
              message: 'Title pattern permits titles longer than the locale allows.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-020',
    title: 'Every business goal has a success metric',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const linked = new Set(manifest.successMetrics.map((metric) => metric.linkedGoalKey));
      const unresolved = manifest.successMetrics.flatMap((metric, index) =>
        request.operatorIntent.businessGoals.some((goal) => goal.goalKey === metric.linkedGoalKey)
          ? []
          : [finding({
              ruleId: 'R-BUS-020',
              path: `$.successMetrics[${index}].linkedGoalKey`,
              expected: 'a goalKey present in the request businessGoals',
              actual: metric.linkedGoalKey,
              message: 'Success metric links to a business goal that was not requested.',
            })],
      );
      const uncovered = request.operatorIntent.businessGoals.flatMap((goal, index) =>
        linked.has(goal.goalKey)
          ? []
          : [finding({
              ruleId: 'R-BUS-020',
              path: '$.successMetrics',
              expected: `at least one metric with linkedGoalKey "${goal.goalKey}"`,
              actual: 'no metric linked',
              message: `Business goal at operatorIntent.businessGoals[${index}] is unmeasured.`,
            })],
      );
      return [...unresolved, ...uncovered];
    },
  },
  {
    ruleId: 'R-BUS-021',
    title: 'Declared unknown paths address absent fields',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest) =>
      manifest.declaredUnknowns.flatMap((declared, index) =>
        resolveJsonPath(manifest, declared.path) === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-021',
              path: `$.declaredUnknowns[${index}].path`,
              expected: 'a path addressing a field that is absent from the manifest',
              actual: declared.path,
              message: 'A value is declared unknown while the field is present; the declaration is false.',
            })],
      ),
  },
  {
    ruleId: 'R-BUS-022',
    title: 'Seasonal periods are ordered and non-overlapping',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest) => {
      const findings: ValidationFinding[] = [];
      manifest.seasonalPlan.forEach((period, index) => {
        if (period.startDate >= period.endDate) {
          findings.push(finding({
            ruleId: 'R-BUS-022',
            path: `$.seasonalPlan[${index}].startDate`,
            expected: `a date earlier than ${period.endDate}`,
            actual: period.startDate,
            message: 'Seasonal period start is not earlier than its end.',
          }));
        }
        if (index > 0 && period.startDate <= manifest.seasonalPlan[index - 1].endDate) {
          findings.push(finding({
            ruleId: 'R-BUS-022',
            path: `$.seasonalPlan[${index}].startDate`,
            expected: `a date later than ${manifest.seasonalPlan[index - 1].endDate}`,
            actual: period.startDate,
            message: 'Seasonal periods overlap or are not in ascending start order.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-023',
    title: 'Referenced keys resolve within the manifest',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) => {
      const pillarKeys = new Set(manifest.contentPillars.map((pillar) => pillar.pillarKey));
      const formatKeys = new Set(manifest.formatStrategy.formats.map((format) => format.formatKey));
      const metricKeys = new Set(manifest.successMetrics.map((metric) => metric.metricKey));
      const findings: ValidationFinding[] = [];

      manifest.seasonalPlan.forEach((period, periodIndex) => {
        period.emphasisPillarKeys.forEach((key, keyIndex) => {
          if (!pillarKeys.has(key)) {
            findings.push(finding({
              ruleId: 'R-BUS-023',
              path: `$.seasonalPlan[${periodIndex}].emphasisPillarKeys[${keyIndex}]`,
              expected: 'a key present in contentPillars',
              actual: key,
              message: 'Seasonal period emphasises a pillar that does not exist.',
            }));
          }
        });
      });

      manifest.seoDirection.topicClusters.forEach((cluster, index) => {
        if (cluster.pillarKey !== undefined && !pillarKeys.has(cluster.pillarKey)) {
          findings.push(finding({
            ruleId: 'R-BUS-023',
            path: `$.seoDirection.topicClusters[${index}].pillarKey`,
            expected: 'a key present in contentPillars',
            actual: cluster.pillarKey,
            message: 'Topic cluster is owned by a pillar that does not exist.',
          }));
        }
      });

      manifest.publishingCadence.slots.forEach((slot, index) => {
        if (!formatKeys.has(slot.formatKey)) {
          findings.push(finding({
            ruleId: 'R-BUS-023',
            path: `$.publishingCadence.slots[${index}].formatKey`,
            expected: 'a key present in formatStrategy.formats',
            actual: slot.formatKey,
            message: 'Publishing slot references a format that does not exist.',
          }));
        }
      });

      manifest.growthPlan.milestones.forEach((milestone, index) => {
        if (!metricKeys.has(milestone.metricKey)) {
          findings.push(finding({
            ruleId: 'R-BUS-023',
            path: `$.growthPlan.milestones[${index}].metricKey`,
            expected: 'a key present in successMetrics',
            actual: milestone.metricKey,
            message: 'Growth milestone references a metric that does not exist.',
          }));
        }
      });

      return findings;
    },
  },
  {
    ruleId: 'R-BUS-024',
    title: 'Conformance rule keys are unique',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (manifest) =>
      duplicatesOf(manifest.conformanceRules, (rule) => rule.ruleKey).map((index) =>
        finding({
          ruleId: 'R-BUS-024',
          path: `$.conformanceRules[${index}].ruleKey`,
          expected: 'a key distinct from every other conformance rule key',
          actual: manifest.conformanceRules[index].ruleKey,
          message: 'Duplicate conformance rule key; per-rule failure rates would be conflated.',
        }),
      ),
  },
  {
    ruleId: 'R-BUS-025',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(manifest, '$', strings);
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
    title: 'White space claims are grounded in supplied observations',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (manifest, request) => {
      const supplied = new Set(
        (request.marketContext?.observations ?? []).map((observation) => observation.observationKey),
      );
      return manifest.competitivePositioning.whiteSpace.flatMap((claim, index) =>
        supplied.has(claim.observationKey)
          ? []
          : [finding({
              ruleId: 'R-BUS-026',
              path: `$.competitivePositioning.whiteSpace[${index}].observationKey`,
              expected: 'an observationKey present in the supplied marketContext',
              actual: claim.observationKey,
              message: 'Competitive claim cites an observation that was never supplied; the claim is ungrounded.',
            })],
      );
    },
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
export function validateStrategyRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as StrategyAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the manifest
 * and the request that produced it. Cross-artifact coherence is only checkable
 * with both in hand (GDE-005 §7.5).
 */
export function validateStrategyResponse(
  validate: ValidateFunction,
  response: unknown,
  request: StrategyRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as StrategyAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare manifest emitted by the model, before the runtime wraps it.
 * `validate` MUST be compiled from `MANIFEST_SCHEMA_POINTER`.
 */
export function validateStrategyManifest(
  validate: ValidateFunction,
  manifest: unknown,
  request: StrategyRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, manifest);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(manifest as StrategyManifest, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

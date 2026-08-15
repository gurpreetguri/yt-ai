/**
 * AGT-01 — Topic Discovery Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither discovers,
 * scores, ranks, repairs, normalises, defaults, nor mutates any artifact. It
 * answers one question — "is this contract acceptable?" — and returns findings.
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
 *     no rule in this file is a model judgement, even though the fields it
 *     checks (scoreBreakdown, etc.) were themselves produced by one.
 *
 * @contract topic-discovery-agent-input/v1  1.0.0
 * @contract topic-discovery-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  TopicDiscoveryAgentRequest,
  TopicDiscoveryAgentResponse,
  TopicDiscoveryRequestData,
  TopicOpportunitySet,
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

export const INPUT_SCHEMA_ID = 'urn:contract:topic-discovery-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:topic-discovery-agent-output:v1' as const;
export const TOPIC_SET_SCHEMA_POINTER =
  'urn:contract:topic-discovery-agent-output:v1#/$defs/topicOpportunitySet' as const;

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

/** `/topics/2/title` → `$.topics[2].title` (STD-000 §8.1 path form). */
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

/** Case- and whitespace-insensitive comparison key. Used for uniqueness and containment rules only. */
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

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<TopicDiscoveryRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'Requested language is among the strategy audience languages',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      data.strategyBinding.audience.languages.includes(data.language)
        ? []
        : [finding({
            ruleId: 'R-IN-001',
            path: '$.strategyBinding.audience.languages',
            expected: `an entry equal to "${data.language}"`,
            actual: JSON.stringify(data.strategyBinding.audience.languages),
            message: 'The requested output language is not among the strategy-declared audience languages.',
          })],
  },
  {
    ruleId: 'R-IN-002',
    title: 'Required and excluded pillar keys are disjoint',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const required = new Set(data.discoveryConstraints?.requiredPillarKeys ?? []);
      const excluded = new Set(data.discoveryConstraints?.excludePillarKeys ?? []);
      return [...required].filter((key) => excluded.has(key)).map((key) =>
        finding({
          ruleId: 'R-IN-002',
          path: '$.discoveryConstraints',
          expected: 'requiredPillarKeys and excludePillarKeys sharing no key',
          actual: key,
          message: `Pillar "${key}" is both required and excluded; the discovery constraints are contradictory.`,
        }),
      );
    },
  },
  {
    ruleId: 'R-IN-003',
    title: 'Required pillar keys resolve to the strategy binding',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const pillarKeys = new Set(data.strategyBinding.contentPillars.map((pillar) => pillar.pillarKey));
      return (data.discoveryConstraints?.requiredPillarKeys ?? []).flatMap((key, index) =>
        pillarKeys.has(key)
          ? []
          : [finding({
              ruleId: 'R-IN-003',
              path: `$.discoveryConstraints.requiredPillarKeys[${index}]`,
              expected: 'a key present in strategyBinding.contentPillars',
              actual: key,
              message: 'Required pillar key does not resolve to any declared content pillar.',
            })],
      );
    },
  },
  {
    ruleId: 'R-IN-004',
    title: 'Excluded pillar keys resolve to the strategy binding',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const pillarKeys = new Set(data.strategyBinding.contentPillars.map((pillar) => pillar.pillarKey));
      return (data.discoveryConstraints?.excludePillarKeys ?? []).flatMap((key, index) =>
        pillarKeys.has(key)
          ? []
          : [finding({
              ruleId: 'R-IN-004',
              path: `$.discoveryConstraints.excludePillarKeys[${index}]`,
              expected: 'a key present in strategyBinding.contentPillars',
              actual: key,
              message: 'Excluded pillar key does not resolve to any declared content pillar.',
            })],
      );
    },
  },
  {
    ruleId: 'R-IN-005',
    title: 'Excluded pillars do not cover every declared pillar',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const excluded = new Set(data.discoveryConstraints?.excludePillarKeys ?? []);
      const total = data.strategyBinding.contentPillars.length;
      return excluded.size >= total && total > 0
        ? [finding({
            ruleId: 'R-IN-005',
            path: '$.discoveryConstraints.excludePillarKeys',
            expected: 'at least one pillar left eligible for discovery',
            actual: `${excluded.size} of ${total} pillars excluded`,
            message: 'Every declared content pillar is excluded; no feasible discovery space remains.',
          })]
        : [];
    },
  },
  {
    ruleId: 'R-IN-006',
    title: 'Untrusted trend context is within size bounds',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const observations = data.trendContext?.observations;
      if (observations === undefined) return [];
      const findings: ValidationFinding[] = [];
      if (observations.length > MAX_TREND_OBSERVATIONS) {
        findings.push(finding({
          ruleId: 'R-IN-006',
          path: '$.trendContext.observations',
          expected: `at most ${MAX_TREND_OBSERVATIONS} observations`,
          actual: String(observations.length),
          message: 'Untrusted input exceeds its declared bound; unbounded untrusted input is a denial-of-wallet vector.',
        }));
      }
      observations.forEach((observation, index) => {
        if ([...observation.statement].length > MAX_TREND_OBSERVATION_LENGTH) {
          findings.push(finding({
            ruleId: 'R-IN-006',
            path: `$.trendContext.observations[${index}].statement`,
            expected: `at most ${MAX_TREND_OBSERVATION_LENGTH} code points`,
            actual: String([...observation.statement].length),
            message: 'Untrusted observation exceeds its declared length bound.',
          }));
        }
      });
      return findings;
    },
  },
];

export const MAX_TREND_OBSERVATIONS = 30;
export const MAX_TREND_OBSERVATION_LENGTH = 500;

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Declared weights for `overallScore` (README §8). Sum to 1.00. */
export const SCORE_WEIGHTS = {
  audienceIntent: 0.15,
  strategicFit: 0.2,
  differentiation: 0.15,
  timeliness: 0.1,
  evergreenPotential: 0.15,
  productionFeasibility: 0.1,
  growthPotential: 0.15,
} as const;

export const OVERALL_SCORE_TOLERANCE = 0.01;

function computeOverallScore(topic: TopicOpportunitySet['topics'][number]): number {
  const { scoreBreakdown } = topic;
  const raw =
    scoreBreakdown.audienceIntent.score * SCORE_WEIGHTS.audienceIntent +
    scoreBreakdown.strategicFit.score * SCORE_WEIGHTS.strategicFit +
    scoreBreakdown.differentiation.score * SCORE_WEIGHTS.differentiation +
    scoreBreakdown.timeliness.score * SCORE_WEIGHTS.timeliness +
    scoreBreakdown.evergreenPotential.score * SCORE_WEIGHTS.evergreenPotential +
    scoreBreakdown.productionFeasibility.score * SCORE_WEIGHTS.productionFeasibility +
    scoreBreakdown.growthPotential.score * SCORE_WEIGHTS.growthPotential;
  return Math.round(raw * 100) / 100;
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  TopicOpportunitySet,
  TopicDiscoveryRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Delivered count equals the topic array length',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set) =>
      set.deliveredCount === set.topics.length
        ? []
        : [finding({
            ruleId: 'R-BUS-001',
            path: '$.deliveredCount',
            expected: String(set.topics.length),
            actual: String(set.deliveredCount),
            message: 'Declared delivered count does not match the number of topics actually present.',
          })],
  },
  {
    ruleId: 'R-BUS-002',
    title: 'A count shortfall is explained',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (set) => {
      if (set.deliveredCount >= set.requestedCount) return [];
      const explained =
        set.declaredUnknowns.some((entry) => entry.reason === 'DISCOVERY_SPACE_EXHAUSTED') ||
        set.assumptions.some((entry) => entry.path === '$.deliveredCount' || entry.path === '$.topics');
      return explained
        ? []
        : [finding({
            ruleId: 'R-BUS-002',
            path: '$.deliveredCount',
            expected: `${set.requestedCount}, or a declaredUnknowns/assumptions entry explaining the shortfall`,
            actual: String(set.deliveredCount),
            message: 'Fewer topics were delivered than requested with no recorded explanation for the shortfall.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Every topic maps to a declared content pillar',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set, request) => {
      const pillarKeys = new Set(request.strategyBinding.contentPillars.map((pillar) => pillar.pillarKey));
      return set.topics.flatMap((topic, index) =>
        pillarKeys.has(topic.pillarKey)
          ? []
          : [finding({
              ruleId: 'R-BUS-003',
              path: `$.topics[${index}].pillarKey`,
              expected: 'a key present in strategyBinding.contentPillars',
              actual: topic.pillarKey,
              message: 'Topic is mapped to a content pillar that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Target persona keys resolve to the strategy binding',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (set, request) => {
      const personaKeys = new Set(request.strategyBinding.audience.personas.map((persona) => persona.personaKey));
      return set.topics.flatMap((topic, index) =>
        topic.targetPersonaKey === undefined || personaKeys.has(topic.targetPersonaKey)
          ? []
          : [finding({
              ruleId: 'R-BUS-004',
              path: `$.topics[${index}].targetPersonaKey`,
              expected: 'a key present in strategyBinding.audience.personas',
              actual: topic.targetPersonaKey,
              message: 'Topic targets a persona that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Overall score matches the declared weighted formula',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set) =>
      set.topics.flatMap((topic, index) => {
        const expected = computeOverallScore(topic);
        return Math.abs(expected - topic.overallScore) <= OVERALL_SCORE_TOLERANCE
          ? []
          : [finding({
              ruleId: 'R-BUS-005',
              path: `$.topics[${index}].overallScore`,
              expected: `${expected.toFixed(2)} (within ${OVERALL_SCORE_TOLERANCE})`,
              actual: topic.overallScore.toFixed(2),
              message: 'Overall score does not match the weighted sum of the score breakdown.',
            })];
      }),
  },
  {
    ruleId: 'R-BUS-006',
    title: 'Ranks are unique and contiguous from 1',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set) => {
      const ranks = set.topics.map((topic) => topic.rank).sort((a, b) => a - b);
      const expected = set.topics.map((_, index) => index + 1);
      const matches = ranks.length === expected.length && ranks.every((rank, index) => rank === expected[index]);
      return matches
        ? []
        : [finding({
            ruleId: 'R-BUS-006',
            path: '$.topics[*].rank',
            expected: `a contiguous set {1..${set.topics.length}} with no repeats`,
            actual: JSON.stringify(ranks),
            message: 'Topic ranks are not a contiguous, non-repeating sequence starting at 1.',
          })];
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'Rank order is non-increasing in overall score',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (set) => {
      const byRank = [...set.topics].sort((a, b) => a.rank - b.rank);
      const findings: ValidationFinding[] = [];
      byRank.forEach((current, index) => {
        if (index === 0) return;
        const previous = byRank[index - 1];
        if (previous === undefined) return;
        if (current.overallScore > previous.overallScore) {
          findings.push(finding({
            ruleId: 'R-BUS-007',
            path: `$.topics[?(@.rank==${current.rank})].overallScore`,
            expected: `<= overallScore of rank ${previous.rank} (${previous.overallScore})`,
            actual: String(current.overallScore),
            message: 'A lower-ranked topic scores higher than the topic ranked above it.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'Topic titles are unique after normalisation',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set) =>
      duplicatesOf(set.topics, (topic) => normalise(topic.title)).flatMap((index) => {
        const topic = set.topics[index];
        if (topic === undefined) return [];
        return [finding({
          ruleId: 'R-BUS-008',
          path: `$.topics[${index}].title`,
          expected: 'a title distinct from every other topic in this set after case and whitespace normalisation',
          actual: topic.title,
          message: 'Two topics in the same set carry the same title.',
        })];
      }),
  },
  {
    ruleId: 'R-BUS-009',
    title: 'Exact matches against existing content are classified as exact duplicates',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set, request) => {
      const existingByTitle = new Map(
        request.existingContentInventory.map((existing) => [normalise(existing.title), existing]),
      );
      return set.topics.flatMap((topic, index) => {
        const match = existingByTitle.get(normalise(topic.title));
        if (match === undefined) return [];
        return topic.duplicateStatus.classification === 'EXACT_DUPLICATE'
          ? []
          : [finding({
              ruleId: 'R-BUS-009',
              path: `$.topics[${index}].duplicateStatus.classification`,
              expected: 'EXACT_DUPLICATE',
              actual: topic.duplicateStatus.classification,
              message: `Topic title exactly matches existing topic "${match.topicRefId}" but was not classified as an exact duplicate.`,
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Duplicate match references resolve to supplied existing content',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set, request) => {
      const existingIds = new Set(request.existingContentInventory.map((existing) => existing.topicRefId));
      return set.topics.flatMap((topic, index) => {
        if (topic.duplicateStatus.classification === 'NONE') return [];
        return existingIds.has(topic.duplicateStatus.matchedTopicRefId)
          ? []
          : [finding({
              ruleId: 'R-BUS-010',
              path: `$.topics[${index}].duplicateStatus.matchedTopicRefId`,
              expected: 'a topicRefId present in the request existingContentInventory',
              actual: topic.duplicateStatus.matchedTopicRefId,
              message: 'Duplicate classification cites an existing topic that was never supplied; the match is ungrounded.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'Timeliness window presence and ordering matches topic type',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (set) =>
      set.topics.flatMap((topic, index) => {
        if ((topic.topicType === 'TRENDING' || topic.topicType === 'NEWS_DRIVEN') && topic.timelinessWindow === undefined) {
          return [finding({
            ruleId: 'R-BUS-011',
            path: `$.topics[${index}].timelinessWindow`,
            expected: 'present, because topicType is TRENDING or NEWS_DRIVEN',
            actual: 'absent',
            message: 'A time-sensitive topic type is missing its relevance window.',
          })];
        }
        if (topic.topicType === 'EVERGREEN' && topic.timelinessWindow !== undefined) {
          return [finding({
            ruleId: 'R-BUS-011',
            path: `$.topics[${index}].timelinessWindow`,
            expected: 'absent, because topicType is EVERGREEN',
            actual: 'present',
            message: 'An evergreen topic declares a relevance window, which contradicts its own classification.',
          })];
        }
        if (topic.timelinessWindow !== undefined) {
          const { relevantFrom, relevantUntil } = topic.timelinessWindow;
          // Both fields are validated as YYYY-MM-DD by the schema (`calendarDate`), so a plain
          // lexical (code point) comparison is equivalent to calendar-date ordering and carries
          // no timezone ambiguity — deliberately avoiding `Date` parsing (STD-000 §5.7).
          if (!(relevantFrom < relevantUntil)) {
            return [finding({
              ruleId: 'R-BUS-011',
              path: `$.topics[${index}].timelinessWindow.relevantFrom`,
              expected: `a date strictly earlier than relevantUntil (${relevantUntil})`,
              actual: relevantFrom,
              message: 'Timeliness window relevantFrom is not strictly earlier than relevantUntil.',
            })];
          }
        }
        return [];
      }),
  },
  {
    ruleId: 'R-BUS-012',
    title: 'No topic touches a prohibited subject',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set, request) => {
      const prohibited = request.strategyBinding.prohibitedTopics.map(normalise);
      if (prohibited.length === 0) return [];
      return set.topics.flatMap((topic, index) => {
        const haystack = `${normalise(topic.title)} ${normalise(topic.angle)}`;
        const hit = prohibited.find((term) => haystack.includes(term));
        return hit === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-012',
              path: `$.topics[${index}]`,
              expected: `no reference to the prohibited subject "${hit}"`,
              actual: topic.title,
              message: 'Topic title or angle references a subject the strategy prohibits.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'Declared unknown paths address absent fields',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (set) =>
      set.declaredUnknowns.flatMap((declared, index) =>
        resolveJsonPath(set, declared.path) === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-013',
              path: `$.declaredUnknowns[${index}].path`,
              expected: 'a path addressing a field that is absent from this document',
              actual: declared.path,
              message: 'A value is declared unknown while the field is present; the declaration is false.',
            })],
      ),
  },
  {
    ruleId: 'R-BUS-014',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (set) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(set, '$', strings);
      return strings.flatMap(({ path, value }) => {
        const matched = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(value));
        return matched === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-014',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
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
export function validateTopicDiscoveryRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as TopicDiscoveryAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the topic
 * set and the request that produced it. Cross-artifact coherence is only
 * checkable with both in hand (GDE-005 §7.5).
 */
export function validateTopicDiscoveryResponse(
  validate: ValidateFunction,
  response: unknown,
  request: TopicDiscoveryRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as TopicDiscoveryAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare topic set emitted by the model, before the runtime wraps it.
 * `validate` MUST be compiled from `TOPIC_SET_SCHEMA_POINTER`.
 */
export function validateTopicOpportunitySet(
  validate: ValidateFunction,
  topicSet: unknown,
  request: TopicDiscoveryRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, topicSet);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(topicSet as TopicOpportunitySet, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

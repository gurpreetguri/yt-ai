/**
 * AGT-02 — Research Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither searches,
 * fetches, extracts, scores, repairs, normalises, defaults, nor mutates any
 * artifact. It answers one question — "is this contract acceptable?" — and
 * returns findings. No network requests, no web searches, no AI calls, no
 * database operations, no retries (README §16).
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
 *     checks (sourceQuality, evidenceStrength, etc.) were themselves produced
 *     by one.
 *
 * @contract research-agent-input/v1  1.0.0
 * @contract research-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  CompletenessAssessment,
  ResearchAgentRequest,
  ResearchAgentResponse,
  ResearchPackage,
  ResearchRequestData,
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

export const INPUT_SCHEMA_ID = 'urn:contract:research-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:research-agent-output:v1' as const;
export const RESEARCH_PACKAGE_SCHEMA_POINTER =
  'urn:contract:research-agent-output:v1#/$defs/researchPackage' as const;

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

/** `/sources/2/title` → `$.sources[2].title` (STD-000 §8.1 path form). */
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

export const MAX_MATERIAL_CONTENT_LENGTH = 6000;
export const MAX_RESEARCH_MATERIALS = 40;

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<ResearchRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'minSources is not greater than maxSources',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const { minSources, maxSources } = data.researchConstraints ?? {};
      if (minSources === undefined || maxSources === undefined) return [];
      return minSources <= maxSources
        ? []
        : [finding({
            ruleId: 'R-IN-001',
            path: '$.researchConstraints',
            expected: 'minSources <= maxSources',
            actual: `minSources=${minSources}, maxSources=${maxSources}`,
            message: 'Declared minimum source count exceeds the declared maximum; the constraint is unsatisfiable.',
          })];
    },
  },
  {
    ruleId: 'R-IN-002',
    title: 'researchMaterials materialId values are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.researchMaterials, (material) => material.materialId).map((index) => {
        const material = data.researchMaterials[index];
        return finding({
          ruleId: 'R-IN-002',
          path: `$.researchMaterials[${index}].materialId`,
          expected: 'a materialId unique within researchMaterials',
          actual: material?.materialId ?? '',
          message: 'Two supplied research materials share the same materialId; they cannot be distinguished for grounding.',
        });
      }),
  },
  {
    ruleId: 'R-IN-003',
    title: 'existingResearch.sources existingSourceRefId values are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const sources = data.existingResearch?.sources ?? [];
      return duplicatesOf(sources, (source) => source.existingSourceRefId).map((index) => {
        const source = sources[index];
        return finding({
          ruleId: 'R-IN-003',
          path: `$.existingResearch.sources[${index}].existingSourceRefId`,
          expected: 'an existingSourceRefId unique within existingResearch.sources',
          actual: source?.existingSourceRefId ?? '',
          message: 'Two carried-forward sources share the same existingSourceRefId.',
        });
      });
    },
  },
  {
    ruleId: 'R-IN-004',
    title: 'Untrusted research materials are within declared size bounds',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const findings: ValidationFinding[] = [];
      if (data.researchMaterials.length > MAX_RESEARCH_MATERIALS) {
        findings.push(finding({
          ruleId: 'R-IN-004',
          path: '$.researchMaterials',
          expected: `at most ${MAX_RESEARCH_MATERIALS} materials`,
          actual: String(data.researchMaterials.length),
          message: 'Untrusted input exceeds its declared bound; unbounded untrusted input is a denial-of-wallet vector.',
        }));
      }
      data.researchMaterials.forEach((material, index) => {
        if ([...material.content].length > MAX_MATERIAL_CONTENT_LENGTH) {
          findings.push(finding({
            ruleId: 'R-IN-004',
            path: `$.researchMaterials[${index}].content`,
            expected: `at most ${MAX_MATERIAL_CONTENT_LENGTH} code points`,
            actual: String([...material.content].length),
            message: 'Untrusted material content exceeds its declared length bound.',
          }));
        }
      });
      return findings;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 * ──────────────────────────────────────────────────────────────────────────── */

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  ResearchPackage,
  ResearchRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Research question IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      duplicatesOf(pkg.researchQuestions, (question) => question.questionId).map((index) => {
        const question = pkg.researchQuestions[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.researchQuestions[${index}].questionId`,
          expected: 'a questionId unique within researchQuestions',
          actual: question?.questionId ?? '',
          message: 'Two research questions share the same questionId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Source IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      duplicatesOf(pkg.sources, (source) => source.sourceId).map((index) => {
        const source = pkg.sources[index];
        return finding({
          ruleId: 'R-BUS-002',
          path: `$.sources[${index}].sourceId`,
          expected: 'a sourceId unique within sources',
          actual: source?.sourceId ?? '',
          message: 'Two sources share the same sourceId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Evidence IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      duplicatesOf(pkg.evidence, (item) => item.evidenceId).map((index) => {
        const item = pkg.evidence[index];
        return finding({
          ruleId: 'R-BUS-003',
          path: `$.evidence[${index}].evidenceId`,
          expected: 'an evidenceId unique within evidence',
          actual: item?.evidenceId ?? '',
          message: 'Two evidence items share the same evidenceId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Evidence sourceId resolves to a declared source',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const sourceIds = new Set(pkg.sources.map((source) => source.sourceId));
      return pkg.evidence.flatMap((item, index) =>
        sourceIds.has(item.sourceId)
          ? []
          : [finding({
              ruleId: 'R-BUS-004',
              path: `$.evidence[${index}].sourceId`,
              expected: 'a sourceId present in sources',
              actual: item.sourceId,
              message: 'Evidence cites a source that was never declared; the evidence is ungrounded and orphaned.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'Evidence researchQuestionId resolves to a declared question',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const questionIds = new Set(pkg.researchQuestions.map((question) => question.questionId));
      return pkg.evidence.flatMap((item, index) =>
        questionIds.has(item.researchQuestionId)
          ? []
          : [finding({
              ruleId: 'R-BUS-005',
              path: `$.evidence[${index}].researchQuestionId`,
              expected: 'a questionId present in researchQuestions',
              actual: item.researchQuestionId,
              message: 'Evidence answers a research question that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-006',
    title: 'Every source is grounded in exactly one supplied provenance reference',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const materialIds = new Set(request.researchMaterials.map((material) => material.materialId));
      const existingSourceIds = new Set(
        (request.existingResearch?.sources ?? []).map((source) => source.existingSourceRefId),
      );
      return pkg.sources.flatMap((source, index) => {
        const hasMaterial = source.derivedFromMaterialId !== undefined;
        const hasExisting = source.derivedFromExistingSourceRefId !== undefined;
        if (hasMaterial === hasExisting) {
          return [finding({
            ruleId: 'R-BUS-006',
            path: `$.sources[${index}]`,
            expected: 'exactly one of derivedFromMaterialId or derivedFromExistingSourceRefId present',
            actual: hasMaterial && hasExisting ? 'both present' : 'neither present',
            message: 'A source must be grounded in exactly one supplied provenance reference; an ungrounded source is a fabricated source.',
          })];
        }
        if (hasMaterial && !materialIds.has(source.derivedFromMaterialId as string)) {
          return [finding({
            ruleId: 'R-BUS-006',
            path: `$.sources[${index}].derivedFromMaterialId`,
            expected: 'a materialId present in the request researchMaterials',
            actual: String(source.derivedFromMaterialId),
            message: 'Source cites a research material that was never supplied; the source is fabricated.',
          })];
        }
        if (hasExisting && !existingSourceIds.has(source.derivedFromExistingSourceRefId as string)) {
          return [finding({
            ruleId: 'R-BUS-006',
            path: `$.sources[${index}].derivedFromExistingSourceRefId`,
            expected: 'an existingSourceRefId present in the request existingResearch.sources',
            actual: String(source.derivedFromExistingSourceRefId),
            message: 'Source cites a prior research source that was never supplied; the source is fabricated.',
          })];
        }
        return [];
      });
    },
  },
  {
    ruleId: 'R-BUS-018',
    title: "Source sourceStatus matches the materialKind of its grounding research material",
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const materialsById = new Map(request.researchMaterials.map((material) => [material.materialId, material]));
      return pkg.sources.flatMap((source, index) => {
        if (source.derivedFromMaterialId === undefined) return [];
        const material = materialsById.get(source.derivedFromMaterialId);
        // An unresolvable materialId is already reported by R-BUS-006; this rule
        // only judges the kind/status relationship once grounding itself resolves.
        if (material === undefined) return [];
        const expectedStatus = material.materialKind === 'FETCHED_DOCUMENT' ? 'FETCHED' : 'SEARCH_RESULT_ONLY';
        return source.sourceStatus === expectedStatus
          ? []
          : [finding({
              ruleId: 'R-BUS-018',
              path: `$.sources[${index}].sourceStatus`,
              expected: expectedStatus,
              actual: source.sourceStatus,
              message: `Source sourceStatus must match the materialKind of the research material it is grounded in (${material.materialKind}). A SEARCH_RESULT material can never be upgraded to FETCHED.`,
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'SEARCH_RESULT_ONLY sources cannot support STRONG evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const searchResultOnlySourceIds = new Set(
        pkg.sources.filter((source) => source.sourceStatus === 'SEARCH_RESULT_ONLY').map((source) => source.sourceId),
      );
      return pkg.evidence.flatMap((item, index) =>
        searchResultOnlySourceIds.has(item.sourceId) && item.evidenceStrength === 'STRONG'
          ? [finding({
              ruleId: 'R-BUS-007',
              path: `$.evidence[${index}].evidenceStrength`,
              expected: 'MODERATE, WEAK, or ANECDOTAL when the cited source was never fetched',
              actual: 'STRONG',
              message: 'A search snippet that was never fetched cannot support strong evidence; the source was never actually read.',
            })]
          : [],
      );
    },
  },
  {
    ruleId: 'R-BUS-008',
    title: 'SEARCH_RESULT_ONLY sources cannot yield CORROBORATED evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const searchResultOnlySourceIds = new Set(
        pkg.sources.filter((source) => source.sourceStatus === 'SEARCH_RESULT_ONLY').map((source) => source.sourceId),
      );
      return pkg.evidence.flatMap((item, index) =>
        searchResultOnlySourceIds.has(item.sourceId) && item.verificationStatus === 'CORROBORATED'
          ? [finding({
              ruleId: 'R-BUS-008',
              path: `$.evidence[${index}].verificationStatus`,
              expected: 'REQUIRES_VERIFICATION, CONFLICTING, or UNRESOLVED when the cited source was never fetched',
              actual: 'CORROBORATED',
              message: 'An unfetched search snippet cannot be represented as corroborated, fully verified source evidence.',
            })]
          : [],
      );
    },
  },
  {
    ruleId: 'R-BUS-009',
    title: 'Conflict conflictingEvidenceIds resolve, at least two entries, all distinct',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const evidenceIds = new Set(pkg.evidence.map((item) => item.evidenceId));
      return pkg.conflicts.flatMap((conflict, index) => {
        const findings: ValidationFinding[] = [];
        if (conflict.conflictingEvidenceIds.length < 2) {
          findings.push(finding({
            ruleId: 'R-BUS-009',
            path: `$.conflicts[${index}].conflictingEvidenceIds`,
            expected: 'at least two evidence references',
            actual: String(conflict.conflictingEvidenceIds.length),
            message: 'A conflict requires at least two disagreeing evidence items; one side alone is not a conflict.',
          }));
        }
        duplicatesOf(conflict.conflictingEvidenceIds, (evidenceId) => evidenceId).forEach((dupIndex) => {
          findings.push(finding({
            ruleId: 'R-BUS-009',
            path: `$.conflicts[${index}].conflictingEvidenceIds[${dupIndex}]`,
            expected: 'an evidenceId not already listed elsewhere in this conflict',
            actual: conflict.conflictingEvidenceIds[dupIndex] ?? '',
            message: 'The same evidence item is cited more than once in the same conflict; it cannot represent two independent sides of a disagreement.',
          }));
        });
        conflict.conflictingEvidenceIds.forEach((evidenceId) => {
          if (!evidenceIds.has(evidenceId)) {
            findings.push(finding({
              ruleId: 'R-BUS-009',
              path: `$.conflicts[${index}].conflictingEvidenceIds`,
              expected: 'an evidenceId present in evidence',
              actual: evidenceId,
              message: 'Conflict cites an evidence item that was never declared; the conflict is ungrounded.',
            }));
          }
        });
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-019',
    title: "Every conflict's cited evidence belongs to the conflict's own research question",
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const evidenceById = new Map(pkg.evidence.map((item) => [item.evidenceId, item]));
      return pkg.conflicts.flatMap((conflict, index) =>
        conflict.conflictingEvidenceIds.flatMap((evidenceId) => {
          const item = evidenceById.get(evidenceId);
          // An unresolvable evidenceId is already reported by R-BUS-009; this rule
          // only judges question alignment once the reference itself resolves.
          if (item === undefined) return [];
          return item.researchQuestionId === conflict.researchQuestionId
            ? []
            : [finding({
                ruleId: 'R-BUS-019',
                path: `$.conflicts[${index}].conflictingEvidenceIds`,
                expected: `evidence ${evidenceId} to have researchQuestionId "${conflict.researchQuestionId}"`,
                actual: `evidence ${evidenceId} has researchQuestionId "${item.researchQuestionId}"`,
                message: 'A conflict cites evidence that answers a different research question than the conflict itself; the two sides do not address the same question.',
              })];
        }),
      );
    },
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Conflict researchQuestionId resolves to a declared question',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const questionIds = new Set(pkg.researchQuestions.map((question) => question.questionId));
      return pkg.conflicts.flatMap((conflict, index) =>
        questionIds.has(conflict.researchQuestionId)
          ? []
          : [finding({
              ruleId: 'R-BUS-010',
              path: `$.conflicts[${index}].researchQuestionId`,
              expected: 'a questionId present in researchQuestions',
              actual: conflict.researchQuestionId,
              message: 'Conflict addresses a research question that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'Gap researchQuestionId, when present, resolves to a declared question',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) => {
      const questionIds = new Set(pkg.researchQuestions.map((question) => question.questionId));
      return pkg.gaps.flatMap((gap, index) =>
        gap.researchQuestionId === undefined || questionIds.has(gap.researchQuestionId)
          ? []
          : [finding({
              ruleId: 'R-BUS-011',
              path: `$.gaps[${index}].researchQuestionId`,
              expected: 'a questionId present in researchQuestions, or absent',
              actual: gap.researchQuestionId,
              message: 'Gap addresses a research question that was never declared.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-012',
    title: 'ANSWERED, PARTIALLY_ANSWERED, and CONFLICTING questions carry at least one evidence item',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const questionsWithEvidence = new Set(pkg.evidence.map((item) => item.researchQuestionId));
      return pkg.researchQuestions.flatMap((question, index) => {
        const requiresEvidence =
          question.status === 'ANSWERED' || question.status === 'PARTIALLY_ANSWERED' || question.status === 'CONFLICTING';
        return requiresEvidence && !questionsWithEvidence.has(question.questionId)
          ? [finding({
              ruleId: 'R-BUS-012',
              path: `$.researchQuestions[${index}].status`,
              expected: 'at least one evidence item referencing this question',
              actual: `status ${question.status} with no supporting evidence`,
              message: 'A question is marked answered, partially answered, or conflicting without any evidence supporting that claim.',
            })]
          : [];
      });
    },
  },
  {
    ruleId: 'R-BUS-013',
    title: 'UNANSWERED questions carry no evidence',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) => {
      const questionsWithEvidence = new Set(pkg.evidence.map((item) => item.researchQuestionId));
      return pkg.researchQuestions.flatMap((question, index) =>
        question.status === 'UNANSWERED' && questionsWithEvidence.has(question.questionId)
          ? [finding({
              ruleId: 'R-BUS-013',
              path: `$.researchQuestions[${index}].status`,
              expected: 'no evidence referencing a question marked UNANSWERED',
              actual: 'evidence exists for this questionId',
              message: 'A question marked unanswered is nonetheless cited by evidence; the status is inconsistent with the evidence array.',
            })]
          : [],
      );
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'Completeness counts match the actual research question tallies',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const expected = computeCompletenessTallies(pkg);
      const actual = pkg.completeness;
      const mismatches: Array<[string, number, number]> = [
        ['totalQuestions', expected.totalQuestions, actual.totalQuestions],
        ['answeredCount', expected.answeredCount, actual.answeredCount],
        ['partiallyAnsweredCount', expected.partiallyAnsweredCount, actual.partiallyAnsweredCount],
        ['unansweredCount', expected.unansweredCount, actual.unansweredCount],
        ['conflictingCount', expected.conflictingCount, actual.conflictingCount],
      ];
      return mismatches
        .filter(([, expectedValue, actualValue]) => expectedValue !== actualValue)
        .map(([field, expectedValue, actualValue]) =>
          finding({
            ruleId: 'R-BUS-014',
            path: `$.completeness.${field}`,
            expected: String(expectedValue),
            actual: String(actualValue),
            message: `Declared completeness.${field} does not match the actual tally of researchQuestions.`,
          }),
        );
    },
  },
  {
    ruleId: 'R-BUS-015',
    title: 'Declared unknown paths address absent fields',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) =>
      pkg.declaredUnknowns.flatMap((declared, index) =>
        resolveJsonPath(pkg, declared.path) === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-015',
              path: `$.declaredUnknowns[${index}].path`,
              expected: 'a path addressing a field that is absent from this document',
              actual: declared.path,
              message: 'A value is declared unknown while the field is present; the declaration is false.',
            })],
      ),
  },
  {
    ruleId: 'R-BUS-016',
    title: 'No placeholder or template residue',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const strings: Array<{ path: string; value: string }> = [];
      collectStrings(pkg, '$', strings);
      return strings.flatMap(({ path, value }) => {
        const matched = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(value));
        return matched === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-016',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-017',
    title: 'Every research question is addressed by evidence or a gap',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) => {
      const questionsWithEvidence = new Set(pkg.evidence.map((item) => item.researchQuestionId));
      const questionsWithGaps = new Set(
        pkg.gaps.flatMap((gap) => (gap.researchQuestionId === undefined ? [] : [gap.researchQuestionId])),
      );
      return pkg.researchQuestions.flatMap((question, index) =>
        questionsWithEvidence.has(question.questionId) || questionsWithGaps.has(question.questionId)
          ? []
          : [finding({
              ruleId: 'R-BUS-017',
              path: `$.researchQuestions[${index}]`,
              expected: 'at least one evidence item or gap entry referencing this question',
              actual: 'no evidence and no gap reference this questionId',
              message: 'A research question is silently unaddressed: neither evidence nor a declared gap accounts for it.',
            })],
      );
    },
  },
];

function computeCompletenessTallies(
  pkg: ResearchPackage,
): Pick<CompletenessAssessment, 'totalQuestions' | 'answeredCount' | 'partiallyAnsweredCount' | 'unansweredCount' | 'conflictingCount'> {
  return {
    totalQuestions: pkg.researchQuestions.length,
    answeredCount: pkg.researchQuestions.filter((question) => question.status === 'ANSWERED').length,
    partiallyAnsweredCount: pkg.researchQuestions.filter((question) => question.status === 'PARTIALLY_ANSWERED').length,
    unansweredCount: pkg.researchQuestions.filter((question) => question.status === 'UNANSWERED').length,
    conflictingCount: pkg.researchQuestions.filter((question) => question.status === 'CONFLICTING').length,
  };
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
export function validateResearchRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as ResearchAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the research
 * package and the request that produced it. Cross-artifact grounding (source
 * provenance, evidence references) is only checkable with both in hand.
 */
export function validateResearchResponse(
  validate: ValidateFunction,
  response: unknown,
  request: ResearchRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as ResearchAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare research package emitted by the model, before the runtime
 * wraps it. `validate` MUST be compiled from `RESEARCH_PACKAGE_SCHEMA_POINTER`.
 */
export function validateResearchPackage(
  validate: ValidateFunction,
  researchPackage: unknown,
  request: ResearchRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, researchPackage);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(researchPackage as ResearchPackage, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

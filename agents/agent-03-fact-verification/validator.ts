/**
 * AGT-03 — Fact Verification Agent · Validation
 *
 * VALIDATION ONLY. This module contains no business logic: it neither
 * identifies claims, verifies them, scores them, repairs, normalises,
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
 *     no rule in this file is a model judgement, even though the fields it
 *     checks (verificationConfidence, verificationStatus, etc.) were
 *     themselves produced by one.
 *
 * @contract fact-verification-agent-input/v1  1.0.0
 * @contract fact-verification-agent-output/v1 1.0.0
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import inputSchema from './input.schema.json';
import outputSchema from './output.schema.json';

import type {
  BusinessRuleDefinition,
  Claim,
  FactVerificationAgentRequest,
  FactVerificationAgentResponse,
  FactVerificationRequestData,
  VerificationPackage,
  VerificationStatus,
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

export const INPUT_SCHEMA_ID = 'urn:contract:fact-verification-agent-input:v1' as const;
export const OUTPUT_SCHEMA_ID = 'urn:contract:fact-verification-agent-output:v1' as const;
export const VERIFICATION_PACKAGE_SCHEMA_POINTER =
  'urn:contract:fact-verification-agent-output:v1#/$defs/verificationPackage' as const;

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

/** `/claims/2/claimText` → `$.claims[2].claimText` (STD-000 §8.1 path form). */
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

export const INPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<FactVerificationRequestData>[] = [
  {
    ruleId: 'R-IN-001',
    title: 'Supplied evidence IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.researchPackage.evidence, (item) => item.evidenceId).map((index) => {
        const item = data.researchPackage.evidence[index];
        return finding({
          ruleId: 'R-IN-001',
          path: `$.researchPackage.evidence[${index}].evidenceId`,
          expected: 'an evidenceId unique within researchPackage.evidence',
          actual: item?.evidenceId ?? '',
          message: 'Two supplied evidence items share the same evidenceId.',
        });
      }),
  },
  {
    ruleId: 'R-IN-002',
    title: 'Supplied source IDs are unique',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) =>
      duplicatesOf(data.researchPackage.sources, (source) => source.sourceId).map((index) => {
        const source = data.researchPackage.sources[index];
        return finding({
          ruleId: 'R-IN-002',
          path: `$.researchPackage.sources[${index}].sourceId`,
          expected: 'a sourceId unique within researchPackage.sources',
          actual: source?.sourceId ?? '',
          message: 'Two supplied sources share the same sourceId.',
        });
      }),
  },
  {
    ruleId: 'R-IN-003',
    title: 'Every supplied evidence.sourceId resolves to a declared source',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const sourceIds = new Set(data.researchPackage.sources.map((source) => source.sourceId));
      return data.researchPackage.evidence.flatMap((item, index) =>
        sourceIds.has(item.sourceId)
          ? []
          : [finding({
              ruleId: 'R-IN-003',
              path: `$.researchPackage.evidence[${index}].sourceId`,
              expected: 'a sourceId present in researchPackage.sources',
              actual: item.sourceId,
              message: 'Supplied evidence cites a source that was never supplied; the input is internally inconsistent.',
            })],
      );
    },
  },
  {
    ruleId: 'R-IN-004',
    title: 'Every supplied evidence.researchQuestionId resolves to a declared research question',
    dimension: 'INPUT',
    severity: 'BLOCKER',
    evaluate: (data) => {
      const questionIds = new Set(data.researchPackage.researchQuestions.map((question) => question.questionId));
      return data.researchPackage.evidence.flatMap((item, index) =>
        questionIds.has(item.researchQuestionId)
          ? []
          : [finding({
              ruleId: 'R-IN-004',
              path: `$.researchPackage.evidence[${index}].researchQuestionId`,
              expected: 'a questionId present in researchPackage.researchQuestions',
              actual: item.researchQuestionId,
              message: 'Supplied evidence answers a research question that was never supplied; the input is internally inconsistent.',
            })],
      );
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Output business rules (R-BUS-*)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The ONLY permitted downstreamSafety value for each verificationStatus (R-BUS-017). Fixed, exhaustive. */
export const DOWNSTREAM_SAFETY_BY_STATUS: Readonly<Record<VerificationStatus, Claim['downstreamSafety']>> = {
  VERIFIED: 'SAFE_TO_USE',
  PARTIALLY_SUPPORTED: 'USE_WITH_QUALIFICATION',
  OUTDATED: 'USE_WITH_QUALIFICATION',
  CONFLICTING: 'USE_WITH_QUALIFICATION',
  UNSUPPORTED: 'DO_NOT_USE',
  CONTRADICTED: 'DO_NOT_USE',
  INSUFFICIENT_EVIDENCE: 'DO_NOT_USE',
  NOT_VERIFIABLE: 'DO_NOT_USE',
};

export const CALCULATION_RESULT_TOLERANCE = 1e-9;

function resolveSourceIdsForClaim(
  claim: Claim,
  evidenceBySourceId: Map<string, string>,
): readonly string[] {
  const ids = new Set<string>();
  for (const evidenceId of [...claim.supportingEvidenceIds, ...claim.contradictingEvidenceIds]) {
    const sourceId = evidenceBySourceId.get(evidenceId);
    if (sourceId !== undefined) ids.add(sourceId);
  }
  return [...ids].sort();
}

export const OUTPUT_BUSINESS_RULES: readonly BusinessRuleDefinition<
  VerificationPackage,
  FactVerificationRequestData
>[] = [
  {
    ruleId: 'R-BUS-001',
    title: 'Claim IDs are unique',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      duplicatesOf(pkg.claims, (claim) => claim.claimId).map((index) => {
        const claim = pkg.claims[index];
        return finding({
          ruleId: 'R-BUS-001',
          path: `$.claims[${index}].claimId`,
          expected: 'a claimId unique within claims',
          actual: claim?.claimId ?? '',
          message: 'Two claims share the same claimId.',
        });
      }),
  },
  {
    ruleId: 'R-BUS-002',
    title: 'Claim researchQuestionId resolves to a supplied research question',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const questionIds = new Set(request.researchPackage.researchQuestions.map((question) => question.questionId));
      return pkg.claims.flatMap((claim, index) =>
        questionIds.has(claim.researchQuestionId)
          ? []
          : [finding({
              ruleId: 'R-BUS-002',
              path: `$.claims[${index}].researchQuestionId`,
              expected: 'a questionId present in the supplied researchPackage.researchQuestions',
              actual: claim.researchQuestionId,
              message: 'Claim is attributed to a research question that was never supplied.',
            })],
      );
    },
  },
  {
    ruleId: 'R-BUS-003',
    title: 'Claim evidence references resolve to supplied evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const evidenceIds = new Set(request.researchPackage.evidence.map((item) => item.evidenceId));
      return pkg.claims.flatMap((claim, index) => {
        const findings: ValidationFinding[] = [];
        claim.supportingEvidenceIds.forEach((evidenceId) => {
          if (!evidenceIds.has(evidenceId)) {
            findings.push(finding({
              ruleId: 'R-BUS-003',
              path: `$.claims[${index}].supportingEvidenceIds`,
              expected: 'an evidenceId present in the supplied researchPackage.evidence',
              actual: evidenceId,
              message: 'Claim cites supporting evidence that was never supplied; the claim is ungrounded.',
            }));
          }
        });
        claim.contradictingEvidenceIds.forEach((evidenceId) => {
          if (!evidenceIds.has(evidenceId)) {
            findings.push(finding({
              ruleId: 'R-BUS-003',
              path: `$.claims[${index}].contradictingEvidenceIds`,
              expected: 'an evidenceId present in the supplied researchPackage.evidence',
              actual: evidenceId,
              message: 'Claim cites contradicting evidence that was never supplied; the claim is ungrounded.',
            }));
          }
        });
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-004',
    title: 'Claim sourceIds is exactly the resolved source set of its evidence references',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const evidenceBySourceId = new Map(
        request.researchPackage.evidence.map((item) => [item.evidenceId, item.sourceId]),
      );
      return pkg.claims.flatMap((claim, index) => {
        const expected = resolveSourceIdsForClaim(claim, evidenceBySourceId);
        const actual = [...claim.sourceIds].sort();
        const matches = expected.length === actual.length && expected.every((id, i) => id === actual[i]);
        return matches
          ? []
          : [finding({
              ruleId: 'R-BUS-004',
              path: `$.claims[${index}].sourceIds`,
              expected: JSON.stringify(expected),
              actual: JSON.stringify(actual),
              message: 'Declared sourceIds does not match the exact set of sources reached through this claim\'s evidence references.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-005',
    title: 'VERIFIED requires at least one supporting evidence item',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'VERIFIED' && claim.supportingEvidenceIds.length === 0
          ? [finding({
              ruleId: 'R-BUS-005',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'at least one supportingEvidenceIds entry when verificationStatus is VERIFIED',
              actual: '0 supporting evidence items',
              message: 'A claim cannot be VERIFIED without evidence.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-006',
    title: 'VERIFIED cannot rest solely on SEARCH_RESULT_ONLY evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const sourceStatusById = new Map(
        request.researchPackage.sources.map((source) => [source.sourceId, source.sourceStatus]),
      );
      const evidenceBySourceId = new Map(
        request.researchPackage.evidence.map((item) => [item.evidenceId, item.sourceId]),
      );
      return pkg.claims.flatMap((claim, index) => {
        if (claim.verificationStatus !== 'VERIFIED') return [];
        const hasFetchedSupport = claim.supportingEvidenceIds.some((evidenceId) => {
          const sourceId = evidenceBySourceId.get(evidenceId);
          return sourceId !== undefined && sourceStatusById.get(sourceId) === 'FETCHED';
        });
        return hasFetchedSupport
          ? []
          : [finding({
              ruleId: 'R-BUS-006',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'at least one supporting evidence item grounded in a FETCHED source',
              actual: 'every supporting evidence item is grounded in a SEARCH_RESULT_ONLY source',
              message: 'A claim cannot be VERIFIED if all supporting evidence is SEARCH_RESULT_ONLY.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-007',
    title: 'VERIFIED requires zero contradicting evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'VERIFIED' && claim.contradictingEvidenceIds.length > 0
          ? [finding({
              ruleId: 'R-BUS-007',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'zero contradictingEvidenceIds when verificationStatus is VERIFIED',
              actual: `${claim.contradictingEvidenceIds.length} contradicting evidence item(s)`,
              message: 'A claim with contradicting evidence cannot be VERIFIED; it is at most CONFLICTING or PARTIALLY_SUPPORTED.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-008',
    title: 'CONTRADICTED requires at least one contradicting evidence item',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'CONTRADICTED' && claim.contradictingEvidenceIds.length === 0
          ? [finding({
              ruleId: 'R-BUS-008',
              path: `$.claims[${index}].contradictingEvidenceIds`,
              expected: 'at least one contradicting evidence reference when verificationStatus is CONTRADICTED',
              actual: '0 contradicting evidence items',
              message: 'A claim marked CONTRADICTED must reference contradicting evidence.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-009',
    title: 'CONFLICTING requires both supporting and contradicting evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'CONFLICTING' &&
        (claim.supportingEvidenceIds.length === 0 || claim.contradictingEvidenceIds.length === 0)
          ? [finding({
              ruleId: 'R-BUS-009',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'at least one supporting AND at least one contradicting evidence item when verificationStatus is CONFLICTING',
              actual: `${claim.supportingEvidenceIds.length} supporting, ${claim.contradictingEvidenceIds.length} contradicting`,
              message: 'A claim marked CONFLICTING must reference evidence representing both sides of the conflict.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-010',
    title: 'Verification conflict evidence references resolve to supplied evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const evidenceIds = new Set(request.researchPackage.evidence.map((item) => item.evidenceId));
      return pkg.conflicts.flatMap((conflict, index) => {
        const findings: ValidationFinding[] = [];
        [...conflict.supportingEvidenceIds, ...conflict.contradictingEvidenceIds].forEach((evidenceId) => {
          if (!evidenceIds.has(evidenceId)) {
            findings.push(finding({
              ruleId: 'R-BUS-010',
              path: `$.conflicts[${index}]`,
              expected: 'an evidenceId present in the supplied researchPackage.evidence',
              actual: evidenceId,
              message: 'Verification conflict cites evidence that was never supplied; the conflict is ungrounded.',
            }));
          }
        });
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-011',
    title: 'Verification conflicts and CONFLICTING claims reference each other consistently',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const claimsById = new Map(pkg.claims.map((claim) => [claim.claimId, claim]));
      const findings: ValidationFinding[] = [];
      pkg.conflicts.forEach((conflict, index) => {
        const claim = claimsById.get(conflict.claimId);
        if (claim === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-011',
            path: `$.conflicts[${index}].claimId`,
            expected: 'a claimId present in claims',
            actual: conflict.claimId,
            message: 'Verification conflict references a claim that was never declared.',
          }));
        } else if (claim.verificationStatus !== 'CONFLICTING') {
          findings.push(finding({
            ruleId: 'R-BUS-011',
            path: `$.conflicts[${index}].claimId`,
            expected: 'a claim with verificationStatus CONFLICTING',
            actual: `claim has verificationStatus ${claim.verificationStatus}`,
            message: 'Verification conflict references a claim that is not itself marked CONFLICTING.',
          }));
        }
      });
      const claimIdsWithConflict = new Set(pkg.conflicts.map((conflict) => conflict.claimId));
      pkg.claims.forEach((claim, index) => {
        if (claim.verificationStatus === 'CONFLICTING' && !claimIdsWithConflict.has(claim.claimId)) {
          findings.push(finding({
            ruleId: 'R-BUS-011',
            path: `$.claims[${index}].verificationStatus`,
            expected: 'at least one conflicts[] entry referencing this claimId',
            actual: 'no matching conflicts[] entry',
            message: 'A claim marked CONFLICTING has no corresponding entry in conflicts[] representing the disagreement.',
          }));
        }
      });
      return findings;
    },
  },
  {
    ruleId: 'R-BUS-012',
    title: 'UNSUPPORTED requires zero supporting and zero contradicting evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'UNSUPPORTED' &&
        (claim.supportingEvidenceIds.length > 0 || claim.contradictingEvidenceIds.length > 0)
          ? [finding({
              ruleId: 'R-BUS-012',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'zero supporting and zero contradicting evidence when verificationStatus is UNSUPPORTED',
              actual: `${claim.supportingEvidenceIds.length} supporting, ${claim.contradictingEvidenceIds.length} contradicting`,
              message: 'A claim citing any evidence is not UNSUPPORTED — it is at least INSUFFICIENT_EVIDENCE.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-013',
    title: 'QUOTE claims require quoteProvenance, and VERIFIED QUOTE claims require quoted evidence',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg, request) => {
      const evidenceById = new Map(request.researchPackage.evidence.map((item) => [item.evidenceId, item]));
      return pkg.claims.flatMap((claim, index) => {
        if (claim.claimType !== 'QUOTE') return [];
        const findings: ValidationFinding[] = [];
        if (claim.quoteProvenance === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-013',
            path: `$.claims[${index}].quoteProvenance`,
            expected: 'present, because claimType is QUOTE',
            actual: 'absent',
            message: 'A QUOTE claim must declare quoteProvenance.',
          }));
        }
        if (claim.verificationStatus === 'VERIFIED') {
          const hasQuotedEvidence = claim.supportingEvidenceIds.some(
            (evidenceId) => evidenceById.get(evidenceId)?.evidenceText.extractionType === 'QUOTATION',
          );
          if (!hasQuotedEvidence) {
            findings.push(finding({
              ruleId: 'R-BUS-013',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'at least one supporting evidence item with evidenceText.extractionType QUOTATION',
              actual: 'no supporting evidence item is an exact quotation',
              message: 'A QUOTE claim cannot be VERIFIED without evidence that is itself an exact quotation, not a paraphrase.',
            }));
          }
        }
        return findings;
      });
    },
  },
  {
    ruleId: 'R-BUS-014',
    title: 'CAUSAL_CLAIM requires causalAnalysis, and VERIFIED causal claims require an explained mechanism',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) => {
        if (claim.claimType !== 'CAUSAL_CLAIM') return [];
        const findings: ValidationFinding[] = [];
        if (claim.causalAnalysis === undefined) {
          findings.push(finding({
            ruleId: 'R-BUS-014',
            path: `$.claims[${index}].causalAnalysis`,
            expected: 'present, because claimType is CAUSAL_CLAIM',
            actual: 'absent',
            message: 'A CAUSAL_CLAIM must declare causalAnalysis.',
          }));
        } else if (
          claim.verificationStatus === 'VERIFIED' &&
          !(claim.causalAnalysis.mechanismExplained && claim.causalAnalysis.confoundersConsidered)
        ) {
          findings.push(finding({
            ruleId: 'R-BUS-014',
            path: `$.claims[${index}].verificationStatus`,
            expected: 'causalAnalysis.mechanismExplained and causalAnalysis.confoundersConsidered both true when verificationStatus is VERIFIED',
            actual: `mechanismExplained=${claim.causalAnalysis.mechanismExplained}, confoundersConsidered=${claim.causalAnalysis.confoundersConsidered}`,
            message: 'Correlation alone does not establish causation; a causal claim cannot be VERIFIED without an explained mechanism and considered confounders.',
          }));
        }
        return findings;
      }),
  },
  {
    ruleId: 'R-BUS-015',
    title: 'calculationCheck.resultMatches is the deterministic comparison, and a mismatch blocks VERIFIED',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) => {
        if (claim.calculationCheck === undefined) return [];
        const findings: ValidationFinding[] = [];
        const actuallyMatches =
          Math.abs(claim.calculationCheck.expectedResult - claim.calculationCheck.computedResult) <=
          CALCULATION_RESULT_TOLERANCE;
        if (claim.calculationCheck.resultMatches !== actuallyMatches) {
          findings.push(finding({
            ruleId: 'R-BUS-015',
            path: `$.claims[${index}].calculationCheck.resultMatches`,
            expected: String(actuallyMatches),
            actual: String(claim.calculationCheck.resultMatches),
            message: 'calculationCheck.resultMatches does not match the deterministic comparison of expectedResult and computedResult.',
          }));
        }
        if (!claim.calculationCheck.resultMatches && claim.verificationStatus === 'VERIFIED') {
          findings.push(finding({
            ruleId: 'R-BUS-015',
            path: `$.claims[${index}].verificationStatus`,
            expected: 'a verificationStatus other than VERIFIED when calculationCheck.resultMatches is false',
            actual: 'VERIFIED',
            message: 'A claim whose calculation does not check out cannot be VERIFIED.',
          }));
        }
        return findings;
      }),
  },
  {
    ruleId: 'R-BUS-016',
    title: 'verificationSummary tallies match the actual claims',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) => {
      const expected = computeSummaryTallies(pkg.claims);
      const actual = pkg.verificationSummary;
      const fields: ReadonlyArray<readonly [string, number, number]> = [
        ['totalClaims', expected.totalClaims, actual.totalClaims],
        ['verifiedCount', expected.verifiedCount, actual.verifiedCount],
        ['partiallySupportedCount', expected.partiallySupportedCount, actual.partiallySupportedCount],
        ['unsupportedCount', expected.unsupportedCount, actual.unsupportedCount],
        ['contradictedCount', expected.contradictedCount, actual.contradictedCount],
        ['insufficientEvidenceCount', expected.insufficientEvidenceCount, actual.insufficientEvidenceCount],
        ['conflictingCount', expected.conflictingCount, actual.conflictingCount],
        ['outdatedCount', expected.outdatedCount, actual.outdatedCount],
        ['notVerifiableCount', expected.notVerifiableCount, actual.notVerifiableCount],
        ['safeToUseCount', expected.safeToUseCount, actual.safeToUseCount],
        ['useWithQualificationCount', expected.useWithQualificationCount, actual.useWithQualificationCount],
        ['doNotUseCount', expected.doNotUseCount, actual.doNotUseCount],
      ];
      return fields
        .filter(([, expectedValue, actualValue]) => expectedValue !== actualValue)
        .map(([field, expectedValue, actualValue]) =>
          finding({
            ruleId: 'R-BUS-016',
            path: `$.verificationSummary.${field}`,
            expected: String(expectedValue),
            actual: String(actualValue),
            message: `Declared verificationSummary.${field} does not match the actual tally of claims.`,
          }),
        );
    },
  },
  {
    ruleId: 'R-BUS-017',
    title: 'downstreamSafety matches the fixed mapping from verificationStatus',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) => {
        const expected = DOWNSTREAM_SAFETY_BY_STATUS[claim.verificationStatus];
        return claim.downstreamSafety === expected
          ? []
          : [finding({
              ruleId: 'R-BUS-017',
              path: `$.claims[${index}].downstreamSafety`,
              expected,
              actual: claim.downstreamSafety,
              message: `downstreamSafety must be ${expected} when verificationStatus is ${claim.verificationStatus}; the two fields are not independently free choices.`,
            })];
      }),
  },
  {
    ruleId: 'R-BUS-018',
    title: 'OPINION and FORECAST claims are NOT_VERIFIABLE',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        (claim.claimType === 'OPINION' || claim.claimType === 'FORECAST') &&
        claim.verificationStatus !== 'NOT_VERIFIABLE'
          ? [finding({
              ruleId: 'R-BUS-018',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'NOT_VERIFIABLE',
              actual: claim.verificationStatus,
              message: 'OPINION and FORECAST claims are not ordinary factual claims and must be verificationStatus NOT_VERIFIABLE.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-019',
    title: 'Corroboration independent/derivative source sets are disjoint and grounded in the claim',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) => {
        const findings: ValidationFinding[] = [];
        const claimSourceIds = new Set(claim.sourceIds);
        const overlap = claim.corroboration.independentSourceIds.filter((id) =>
          claim.corroboration.derivativeSourceIds.includes(id),
        );
        if (overlap.length > 0) {
          findings.push(finding({
            ruleId: 'R-BUS-019',
            path: `$.claims[${index}].corroboration`,
            expected: 'independentSourceIds and derivativeSourceIds sharing no sourceId',
            actual: JSON.stringify(overlap),
            message: 'A source cannot be counted as both independent and derivative corroboration for the same claim.',
          }));
        }
        [...claim.corroboration.independentSourceIds, ...claim.corroboration.derivativeSourceIds].forEach(
          (sourceId) => {
            if (!claimSourceIds.has(sourceId)) {
              findings.push(finding({
                ruleId: 'R-BUS-019',
                path: `$.claims[${index}].corroboration`,
                expected: 'a sourceId present in this claim\'s own sourceIds',
                actual: sourceId,
                message: 'Corroboration cites a source not among this claim\'s own evidence-derived sourceIds.',
              }));
            }
          },
        );
        return findings;
      }),
  },
  {
    ruleId: 'R-BUS-020',
    title: 'Declared unknown paths address absent fields',
    dimension: 'OUTPUT',
    severity: 'ERROR',
    evaluate: (pkg) =>
      pkg.declaredUnknowns.flatMap((declared, index) =>
        resolveJsonPath(pkg, declared.path) === undefined
          ? []
          : [finding({
              ruleId: 'R-BUS-020',
              path: `$.declaredUnknowns[${index}].path`,
              expected: 'a path addressing a field that is absent from this document',
              actual: declared.path,
              message: 'A value is declared unknown while the field is present; the declaration is false.',
            })],
      ),
  },
  {
    ruleId: 'R-BUS-021',
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
              ruleId: 'R-BUS-021',
              path,
              expected: 'completed content with no template residue',
              actual: value.slice(0, 120),
              message: 'Placeholder or truncation residue detected; the field is not complete.',
            })];
      });
    },
  },
  {
    ruleId: 'R-BUS-022',
    title: 'INSUFFICIENT_EVIDENCE requires at least one referenced evidence item',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) =>
        claim.verificationStatus === 'INSUFFICIENT_EVIDENCE' &&
        claim.supportingEvidenceIds.length === 0 &&
        claim.contradictingEvidenceIds.length === 0
          ? [finding({
              ruleId: 'R-BUS-022',
              path: `$.claims[${index}].verificationStatus`,
              expected: 'at least one supporting or contradicting evidence reference when verificationStatus is INSUFFICIENT_EVIDENCE',
              actual: '0 evidence items',
              message: 'INSUFFICIENT_EVIDENCE means some evidence exists but falls short; zero evidence is UNSUPPORTED instead.',
            })]
          : [],
      ),
  },
  {
    ruleId: 'R-BUS-023',
    title: 'OUTDATED requires supporting evidence and a MODERATE or SEVERE freshness concern',
    dimension: 'OUTPUT',
    severity: 'BLOCKER',
    evaluate: (pkg) =>
      pkg.claims.flatMap((claim, index) => {
        if (claim.verificationStatus !== 'OUTDATED') return [];
        const findings: ValidationFinding[] = [];
        if (claim.supportingEvidenceIds.length === 0) {
          findings.push(finding({
            ruleId: 'R-BUS-023',
            path: `$.claims[${index}].supportingEvidenceIds`,
            expected: 'at least one supporting evidence item when verificationStatus is OUTDATED',
            actual: '0 supporting evidence items',
            message: 'A claim cannot be OUTDATED without evidence that once supported it.',
          }));
        }
        if (
          claim.freshnessAssessment.freshnessConcern !== 'MODERATE' &&
          claim.freshnessAssessment.freshnessConcern !== 'SEVERE'
        ) {
          findings.push(finding({
            ruleId: 'R-BUS-023',
            path: `$.claims[${index}].freshnessAssessment.freshnessConcern`,
            expected: 'MODERATE or SEVERE when verificationStatus is OUTDATED',
            actual: claim.freshnessAssessment.freshnessConcern,
            message: 'A claim marked OUTDATED must declare a material freshness concern.',
          }));
        }
        return findings;
      }),
  },
];

function computeSummaryTallies(claims: readonly Claim[]): {
  totalClaims: number;
  verifiedCount: number;
  partiallySupportedCount: number;
  unsupportedCount: number;
  contradictedCount: number;
  insufficientEvidenceCount: number;
  conflictingCount: number;
  outdatedCount: number;
  notVerifiableCount: number;
  safeToUseCount: number;
  useWithQualificationCount: number;
  doNotUseCount: number;
} {
  const countStatus = (status: VerificationStatus) =>
    claims.filter((claim) => claim.verificationStatus === status).length;
  return {
    totalClaims: claims.length,
    verifiedCount: countStatus('VERIFIED'),
    partiallySupportedCount: countStatus('PARTIALLY_SUPPORTED'),
    unsupportedCount: countStatus('UNSUPPORTED'),
    contradictedCount: countStatus('CONTRADICTED'),
    insufficientEvidenceCount: countStatus('INSUFFICIENT_EVIDENCE'),
    conflictingCount: countStatus('CONFLICTING'),
    outdatedCount: countStatus('OUTDATED'),
    notVerifiableCount: countStatus('NOT_VERIFIABLE'),
    safeToUseCount: claims.filter((claim) => claim.downstreamSafety === 'SAFE_TO_USE').length,
    useWithQualificationCount: claims.filter((claim) => claim.downstreamSafety === 'USE_WITH_QUALIFICATION').length,
    doNotUseCount: claims.filter((claim) => claim.downstreamSafety === 'DO_NOT_USE').length,
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
export function validateFactVerificationRequest(
  validate: ValidateFunction,
  request: unknown,
): ValidationReport {
  const structural = structuralValidate(validate, request);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const data = (request as FactVerificationAgentRequest).data;
  const business = INPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(data, undefined as never));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Output acceptance: structural first, then business rules against the
 * verification package and the request that produced it. Cross-artifact
 * grounding (evidence/source references, quote provenance, causal-analysis
 * gating) requires the request's own data, which is why it is threaded through.
 */
export function validateFactVerificationResponse(
  validate: ValidateFunction,
  response: unknown,
  request: FactVerificationRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, response);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const typed = response as FactVerificationAgentResponse;
  if (typed.contractType === 'ERROR') {
    return { outcome: 'PASSED', findings: [] };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) => rule.evaluate(typed.data, request));
  return { outcome: aggregateOutcome(business), findings: business };
}

/**
 * Validates the bare verification package emitted by the model, before the
 * runtime wraps it. `validate` MUST be compiled from
 * `VERIFICATION_PACKAGE_SCHEMA_POINTER`.
 */
export function validateVerificationPackage(
  validate: ValidateFunction,
  verificationPackage: unknown,
  request: FactVerificationRequestData,
): ValidationReport {
  const structural = structuralValidate(validate, verificationPackage);
  if (structural.length > 0) {
    return { outcome: 'FAILED', findings: structural };
  }
  const business = OUTPUT_BUSINESS_RULES.flatMap((rule) =>
    rule.evaluate(verificationPackage as VerificationPackage, request),
  );
  return { outcome: aggregateOutcome(business), findings: business };
}

/** Every rule this module can report, for catalogue registration and coverage assertions. */
export const ALL_RULE_IDS: readonly string[] = [
  STRUCTURAL_RULE_ID,
  ...INPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
  ...OUTPUT_BUSINESS_RULES.map((rule) => rule.ruleId),
];

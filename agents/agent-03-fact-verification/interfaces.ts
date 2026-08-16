/**
 * AGT-03 — Fact Verification Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `fact-verification-agent-input/v1` and
 * `fact-verification-agent-output/v1` exactly; the schemas remain the
 * enforcement mechanism (STD-000 §4.3).
 *
 * Conventions:
 *  - Optionality (`?`) means the property is OMITTED when absent. `null` is never
 *    a permitted value anywhere in these contracts (STD-000 §5.4, Rule 16).
 *  - Arrays are never `null`; the empty case is `[]`.
 *  - Every union type below is CLOSED. Adding a member is a MAJOR change
 *    (STD-000 §5.5). Consumers may exhaustively switch on them.
 *  - `readonly` throughout: contracts are immutable once emitted (GDE-003 §3.3).
 *  - Ratios are decimals on [0.0, 1.0] (STD-000 §5.9).
 *
 * @contract fact-verification-agent-input/v1  1.0.0
 * @contract fact-verification-agent-output/v1 1.0.0
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────────── */

/** RFC 3339 UTC instant, millisecond precision: `2026-08-09T14:32:11.482Z`. */
export type IsoTimestamp = string;

/** Date-only value: `2026-08-09`. */
export type CalendarDate = string;

/** BCP 47 language tag: `en-US`, `pt-BR`, `hi-IN`. */
export type Bcp47Tag = string;

/** Semantic version: `1.4.0`. */
export type SemanticVersion = string;

/** Opaque, type-prefixed, time-ordered platform identifier: `top_01J8Z…`. Never parsed. */
export type PrefixedId = string;

/** Response- or request-local stable key, `^[A-Z][A-Z0-9_]{2,31}$`. NOT a platform identifier. */
export type LocalKey = string;

/** Machine-readable location rooted at `$.`, e.g. `$.claims[2].claimText`. */
export type JsonPath = string;

/** Decimal on [0.0, 1.0]. */
export type Ratio = number;

/** Absolute, scheme-qualified, https-only URL. */
export type HttpsUrl = string;

/* ────────────────────────────────────────────────────────────────────────────
 * Envelope (GDE-003 §4)
 * ──────────────────────────────────────────────────────────────────────────── */

export type ContractType =
  | 'REQUEST' | 'RESPONSE' | 'EVENT' | 'VALIDATION_RESULT' | 'ERROR'
  | 'RECORD' | 'MANIFEST' | 'CONFIGURATION' | 'ANALYTICS';

export type ContractStatus = 'SUCCESS' | 'PARTIAL' | 'FAILURE';

export type ReferenceType =
  | 'ARTIFACT' | 'ASSET' | 'PROMPT' | 'WORKFLOW' | 'CONTRACT' | 'CONFIGURATION' | 'EXTERNAL';

export type ReferenceRole =
  | 'INPUT' | 'SOURCE' | 'PARENT' | 'SUPERSEDES' | 'GOVERNS' | 'PRODUCES';

export type TrustLevel = 'TRUSTED' | 'UNTRUSTED';

/** Immutable, version-pinned pointer. Floating references are prohibited (GDE-003 §10.3). */
export interface ContractReference {
  readonly refType: ReferenceType;
  readonly refId: string;
  readonly version: string;
  readonly integrity?: string;
  readonly role: ReferenceRole;
  readonly scope: PrefixedId;
  readonly trust?: TrustLevel;
}

export interface ProducerIdentity {
  readonly name: string;
  readonly version: SemanticVersion;
}

/** Normalised, provider-neutral sampling parameters (STD-000 §14.3). */
export interface NormalisedParameters {
  readonly temperature: number;
  readonly topP: number;
  readonly seed?: number;
  readonly maxOutputTokens?: number;
}

/** Request-side `meta` (GDE-003 §5). Carries no business data. */
export interface FactVerificationRequestMeta {
  readonly messageId: PrefixedId;
  readonly correlationId: PrefixedId;
  readonly causationId?: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly createdAt: IsoTimestamp;
  readonly locale: Bcp47Tag;
  readonly tenantId: PrefixedId;
  readonly channelId: PrefixedId;
  readonly strategyVersion?: SemanticVersion;
  readonly producer: ProducerIdentity;
}

/** Response-side `meta`. Provenance is supplied by the runtime, never by the model. */
export interface FactVerificationResponseMeta {
  readonly messageId: PrefixedId;
  readonly correlationId: PrefixedId;
  readonly causationId: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  readonly attempt?: number;
  readonly createdAt: IsoTimestamp;
  readonly locale: Bcp47Tag;
  readonly tenantId: PrefixedId;
  readonly channelId: PrefixedId;
  readonly strategyVersion?: SemanticVersion;
  readonly producer: ProducerIdentity;
  readonly agentId: string;
  readonly agentVersion: SemanticVersion;
  readonly promptVersion: string;
  readonly provider?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly parameters?: NormalisedParameters;
}

export type ExecutionAttemptType = 'INITIAL' | 'REPAIR' | 'REGENERATION';
export type FinishReason = 'COMPLETE' | 'TRUNCATED' | 'REFUSED' | 'ERROR';

export interface ExecutionBlock {
  readonly attempt: number;
  readonly attemptType: ExecutionAttemptType;
  readonly durationMs: number;
  readonly costMicroUsd: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly finishReason?: FinishReason;
  readonly resourceClass?: string;
  readonly outcome: 'SUCCESS' | 'FAILURE';
}

export type ValidationStageName =
  | 'STRUCTURAL' | 'BUSINESS' | 'CONSISTENCY' | 'QUALITY' | 'POLICY' | 'HUMAN';

export type ValidationStageOutcome =
  | 'PASSED' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE' | 'SKIPPED';

export type ValidationOutcome =
  | 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE';

export type FindingSeverity = 'BLOCKER' | 'ERROR' | 'WARNING' | 'INFO';

export type FindingBasis = 'DETERMINISTIC' | 'MODEL_ASSESSED' | 'HUMAN';

export type ConfidenceBasis = 'DETERMINISTIC' | 'MODEL_ASSESSED' | 'AGGREGATE';

export interface ValidationFinding {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly path: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly basis: FindingBasis;
}

export interface ValidationStageResult {
  readonly stage: ValidationStageName;
  readonly outcome: ValidationStageOutcome;
  readonly durationMs: number;
}

/** Produced by the validation plane, never by the artifact's producer (GDE-003 §4.6). */
export interface ValidationBlock {
  readonly outcome: ValidationOutcome;
  readonly stages: readonly ValidationStageResult[];
  readonly findings: readonly ValidationFinding[];
  readonly confidence?: { readonly value: Ratio; readonly basis: ConfidenceBasis };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Errors (STD-000 §8)
 * ──────────────────────────────────────────────────────────────────────────── */

export type ErrorCategory =
  | 'VALIDATION' | 'AI_PROVIDER' | 'AI_OUTPUT' | 'NETWORK' | 'EXTERNAL_API' | 'TIMEOUT'
  | 'RATE_LIMIT' | 'QUOTA' | 'AUTH' | 'PERMISSION' | 'SECURITY' | 'POLICY_COMPLIANCE'
  | 'CONFIGURATION' | 'RESOURCE' | 'DATA_INTEGRITY' | 'WORKFLOW' | 'BUDGET' | 'UNKNOWN';

export type ErrorSeverity = 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';

export type ErrorStage =
  | 'INPUT_VALIDATION' | 'INVOCATION' | 'OUTPUT_PARSE' | 'OUTPUT_VALIDATION' | 'BUSINESS_VALIDATION';

/** The registered error codes AGT-03 may emit (STD-000 §8.4). Closed. */
export type FactVerificationAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.DUPLICATE_EVIDENCE_ID'
  | 'VALIDATION.INPUT.DUPLICATE_SOURCE_ID'
  | 'VALIDATION.INPUT.EVIDENCE_REFERENCE_UNRESOLVABLE'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE'
  | 'AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY'
  | 'AI_OUTPUT.CONTENT.TRUNCATED'
  | 'AI_OUTPUT.BUSINESS.RULE_VIOLATED'
  | 'SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK';

export interface ErrorDetail {
  readonly path: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly ruleId?: string;
}

export interface ErrorCause {
  readonly code: string;
  readonly message: string;
}

/** The standard error object. Never a bare string (STD-000 §8.5). */
export interface StandardError {
  readonly code: FactVerificationAgentErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly message: string;
  readonly userMessage?: string;
  readonly source: {
    readonly component: string;
    readonly version: SemanticVersion;
    readonly stage: ErrorStage;
  };
  readonly context: {
    readonly correlationId: PrefixedId;
    readonly runId?: PrefixedId;
    readonly nodeId?: PrefixedId;
    readonly attempt?: number;
  };
  readonly details?: readonly ErrorDetail[];
  readonly remediation?: string;
  readonly occurredAt: IsoTimestamp;
  readonly causeChain?: readonly ErrorCause[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * INPUT — fact-verification-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type QuestionType =
  | 'CORE_CLAIM' | 'SUPPORTING_FACT' | 'STATISTIC' | 'DATE_OR_TIMELINE' | 'DEFINITION'
  | 'OFFICIAL_POSITION' | 'COMPETING_EXPLANATION' | 'RECENT_CHANGE' | 'LIMITATION_OR_EXCEPTION' | 'OTHER';

export type QuestionPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type QuestionStatus = 'ANSWERED' | 'PARTIALLY_ANSWERED' | 'UNANSWERED' | 'CONFLICTING';

export interface ResearchQuestionRef {
  readonly questionId: LocalKey;
  readonly questionText: string;
  readonly questionType: QuestionType;
  readonly priority: QuestionPriority;
  readonly status: QuestionStatus;
}

export type SourceType =
  | 'OFFICIAL_DOCUMENTATION' | 'GOVERNMENT' | 'ACADEMIC_PAPER' | 'STANDARDS_ORGANIZATION' | 'COMPANY'
  | 'PRIMARY_SOURCE' | 'REPUTABLE_NEWS' | 'INDUSTRY_PUBLICATION' | 'EXPERT_SOURCE' | 'SECONDARY_SOURCE'
  | 'COMMUNITY_DISCUSSION' | 'SEARCH_RESULT' | 'OTHER';

export type SourceStatus = 'SEARCH_RESULT_ONLY' | 'FETCHED';

export interface ScoreDimension {
  readonly score: Ratio;
  readonly rationale: string;
}

export interface SourceQuality {
  readonly authority: ScoreDimension;
  readonly relevance: ScoreDimension;
  readonly freshness: ScoreDimension;
  readonly primarySourceStatus: ScoreDimension;
  readonly specificity: ScoreDimension;
  readonly corroboration: ScoreDimension;
}

export interface SourceRef {
  readonly sourceId: LocalKey;
  readonly title: string;
  readonly publisher?: string;
  readonly url?: HttpsUrl;
  readonly sourceType: SourceType;
  readonly sourceStatus: SourceStatus;
  readonly author?: string;
  readonly language?: Bcp47Tag;
  readonly publishedAt?: CalendarDate;
  readonly lastUpdatedAt?: CalendarDate;
  readonly accessedAt: IsoTimestamp;
  readonly derivedFromMaterialId?: LocalKey;
  readonly derivedFromExistingSourceRefId?: PrefixedId;
  readonly sourceQuality: SourceQuality;
}

export type ExtractionType = 'QUOTATION' | 'PARAPHRASE';

export interface EvidenceTextQuotation {
  readonly extractionType: 'QUOTATION';
  readonly text: string;
}

export interface EvidenceTextParaphrase {
  readonly extractionType: 'PARAPHRASE';
  readonly text: string;
}

export type EvidenceText = EvidenceTextQuotation | EvidenceTextParaphrase;

export type EvidenceStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'ANECDOTAL';
export type EvidenceVerificationStatus = 'REQUIRES_VERIFICATION' | 'CORROBORATED' | 'CONFLICTING' | 'UNRESOLVED';

export interface EvidenceItemRef {
  readonly evidenceId: LocalKey;
  readonly researchQuestionId: LocalKey;
  readonly sourceId: LocalKey;
  readonly claim: string;
  readonly evidenceText: EvidenceText;
  readonly supportingContext?: string;
  readonly locationInSource?: string;
  readonly evidenceDate?: CalendarDate;
  readonly evidenceStrength: EvidenceStrength;
  readonly relevance: Ratio;
  readonly freshness: Ratio;
  readonly verificationStatus: EvidenceVerificationStatus;
  readonly limitations: readonly string[];
  readonly notesForVerification?: string;
}

export interface ResearchConflictRef {
  readonly conflictId: LocalKey;
  readonly researchQuestionId: LocalKey;
  readonly description: string;
  readonly conflictingEvidenceIds: readonly LocalKey[];
  readonly possibleReason?: string;
}

export type GapType =
  | 'UNANSWERED_QUESTION' | 'INSUFFICIENT_SOURCES' | 'WEAK_SOURCES_ONLY' | 'STALE_INFORMATION'
  | 'NO_PRIMARY_SOURCE' | 'CONFLICTING_UNRESOLVED' | 'OUT_OF_SCOPE_FOR_SUPPLIED_MATERIALS';

export type GapSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ResearchGapRef {
  readonly gapId: LocalKey;
  readonly gapType: GapType;
  readonly researchQuestionId?: LocalKey;
  readonly description: string;
  readonly severity: GapSeverity;
}

/**
 * The Research Package this agent verifies. Provenance TRUSTED (produced
 * by an already-validated upstream invocation) but its embedded free text
 * MUST be treated by the prompt as inert, untrusted data (README §17).
 */
export interface ResearchPackageRef {
  readonly topicId: LocalKey;
  readonly researchQuestions: readonly ResearchQuestionRef[];
  readonly sources: readonly SourceRef[];
  readonly evidence: readonly EvidenceItemRef[];
  readonly conflicts: readonly ResearchConflictRef[];
  readonly gaps: readonly ResearchGapRef[];
}

/** The payload the model receives. */
export interface FactVerificationRequestData {
  readonly researchPackage: ResearchPackageRef;
  readonly language: Bcp47Tag;
}

export interface FactVerificationAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: FactVerificationRequestMeta;
  readonly data: FactVerificationRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — fact-verification-agent-output/v1 · THE VERIFICATION PACKAGE
 * ──────────────────────────────────────────────────────────────────────────── */

export type ClaimType =
  | 'STATISTIC' | 'DATE' | 'DEFINITION' | 'TECHNICAL_FACT' | 'PRODUCT_FACT' | 'COMPARISON' | 'PRICE'
  | 'REGULATION' | 'EVENT' | 'HISTORICAL_FACT' | 'QUOTE' | 'CAUSAL_CLAIM' | 'OPINION' | 'FORECAST' | 'OTHER';

export type VerificationStatus =
  | 'VERIFIED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING' | 'OUTDATED' | 'NOT_VERIFIABLE';

export type DownstreamSafety = 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE';

export type FreshnessConcern = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

export interface FreshnessAssessment {
  readonly isTimeSensitive: boolean;
  readonly freshnessConcern: FreshnessConcern;
  readonly mostRecentEvidenceDate?: CalendarDate;
  readonly rationale: string;
}

/** Required only when claimType is QUOTE (R-BUS-013). */
export interface QuoteProvenance {
  readonly speaker: string;
  readonly speakerConfirmed: boolean;
  readonly contextAvailable: boolean;
  readonly rationale: string;
}

/** Required only when claimType is CAUSAL_CLAIM (R-BUS-014). */
export interface CausalAnalysis {
  readonly correlationEvidenceIds: readonly LocalKey[];
  readonly mechanismExplained: boolean;
  readonly confoundersConsidered: boolean;
  readonly rationale: string;
}

/** Present only when the claim depends on arithmetic (R-BUS-015). */
export interface CalculationCheck {
  readonly inputsDescription: string;
  readonly formula: string;
  readonly expectedResult: number;
  readonly computedResult: number;
  readonly resultMatches: boolean;
}

export interface Corroboration {
  readonly independentSourceIds: readonly LocalKey[];
  readonly derivativeSourceIds: readonly LocalKey[];
  readonly rationale: string;
}

export interface VerificationConfidence {
  readonly evidenceStrength: ScoreDimension;
  readonly sourceAuthority: ScoreDimension;
  readonly corroborationStrength: ScoreDimension;
  readonly freshness: ScoreDimension;
}

export interface Claim {
  readonly claimId: LocalKey;
  readonly claimText: string;
  readonly claimType: ClaimType;
  /** MUST resolve to the request's researchPackage.researchQuestions (R-BUS-002). */
  readonly researchQuestionId: LocalKey;
  /** MUST resolve to the request's researchPackage.evidence (R-BUS-003). 0-15 items. */
  readonly supportingEvidenceIds: readonly LocalKey[];
  /** MUST resolve to the request's researchPackage.evidence (R-BUS-003). 0-15 items. */
  readonly contradictingEvidenceIds: readonly LocalKey[];
  /** The exact resolved sourceId set of supportingEvidenceIds + contradictingEvidenceIds (R-BUS-004). */
  readonly sourceIds: readonly LocalKey[];
  readonly verificationStatus: VerificationStatus;
  readonly verificationConfidence: VerificationConfidence;
  readonly rationale: string;
  readonly corroboration: Corroboration;
  readonly freshnessAssessment: FreshnessAssessment;
  readonly quoteProvenance?: QuoteProvenance;
  readonly causalAnalysis?: CausalAnalysis;
  readonly calculationCheck?: CalculationCheck;
  /** 0-5 items. Empty array means no material limitation was identified. */
  readonly limitations: readonly string[];
  readonly notesForDownstream?: string;
  readonly downstreamSafety: DownstreamSafety;
}

export type NatureOfConflict =
  | 'DIRECT_CONTRADICTION' | 'METHODOLOGY_DIFFERENCE' | 'TEMPORAL_DIFFERENCE' | 'SCOPE_DIFFERENCE' | 'UNKNOWN';

export interface VerificationConflict {
  readonly conflictId: LocalKey;
  /** MUST resolve to a declared claims entry with verificationStatus CONFLICTING (R-BUS-011). */
  readonly claimId: LocalKey;
  readonly description: string;
  /** At least one entry, each resolving to the request's researchPackage.evidence (R-BUS-010). */
  readonly supportingEvidenceIds: readonly LocalKey[];
  /** At least one entry, each resolving to the request's researchPackage.evidence (R-BUS-010). */
  readonly contradictingEvidenceIds: readonly LocalKey[];
  readonly natureOfConflict: NatureOfConflict;
  readonly unresolvedReason: string;
}

export interface VerificationSummary {
  readonly totalClaims: number;
  readonly verifiedCount: number;
  readonly partiallySupportedCount: number;
  readonly unsupportedCount: number;
  readonly contradictedCount: number;
  readonly insufficientEvidenceCount: number;
  readonly conflictingCount: number;
  readonly outdatedCount: number;
  readonly notVerifiableCount: number;
  readonly safeToUseCount: number;
  readonly useWithQualificationCount: number;
  readonly doNotUseCount: number;
  readonly overallReadiness: boolean;
  readonly readinessRationale: string;
}

export type VerificationAssumptionBasis = 'RESEARCH_PACKAGE' | 'LANGUAGE';

export interface VerificationAssumption {
  readonly assumptionKey: LocalKey;
  readonly statement: string;
  readonly basis: VerificationAssumptionBasis;
  readonly path: JsonPath;
}

export type VerificationUnknownReason =
  | 'INPUT_NOT_SUPPLIED' | 'EVIDENCE_INSUFFICIENT' | 'NOT_DETERMINABLE_FROM_SUPPLIED_EVIDENCE';

export interface DeclaredUnknown {
  readonly path: JsonPath;
  readonly reason: VerificationUnknownReason;
}

export interface InputSufficiency {
  readonly value: Ratio;
  readonly basis: 'SELF_REPORTED';
  readonly limitations: readonly string[];
}

/**
 * THE VERIFICATION PACKAGE — the single deliverable of AGT-03. Every claim is
 * graded against SUPPLIED EVIDENCE ONLY (README §3); VERIFIED never means
 * "true in the world."
 */
export interface VerificationPackage {
  readonly packageKind: 'VERIFICATION_PACKAGE';
  readonly topicId: LocalKey;
  /** 1-60 items. claimId unique (R-BUS-001). */
  readonly claims: readonly Claim[];
  readonly conflicts: readonly VerificationConflict[];
  readonly verificationSummary: VerificationSummary;
  readonly assumptions: readonly VerificationAssumption[];
  readonly declaredUnknowns: readonly DeclaredUnknown[];
  readonly inputSufficiency: InputSufficiency;
}

export interface FactVerificationAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: FactVerificationResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: VerificationPackage;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface FactVerificationAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: FactVerificationResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export type FactVerificationAgentResponse =
  | FactVerificationAgentSuccessResponse
  | FactVerificationAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

/** The structured refusal form declared in the prompt's block 6. */
export interface FactVerificationRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

/** Exactly what the model may emit: a verification package, or a refusal. Nothing else. */
export type FactVerificationModelOutput = VerificationPackage | FactVerificationRefusal;

/* ────────────────────────────────────────────────────────────────────────────
 * Validation surface (implemented in validator.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

export type RuleId = string;

/** A declarative, individually named, individually testable rule (STD-000 §6.3). */
export interface BusinessRuleDefinition<TSubject, TContext = undefined> {
  readonly ruleId: RuleId;
  readonly title: string;
  readonly dimension: 'INPUT' | 'OUTPUT';
  readonly severity: FindingSeverity;
  /** Returns one finding per violation, or `[]` when the rule holds. */
  readonly evaluate: (subject: TSubject, context: TContext) => readonly ValidationFinding[];
}

export interface ValidationReport {
  readonly outcome: ValidationOutcome;
  readonly findings: readonly ValidationFinding[];
}

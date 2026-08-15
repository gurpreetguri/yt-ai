/**
 * AGT-02 — Research Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `research-agent-input/v1` and `research-agent-output/v1`
 * exactly; the schemas remain the enforcement mechanism (STD-000 §4.3).
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
 * @contract research-agent-input/v1  1.0.0
 * @contract research-agent-output/v1 1.0.0
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

/** Machine-readable location rooted at `$.`, e.g. `$.sources[2].title`. */
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
export interface ResearchAgentRequestMeta {
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
export interface ResearchAgentResponseMeta {
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

/** The registered error codes AGT-02 may emit (STD-000 §8.4). Closed. */
export type ResearchAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.SOURCE_COUNT_BOUNDS_CONTRADICTORY'
  | 'VALIDATION.INPUT.MATERIAL_BOUNDS_EXCEEDED'
  | 'VALIDATION.INPUT.DUPLICATE_MATERIAL_ID'
  | 'VALIDATION.INPUT.DUPLICATE_EXISTING_SOURCE_ID'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.FABRICATED_SOURCE'
  | 'AI_OUTPUT.CONTENT.FABRICATED_QUOTATION'
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
  readonly code: ResearchAgentErrorCode;
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
 * INPUT — research-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type TopicType =
  | 'EVERGREEN' | 'TRENDING' | 'NEWS_DRIVEN' | 'EDUCATIONAL' | 'COMPARISON'
  | 'TUTORIAL' | 'LIST' | 'PROBLEM_SOLUTION' | 'OPINION_ANALYSIS' | 'CASE_STUDY';

export type AudienceIntent = 'LEARN' | 'COMPARE' | 'DECIDE' | 'SOLVE_PROBLEM' | 'STAY_INFORMED' | 'BE_ENTERTAINED';

export type ResearchPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** The subset of an Agent 01 Topic Opportunity this agent needs (GDE-002 §5.4). Trusted. */
export interface TopicOpportunityRef {
  readonly topicId: LocalKey;
  readonly title: string;
  readonly angle: string;
  readonly topicType: TopicType;
  readonly pillarKey: LocalKey;
  readonly audienceIntent: AudienceIntent;
  readonly researchPriority: ResearchPriority;
}

export type SourceType =
  | 'OFFICIAL_DOCUMENTATION' | 'GOVERNMENT' | 'ACADEMIC_PAPER' | 'STANDARDS_ORGANIZATION' | 'COMPANY'
  | 'PRIMARY_SOURCE' | 'REPUTABLE_NEWS' | 'INDUSTRY_PUBLICATION' | 'EXPERT_SOURCE' | 'SECONDARY_SOURCE'
  | 'COMMUNITY_DISCUSSION' | 'SEARCH_RESULT' | 'OTHER';

export type RequestedDepth = 'SURFACE' | 'STANDARD' | 'DEEP';

export interface ResearchConstraints {
  /** MUST be <= maxSources when both present (R-IN-001). */
  readonly minSources?: number;
  readonly maxSources?: number;
  readonly requiredSourceTypes?: readonly SourceType[];
  readonly excludedDomains?: readonly string[];
  readonly maxSourceAgeDays?: number;
}

export interface ExistingResearchSourceRef {
  readonly existingSourceRefId: PrefixedId;
  readonly title: string;
  readonly url?: HttpsUrl;
  readonly sourceType: SourceType;
}

/** Prior, previously-vetted research to extend rather than re-derive. Trusted. */
export interface ExistingResearch {
  readonly researchPackageRefId: PrefixedId;
  readonly sources: readonly ExistingResearchSourceRef[];
}

export type MaterialKind = 'SEARCH_RESULT' | 'FETCHED_DOCUMENT';

/**
 * UNTRUSTED. One search result or fetched document supplied by the workflow's
 * research/search provider (GDE-002 §5.6). Data only; contains no instructions.
 */
export interface ResearchMaterial {
  readonly materialId: LocalKey;
  readonly materialKind: MaterialKind;
  readonly url?: HttpsUrl;
  readonly title: string;
  /** UNTRUSTED claim, not independently verified. */
  readonly publisherHint?: string;
  readonly content: string;
  readonly retrievedAt: IsoTimestamp;
  readonly claimedPublishedAt?: CalendarDate;
  readonly claimedLastUpdatedAt?: CalendarDate;
  readonly sourceTypeHint?: SourceType;
  readonly searchQueryRef?: string;
}

/** The payload the model receives. */
export interface ResearchRequestData {
  readonly topicOpportunity: TopicOpportunityRef;
  readonly researchConstraints?: ResearchConstraints;
  readonly existingResearch?: ExistingResearch;
  /** UNTRUSTED. 0-40 items. */
  readonly researchMaterials: readonly ResearchMaterial[];
  readonly requestedDepth: RequestedDepth;
  readonly language: Bcp47Tag;
}

export interface ResearchAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ResearchAgentRequestMeta;
  readonly data: ResearchRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — research-agent-output/v1 · THE RESEARCH PACKAGE
 * ──────────────────────────────────────────────────────────────────────────── */

export type QuestionType =
  | 'CORE_CLAIM' | 'SUPPORTING_FACT' | 'STATISTIC' | 'DATE_OR_TIMELINE' | 'DEFINITION'
  | 'OFFICIAL_POSITION' | 'COMPETING_EXPLANATION' | 'RECENT_CHANGE' | 'LIMITATION_OR_EXCEPTION' | 'OTHER';

export type QuestionPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type QuestionStatus = 'ANSWERED' | 'PARTIALLY_ANSWERED' | 'UNANSWERED' | 'CONFLICTING';

export interface ResearchQuestion {
  readonly questionId: LocalKey;
  readonly questionText: string;
  readonly questionType: QuestionType;
  readonly priority: QuestionPriority;
  readonly status: QuestionStatus;
}

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

export interface Source {
  readonly sourceId: LocalKey;
  readonly title: string;
  readonly publisher?: string;
  readonly url?: HttpsUrl;
  readonly sourceType: SourceType;
  /** The SEARCH_RESULT vs SOURCE distinction (README §13). */
  readonly sourceStatus: SourceStatus;
  readonly author?: string;
  readonly language?: Bcp47Tag;
  readonly publishedAt?: CalendarDate;
  readonly lastUpdatedAt?: CalendarDate;
  readonly accessedAt: IsoTimestamp;
  /** Exactly one of `derivedFromMaterialId` / `derivedFromExistingSourceRefId` MUST be present (R-BUS-006). */
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

/** Discriminated union on `extractionType` (GDE-003 §6.7). Never inferred from field presence. */
export type EvidenceText = EvidenceTextQuotation | EvidenceTextParaphrase;

export type EvidenceStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'ANECDOTAL';

export type VerificationStatus = 'REQUIRES_VERIFICATION' | 'CORROBORATED' | 'CONFLICTING' | 'UNRESOLVED';

export interface EvidenceItem {
  readonly evidenceId: LocalKey;
  readonly researchQuestionId: LocalKey;
  readonly sourceId: LocalKey;
  readonly claim: string;
  readonly evidenceText: EvidenceText;
  readonly supportingContext?: string;
  readonly locationInSource?: string;
  readonly evidenceDate?: CalendarDate;
  /** SEARCH_RESULT_ONLY sources cannot support STRONG evidence (R-BUS-007). */
  readonly evidenceStrength: EvidenceStrength;
  readonly relevance: Ratio;
  readonly freshness: Ratio;
  /** SEARCH_RESULT_ONLY sources cannot be CORROBORATED (R-BUS-008). */
  readonly verificationStatus: VerificationStatus;
  /** 0-5 items. Empty array means no material limitation was identified. */
  readonly limitations: readonly string[];
  readonly notesForVerification?: string;
}

export interface Conflict {
  readonly conflictId: LocalKey;
  readonly researchQuestionId: LocalKey;
  readonly description: string;
  /** At least two entries, each resolving to a declared evidence item (R-BUS-009). */
  readonly conflictingEvidenceIds: readonly LocalKey[];
  readonly possibleReason?: string;
}

export type GapType =
  | 'UNANSWERED_QUESTION' | 'INSUFFICIENT_SOURCES' | 'WEAK_SOURCES_ONLY' | 'STALE_INFORMATION'
  | 'NO_PRIMARY_SOURCE' | 'CONFLICTING_UNRESOLVED' | 'OUT_OF_SCOPE_FOR_SUPPLIED_MATERIALS';

export type GapSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ResearchGap {
  readonly gapId: LocalKey;
  readonly gapType: GapType;
  readonly researchQuestionId?: LocalKey;
  readonly description: string;
  readonly severity: GapSeverity;
}

export interface CompletenessAssessment {
  readonly totalQuestions: number;
  readonly answeredCount: number;
  readonly partiallyAnsweredCount: number;
  readonly unansweredCount: number;
  readonly conflictingCount: number;
  readonly weakOrIndirectSourceIds: readonly LocalKey[];
  readonly readyForFactVerification: boolean;
  readonly readinessRationale: string;
}

export interface FollowUpSearch {
  readonly queryId: LocalKey;
  readonly queryText: string;
  readonly rationale: string;
  readonly targetQuestionId?: LocalKey;
}

export type ResearchAssumptionBasis =
  | 'TOPIC_OPPORTUNITY' | 'RESEARCH_MATERIALS' | 'RESEARCH_CONSTRAINTS' | 'EXISTING_RESEARCH' | 'REQUESTED_DEPTH';

export interface ResearchAssumption {
  readonly assumptionKey: LocalKey;
  readonly statement: string;
  readonly basis: ResearchAssumptionBasis;
  readonly path: JsonPath;
}

export type ResearchUnknownReason =
  | 'INPUT_NOT_SUPPLIED' | 'INPUT_INSUFFICIENT' | 'MATERIALS_INSUFFICIENT' | 'NOT_DETERMINABLE_WITHOUT_FURTHER_RESEARCH';

/** The declared-unknown mechanism. Its presence never makes the response a failure. */
export interface DeclaredUnknown {
  readonly path: JsonPath;
  readonly reason: ResearchUnknownReason;
}

/** A statement about INPUTS, not about output quality (GDE-002 §9.5). */
export interface InputSufficiency {
  readonly value: Ratio;
  readonly basis: 'SELF_REPORTED';
  readonly limitations: readonly string[];
}

/**
 * THE RESEARCH PACKAGE — the single deliverable of AGT-02, the D1 research
 * dossier (ARC-001 §5.3). Every claim here is EVIDENCE, never a verified fact
 * and never editorial truth (README §3). Agent 03 performs final verification.
 */
export interface ResearchPackage {
  readonly packageKind: 'RESEARCH_PACKAGE';
  readonly topicId: LocalKey;
  readonly researchQuestions: readonly ResearchQuestion[];
  readonly sources: readonly Source[];
  readonly evidence: readonly EvidenceItem[];
  readonly conflicts: readonly Conflict[];
  readonly gaps: readonly ResearchGap[];
  readonly completeness: CompletenessAssessment;
  readonly recommendedFollowUpSearches: readonly FollowUpSearch[];
  readonly assumptions: readonly ResearchAssumption[];
  readonly declaredUnknowns: readonly DeclaredUnknown[];
  readonly inputSufficiency: InputSufficiency;
}

export interface ResearchAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ResearchAgentResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: ResearchPackage;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface ResearchAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ResearchAgentResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

/** Discriminated on `contractType`. */
export type ResearchAgentResponse = ResearchAgentSuccessResponse | ResearchAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

/** The structured refusal form declared in the prompt's block 6. */
export interface ResearchAgentRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

/** Exactly what the model may emit: a research package, or a refusal. Nothing else. */
export type ResearchAgentModelOutput = ResearchPackage | ResearchAgentRefusal;

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

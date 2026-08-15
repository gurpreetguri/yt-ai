/**
 * AGT-01 — Topic Discovery Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `topic-discovery-agent-input/v1` and
 * `topic-discovery-agent-output/v1` exactly; the schemas remain the
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
 * @contract topic-discovery-agent-input/v1  1.0.0
 * @contract topic-discovery-agent-output/v1 1.0.0
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

/**
 * Response- or request-local stable key, `^[A-Z][A-Z0-9_]{2,31}$`.
 * NOT a platform identifier. A durable identifier is assigned downstream on
 * commission (STD-000 §5.8).
 */
export type LocalKey = string;

/** Machine-readable location rooted at `$.`, e.g. `$.topics[2].title`. */
export type JsonPath = string;

/** Decimal on [0.0, 1.0]. */
export type Ratio = number;

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
export interface TopicDiscoveryRequestMeta {
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
export interface TopicDiscoveryResponseMeta {
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

/** The registered error codes AGT-01 may emit (STD-000 §8.4). Closed. */
export type TopicDiscoveryAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.PILLAR_CONSTRAINTS_CONTRADICTORY'
  | 'VALIDATION.INPUT.PILLAR_KEY_UNRESOLVABLE'
  | 'VALIDATION.INPUT.LANGUAGE_MISMATCH'
  | 'VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
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
  readonly code: TopicDiscoveryAgentErrorCode;
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
 * INPUT — topic-discovery-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type ExpertiseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'MIXED';
export type FormatType = 'LONG_FORM' | 'SHORT_FORM' | 'LIVE';

export type TopicType =
  | 'EVERGREEN' | 'TRENDING' | 'NEWS_DRIVEN' | 'EDUCATIONAL' | 'COMPARISON'
  | 'TUTORIAL' | 'LIST' | 'PROBLEM_SOLUTION' | 'OPINION_ANALYSIS' | 'CASE_STUDY';

export interface StrategyPillarRef {
  readonly pillarKey: LocalKey;
  readonly name: string;
  readonly description: string;
  readonly targetShareRatio: Ratio;
}

export interface StrategyPersonaRef {
  readonly personaKey: LocalKey;
  readonly name: string;
  readonly expertiseLevel: ExpertiseLevel;
}

export interface StrategyAudienceRef {
  readonly primarySegment: string;
  /** 1-3 items. */
  readonly personas: readonly StrategyPersonaRef[];
  /** MUST include `data.language` (R-IN-001). 1-5 items. */
  readonly languages: readonly Bcp47Tag[];
}

export interface StrategyTopicClusterRef {
  readonly clusterKey: LocalKey;
  readonly name: string;
  readonly seedKeywords: readonly string[];
  readonly pillarKey?: LocalKey;
}

export interface StrategySeoDirectionRef {
  readonly topicClusters: readonly StrategyTopicClusterRef[];
}

export interface StrategyFormatRef {
  readonly formatKey: LocalKey;
  readonly formatType: FormatType;
  readonly targetMinDurationMs: number;
  readonly targetMaxDurationMs: number;
}

export interface StrategyFormatStrategyRef {
  readonly formats: readonly StrategyFormatRef[];
}

/** The strategy SUBSET this agent needs — never the full Strategy Manifest (GDE-002 §5.4). */
export interface StrategyBinding {
  readonly strategyVersion: SemanticVersion;
  /** 2-6 items. */
  readonly contentPillars: readonly StrategyPillarRef[];
  readonly audience: StrategyAudienceRef;
  readonly seoDirection?: StrategySeoDirectionRef;
  readonly formatStrategy: StrategyFormatStrategyRef;
  /** Every candidate topic MUST avoid these (R-BUS-012). Absent means none supplied means empty array (never null). */
  readonly prohibitedTopics: readonly string[];
}

export type ExistingTopicStatus = 'PUBLISHED' | 'IN_PRODUCTION' | 'PROPOSED' | 'REJECTED';

export interface ExistingTopic {
  readonly topicRefId: PrefixedId;
  readonly title: string;
  readonly angle?: string;
  /** Absent means the topic predates the current pillar structure, or its pillar was retired. */
  readonly pillarKey?: LocalKey;
  readonly status: ExistingTopicStatus;
  /** Present only when `status` is `REJECTED`. */
  readonly rejectionReason?: string;
  readonly recordedAt: CalendarDate;
}

export interface DiscoveryConstraints {
  /** MUST resolve to `strategyBinding.contentPillars` (R-IN-003); disjoint from `excludePillarKeys` (R-IN-002). */
  readonly requiredPillarKeys?: readonly LocalKey[];
  /** MUST resolve to `strategyBinding.contentPillars` (R-IN-004); MUST NOT cover every pillar (R-IN-005). */
  readonly excludePillarKeys?: readonly LocalKey[];
  readonly allowedTopicTypes?: readonly TopicType[];
}

export interface TrendObservation {
  readonly observationKey: LocalKey;
  readonly statement: string;
  readonly observedAt?: CalendarDate;
}

/**
 * UNTRUSTED external content (GDE-002 §5.6). Delimited, labelled as data, and
 * size-bounded before invocation. Absent means timeliness scoring relies on the
 * topic's inherent nature only, and the omission is recorded in `assumptions`.
 */
export interface TrendContext {
  readonly sourceRefId: string;
  readonly collectedAt: IsoTimestamp;
  readonly observations: readonly TrendObservation[];
}

/** The payload the model receives. */
export interface TopicDiscoveryRequestData {
  readonly strategyBinding: StrategyBinding;
  /** 0-300 items. Empty array means this channel has no history yet. */
  readonly existingContentInventory: readonly ExistingTopic[];
  readonly discoveryConstraints?: DiscoveryConstraints;
  /** UNTRUSTED. */
  readonly trendContext?: TrendContext;
  readonly language: Bcp47Tag;
  readonly requestedTopicCount: number;
}

export interface TopicDiscoveryAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: TopicDiscoveryRequestMeta;
  readonly data: TopicDiscoveryRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — topic-discovery-agent-output/v1 · THE TOPIC OPPORTUNITY SET
 * ──────────────────────────────────────────────────────────────────────────── */

export type AudienceIntent = 'LEARN' | 'COMPARE' | 'DECIDE' | 'SOLVE_PROBLEM' | 'STAY_INFORMED' | 'BE_ENTERTAINED';

export interface ScoreDimension {
  readonly score: Ratio;
  readonly rationale: string;
}

export interface ScoreBreakdown {
  readonly audienceIntent: ScoreDimension;
  readonly strategicFit: ScoreDimension;
  readonly differentiation: ScoreDimension;
  readonly timeliness: ScoreDimension;
  readonly evergreenPotential: ScoreDimension;
  readonly productionFeasibility: ScoreDimension;
  readonly growthPotential: ScoreDimension;
}

export type RiskCategory =
  | 'FACTUAL_COMPLEXITY' | 'LEGAL_SENSITIVITY' | 'AUDIENCE_MISMATCH'
  | 'SATURATION' | 'PRODUCTION_COMPLEXITY' | 'PLATFORM_POLICY';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TopicRisk {
  readonly riskKey: LocalKey;
  readonly category: RiskCategory;
  readonly description: string;
  readonly severity: RiskSeverity;
}

export type ResearchPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DuplicateClassification =
  | 'NONE' | 'EXACT_DUPLICATE' | 'NEAR_DUPLICATE' | 'SAME_SUBJECT_DIFFERENT_ANGLE' | 'TRIVIAL_WORDING_VARIANT';

export interface DuplicateStatusNone {
  readonly classification: 'NONE';
}

export interface DuplicateStatusMatched {
  readonly classification: 'EXACT_DUPLICATE' | 'NEAR_DUPLICATE' | 'SAME_SUBJECT_DIFFERENT_ANGLE' | 'TRIVIAL_WORDING_VARIANT';
  /** MUST resolve to a supplied `existingContentInventory` entry (R-BUS-010). */
  readonly matchedTopicRefId: PrefixedId;
  readonly similarityBasis: string;
}

/** Discriminated union on `classification` (GDE-003 §6.7). Never inferred from field presence. */
export type DuplicateStatus = DuplicateStatusNone | DuplicateStatusMatched;

export interface TimelinessWindow {
  readonly relevantFrom: CalendarDate;
  /** Strictly later than `relevantFrom`. */
  readonly relevantUntil: CalendarDate;
  readonly rationale: string;
}

export interface TopicOpportunity {
  /** Stable within this response only. A durable identifier is assigned downstream on commission. */
  readonly topicId: LocalKey;
  readonly title: string;
  /** The specific promise or framing that distinguishes this topic from a generic treatment. */
  readonly angle: string;
  readonly topicType: TopicType;
  /** MUST resolve to the request's `strategyBinding.contentPillars` (R-BUS-003). */
  readonly pillarKey: LocalKey;
  /** Absent means the topic serves the audience broadly. When present, MUST resolve to a persona (R-BUS-004). */
  readonly targetPersonaKey?: LocalKey;
  readonly audienceIntent: AudienceIntent;
  /** Seven transparent, independently-justified dimensions (README §8). */
  readonly scoreBreakdown: ScoreBreakdown;
  /** Weighted sum of `scoreBreakdown`, rounded to 2 decimals (R-BUS-005). */
  readonly overallScore: Ratio;
  /** 1-based. Unique, contiguous (R-BUS-006), non-increasing in `overallScore` (R-BUS-007). */
  readonly rank: number;
  /** Present when `topicType` is `TRENDING` or `NEWS_DRIVEN`; absent when `EVERGREEN` (R-BUS-011). */
  readonly timelinessWindow?: TimelinessWindow;
  /** 0-6 items. Empty array means no notable considerations. */
  readonly productionConsiderations: readonly string[];
  /** 0-8 items. Empty array means no material risk was identified. */
  readonly risks: readonly TopicRisk[];
  readonly researchPriority: ResearchPriority;
  readonly duplicateStatus: DuplicateStatus;
}

export type AssumptionBasis =
  | 'STRATEGY_BINDING' | 'EXISTING_CONTENT_INVENTORY' | 'DISCOVERY_CONSTRAINTS' | 'TREND_CONTEXT' | 'REQUESTED_COUNT';

export interface TopicDiscoveryAssumption {
  readonly assumptionKey: LocalKey;
  readonly statement: string;
  readonly basis: AssumptionBasis;
  readonly path: JsonPath;
}

export type UnknownReason =
  | 'INPUT_NOT_SUPPLIED' | 'INPUT_INSUFFICIENT' | 'DISCOVERY_SPACE_EXHAUSTED' | 'NOT_DETERMINABLE_WITHOUT_RESEARCH';

/** The declared-unknown mechanism. Its presence never makes the response a failure. */
export interface DeclaredUnknown {
  readonly path: JsonPath;
  readonly reason: UnknownReason;
}

/** A statement about INPUTS, not about output quality (GDE-002 §9.5). */
export interface InputSufficiency {
  readonly value: Ratio;
  readonly basis: 'SELF_REPORTED';
  readonly limitations: readonly string[];
}

/**
 * THE TOPIC OPPORTUNITY SET — the single deliverable of AGT-01.
 * This object, and only this object, is what the model emits. Every topic is
 * an OPPORTUNITY for research, never a verified fact and never a commissioned
 * topic (README §3).
 */
export interface TopicOpportunitySet {
  readonly setKind: 'TOPIC_OPPORTUNITY_SET';
  readonly requestedCount: number;
  /** MUST equal `topics.length` (R-BUS-001). */
  readonly deliveredCount: number;
  /** Ordered: ascending `rank`. 0-50 items. Titles unique after normalisation (R-BUS-008). */
  readonly topics: readonly TopicOpportunity[];
  readonly assumptions: readonly TopicDiscoveryAssumption[];
  readonly declaredUnknowns: readonly DeclaredUnknown[];
  readonly inputSufficiency: InputSufficiency;
}

export interface TopicDiscoveryAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: TopicDiscoveryResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: TopicOpportunitySet;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface TopicDiscoveryAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: TopicDiscoveryResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

/** Discriminated on `contractType`. */
export type TopicDiscoveryAgentResponse = TopicDiscoveryAgentSuccessResponse | TopicDiscoveryAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY'
  | 'CONSTRAINTS_UNSATISFIABLE' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

/** The structured refusal form declared in the prompt's block 6. */
export interface TopicDiscoveryRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

/** Exactly what the model may emit: a topic opportunity set, or a refusal. Nothing else. */
export type TopicDiscoveryModelOutput = TopicOpportunitySet | TopicDiscoveryRefusal;

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

/**
 * AGT-00 — Strategy Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `strategy-agent-input/v1` and `strategy-agent-output/v1`
 * exactly; the schemas remain the enforcement mechanism (STD-000 §4.3).
 *
 * Conventions:
 *  - Optionality (`?`) means the property is OMITTED when absent. `null` is never
 *    a permitted value anywhere in these contracts (STD-000 §5.4, Rule 16).
 *  - Arrays are never `null`; the empty case is `[]`.
 *  - Every union type below is CLOSED. Adding a member is a MAJOR change
 *    (STD-000 §5.5). Consumers may exhaustively switch on them.
 *  - `readonly` throughout: contracts are immutable once emitted (GDE-003 §3.3).
 *  - Durations are integer milliseconds; money is integer micro-USD;
 *    ratios are decimals on [0.0, 1.0] (STD-000 §5.9).
 *
 * @contract strategy-agent-input/v1  1.0.0
 * @contract strategy-agent-output/v1 1.0.0
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

/** ISO 3166-1 alpha-2 country code: `US`, `DE`. */
export type CountryCode = string;

/** Semantic version: `1.4.0`. */
export type SemanticVersion = string;

/** Opaque, type-prefixed, time-ordered platform identifier: `chn_01J8Z…`. Never parsed. */
export type PrefixedId = string;

/**
 * Manifest- or request-local stable key, `^[A-Z][A-Z0-9_]{2,31}$`.
 * NOT a platform identifier. Durable identifiers are assigned by the Strategy
 * Store on approval (STD-000 §5.8).
 */
export type LocalKey = string;

/** Machine-readable location rooted at `$.`, e.g. `$.contentPillars[2].name`. */
export type JsonPath = string;

/** Decimal on [0.0, 1.0]. */
export type Ratio = number;

/** 24-hour local wall time, `HH:mm`. Always paired with an IANA timezone. */
export type LocalTimeHhMm = string;

/** IANA timezone identifier, e.g. `America/New_York`. */
export type IanaTimezone = string;

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
  /** `sha256:<64 hex>`. Present only where the target is content-addressed. */
  readonly integrity?: string;
  readonly role: ReferenceRole;
  /** Tenant the reference resolves within. Cross-tenant is a SECURITY error. */
  readonly scope: PrefixedId;
  /** Mandatory when `refType` is `EXTERNAL`; absence means `TRUSTED`. */
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
export interface StrategyRequestMeta {
  readonly messageId: PrefixedId;
  readonly correlationId: PrefixedId;
  readonly causationId?: PrefixedId;
  readonly runId?: PrefixedId;
  readonly nodeId?: PrefixedId;
  /** Absent means the first attempt. */
  readonly attempt?: number;
  readonly createdAt: IsoTimestamp;
  readonly locale: Bcp47Tag;
  readonly tenantId: PrefixedId;
  readonly channelId: PrefixedId;
  readonly brandVersion?: SemanticVersion;
  readonly localeVersion?: SemanticVersion;
  readonly producer: ProducerIdentity;
}

/** Response-side `meta`. Provenance is supplied by the runtime, never by the model. */
export interface StrategyResponseMeta {
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
  readonly brandVersion?: SemanticVersion;
  readonly localeVersion?: SemanticVersion;
  readonly producer: ProducerIdentity;
  readonly agentId: string;
  readonly agentVersion: SemanticVersion;
  /** Immutable, content-addressed prompt identity (STD-000 §4.9). */
  readonly promptVersion: string;
  /** Audit only. MUST NOT influence consumer behaviour (STD-000 Rule 5). */
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
  /** `TRUNCATED` MUST be treated as a failure (STD-000 §6.7). */
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
  /** What makes targeted repair possible instead of full regeneration. */
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

/** The registered error codes AGT-00 may emit (STD-000 §8.4). Closed. */
export type StrategyAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.AUDIENCE_UNRESOLVABLE'
  | 'VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY'
  | 'VALIDATION.INPUT.LOCALE_MISMATCH'
  | 'VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE'
  | 'VALIDATION.INPUT.DERIVATION_INCOMPLETE'
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
  readonly code: StrategyAgentErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  /** Set by the producer from category; never inferred from message text. */
  readonly retryable: boolean;
  /** For engineers. Specific. */
  readonly message: string;
  /** For end users. Leaks no internal structure, provider, prompt, or identifiers. */
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
  /** Nearest cause first. */
  readonly causeChain?: readonly ErrorCause[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared domain enumerations
 * ──────────────────────────────────────────────────────────────────────────── */

export type ToneDescriptor =
  | 'AUTHORITATIVE' | 'CONVERSATIONAL' | 'ANALYTICAL' | 'ENERGETIC' | 'CALM'
  | 'WITTY' | 'EMPATHETIC' | 'DIRECT' | 'CURIOUS' | 'PRAGMATIC' | 'OPTIMISTIC' | 'IRREVERENT';

export type ExpertiseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'MIXED';

export type AgeBand =
  | 'AGE_13_17' | 'AGE_18_24' | 'AGE_25_34' | 'AGE_35_44' | 'AGE_45_54' | 'AGE_55_PLUS';

export type MetricUnit = 'COUNT' | 'HOURS' | 'RATIO' | 'MILLISECONDS' | 'MICRO_USD';

export type FormatType = 'LONG_FORM' | 'SHORT_FORM' | 'LIVE';

export type AspectRatio = 'RATIO_16_9' | 'RATIO_9_16' | 'RATIO_1_1';

export type DayOfWeek =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type BusinessGoalKind =
  | 'AUDIENCE_GROWTH' | 'REVENUE' | 'BRAND_AUTHORITY' | 'LEAD_GENERATION'
  | 'COMMUNITY' | 'PRODUCT_ADOPTION' | 'EDUCATION_IMPACT';

/* ────────────────────────────────────────────────────────────────────────────
 * INPUT — strategy-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type ContentCategory =
  | 'EDUCATION' | 'TECHNOLOGY' | 'BUSINESS_FINANCE' | 'HEALTH_FITNESS' | 'SCIENCE'
  | 'HISTORY' | 'ENTERTAINMENT' | 'GAMING' | 'LIFESTYLE' | 'NEWS_COMMENTARY'
  | 'ARTS_CULTURE' | 'TRAVEL' | 'FOOD' | 'SPORTS' | 'OTHER';

export type ChannelMaturity = 'NEW' | 'ESTABLISHED' | 'SCALING';

export interface ChannelProfile {
  /** Display data only; never a key (STD-000 Rule 8). */
  readonly displayName: string;
  readonly contentCategory: ContentCategory;
  readonly maturity: ChannelMaturity;
  /** Absent means the agent must not reference subscriber scale in any output field. */
  readonly currentSubscriberCount?: number;
  /** Absent means the agent must not reference publishing history in any output field. */
  readonly currentVideoCount?: number;
}

export interface BusinessGoal {
  readonly goalKey: LocalKey;
  readonly goal: BusinessGoalKind;
  /** 1 is highest. Unique across `businessGoals` (R-IN-003). */
  readonly priority: number;
  readonly horizonDays: number;
  /** Absent means the agent proposes the target and records the judgement in `assumptions`. */
  readonly targetValue?: number;
  /** Required when `targetValue` is present. */
  readonly targetUnit?: MetricUnit;
}

export interface OperatorIntent {
  readonly missionStatement: string;
  /** Unordered; rank is `priority`. 1-5 items. */
  readonly businessGoals: readonly BusinessGoal[];
  readonly weeklyVideoTarget: number;
  readonly targetAudienceDescription: string;
  /** Each entry MUST become a conformance rule (R-BUS-015). Absent means none. */
  readonly nonNegotiables?: readonly string[];
  /** Each entry MUST be preserved in the manifest (R-BUS-014). Absent means none. */
  readonly prohibitedTopics?: readonly string[];
}

export interface AudienceDefinition {
  readonly primarySegment: string;
  readonly geographies: readonly CountryCode[];
  /** MUST include `localeBinding.locale` (R-IN-001). */
  readonly languages: readonly Bcp47Tag[];
  readonly ageBands: readonly AgeBand[];
  readonly expertiseLevel: ExpertiseLevel;
}

export type VoicePersona =
  | 'NARRATOR' | 'PRACTITIONER' | 'ANALYST' | 'GUIDE' | 'HOST' | 'INVESTIGATOR';

/** The brand SUBSET this agent needs — never the full brand kit (GDE-002 §5.4). */
export interface BrandBinding {
  readonly brandVersion: SemanticVersion;
  /** The permitted tone vocabulary. Output descriptors MUST be a subset (R-BUS-017). */
  readonly toneDescriptors: readonly ToneDescriptor[];
  readonly voicePersona: VoicePersona;
  /** Absent means no preferences. */
  readonly vocabularyPreferences?: readonly string[];
  /** Each entry MUST be preserved in the manifest (R-BUS-018). Absent means none. */
  readonly vocabularyProhibitions?: readonly string[];
}

export type ReadingDirection = 'LTR' | 'RTL';

/** The locale SUBSET this agent needs (GDE-002 §5.4). */
export interface LocaleBinding {
  readonly locale: Bcp47Tag;
  readonly localeVersion: SemanticVersion;
  readonly readingDirection: ReadingDirection;
  /** Bounds `titlePatterns[].maxLengthChars` (R-BUS-019). */
  readonly maxTitleLengthChars: number;
  readonly speakingRateWordsPerMinute: number;
}

export interface CapacityConstraints {
  readonly weeklyProductionCapacityVideos: number;
  readonly minVideoDurationMs: number;
  readonly maxVideoDurationMs: number;
  /** Absent means the agent proposes no cost-bound conformance rule. */
  readonly budgetPerVideoMicroUsd?: number;
}

export interface MarketObservation {
  readonly observationKey: LocalKey;
  readonly statement: string;
  readonly observedAt?: CalendarDate;
}

/**
 * UNTRUSTED external content (GDE-002 §5.6). Delimited, labelled as data, and
 * size-bounded before invocation. Absent means `competitivePositioning.whiteSpace`
 * is emitted empty and the omission is recorded in `assumptions`.
 */
export interface MarketContext {
  readonly sourceRefId: string;
  readonly collectedAt: IsoTimestamp;
  readonly observations: readonly MarketObservation[];
}

/** Absent means `derivation.cycle` is `INITIAL` (R-BUS-010). */
export interface PriorStrategy {
  readonly strategyVersion: SemanticVersion;
  readonly approvedAt?: IsoTimestamp;
  /** Keys to carry forward so per-pillar attribution stays joinable across versions. */
  readonly pillarKeys: readonly LocalKey[];
  /** Absent means no pillar was flagged. */
  readonly underperformingPillarKeys?: readonly LocalKey[];
}

export type InsightDimension =
  | 'CONTENT_PILLAR' | 'FORMAT' | 'DURATION' | 'PUBLISHING_CADENCE'
  | 'PACKAGING' | 'SEO' | 'TONE' | 'CALL_TO_ACTION' | 'MONETIZATION' | 'AUDIENCE';

export interface InsightProposal {
  readonly proposalId: PrefixedId;
  readonly dimension: InsightDimension;
  readonly recommendation: string;
  readonly evidenceRefId: string;
  readonly sampleSize: number;
  readonly confidence: Ratio;
}

/** The payload the model receives. */
export interface StrategyRequestData {
  readonly channelProfile: ChannelProfile;
  readonly operatorIntent: OperatorIntent;
  readonly audienceDefinition: AudienceDefinition;
  readonly brandBinding: BrandBinding;
  readonly localeBinding: LocaleBinding;
  readonly capacityConstraints: CapacityConstraints;
  /** UNTRUSTED. */
  readonly marketContext?: MarketContext;
  readonly priorStrategy?: PriorStrategy;
  /** Requires `priorStrategy` (R-IN-007). */
  readonly insightProposals?: readonly InsightProposal[];
}

export interface StrategyAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StrategyRequestMeta;
  readonly data: StrategyRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — strategy-agent-output/v1 · THE STRATEGY MANIFEST
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Mission {
  readonly statement: string;
  readonly positioning: string;
  /** Unordered. 2-5 items. */
  readonly differentiators: readonly string[];
}

export interface AudiencePersona {
  readonly personaKey: LocalKey;
  readonly name: string;
  readonly description: string;
  readonly motivations: readonly string[];
  readonly painPoints: readonly string[];
  readonly expertiseLevel: ExpertiseLevel;
}

export interface ManifestAudience {
  readonly primarySegment: string;
  /** Ordered: most representative first. 1-3 items. */
  readonly personas: readonly AudiencePersona[];
  readonly geographies: readonly CountryCode[];
  /** Ordered: index 0 is the production language and equals `localeBinding.locale`. */
  readonly languages: readonly Bcp47Tag[];
  readonly ageBands: readonly AgeBand[];
  readonly expertiseLevel: ExpertiseLevel;
}

export type PillarIntent = 'EDUCATE' | 'ENTERTAIN' | 'INSPIRE' | 'PERSUADE' | 'INFORM';

export interface ContentPillar {
  /** Carried forward unchanged where the pillar persists across strategy versions. */
  readonly pillarKey: LocalKey;
  readonly name: string;
  readonly description: string;
  readonly intent: PillarIntent;
  /** 0.05-0.6. All pillar shares sum to 1.0 ± 0.01 (R-BUS-003). */
  readonly targetShareRatio: Ratio;
  /** Illustrative only; not commissioned topics. 2-5 items. */
  readonly exampleTopics: readonly string[];
}

export interface FormatSpec {
  readonly formatKey: LocalKey;
  readonly formatType: FormatType;
  readonly aspectRatio: AspectRatio;
  readonly targetMinDurationMs: number;
  readonly targetMaxDurationMs: number;
  readonly weeklyCount: number;
  readonly structurePattern: string;
}

export interface FormatStrategy {
  /** Ordered: descending `weeklyCount`. 1-3 items. */
  readonly formats: readonly FormatSpec[];
}

export interface PublishingSlot {
  readonly slotKey: LocalKey;
  readonly dayOfWeek: DayOfWeek;
  /** Local wall time; always paired with `timezone` (STD-000 §5.7). */
  readonly publishLocalTime: LocalTimeHhMm;
  readonly timezone: IanaTimezone;
  readonly formatKey: LocalKey;
}

export interface PublishingCadence {
  readonly weeklyVideoCount: number;
  /** Ordered: ascending day then time. Length equals `weeklyVideoCount` (R-BUS-006). */
  readonly slots: readonly PublishingSlot[];
}

export type NarrationPerson =
  | 'FIRST_PERSON_SINGULAR' | 'FIRST_PERSON_PLURAL' | 'SECOND_PERSON' | 'THIRD_PERSON';

export type HumourLevel = 'NONE' | 'LIGHT' | 'MODERATE' | 'PROMINENT';

export interface ToneAndPersonality {
  /** Subset of `brandBinding.toneDescriptors` (R-BUS-017). 3-8 items. */
  readonly toneDescriptors: readonly ToneDescriptor[];
  readonly narrationPerson: NarrationPerson;
  readonly humourLevel: HumourLevel;
  readonly vocabularyPreferences: readonly string[];
  /** Superset of `brandBinding.vocabularyProhibitions` (R-BUS-018). */
  readonly vocabularyProhibitions: readonly string[];
}

export interface TitlePattern {
  readonly patternKey: LocalKey;
  /** A shape, not a title. Placeholders in angle brackets. */
  readonly pattern: string;
  /** ≤ `localeBinding.maxTitleLengthChars` (R-BUS-019). */
  readonly maxLengthChars: number;
}

export type FaceUsage = 'REQUIRED' | 'PREFERRED' | 'OPTIONAL' | 'PROHIBITED';

export interface ThumbnailDirection {
  readonly compositionRules: readonly string[];
  readonly textMaxWords: number;
  readonly faceUsage: FaceUsage;
}

export type HookElement =
  | 'STAKES' | 'PROMISE' | 'QUESTION' | 'PATTERN_BREAK' | 'CREDIBILITY_SIGNAL' | 'PREVIEW';

export interface HookDirection {
  readonly maxDurationMs: number;
  readonly requiredElements: readonly HookElement[];
}

export interface PackagingDirection {
  /** Ordered: preferred first. 2-6 items. */
  readonly titlePatterns: readonly TitlePattern[];
  readonly thumbnailDirection: ThumbnailDirection;
  readonly hookDirection: HookDirection;
}

export interface TopicCluster {
  readonly clusterKey: LocalKey;
  readonly name: string;
  readonly seedKeywords: readonly string[];
  /** Absent means the cluster spans pillars and D1 may map it to any of them. */
  readonly pillarKey?: LocalKey;
}

export type KeywordStrategy = 'HEAD_TERMS' | 'LONG_TAIL' | 'MIXED';

export interface SeoDirection {
  /** Ordered: descending strategic priority. 1-8 items. */
  readonly topicClusters: readonly TopicCluster[];
  readonly keywordStrategy: KeywordStrategy;
}

export type CallToActionKind =
  | 'SUBSCRIBE' | 'WATCH_NEXT' | 'VISIT_LINK' | 'COMMENT' | 'SHARE' | 'NONE';

export type CallToActionPlacement = 'OPENING' | 'MID_ROLL' | 'CLOSING' | 'DESCRIPTION';

export interface CallToActionStrategy {
  readonly primaryAction: CallToActionKind;
  readonly placement: readonly CallToActionPlacement[];
  readonly frequencyPerVideo: number;
}

export type MonetizationModel =
  | 'AD_REVENUE' | 'SPONSORSHIP' | 'AFFILIATE' | 'PRODUCT' | 'MEMBERSHIP' | 'NONE';

export interface MonetizationStrategy {
  readonly models: readonly MonetizationModel[];
  readonly constraints: readonly string[];
}

export type SuccessMetricKind =
  | 'VIEWS' | 'WATCH_TIME_HOURS' | 'SUBSCRIBER_GAIN' | 'AVERAGE_VIEW_DURATION_MS'
  | 'CLICK_THROUGH_RATE' | 'RETENTION_RATE_AT_30S' | 'REVENUE_MICRO_USD'
  | 'COMMENTS_PER_VIDEO' | 'RETURNING_VIEWER_RATIO';

export type ReviewCadence = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface SuccessMetric {
  readonly metricKey: LocalKey;
  /** Resolves to a request `businessGoals[].goalKey` (R-BUS-020). */
  readonly linkedGoalKey: LocalKey;
  readonly metric: SuccessMetricKind;
  readonly targetValue: number;
  readonly unit: MetricUnit;
  readonly horizonDays: number;
  readonly reviewCadence: ReviewCadence;
}

export interface GrowthMilestone {
  readonly milestoneKey: LocalKey;
  readonly description: string;
  /** Resolves to a `successMetrics[].metricKey`. */
  readonly metricKey: LocalKey;
  readonly targetValue: number;
  /** Days from approval — an offset, because the approval instant is unknown at authoring time. */
  readonly byDayOffset: number;
}

export interface ExpansionCandidate {
  readonly candidateKey: LocalKey;
  readonly description: string;
  readonly triggerCondition: string;
}

export interface GrowthPlan {
  readonly horizonDays: number;
  /** Ordered: ascending `byDayOffset`. 1-5 items. */
  readonly milestones: readonly GrowthMilestone[];
  readonly expansionCandidates: readonly ExpansionCandidate[];
}

export interface WhiteSpaceClaim {
  readonly claim: string;
  /** Resolves to a supplied `marketContext.observations[].observationKey`. */
  readonly observationKey: LocalKey;
}

export interface CompetitivePositioning {
  readonly positioningStatement: string;
  /** Empty when `marketContext` was not supplied. */
  readonly whiteSpace: readonly WhiteSpaceClaim[];
  readonly avoidancePatterns: readonly string[];
}

export interface SeasonalPeriod {
  readonly periodKey: LocalKey;
  readonly name: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly emphasisPillarKeys: readonly LocalKey[];
}

export type RiskCategory =
  | 'AUDIENCE' | 'PLATFORM_POLICY' | 'MONETIZATION' | 'BRAND' | 'CAPACITY' | 'COMPETITIVE' | 'LEGAL';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StrategyRisk {
  readonly riskKey: LocalKey;
  readonly category: RiskCategory;
  readonly description: string;
  readonly severity: RiskSeverity;
  readonly mitigation: string;
}

export type ConformanceDimension =
  | 'TOPIC' | 'PILLAR' | 'FORMAT' | 'DURATION' | 'TONE' | 'VOCABULARY'
  | 'PACKAGING' | 'SEO' | 'CALL_TO_ACTION' | 'MONETIZATION' | 'DISCLOSURE' | 'CADENCE';

/** Strategy conformance criteria supplied to the validation plane (ARC-001 §4.3). */
export interface ConformanceRule {
  readonly ruleKey: LocalKey;
  readonly dimension: ConformanceDimension;
  /** One checkable condition, stated as a single measurable requirement. */
  readonly requirement: string;
  readonly severity: 'BLOCKER' | 'ERROR' | 'WARNING';
}

export type ChangeType = 'ADDED' | 'CHANGED' | 'REMOVED' | 'RETAINED_EXPLICITLY';

export interface ChangeSummaryEntry {
  readonly path: JsonPath;
  readonly changeType: ChangeType;
  readonly rationale: string;
  /** Absent means the change is operator-driven; the rationale then cites `operatorIntent`. */
  readonly evidenceProposalId?: PrefixedId;
}

export interface DerivationInitial {
  readonly cycle: 'INITIAL';
}

export interface DerivationRevision {
  readonly cycle: 'REVISION';
  readonly supersedesStrategyVersion: SemanticVersion;
  readonly adoptedProposalIds: readonly PrefixedId[];
  /** Ordered: descending impact. 1-30 items. */
  readonly changeSummary: readonly ChangeSummaryEntry[];
}

/** Discriminated union on `cycle` (GDE-003 §6.7). Never inferred from field presence. */
export type Derivation = DerivationInitial | DerivationRevision;

export type AssumptionBasis =
  | 'OPERATOR_INTENT' | 'AUDIENCE_DEFINITION' | 'BRAND_BINDING' | 'LOCALE_BINDING'
  | 'CAPACITY_CONSTRAINTS' | 'MARKET_CONTEXT' | 'INSIGHT_PROPOSAL' | 'PRIOR_STRATEGY';

export interface StrategyAssumption {
  readonly assumptionKey: LocalKey;
  readonly statement: string;
  readonly basis: AssumptionBasis;
  readonly path: JsonPath;
}

export type UnknownReason =
  | 'INPUT_NOT_SUPPLIED' | 'INPUT_INSUFFICIENT'
  | 'NOT_APPLICABLE_TO_CHANNEL' | 'NOT_DETERMINABLE_WITHOUT_HISTORY';

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
 * THE STRATEGY MANIFEST — the single deliverable of Department 0.
 * This object, and only this object, is what the model emits.
 * It is a PROPOSAL until the Strategy Store records human approval.
 */
export interface StrategyManifest {
  readonly manifestKind: 'STRATEGY_MANIFEST';
  readonly mission: Mission;
  readonly audience: ManifestAudience;
  /** Ordered: descending `targetShareRatio`. 2-6 items. */
  readonly contentPillars: readonly ContentPillar[];
  readonly formatStrategy: FormatStrategy;
  readonly publishingCadence: PublishingCadence;
  readonly toneAndPersonality: ToneAndPersonality;
  readonly packagingDirection: PackagingDirection;
  readonly seoDirection: SeoDirection;
  readonly callToActionStrategy: CallToActionStrategy;
  readonly monetizationStrategy: MonetizationStrategy;
  readonly successMetrics: readonly SuccessMetric[];
  readonly growthPlan: GrowthPlan;
  readonly competitivePositioning: CompetitivePositioning;
  /** Ordered: ascending `startDate`. Empty means no seasonal emphasis. */
  readonly seasonalPlan: readonly SeasonalPeriod[];
  readonly riskAssessment: readonly StrategyRisk[];
  readonly conformanceRules: readonly ConformanceRule[];
  readonly prohibitedTopics: readonly string[];
  readonly derivation: Derivation;
  readonly assumptions: readonly StrategyAssumption[];
  readonly declaredUnknowns: readonly DeclaredUnknown[];
  readonly inputSufficiency: InputSufficiency;
}

export interface StrategyAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StrategyResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: StrategyManifest;
  /** Non-blocking warnings only. Never present-and-empty. */
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface StrategyAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StrategyResponseMeta;
  readonly status: 'FAILURE';
  /** All failures reported together, never one at a time (STD-000 §6.2). */
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

/** Discriminated on `contractType`. */
export type StrategyAgentResponse = StrategyAgentSuccessResponse | StrategyAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY'
  | 'CONSTRAINTS_UNSATISFIABLE' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

/** The structured refusal form declared in the prompt's block 6. */
export interface StrategyRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

/** Exactly what the model may emit: a manifest, or a refusal. Nothing else. */
export type StrategyModelOutput = StrategyManifest | StrategyRefusal;

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
  /** All findings, never only the first (STD-000 §6.2). */
  readonly findings: readonly ValidationFinding[];
}

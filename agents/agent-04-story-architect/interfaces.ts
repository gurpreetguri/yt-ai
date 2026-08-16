/**
 * AGT-04 — Story Architect Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `story-architect-agent-input/v1` and
 * `story-architect-agent-output/v1` exactly; the schemas remain the
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
 * @contract story-architect-agent-input/v1  1.0.0
 * @contract story-architect-agent-output/v1 1.0.0
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────────── */

export type IsoTimestamp = string;
export type CalendarDate = string;
export type Bcp47Tag = string;
export type SemanticVersion = string;
export type PrefixedId = string;
export type LocalKey = string;
export type JsonPath = string;
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

export interface NormalisedParameters {
  readonly temperature: number;
  readonly topP: number;
  readonly seed?: number;
  readonly maxOutputTokens?: number;
}

export interface StoryArchitectRequestMeta {
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

export interface StoryArchitectResponseMeta {
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

/** The registered error codes AGT-04 may emit (STD-000 §8.4). Closed. */
export type StoryArchitectAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID'
  | 'VALIDATION.INPUT.TOPIC_ID_MISMATCH'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE'
  | 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST'
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

export interface StandardError {
  readonly code: StoryArchitectAgentErrorCode;
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
 * INPUT — story-architect-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type TopicType =
  | 'EVERGREEN' | 'TRENDING' | 'NEWS_DRIVEN' | 'EDUCATIONAL' | 'COMPARISON'
  | 'TUTORIAL' | 'LIST' | 'PROBLEM_SOLUTION' | 'OPINION_ANALYSIS' | 'CASE_STUDY';

export type AudienceIntent = 'LEARN' | 'COMPARE' | 'DECIDE' | 'SOLVE_PROBLEM' | 'STAY_INFORMED' | 'BE_ENTERTAINED';

export interface TopicOpportunityRef {
  /** MUST equal VerificationPackageRef.topicId — both name the same topic (R-IN-002). */
  readonly topicId: LocalKey;
  readonly title: string;
  readonly angle: string;
  readonly topicType: TopicType;
  readonly pillarKey: LocalKey;
  readonly audienceIntent: AudienceIntent;
}

export type PacingValue = 'FAST' | 'MODERATE' | 'SLOW';

export interface StoryConstraints {
  readonly maxBeatCount?: number;
  readonly pacingPreference?: PacingValue;
  readonly requireCallToAction?: boolean;
}

export type ClaimType =
  | 'STATISTIC' | 'DATE' | 'DEFINITION' | 'TECHNICAL_FACT' | 'PRODUCT_FACT' | 'COMPARISON' | 'PRICE'
  | 'REGULATION' | 'EVENT' | 'HISTORICAL_FACT' | 'QUOTE' | 'CAUSAL_CLAIM' | 'OPINION' | 'FORECAST' | 'OTHER';

export type VerificationStatus =
  | 'VERIFIED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING' | 'OUTDATED' | 'NOT_VERIFIABLE';

export type DownstreamSafety = 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE';
export type FreshnessConcern = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

/**
 * The subset of a verified Claim this agent needs. `downstreamSafety` is
 * the Verification Package's fixed, already-validated determination — this agent respects it
 * absolutely and never re-derives or overrides it (README §4).
 */
export interface VerifiedClaimRef {
  readonly claimId: LocalKey;
  readonly claimText: string;
  readonly claimType: ClaimType;
  readonly verificationStatus: VerificationStatus;
  readonly downstreamSafety: DownstreamSafety;
  /** 0-15 items. What a story beat may cite via `evidenceRefs` for this claim. */
  readonly supportingEvidenceIds: readonly LocalKey[];
  readonly isTimeSensitive: boolean;
  readonly freshnessConcern: FreshnessConcern;
  readonly limitations: readonly string[];
  readonly notesForDownstream?: string;
}

/**
 * The subset of the Verification Package this agent needs.
 * Provenance TRUSTED but embedded free text MUST be treated as untrusted
 * data by the prompt (README §15).
 */
export interface VerificationPackageRef {
  /** MUST equal TopicOpportunityRef.topicId — both name the same topic (R-IN-002). */
  readonly topicId: LocalKey;
  /** 1-60 items. claimId unique (R-IN-001). */
  readonly claims: readonly VerifiedClaimRef[];
  readonly overallReadiness: boolean;
}

/** The payload the model receives. */
export interface StoryArchitectRequestData {
  readonly verificationPackage: VerificationPackageRef;
  readonly topicOpportunity: TopicOpportunityRef;
  readonly storyConstraints?: StoryConstraints;
  readonly targetDurationSeconds: number;
  readonly language: Bcp47Tag;
}

export interface StoryArchitectAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StoryArchitectRequestMeta;
  readonly data: StoryArchitectRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — story-architect-agent-output/v1 · THE STORY ARCHITECTURE
 * ──────────────────────────────────────────────────────────────────────────── */

export interface StoryObjective {
  readonly viewer: string;
  readonly viewerProblem: string;
  readonly centralPromise: string;
  readonly transformationPayoff: string;
  readonly emotionalDirection: string;
  readonly editorialAngle: string;
  readonly expectedTakeaway: string;
}

export type HookType =
  | 'CONTRADICTION' | 'SURPRISING_RESULT' | 'QUESTION' | 'PROBLEM' | 'PROMISE'
  | 'DISCOVERY' | 'MISTAKE' | 'COMPARISON' | 'STORY_SETUP';

/** Structural definition only — never final narration (README §9). */
export interface Hook {
  readonly hookType: HookType;
  readonly curiosityMechanism: string;
  readonly viewerQuestion: string;
  /** MUST resolve to the request's claims (R-BUS-007); none may be DO_NOT_USE (R-BUS-005); USE_WITH_QUALIFICATION requires `qualification` (R-BUS-023). 0-6 items. */
  readonly claimRefs: readonly LocalKey[];
  readonly payoffExpectation: string;
  readonly approxDurationSeconds: number;
  /** Required when any claimRefs entry's downstreamSafety is USE_WITH_QUALIFICATION (R-BUS-023). Same semantic meaning as a beat's qualification field. */
  readonly qualification?: string;
}

export type BeatType =
  | 'HOOK' | 'CONTEXT' | 'PROBLEM' | 'QUESTION' | 'DISCOVERY' | 'EXPLANATION' | 'COMPARISON'
  | 'EVIDENCE' | 'COUNTERPOINT' | 'ESCALATION' | 'TURNING_POINT' | 'PAYOFF' | 'CONCLUSION' | 'CTA';

export type BeatImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** One structured story beat (README §10). Contains no final narration. */
export interface StoryBeat {
  readonly beatId: LocalKey;
  /** 1-based. Unique and contiguous across beats (R-BUS-002). */
  readonly order: number;
  readonly beatType: BeatType;
  readonly purpose: string;
  readonly viewerQuestion?: string;
  readonly expectedViewerState: string;
  /** MUST resolve to the request's claims (R-BUS-003); none DO_NOT_USE (R-BUS-005); USE_WITH_QUALIFICATION requires `qualification` (R-BUS-006). 0-6 items. */
  readonly claimRefs: readonly LocalKey[];
  /** MUST resolve to a supportingEvidenceIds entry of a supplied claim (R-BUS-004); owning claim may not be DO_NOT_USE (R-BUS-005). 0-6 items. */
  readonly evidenceRefs: readonly LocalKey[];
  readonly requiredConcepts: readonly string[];
  readonly transitionIntent?: string;
  readonly approxDurationSeconds: number;
  readonly importance: BeatImportance;
  readonly pacing: PacingValue;
  /** Required when any claimRefs entry's downstreamSafety is USE_WITH_QUALIFICATION (R-BUS-006). */
  readonly qualification?: string;
  /** MUST resolve to a declared researchGaps entry when present (R-BUS-014). */
  readonly researchGapRef?: LocalKey;
}

/** Deterministically checked against the request's targetDurationSeconds (README §12). */
export interface StoryDuration {
  /** MUST equal the request's targetDurationSeconds exactly (R-BUS-025). */
  readonly targetDurationSeconds: number;
  /** MUST equal the sum of beats[].approxDurationSeconds (R-BUS-009). */
  readonly totalBeatDurationSeconds: number;
  readonly toleranceRatio: 0.15;
  /** MUST equal |totalBeatDurationSeconds - targetDurationSeconds| / targetDurationSeconds <= toleranceRatio (R-BUS-010). */
  readonly withinTolerance: boolean;
}

export interface StoryPayoff {
  readonly description: string;
  readonly connectsToOpeningPromise: boolean;
  readonly connectsToCentralQuestion: boolean;
  readonly connectsToViewerProblem: boolean;
  /** MUST resolve to the request's claims (R-BUS-008); none DO_NOT_USE (R-BUS-005); USE_WITH_QUALIFICATION requires `qualification` (R-BUS-024). 0-6 items. */
  readonly resolutionClaimRefs: readonly LocalKey[];
  /** Required when any resolutionClaimRefs entry's downstreamSafety is USE_WITH_QUALIFICATION (R-BUS-024). Same semantic meaning as a beat's qualification field. */
  readonly qualification?: string;
}

export interface StoryConclusion {
  readonly summaryApproach: string;
  readonly finalTakeaway: string;
  readonly tone?: string;
}

export type CtaType = 'SUBSCRIBE' | 'WATCH_NEXT' | 'COMMENT' | 'RESOURCE' | 'NONE';

/** Structural CTA direction only — never final CTA copy (README §14). */
export interface CtaStrategy {
  readonly ctaType: CtaType;
  readonly rationale: string;
}

export type ResearchGapSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StoryResearchGap {
  readonly gapId: LocalKey;
  readonly relatedBeatId?: LocalKey;
  readonly description: string;
  readonly severity: ResearchGapSeverity;
  readonly impactOnStory: string;
}

export type DownstreamReadiness = 'READY_FOR_SCRIPT' | 'NOT_READY_FOR_SCRIPT';

export interface ReadinessBlocker {
  readonly blockerId: LocalKey;
  readonly description: string;
  readonly severity: ResearchGapSeverity;
}

export type StoryAssumptionBasis =
  | 'VERIFICATION_PACKAGE' | 'TOPIC_OPPORTUNITY' | 'TARGET_DURATION' | 'STORY_CONSTRAINTS' | 'LANGUAGE';

export interface StoryAssumption {
  readonly assumptionKey: LocalKey;
  readonly statement: string;
  readonly basis: StoryAssumptionBasis;
  readonly path: JsonPath;
}

export type StoryUnknownReason =
  | 'INPUT_NOT_SUPPLIED' | 'VERIFIED_CLAIMS_INSUFFICIENT' | 'NOT_DETERMINABLE_FROM_SUPPLIED_INPUT';

export interface DeclaredUnknown {
  readonly path: JsonPath;
  readonly reason: StoryUnknownReason;
}

export interface InputSufficiency {
  readonly value: Ratio;
  readonly basis: 'SELF_REPORTED';
  readonly limitations: readonly string[];
}

/**
 * THE STORY ARCHITECTURE — the single deliverable of AGT-04. A structured
 * BLUEPRINT for narration script writing, never final narration (README §1, §3). Every
 * factual element traces to a verified claim (README §5).
 */
export interface StoryArchitecture {
  readonly packageKind: 'STORY_ARCHITECTURE';
  /** MUST equal the request's topicOpportunity.topicId exactly (R-BUS-021). */
  readonly topicId: LocalKey;
  readonly storyObjective: StoryObjective;
  readonly hook: Hook;
  /** 2-30 items. beatId unique (R-BUS-001); order unique and contiguous from 1 (R-BUS-002). */
  readonly beats: readonly StoryBeat[];
  readonly pacingStrategy: string;
  readonly duration: StoryDuration;
  readonly payoff: StoryPayoff;
  readonly conclusion: StoryConclusion;
  readonly ctaStrategy: CtaStrategy;
  readonly researchGaps: readonly StoryResearchGap[];
  readonly downstreamReadiness: DownstreamReadiness;
  readonly readinessRationale: string;
  /** Required non-empty when NOT_READY_FOR_SCRIPT (R-BUS-016); required empty when READY_FOR_SCRIPT. */
  readonly readinessBlockers: readonly ReadinessBlocker[];
  readonly assumptions: readonly StoryAssumption[];
  readonly declaredUnknowns: readonly DeclaredUnknown[];
  readonly inputSufficiency: InputSufficiency;
}

export interface StoryArchitectAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StoryArchitectResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: StoryArchitecture;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface StoryArchitectAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: StoryArchitectResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export type StoryArchitectAgentResponse = StoryArchitectAgentSuccessResponse | StoryArchitectAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

export interface StoryArchitectRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

export type StoryArchitectModelOutput = StoryArchitecture | StoryArchitectRefusal;

/* ────────────────────────────────────────────────────────────────────────────
 * Validation surface (implemented in validator.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

export type RuleId = string;

export interface BusinessRuleDefinition<TSubject, TContext = undefined> {
  readonly ruleId: RuleId;
  readonly title: string;
  readonly dimension: 'INPUT' | 'OUTPUT';
  readonly severity: FindingSeverity;
  readonly evaluate: (subject: TSubject, context: TContext) => readonly ValidationFinding[];
}

export interface ValidationReport {
  readonly outcome: ValidationOutcome;
  readonly findings: readonly ValidationFinding[];
}

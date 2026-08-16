/**
 * AGT-06 — Script Reviewer Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `script-reviewer-agent-input/v1` and
 * `script-reviewer-agent-output/v1` exactly; the schemas remain the
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
 * Agent 06 is a REVIEWER, not a writer (README §1). It never rewrites
 * narration, never invents a replacement fact, quote, or source, and never
 * silently corrects the script it reviews — every defect it finds is
 * reported as a structured `ReviewIssue`, never fixed in place (README §2).
 *
 * @contract script-reviewer-agent-input/v1  1.0.0
 * @contract script-reviewer-agent-output/v1 1.0.0
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────────── */

export type IsoTimestamp = string;
export type Bcp47Tag = string;
export type SemanticVersion = string;
export type PrefixedId = string;
export type LocalKey = string;
export type JsonPath = string;
export type Ratio = number;

/* ────────────────────────────────────────────────────────────────────────────
 * Envelope (GDE-003 §4) — structurally identical to every prior agent's envelope
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

export interface ScriptReviewerRequestMeta {
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

export interface ScriptReviewerResponseMeta {
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

/** The registered error codes AGT-06 may emit (STD-000 §8.4). Closed. */
export type ScriptReviewerAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID'
  | 'VALIDATION.INPUT.TOPIC_ID_MISMATCH'
  | 'VALIDATION.INPUT.SCRIPT_NOT_READY'
  | 'VALIDATION.INPUT.STORY_NOT_READY'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION'
  | 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE'
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
  readonly code: ScriptReviewerAgentErrorCode;
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
 * INPUT — script-reviewer-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type ClaimType =
  | 'STATISTIC' | 'DATE' | 'DEFINITION' | 'TECHNICAL_FACT' | 'PRODUCT_FACT' | 'COMPARISON' | 'PRICE'
  | 'REGULATION' | 'EVENT' | 'HISTORICAL_FACT' | 'QUOTE' | 'CAUSAL_CLAIM' | 'OPINION' | 'FORECAST' | 'OTHER';

export type VerificationStatus =
  | 'VERIFIED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING' | 'OUTDATED' | 'NOT_VERIFIABLE';

export type DownstreamSafety = 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE';
export type FreshnessConcern = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

/** Present only when claimType is QUOTE. A script segment's quotation.speaker MUST equal this speaker exactly. */
export interface QuoteProvenanceRef {
  readonly speaker: string;
  readonly speakerConfirmed: boolean;
}

/** The subset of a verified Claim this agent needs to review a script without inventing a fact. */
export interface VerifiedClaimRef {
  readonly claimId: LocalKey;
  readonly claimText: string;
  readonly claimType: ClaimType;
  readonly verificationStatus: VerificationStatus;
  readonly downstreamSafety: DownstreamSafety;
  /** 0-15 items. What a script segment may cite via `evidenceRefs` for this claim. */
  readonly supportingEvidenceIds: readonly LocalKey[];
  readonly isTimeSensitive: boolean;
  readonly freshnessConcern: FreshnessConcern;
  readonly limitations: readonly string[];
  readonly notesForDownstream?: string;
  readonly quoteProvenance?: QuoteProvenanceRef;
}

/** The subset of the Verification Package this agent needs. */
export interface VerificationPackageRef {
  readonly topicId: LocalKey;
  /** 1-60 items. claimId unique (R-IN-005). */
  readonly claims: readonly VerifiedClaimRef[];
}

export type HookType =
  | 'CONTRADICTION' | 'SURPRISING_RESULT' | 'QUESTION' | 'PROBLEM' | 'PROMISE'
  | 'DISCOVERY' | 'MISTAKE' | 'COMPARISON' | 'STORY_SETUP';

/** The subset of the Story Architecture's `hook` this agent needs to check the script opens faithfully. */
export interface HookRef {
  readonly hookType: HookType;
  readonly curiosityMechanism: string;
  readonly viewerQuestion: string;
  readonly claimRefs: readonly LocalKey[];
  readonly payoffExpectation: string;
  readonly approxDurationSeconds: number;
  readonly qualification?: string;
}

export type BeatType =
  | 'HOOK' | 'CONTEXT' | 'PROBLEM' | 'QUESTION' | 'DISCOVERY' | 'EXPLANATION' | 'COMPARISON'
  | 'EVIDENCE' | 'COUNTERPOINT' | 'ESCALATION' | 'TURNING_POINT' | 'PAYOFF' | 'CONCLUSION' | 'CTA';

export type BeatImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PacingValue = 'FAST' | 'MODERATE' | 'SLOW';

/** The subset of a Story Architecture `StoryBeat` this agent needs. */
export interface StoryBeatRef {
  readonly beatId: LocalKey;
  /** 1-based. Unique and contiguous across beats. */
  readonly order: number;
  readonly beatType: BeatType;
  readonly purpose: string;
  readonly viewerQuestion?: string;
  readonly expectedViewerState: string;
  readonly claimRefs: readonly LocalKey[];
  readonly evidenceRefs: readonly LocalKey[];
  readonly requiredConcepts: readonly string[];
  readonly transitionIntent?: string;
  readonly approxDurationSeconds: number;
  readonly importance: BeatImportance;
  readonly pacing: PacingValue;
  readonly qualification?: string;
}

export interface StoryDurationRef {
  readonly targetDurationSeconds: number;
  readonly totalBeatDurationSeconds: number;
  readonly toleranceRatio: 0.15;
  readonly withinTolerance: boolean;
}

/** The subset of the Story Architecture's `payoff` this agent needs. */
export interface StoryPayoffRef {
  readonly description: string;
  readonly connectsToOpeningPromise: boolean;
  readonly connectsToCentralQuestion: boolean;
  readonly connectsToViewerProblem: boolean;
  readonly resolutionClaimRefs: readonly LocalKey[];
  readonly qualification?: string;
}

export interface StoryConclusionRef {
  readonly summaryApproach: string;
  readonly finalTakeaway: string;
  readonly tone?: string;
}

export type CtaType = 'SUBSCRIBE' | 'WATCH_NEXT' | 'COMMENT' | 'RESOURCE' | 'NONE';

export interface CtaStrategyRef {
  readonly ctaType: CtaType;
  readonly rationale: string;
}

export type StoryDownstreamReadiness = 'READY_FOR_SCRIPT' | 'NOT_READY_FOR_SCRIPT';

/** The subset of the Story Architecture this agent needs (GDE-002 §5.1 minimum-context principle). */
export interface StoryArchitectureRef {
  readonly topicId: LocalKey;
  readonly hook: HookRef;
  /** 2-30 items. beatId unique; order unique and contiguous from 1. */
  readonly beats: readonly StoryBeatRef[];
  readonly duration: StoryDurationRef;
  readonly payoff: StoryPayoffRef;
  readonly conclusion: StoryConclusionRef;
  readonly ctaStrategy: CtaStrategyRef;
  /** MUST be READY_FOR_SCRIPT (R-IN-002). */
  readonly downstreamReadiness: StoryDownstreamReadiness;
}

export type SegmentType =
  | 'HOOK' | 'INTRO' | 'CONTEXT' | 'PROBLEM' | 'QUESTION' | 'EXPLANATION' | 'EVIDENCE'
  | 'EXAMPLE' | 'COMPARISON' | 'COUNTERPOINT' | 'ESCALATION' | 'REVEAL' | 'PAYOFF'
  | 'CONCLUSION' | 'CTA' | 'TRANSITION';

export type DeliveryIntent =
  | 'CURIOSITY' | 'CLARITY' | 'URGENCY' | 'REASSURANCE' | 'CONTRAST' | 'CALL_TO_ACTION' | 'REFLECTION';

export type Emphasis = 'NONE' | 'LIGHT' | 'STRONG';

/** A direct quotation inside a segment, as emitted in the Narration Script. */
export interface QuotationRef {
  readonly claimId: LocalKey;
  readonly speaker: string;
  readonly quotedText: string;
}

/** The subset of a Narration Script `ScriptSegment` this agent needs to review it in full. */
export interface ScriptSegmentRef {
  readonly segmentId: LocalKey;
  /** 1-based. Unique and contiguous across segments. */
  readonly order: number;
  readonly beatRef: LocalKey;
  readonly segmentType: SegmentType;
  readonly narration: string;
  readonly estimatedDurationSeconds: number;
  readonly claimRefs: readonly LocalKey[];
  readonly evidenceRefs: readonly LocalKey[];
  readonly qualification?: string;
  readonly quotation?: QuotationRef;
  readonly deliveryIntent: DeliveryIntent;
  readonly transition?: string;
  readonly emphasis: Emphasis;
  readonly notes?: string;
}

export interface ScriptDurationRef {
  readonly targetDurationSeconds: number;
  readonly totalEstimatedDurationSeconds: number;
  readonly toleranceRatio: 0.15;
  readonly withinTolerance: boolean;
  readonly wordsPerMinute: 150;
}

export type ScriptWarningSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScriptWarningRef {
  readonly warningId: LocalKey;
  readonly relatedSegmentId?: LocalKey;
  readonly description: string;
  readonly severity: ScriptWarningSeverity;
}

export type ScriptDownstreamReadiness = 'READY_FOR_REVIEW' | 'NOT_READY_FOR_REVIEW';

export interface ScriptReadinessBlockerRef {
  readonly blockerId: LocalKey;
  readonly description: string;
  readonly severity: ScriptWarningSeverity;
}

/** The subset of the Narration Script this agent needs — effectively the whole thing, since it reviews the script in full. */
export interface NarrationScriptRef {
  readonly topicId: LocalKey;
  /** 2-80 items. segmentId unique; order unique and contiguous from 1. */
  readonly segments: readonly ScriptSegmentRef[];
  readonly scriptDuration: ScriptDurationRef;
  readonly wordCount: number;
  readonly warnings: readonly ScriptWarningRef[];
  /** MUST be READY_FOR_REVIEW (R-IN-001). */
  readonly downstreamReadiness: ScriptDownstreamReadiness;
  readonly readinessRationale: string;
  readonly readinessBlockers: readonly ScriptReadinessBlockerRef[];
}

export type ExpertiseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'MIXED';

export type ToneDescriptor =
  | 'AUTHORITATIVE' | 'CONVERSATIONAL' | 'ANALYTICAL' | 'ENERGETIC' | 'CALM'
  | 'WITTY' | 'EMPATHETIC' | 'DIRECT' | 'CURIOUS' | 'PRAGMATIC' | 'OPTIMISTIC' | 'IRREVERENT';

/**
 * The subset of the Strategy Manifest/Topic Candidates audience definition this agent needs to judge
 * audience fit — identical shape in spirit to the Strategy Manifest's own
 * `AudienceDefinition`/`BrandBinding` and the Topic Candidates' `StrategyAudienceRef`
 * (GDE-002 §5.4 minimum-context principle applied across the widest
 * upstream gap in this pipeline).
 */
export interface AudienceContextRef {
  readonly primarySegment: string;
  readonly expertiseLevel: ExpertiseLevel;
  /** 1-4 items. The permitted tone vocabulary this script is judged against. */
  readonly toneDescriptors: readonly ToneDescriptor[];
}

/** The payload the model receives. */
export interface ScriptReviewerRequestData {
  readonly script: NarrationScriptRef;
  readonly storyArchitecture: StoryArchitectureRef;
  readonly verificationPackage: VerificationPackageRef;
  readonly audienceContext: AudienceContextRef;
  readonly language: Bcp47Tag;
}

export interface ScriptReviewerAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptReviewerRequestMeta;
  readonly data: ScriptReviewerRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — script-reviewer-agent-output/v1 · THE REVIEW REPORT
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReviewDecision = 'APPROVED' | 'REPAIR_REQUIRED' | 'REGENERATION_REQUIRED' | 'REJECTED';
export type NextAction = 'CONTINUE' | 'REPAIR_SCRIPT' | 'REGENERATE_SCRIPT' | 'REJECT';

/** The exact machine-readable summary block (README §7, system-prompt.md block 5). */
export interface ReviewSummary {
  readonly decision: ReviewDecision;
  /** MUST equal (decision === 'APPROVED') (R-BUS-009). */
  readonly readyForScenePlanning: boolean;
  /** MUST equal the count of issues with blocking === true (R-BUS-006). */
  readonly blockingIssueCount: number;
  /** MUST equal the count of issues with severity HIGH (R-BUS-007). */
  readonly highSeverityIssueCount: number;
  /** MUST equal the count of issues with repairability REPAIRABLE (R-BUS-008). */
  readonly repairableIssueCount: number;
}

export type IssueCategory =
  | 'UNSUPPORTED_CLAIM' | 'CLAIM_REFERENCE_MISMATCH' | 'DO_NOT_USE_VIOLATION' | 'QUALIFICATION_MISSING'
  | 'NUMERIC_DRIFT' | 'UNSUPPORTED_QUOTE' | 'UNSUPPORTED_CAUSAL_CLAIM' | 'UNSUPPORTED_COMPARISON'
  | 'CONFLICTING_PRESENTED_AS_CERTAIN' | 'OUTDATED_PRESENTED_AS_CURRENT'
  | 'STORY_ALIGNMENT' | 'STRUCTURAL_COMPLETENESS' | 'DURATION' | 'SPOKEN_LANGUAGE_QUALITY'
  | 'AUDIENCE_FIT' | 'ENGAGEMENT' | 'SAFETY' | 'CALL_TO_ACTION';

export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Repairability = 'REPAIRABLE' | 'NOT_REPAIRABLE';

/**
 * Which pass produced this issue. `DETERMINISTIC` issues are ones the
 * validator itself can independently re-derive from the request data alone
 * (README §9) — the model is expected to surface them too, and a
 * deterministic ground-truth rule checks that it did (`R-BUS-014`–`022`).
 * `MODEL_ASSESSED` issues are semantic judgements (clarity, engagement,
 * naturalness, audience fit) no deterministic rule can re-derive.
 */
export type IssueBasis = 'DETERMINISTIC' | 'MODEL_ASSESSED';

/**
 * One reviewer finding. Never contains replacement narration, a corrected
 * number, or a rewritten sentence — the schema has no field capable of
 * holding one, and `recommendation` is capped well below full-paragraph
 * length (README §4, system-prompt.md §4d).
 */
export interface ReviewIssue {
  readonly issueId: LocalKey;
  readonly category: IssueCategory;
  readonly severity: IssueSeverity;
  readonly basis: IssueBasis;
  /** A human-readable pointer to where the issue was found, e.g. a segment id or a JSON path. */
  readonly location: string;
  readonly description: string;
  /** MUST resolve to a segmentId in the request's script.segments, when present (R-BUS-002). */
  readonly affectedSegmentId?: LocalKey;
  /** MUST resolve to a beatId in the request's storyArchitecture.beats, when present (R-BUS-003). */
  readonly affectedBeatId?: LocalKey;
  /** MUST resolve to the request's verificationPackage.claims (R-BUS-004). 0-6 items. */
  readonly affectedClaimIds: readonly LocalKey[];
  /** MUST resolve to a supportingEvidenceIds entry of a supplied claim (R-BUS-005). 0-6 items. */
  readonly affectedEvidenceIds: readonly LocalKey[];
  /** Guidance for a human or for the next narration script writing attempt — never replacement narration itself. */
  readonly recommendation: string;
  readonly repairability: Repairability;
  /** Whether this issue alone prevents APPROVED (README §3). */
  readonly blocking: boolean;
  readonly confidence: Ratio;
}

export type DimensionStatus = 'STRONG' | 'ACCEPTABLE' | 'WEAK' | 'FAILING';

export interface DimensionAssessment {
  readonly status: DimensionStatus;
  readonly notes?: string;
}

/** Fifteen controlled per-dimension assessments — never a single 0-100 score (README §6). */
export interface ReviewDimensions {
  readonly factualAccuracy: DimensionAssessment;
  readonly claimProvenance: DimensionAssessment;
  readonly storyAlignment: DimensionAssessment;
  readonly narrativeQuality: DimensionAssessment;
  readonly clarity: DimensionAssessment;
  readonly pacing: DimensionAssessment;
  readonly audienceFit: DimensionAssessment;
  readonly engagement: DimensionAssessment;
  readonly qualificationPreservation: DimensionAssessment;
  readonly numericalAccuracy: DimensionAssessment;
  readonly quoteAccuracy: DimensionAssessment;
  readonly durationAccuracy: DimensionAssessment;
  readonly completeness: DimensionAssessment;
  readonly callToAction: DimensionAssessment;
  readonly safetyCompliance: DimensionAssessment;
}

export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface ReviewCheckResult {
  readonly status: CheckStatus;
  readonly summary: string;
}

/**
 * THE REVIEW REPORT — the single deliverable of AGT-06. Structured findings
 * about the narration script under review, never a rewritten script, never a replacement
 * fact, never new evidence, never a new source (README §1, §4).
 */
export interface ReviewReport {
  readonly packageKind: 'REVIEW_REPORT';
  /** MUST equal the request's script.topicId exactly (R-BUS-023). */
  readonly topicId: LocalKey;
  readonly summary: ReviewSummary;
  readonly nextAction: NextAction;
  readonly dimensions: ReviewDimensions;
  /** 0-100 items. issueId unique (R-BUS-001). */
  readonly issues: readonly ReviewIssue[];
  readonly factualIntegrityResult: ReviewCheckResult;
  readonly provenanceResult: ReviewCheckResult;
  readonly architectureAlignmentResult: ReviewCheckResult;
  readonly durationResult: ReviewCheckResult;
  readonly audienceResult: ReviewCheckResult;
  readonly engagementResult: ReviewCheckResult;
  readonly safetyResult: ReviewCheckResult;
  /** 0-10 items. General guidance only — never replacement narration (README §4). */
  readonly recommendations: readonly string[];
  readonly reviewRationale: string;
}

export interface ScriptReviewerAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptReviewerResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: ReviewReport;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface ScriptReviewerAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptReviewerResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export type ScriptReviewerAgentResponse = ScriptReviewerAgentSuccessResponse | ScriptReviewerAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

export interface ScriptReviewerRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

export type ScriptReviewerModelOutput = ReviewReport | ScriptReviewerRefusal;

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

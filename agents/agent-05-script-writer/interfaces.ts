/**
 * AGT-05 — Script Writer Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `script-writer-agent-input/v1` and
 * `script-writer-agent-output/v1` exactly; the schemas remain the
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
 * Agent 05 is a WRITER, not a researcher or verifier (README §1). It never
 * invents a factual claim, a quote, a statistic, or a source; every factual
 * script segment traces to a Story Architecture story beat and, through it, to
 * a verified claim (README §4).
 *
 * @contract script-writer-agent-input/v1  1.0.0
 * @contract script-writer-agent-output/v1 1.0.0
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

export interface ScriptWriterRequestMeta {
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

export interface ScriptWriterResponseMeta {
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

/** The registered error codes AGT-05 may emit (STD-000 §8.4). Closed. */
export type ScriptWriterAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID'
  | 'VALIDATION.INPUT.TOPIC_ID_MISMATCH'
  | 'VALIDATION.INPUT.STORY_NOT_READY'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE'
  | 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST'
  | 'AI_OUTPUT.CONTENT.FABRICATED_QUOTE'
  | 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER'
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
  readonly code: ScriptWriterAgentErrorCode;
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
 * INPUT — script-writer-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type ClaimType =
  | 'STATISTIC' | 'DATE' | 'DEFINITION' | 'TECHNICAL_FACT' | 'PRODUCT_FACT' | 'COMPARISON' | 'PRICE'
  | 'REGULATION' | 'EVENT' | 'HISTORICAL_FACT' | 'QUOTE' | 'CAUSAL_CLAIM' | 'OPINION' | 'FORECAST' | 'OTHER';

export type VerificationStatus =
  | 'VERIFIED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING' | 'OUTDATED' | 'NOT_VERIFIABLE';

export type DownstreamSafety = 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE';
export type FreshnessConcern = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

/** The subset of a verified claim's quote provenance this agent needs to write (never fabricate) a quotation. */
export interface QuoteProvenanceRef {
  readonly speaker: string;
  readonly speakerConfirmed: boolean;
}

/**
 * The subset of a verified Claim this agent needs. `downstreamSafety` is
 * the Verification Package's fixed, already-validated determination — this agent respects it
 * absolutely and never re-derives or overrides it (README §4), identical in
 * spirit to Agent 04's own `VerifiedClaimRef`.
 */
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
  /** Present only when claimType is QUOTE. A segment's `quotation.speaker` MUST equal this speaker exactly (R-BUS-014). */
  readonly quoteProvenance?: QuoteProvenanceRef;
}

/** The subset of the Verification Package this agent needs. */
export interface VerificationPackageRef {
  readonly topicId: LocalKey;
  /** 1-60 items. claimId unique (R-IN-003). */
  readonly claims: readonly VerifiedClaimRef[];
}

export type HookType =
  | 'CONTRADICTION' | 'SURPRISING_RESULT' | 'QUESTION' | 'PROBLEM' | 'PROMISE'
  | 'DISCOVERY' | 'MISTAKE' | 'COMPARISON' | 'STORY_SETUP';

/** The subset of the Story Architecture's `hook` this agent needs to open the script faithfully. */
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
  /** MUST resolve to the request's verificationPackage.claims (R-BUS-004). 0-6 items. */
  readonly claimRefs: readonly LocalKey[];
  /** MUST resolve to a supportingEvidenceIds entry of one of THIS beat's own claims (R-BUS-005). 0-6 items. */
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

/**
 * The subset of the Story Architecture this agent needs
 * (GDE-002 §5.1 minimum-context principle). `storyObjective`, `pacingStrategy`,
 * `researchGaps`, `readinessBlockers`, `assumptions`, `declaredUnknowns`, and
 * `inputSufficiency` are the Story Architecture's own internal reasoning surface and are not
 * required here.
 */
export interface StoryArchitectureRef {
  readonly topicId: LocalKey;
  readonly hook: HookRef;
  /** 2-30 items. beatId unique; order unique and contiguous from 1. */
  readonly beats: readonly StoryBeatRef[];
  readonly duration: StoryDurationRef;
  readonly payoff: StoryPayoffRef;
  readonly conclusion: StoryConclusionRef;
  readonly ctaStrategy: CtaStrategyRef;
  /** MUST be READY_FOR_SCRIPT (R-IN-001) — a NOT_READY_FOR_SCRIPT architecture cannot be scripted. */
  readonly downstreamReadiness: StoryDownstreamReadiness;
}

/** The payload the model receives. */
export interface ScriptWriterRequestData {
  readonly storyArchitecture: StoryArchitectureRef;
  readonly verificationPackage: VerificationPackageRef;
  readonly language: Bcp47Tag;
}

export interface ScriptWriterAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptWriterRequestMeta;
  readonly data: ScriptWriterRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — script-writer-agent-output/v1 · THE NARRATION SCRIPT
 * ──────────────────────────────────────────────────────────────────────────── */

export type SegmentType =
  | 'HOOK' | 'INTRO' | 'CONTEXT' | 'PROBLEM' | 'QUESTION' | 'EXPLANATION' | 'EVIDENCE'
  | 'EXAMPLE' | 'COMPARISON' | 'COUNTERPOINT' | 'ESCALATION' | 'REVEAL' | 'PAYOFF'
  | 'CONCLUSION' | 'CTA' | 'TRANSITION';

/**
 * The narrative/emotional intent this segment is delivered with — a
 * controlled vocabulary so downstream voice direction (a later agent, not
 * this one) has something structured to read, never free-text stage
 * direction (README §11).
 */
export type DeliveryIntent =
  | 'CURIOSITY' | 'CLARITY' | 'URGENCY' | 'REASSURANCE' | 'CONTRAST' | 'CALL_TO_ACTION' | 'REFLECTION';

export type Emphasis = 'NONE' | 'LIGHT' | 'STRONG';

/**
 * A direct quotation inside a segment. MUST trace to a QUOTE-type claim the
 * same segment already cites via `claimRefs`; `quotedText` MUST equal that
 * claim's `claimText` exactly and `speaker` MUST equal its
 * `quoteProvenance.speaker` exactly (R-BUS-014, R-BUS-015) — never a
 * fabricated quote, and never a paraphrase promoted into quotation marks.
 */
export interface Quotation {
  readonly claimId: LocalKey;
  readonly speaker: string;
  readonly quotedText: string;
}

/**
 * One unit of spoken narration (README §7). Every segment traces to exactly
 * one Story Architecture story beat via `beatRef`; every factual statement inside
 * `narration` traces to a claim in `claimRefs`, and every `evidenceRefs`
 * entry traces to one of those same claims (README §8, §9).
 */
export interface ScriptSegment {
  readonly segmentId: LocalKey;
  /** 1-based. Unique and contiguous across segments (R-BUS-002). */
  readonly order: number;
  /** MUST resolve to a beatId in the request's storyArchitecture.beats (R-BUS-003). */
  readonly beatRef: LocalKey;
  readonly segmentType: SegmentType;
  /** The actual spoken script text for this segment. Natural, spoken-language prose — never markdown, never a heading. */
  readonly narration: string;
  readonly estimatedDurationSeconds: number;
  /** MUST resolve to the request's verificationPackage.claims (R-BUS-004); none may be DO_NOT_USE (R-BUS-006); USE_WITH_QUALIFICATION requires `qualification` (R-BUS-007). 0-6 items. */
  readonly claimRefs: readonly LocalKey[];
  /** MUST resolve to a supportingEvidenceIds entry of one of THIS segment's own claimRefs (R-BUS-005, R-BUS-008). 0-6 items. */
  readonly evidenceRefs: readonly LocalKey[];
  /** Required when any claimRefs entry's downstreamSafety is USE_WITH_QUALIFICATION (R-BUS-007). */
  readonly qualification?: string;
  readonly quotation?: Quotation;
  readonly deliveryIntent: DeliveryIntent;
  /** A short editorial bridge to the next segment. Not spoken narration; excluded from word count and duration. */
  readonly transition?: string;
  readonly emphasis: Emphasis;
  /** Editorial note for a downstream human/agent. Not spoken; excluded from word count and duration. */
  readonly notes?: string;
}

/** Deterministically checked against the request's storyArchitecture.duration.targetDurationSeconds (README §13). */
export interface ScriptDuration {
  /** MUST equal storyArchitecture.duration.targetDurationSeconds exactly (R-BUS-018). */
  readonly targetDurationSeconds: number;
  /** MUST equal the sum of segments[].estimatedDurationSeconds (R-BUS-017). */
  readonly totalEstimatedDurationSeconds: number;
  readonly toleranceRatio: 0.15;
  /** MUST equal |totalEstimatedDurationSeconds - targetDurationSeconds| / targetDurationSeconds <= toleranceRatio (R-BUS-019). */
  readonly withinTolerance: boolean;
  /** Fixed, deterministic speech rate this script's timing is derived from (R-BUS-020). See `SCRIPT_WORDS_PER_MINUTE` in validator.ts. */
  readonly wordsPerMinute: 150;
}

export type ScriptWarningSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/** A structured, non-blocking concern the model itself surfaces about the script it produced (README §16). */
export interface ScriptWarning {
  readonly warningId: LocalKey;
  readonly relatedSegmentId?: LocalKey;
  readonly description: string;
  readonly severity: ScriptWarningSeverity;
}

export type ScriptDownstreamReadiness = 'READY_FOR_REVIEW' | 'NOT_READY_FOR_REVIEW';

export interface ScriptReadinessBlocker {
  readonly blockerId: LocalKey;
  readonly description: string;
  readonly severity: ScriptWarningSeverity;
}

/**
 * THE NARRATION SCRIPT — the single deliverable of AGT-05. Complete,
 * natural-language, spoken-ready narration built strictly from the
 * Story Architecture and its verified claims (README §1). Contains no
 * scene plan, no image prompt, no voice setting, and no caption — those
 * belong to later agents (README §3).
 */
export interface NarrationScript {
  readonly packageKind: 'NARRATION_SCRIPT';
  /** MUST equal the request's storyArchitecture.topicId exactly (R-BUS-025). */
  readonly topicId: LocalKey;
  /** 2-80 items. segmentId unique (R-BUS-001); order unique and contiguous from 1 (R-BUS-002). */
  readonly segments: readonly ScriptSegment[];
  readonly scriptDuration: ScriptDuration;
  /** MUST equal the actual word count of every segment's narration, concatenated (R-BUS-021). Never trusted over the calculated value. */
  readonly wordCount: number;
  readonly warnings: readonly ScriptWarning[];
  readonly downstreamReadiness: ScriptDownstreamReadiness;
  readonly readinessRationale: string;
  /** Required non-empty when NOT_READY_FOR_REVIEW (R-BUS-023); required empty when READY_FOR_REVIEW. */
  readonly readinessBlockers: readonly ScriptReadinessBlocker[];
}

export interface ScriptWriterAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptWriterResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: NarrationScript;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface ScriptWriterAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScriptWriterResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export type ScriptWriterAgentResponse = ScriptWriterAgentSuccessResponse | ScriptWriterAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

export interface ScriptWriterRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

export type ScriptWriterModelOutput = NarrationScript | ScriptWriterRefusal;

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

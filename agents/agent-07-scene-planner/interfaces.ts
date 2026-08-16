/**
 * AGT-07 — Scene Planner Agent · Type contracts
 *
 * Types only. No implementation, no runtime values, no classes, no decorators.
 * Generated shape mirrors `scene-planner-agent-input/v1` and
 * `scene-planner-agent-output/v1` exactly; the schemas remain the
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
 * Agent 07 is a PLANNER, not a producer (README §1). It never generates an
 * image, a video, a voice instruction, a caption, or a final visual/asset
 * prompt; it never rewrites the script; it never introduces a new factual
 * claim. It describes WHAT each scene needs — Agent 08 decides HOW to
 * execute it visually (README §2).
 *
 * @contract scene-planner-agent-input/v1  1.0.0
 * @contract scene-planner-agent-output/v1 1.0.0
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

export interface ScenePlannerRequestMeta {
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

export interface ScenePlannerResponseMeta {
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

/** The registered error codes AGT-07 may emit (STD-000 §8.4). Closed. */
export type ScenePlannerAgentErrorCode =
  | 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING'
  | 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED'
  | 'VALIDATION.INPUT.DUPLICATE_CLAIM_ID'
  | 'VALIDATION.INPUT.TOPIC_ID_MISMATCH'
  | 'VALIDATION.INPUT.SCRIPT_NOT_READY'
  | 'VALIDATION.INPUT.STORY_NOT_READY'
  | 'VALIDATION.INPUT.REVIEW_NOT_APPROVED'
  | 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY'
  | 'AI_OUTPUT.JSON.PARSE_FAILED'
  | 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED'
  | 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM'
  | 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE'
  | 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST'
  | 'AI_OUTPUT.CONTENT.FABRICATED_QUOTE'
  | 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER'
  | 'AI_OUTPUT.CONTENT.TIMELINE_INVALID'
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
  readonly code: ScenePlannerAgentErrorCode;
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
 * INPUT — scene-planner-agent-input/v1
 * ──────────────────────────────────────────────────────────────────────────── */

export type ClaimType =
  | 'STATISTIC' | 'DATE' | 'DEFINITION' | 'TECHNICAL_FACT' | 'PRODUCT_FACT' | 'COMPARISON' | 'PRICE'
  | 'REGULATION' | 'EVENT' | 'HISTORICAL_FACT' | 'QUOTE' | 'CAUSAL_CLAIM' | 'OPINION' | 'FORECAST' | 'OTHER';

export type VerificationStatus =
  | 'VERIFIED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING' | 'OUTDATED' | 'NOT_VERIFIABLE';

export type DownstreamSafety = 'SAFE_TO_USE' | 'USE_WITH_QUALIFICATION' | 'DO_NOT_USE';
export type FreshnessConcern = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

/** Present only when claimType is QUOTE. A scene's quotation.speaker MUST equal this speaker exactly. */
export interface QuoteProvenanceRef {
  readonly speaker: string;
  readonly speakerConfirmed: boolean;
}

/** The subset of a verified Claim this agent needs to plan visuals without inventing a fact. */
export interface VerifiedClaimRef {
  readonly claimId: LocalKey;
  readonly claimText: string;
  readonly claimType: ClaimType;
  readonly verificationStatus: VerificationStatus;
  readonly downstreamSafety: DownstreamSafety;
  /** 0-15 items. What a scene may cite via `evidenceRefs` for this claim. */
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
  /** 1-60 items. claimId unique (R-IN-009). */
  readonly claims: readonly VerifiedClaimRef[];
}

export type HookType =
  | 'CONTRADICTION' | 'SURPRISING_RESULT' | 'QUESTION' | 'PROBLEM' | 'PROMISE'
  | 'DISCOVERY' | 'MISTAKE' | 'COMPARISON' | 'STORY_SETUP';

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
  /** MUST be READY_FOR_SCRIPT (R-IN-005). */
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

/** The subset of a Narration Script `ScriptSegment` this agent needs to plan its visuals. */
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

export type ScriptDownstreamReadiness = 'READY_FOR_REVIEW' | 'NOT_READY_FOR_REVIEW';

/** The subset of the Narration Script this agent needs — effectively the whole thing, since every scene must map back to it. */
export interface NarrationScriptRef {
  readonly topicId: LocalKey;
  /** 2-80 items. segmentId unique; order unique and contiguous from 1. */
  readonly segments: readonly ScriptSegmentRef[];
  readonly scriptDuration: ScriptDurationRef;
  readonly wordCount: number;
  /** MUST be READY_FOR_REVIEW (R-IN-001). */
  readonly downstreamReadiness: ScriptDownstreamReadiness;
}

export type ReviewDecision = 'APPROVED' | 'REPAIR_REQUIRED' | 'REGENERATION_REQUIRED' | 'REJECTED';
export type NextAction = 'CONTINUE' | 'REPAIR_SCRIPT' | 'REGENERATE_SCRIPT' | 'REJECT';

/**
 * The subset of the Review Report this agent needs. This is the
 * approval gate: Agent 07 MUST NOT plan scenes for a script the Review Report has not
 * approved (README §3). `topicId` here is the Review Report's own echoed topic
 * identity (`script-reviewer-agent-output/v1` `R-BUS-023`), used to confirm
 * the review actually pertains to the topic this request otherwise agrees
 * on (R-IN-008) — this pipeline has no other cross-artifact identity
 * primitive than `topicId` (README §6).
 */
export interface ReviewResultRef {
  readonly topicId: LocalKey;
  readonly decision: ReviewDecision;
  /** MUST be true (R-IN-004) — the Review Report's own readiness determination, echoed. */
  readonly readyForScenePlanning: boolean;
  /** MUST be CONTINUE (R-IN-003). */
  readonly nextAction: NextAction;
}

/** The payload the model receives. */
export interface ScenePlannerRequestData {
  readonly script: NarrationScriptRef;
  readonly reviewResult: ReviewResultRef;
  readonly storyArchitecture: StoryArchitectureRef;
  readonly verificationPackage: VerificationPackageRef;
  readonly language: Bcp47Tag;
}

export interface ScenePlannerAgentRequest {
  readonly contractVersion: '1.0';
  readonly contractType: 'REQUEST';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScenePlannerRequestMeta;
  readonly data: ScenePlannerRequestData;
  readonly references?: readonly ContractReference[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTPUT — scene-planner-agent-output/v1 · THE SCENE PLAN
 * ──────────────────────────────────────────────────────────────────────────── */

export type SceneType =
  | 'TITLE_CARD' | 'HOOK_VISUAL' | 'TALKING_POINT' | 'CONCEPT' | 'DIAGRAM' | 'DATA' | 'COMPARISON'
  | 'PRODUCT_DEMO' | 'SCREEN_RECORDING' | 'CODE' | 'UI' | 'DOCUMENT' | 'TIMELINE' | 'QUOTE'
  | 'MAP' | 'PROCESS' | 'B_ROLL' | 'TRANSITION' | 'PAYOFF' | 'CTA';

export type VisualImportance = 'PRIMARY' | 'SECONDARY' | 'SUPPORTING';

export type VisualElementType =
  | 'UI_SCREEN' | 'DIAGRAM' | 'CHART' | 'ICON_SET' | 'TEXT_OVERLAY' | 'PRODUCT_SHOT'
  | 'CODE_BLOCK' | 'DOCUMENT_VIEW' | 'MAP_VIEW' | 'TIMELINE_GRAPHIC' | 'COMPARISON_TABLE'
  | 'B_ROLL_CONCEPT' | 'ANIMATION_CONCEPT' | 'SCREEN_RECORDING_CONCEPT' | 'DATA_VISUAL';

/** A structural description of what a scene needs to show — never a final image/video prompt (README §4). */
export interface VisualElement {
  readonly type: VisualElementType;
  readonly description: string;
  readonly importance: VisualImportance;
}

export type AssetCategory =
  | 'PRODUCT_SCREENSHOT' | 'UI_CAPTURE' | 'ICON' | 'DIAGRAM' | 'CHART' | 'STOCK_VIDEO'
  | 'STOCK_IMAGE' | 'GENERATED_IMAGE' | 'GENERATED_VIDEO' | 'SCREEN_RECORDING' | 'TEXT_GRAPHIC';

/** A category of asset the scene needs — never a selected, downloaded, or generated asset (README §12). */
export interface AssetRequirement {
  readonly category: AssetCategory;
  readonly description: string;
  readonly importance: VisualImportance;
}

export type TransitionIntent = 'CUT' | 'FADE' | 'MATCH' | 'CONTINUE' | 'WIPE' | 'NONE';

export type OnScreenTextKind =
  | 'TITLE' | 'STATISTIC' | 'FEATURE_NAME' | 'COMPARISON_LABEL' | 'DIAGRAM_LABEL' | 'KEY_TAKEAWAY';

/**
 * What information should appear on screen — never rendered caption text
 * (README §13, Agent 11's responsibility). A `STATISTIC` entry MUST carry a
 * `claimRef` already present in the scene's own `claimRefs` (R-BUS-013).
 */
export interface OnScreenTextItem {
  readonly kind: OnScreenTextKind;
  readonly text: string;
  readonly claimRef?: LocalKey;
}

/** A quotation a scene visually represents. Structurally identical to Agent 05/06's own `Quotation`. */
export interface SceneQuotation {
  readonly claimId: LocalKey;
  readonly speaker: string;
  readonly quotedText: string;
}

/**
 * One planned scene (README §5). Every scene traces to one or more Narration Script
 * script segments via `segmentRefs`; every factual visual element traces to
 * a claim in `claimRefs`, and every `evidenceRefs` entry traces to one of
 * those same claims (README §7, §8).
 */
export interface Scene {
  readonly sceneId: LocalKey;
  /** 1-based. Unique and contiguous across scenes (R-BUS-002). */
  readonly order: number;
  /** MUST resolve to segmentId values in the request's script.segments (R-BUS-003). 1-10 items. */
  readonly segmentRefs: readonly LocalKey[];
  /** MUST resolve to a beatId in the request's storyArchitecture.beats, when present (R-BUS-004). */
  readonly beatRef?: LocalKey;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
  /** MUST equal endTimeSeconds - startTimeSeconds (R-BUS-016). */
  readonly durationSeconds: number;
  readonly sceneType: SceneType;
  readonly visualPurpose: string;
  /** 1-6 items. */
  readonly visualElements: readonly VisualElement[];
  /** 0-6 items. Factual bullets this scene shows on screen. */
  readonly informationToShow: readonly string[];
  /** MUST resolve to the request's verificationPackage.claims (R-BUS-005); none may be DO_NOT_USE (R-BUS-008); USE_WITH_QUALIFICATION requires `qualification` (R-BUS-009). 0-6 items. */
  readonly claimRefs: readonly LocalKey[];
  /** MUST resolve to a supportingEvidenceIds entry of one of THIS scene's own claimRefs (R-BUS-006, R-BUS-007). 0-6 items. */
  readonly evidenceRefs: readonly LocalKey[];
  /** Required when any claimRefs entry's downstreamSafety is USE_WITH_QUALIFICATION (R-BUS-009). */
  readonly qualification?: string;
  readonly quotation?: SceneQuotation;
  readonly continuity?: string;
  readonly transition: TransitionIntent;
  /** 0-4 items. */
  readonly onScreenTextIntent: readonly OnScreenTextItem[];
  /** 1-6 items. */
  readonly assetRequirements: readonly AssetRequirement[];
  readonly downstreamNotes?: string;
}

/** Deterministically checked against the request's script.scriptDuration.targetDurationSeconds (README §9). */
export interface PlanDuration {
  /** MUST equal script.scriptDuration.targetDurationSeconds exactly (R-BUS-021). */
  readonly targetDurationSeconds: number;
  /** MUST equal the sum of scenes[].durationSeconds (R-BUS-020). */
  readonly totalPlannedDurationSeconds: number;
  readonly toleranceRatio: 0.15;
  /** MUST equal |totalPlannedDurationSeconds - targetDurationSeconds| / targetDurationSeconds <= toleranceRatio (R-BUS-022). */
  readonly withinTolerance: boolean;
}

export type ScenePlanWarningSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScenePlanWarning {
  readonly warningId: LocalKey;
  readonly relatedSceneId?: LocalKey;
  readonly description: string;
  readonly severity: ScenePlanWarningSeverity;
}

export type ScenePlanDownstreamReadiness = 'READY_FOR_VISUAL_DIRECTION' | 'NOT_READY_FOR_VISUAL_DIRECTION';

export interface ScenePlanReadinessBlocker {
  readonly blockerId: LocalKey;
  readonly description: string;
  readonly severity: ScenePlanWarningSeverity;
}

/**
 * THE SCENE PLAN — the single deliverable of AGT-07. A structured visual
 * BLUEPRINT for Agent 08, never a final image/video prompt, never a
 * generated asset (README §1, §4).
 */
export interface ScenePlan {
  readonly packageKind: 'SCENE_PLAN';
  /** MUST equal the request's script.topicId exactly (R-BUS-026). */
  readonly topicId: LocalKey;
  /** 2-100 items. sceneId unique (R-BUS-001); order unique and contiguous from 1 (R-BUS-002). */
  readonly scenes: readonly Scene[];
  readonly planDuration: PlanDuration;
  readonly warnings: readonly ScenePlanWarning[];
  readonly downstreamReadiness: ScenePlanDownstreamReadiness;
  readonly readinessRationale: string;
  /** Required non-empty when NOT_READY_FOR_VISUAL_DIRECTION (R-BUS-023); required empty when READY_FOR_VISUAL_DIRECTION. */
  readonly readinessBlockers: readonly ScenePlanReadinessBlocker[];
}

export interface ScenePlannerAgentSuccessResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'RESPONSE';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScenePlannerResponseMeta;
  readonly status: 'SUCCESS';
  readonly data: ScenePlan;
  readonly issues?: readonly StandardError[];
  readonly validation?: ValidationBlock;
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export interface ScenePlannerAgentErrorResponse {
  readonly contractVersion: '1.0';
  readonly contractType: 'ERROR';
  readonly schemaVersion: SemanticVersion;
  readonly meta: ScenePlannerResponseMeta;
  readonly status: 'FAILURE';
  readonly issues: readonly StandardError[];
  readonly execution?: ExecutionBlock;
  readonly references?: readonly ContractReference[];
}

export type ScenePlannerAgentResponse = ScenePlannerAgentSuccessResponse | ScenePlannerAgentErrorResponse;

/* ────────────────────────────────────────────────────────────────────────────
 * Raw model output — before the runtime wraps it in an envelope
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefusalReasonCode =
  | 'INPUT_MISSING' | 'INPUT_MALFORMED' | 'INPUT_CONTRADICTORY' | 'OUT_OF_SCOPE' | 'INSTRUCTION_IN_DATA';

export interface ScenePlannerRefusal {
  readonly refusal: {
    readonly reasonCode: RefusalReasonCode;
    readonly details: string;
  };
}

export type ScenePlannerModelOutput = ScenePlan | ScenePlannerRefusal;

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

import { Injectable, Logger } from '@nestjs/common';

import type {
  AudienceContextRef as ReviewerAudienceContextRef,
  NarrationScriptRef as ReviewerNarrationScriptRef,
  ScriptReviewerAgentRequest,
  StoryArchitectureRef as ReviewerStoryArchitectureRef,
  VerificationPackageRef as ReviewerVerificationPackageRef,
  ReviewReport,
} from '@agents/agent-06-script-reviewer/interfaces';
import { ScriptReviewerService } from '../agents/script-reviewer/script-reviewer.service';

import type { StrategyAgentRequest, StrategyManifest } from '@agents/agent-00-strategy/interfaces';
import { StrategyService } from '../agents/strategy/strategy.service';

import type {
  StrategyBinding,
  TopicDiscoveryAgentRequest,
  TopicOpportunity,
} from '@agents/agent-01-topic-discovery/interfaces';
import { TopicDiscoveryService } from '../agents/topic-discovery/topic-discovery.service';

import type {
  ResearchAgentRequest,
  ResearchPackage,
  TopicOpportunityRef as ResearchTopicOpportunityRef,
} from '@agents/agent-02-research/interfaces';
import { ResearchService } from '../agents/research/research.service';

import type {
  FactVerificationAgentRequest,
  ResearchPackageRef,
  VerificationPackage,
} from '@agents/agent-03-fact-verification/interfaces';
import { FactVerificationService } from '../agents/fact-verification/fact-verification.service';

import type {
  StoryArchitectAgentRequest,
  StoryArchitecture,
  TopicOpportunityRef as StoryTopicOpportunityRef,
  VerificationPackageRef as StoryVerificationPackageRef,
  VerifiedClaimRef as StoryVerifiedClaimRef,
} from '@agents/agent-04-story-architect/interfaces';
import { StoryArchitectService } from '../agents/story-architect/story-architect.service';

import type {
  NarrationScript,
  ScriptWriterAgentRequest,
  StoryArchitectureRef as WriterStoryArchitectureRef,
  VerificationPackageRef as WriterVerificationPackageRef,
} from '@agents/agent-05-script-writer/interfaces';
import { ScriptWriterService } from '../agents/script-writer/script-writer.service';

import type {
  NarrationScriptRef as PlannerNarrationScriptRef,
  ReviewResultRef,
  ScenePlan,
  ScenePlannerAgentRequest,
  StoryArchitectureRef as PlannerStoryArchitectureRef,
  VerificationPackageRef as PlannerVerificationPackageRef,
} from '@agents/agent-07-scene-planner/interfaces';
import { ScenePlannerService } from '../agents/scene-planner/scene-planner.service';

import { generatePrefixedId } from '../common/id.util';
import { buildFinalOutput } from './output-formatter';
import {
  PIPELINE_AGENT_IDS,
  PipelineAgentId,
  PipelineRunRequest,
  PipelineRunResponse,
  PipelineStep,
} from './pipeline.types';

const PRODUCER = { name: 'ytv-pipeline-orchestrator', version: '0.1.0' } as const;
const DEV_LOCALE = 'en-US';
/**
 * This dev orchestrator's fixed default video length. There is no
 * per-request duration field on the UI form (STRICT scope: topic/niche/
 * audience only), so this is a deliberate, documented constant — never a
 * value invented by a model.
 */
const DEFAULT_TARGET_DURATION_SECONDS = 180;

const ARTIFACT_NAME: Record<PipelineAgentId, string> = {
  'agent-00-strategy': 'Strategy Manifest',
  'agent-01-topic-discovery': 'Topic Candidates',
  'agent-02-research': 'Research Package',
  'agent-03-fact-verification': 'Verification Package',
  'agent-04-story-architect': 'Story Architecture',
  'agent-05-script-writer': 'Narration Script',
  'agent-06-script-reviewer': 'Review Report',
  'agent-07-scene-planner': 'Scene Plan',
};

interface RunContext {
  readonly tenantId: string;
  readonly channelId: string;
  readonly correlationId: string;
  /** No durable Strategy Store exists yet (STD-000 §5.8) — this dev pipeline mints one run-scoped version string itself, documented here rather than fabricated silently. */
  readonly strategyVersion: string;
}

/**
 * The pipeline orchestrator (commissioning brief STEP 5): the first and
 * only piece of actual multi-agent composition in this backend. It never
 * embeds business logic belonging to an agent (no claim grading, no story
 * structuring) — it only sequences the 8 already-hardened agent services,
 * threading each one's real, validated output into the next one's real,
 * validated input, exactly as `ARC-001` §7.2 assigns to "the workflow
 * engine" and explicitly withholds from any agent. Every agent call here
 * uses each service's own `execute()` — the same public method, same
 * validators, same AI_PROVIDER invocation, same error classification the
 * agent already had. Nothing about an agent changed to make this possible.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly strategyService: StrategyService,
    private readonly topicDiscoveryService: TopicDiscoveryService,
    private readonly researchService: ResearchService,
    private readonly factVerificationService: FactVerificationService,
    private readonly storyArchitectService: StoryArchitectService,
    private readonly scriptWriterService: ScriptWriterService,
    private readonly scriptReviewerService: ScriptReviewerService,
    private readonly scenePlannerService: ScenePlannerService,
  ) {}

  async run(request: PipelineRunRequest): Promise<PipelineRunResponse> {
    const ctx: RunContext = {
      tenantId: generatePrefixedId('ten'),
      channelId: generatePrefixedId('chn'),
      correlationId: generatePrefixedId('cor'),
      strategyVersion: '1.0.0',
    };

    const steps: PipelineStep[] = PIPELINE_AGENT_IDS.map((agent) => ({
      agent,
      artifact: ARTIFACT_NAME[agent],
      status: 'error',
      input: null,
      output: null,
      error: 'Not attempted — an earlier required step did not succeed.',
    }));

    let manifest: StrategyManifest | null = null;
    let topic: TopicOpportunity | null = null;
    let researchPackage: ResearchPackage | null = null;
    let verificationPackage: VerificationPackage | null = null;
    let storyArchitecture: StoryArchitecture | null = null;
    let narrationScript: NarrationScript | null = null;
    let reviewReport: ReviewReport | null = null;
    let scenePlan: ScenePlan | null = null;

    // Agent 00 — Strategy.
    const strategyRequest = this.buildStrategyRequest(request, ctx);
    const strategyResult = await this.attempt('agent-00-strategy', strategyRequest, steps, (attemptType) =>
      this.strategyService.execute(strategyRequest, { attemptType }),
    );
    if (strategyResult === null) return this.finish(request, steps, {});
    manifest = strategyResult;

    // Agent 01 — Topic Discovery.
    const topicRequest = this.buildTopicDiscoveryRequest(request, ctx, manifest);
    const topicResult = await this.attempt('agent-01-topic-discovery', topicRequest, steps, (attemptType) =>
      this.topicDiscoveryService.execute(topicRequest, { attemptType }),
    );
    if (topicResult === null) return this.finish(request, steps, {});
    topic = topicResult.topics.find((candidate) => candidate.rank === 1) ?? topicResult.topics[0] ?? null;
    if (topic === null) {
      this.markError(
        'agent-01-topic-discovery',
        steps,
        'Topic Discovery returned zero candidates; nothing to research.',
      );
      return this.finish(request, steps, {});
    }

    // Agent 02 — Research.
    const researchRequest = this.buildResearchRequest(request, ctx, topic);
    const researchResult = await this.attempt('agent-02-research', researchRequest, steps, (attemptType) =>
      this.researchService.execute(researchRequest, { attemptType }),
    );
    if (researchResult === null)
      return this.finish(request, steps, { story: null, script: null, review: null, scenePlan: null });
    researchPackage = researchResult;

    // Agent 03 — Fact Verification.
    const verificationRequest = this.buildFactVerificationRequest(request, ctx, researchPackage);
    const verificationResult = await this.attempt(
      'agent-03-fact-verification',
      verificationRequest,
      steps,
      (attemptType) => this.factVerificationService.execute(verificationRequest, { attemptType }),
    );
    if (verificationResult === null) return this.finish(request, steps, {});
    verificationPackage = verificationResult;

    // Agent 04 — Story Architect.
    const storyRequest = this.buildStoryArchitectRequest(request, ctx, verificationPackage, topic);
    const storyResult = await this.attempt('agent-04-story-architect', storyRequest, steps, (attemptType) =>
      this.storyArchitectService.execute(storyRequest, { attemptType }),
    );
    if (storyResult === null) return this.finish(request, steps, {});
    storyArchitecture = storyResult;

    // Agent 05 — Script Writer.
    const scriptRequest = this.buildScriptWriterRequest(request, ctx, storyArchitecture, verificationPackage);
    const scriptResult = await this.attempt('agent-05-script-writer', scriptRequest, steps, (attemptType) =>
      this.scriptWriterService.execute(scriptRequest, { attemptType }),
    );
    if (scriptResult === null) return this.finish(request, steps, { story: storyArchitecture });
    narrationScript = scriptResult;

    // Agent 06 — Script Reviewer.
    const reviewRequest = this.buildScriptReviewerRequest(
      request,
      ctx,
      narrationScript,
      storyArchitecture,
      verificationPackage,
      manifest,
    );
    const reviewResult = await this.attempt('agent-06-script-reviewer', reviewRequest, steps, (attemptType) =>
      this.scriptReviewerService.execute(reviewRequest, { attemptType }),
    );
    if (reviewResult === null)
      return this.finish(request, steps, { story: storyArchitecture, script: narrationScript });
    reviewReport = reviewResult;

    // Agent 07 — Scene Planner. Only attempted when Agent 06 actually cleared the script — this mirrors the
    // real approval gate (`R-IN-002`/`R-IN-003` on Agent 07's own input contract), not a decision this
    // orchestrator invents; attempting it on a non-approved review would just fail Agent 07's own validation.
    if (
      reviewReport.summary.decision !== 'APPROVED' ||
      !reviewReport.summary.readyForScenePlanning ||
      reviewReport.nextAction !== 'CONTINUE'
    ) {
      this.markSkipped(
        'agent-07-scene-planner',
        steps,
        `Skipped — the Review Report did not clear the script for scene planning (decision=${reviewReport.summary.decision}, nextAction=${reviewReport.nextAction}).`,
      );
      return this.finish(request, steps, {
        story: storyArchitecture,
        script: narrationScript,
        review: reviewReport,
        scenePlan: null,
      });
    }

    const sceneRequest = this.buildScenePlannerRequest(
      request,
      ctx,
      narrationScript,
      reviewReport,
      storyArchitecture,
      verificationPackage,
    );
    const sceneResult = await this.attempt('agent-07-scene-planner', sceneRequest, steps, (attemptType) =>
      this.scenePlannerService.execute(sceneRequest, { attemptType }),
    );
    scenePlan = sceneResult;

    return this.finish(request, steps, {
      story: storyArchitecture,
      script: narrationScript,
      review: reviewReport,
      scenePlan,
    });
  }

  // --- execution + error handling -----------------------------------------

  /**
   * At most one retry, and only when the agent's OWN error classification
   * says the failure is `retryable` (e.g. `AI_OUTPUT.JSON.PARSE_FAILED` —
   * a local model ignoring the "JSON only" instruction, commissioning
   * brief STEP 3). Never retries a non-retryable failure (a real schema/
   * business-rule violation retrying against the same input would just
   * fail the same way), and never retries more than once — retry policy
   * lives here, in the orchestrator, not duplicated inside each agent
   * (`STD-000` "Retry, repair, backoff, attempt counting" is the runtime/
   * workflow's job, per every agent's own non-responsibilities table).
   */
  private static readonly MAX_ATTEMPTS = 2;

  private async attempt<
    TRequest,
    TOutcome extends {
      ok: boolean;
      response: {
        data?: unknown;
        issues?: readonly { message: string; userMessage?: string; retryable?: boolean }[];
      };
    },
  >(
    agent: PipelineAgentId,
    request: TRequest,
    steps: PipelineStep[],
    invoke: (attemptType: 'INITIAL' | 'REPAIR') => Promise<TOutcome>,
  ): Promise<TOutcome extends { ok: true; response: { data: infer TData } } ? TData : never | null> {
    const index = PIPELINE_AGENT_IDS.indexOf(agent);
    try {
      for (let attemptNumber = 1; attemptNumber <= PipelineService.MAX_ATTEMPTS; attemptNumber += 1) {
        const attemptType: 'INITIAL' | 'REPAIR' = attemptNumber === 1 ? 'INITIAL' : 'REPAIR';
        // eslint-disable-next-line no-await-in-loop -- sequential, bounded retry by design: only retries after the previous attempt genuinely failed.
        const outcome = await invoke(attemptType);
        if (outcome.ok) {
          const data = (outcome.response as { data: unknown }).data;
          steps[index] = {
            agent,
            artifact: ARTIFACT_NAME[agent],
            status: 'success',
            input: request,
            output: data,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic outcome shape varies per agent; the caller narrows it via its own declared local variable type.
          return data as any;
        }
        const issue = outcome.response.issues?.[0];
        const message = issue?.userMessage ?? issue?.message ?? 'Agent execution failed validation.';
        if (issue?.retryable === true && attemptNumber < PipelineService.MAX_ATTEMPTS) {
          this.logger.warn(
            `${agent} attempt ${attemptNumber} failed (${message}) — retrying once (retryable).`,
          );
          continue;
        }
        steps[index] = {
          agent,
          artifact: ARTIFACT_NAME[agent],
          status: 'error',
          input: request,
          output: outcome.response,
          error: message,
        };
        this.logger.warn(`${agent} failed: ${message}`);
        return null as never;
      }
      return null as never;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error during agent execution.';
      steps[index] = {
        agent,
        artifact: ARTIFACT_NAME[agent],
        status: 'error',
        input: request,
        output: null,
        error: message,
      };
      this.logger.error(`${agent} threw: ${message}`);
      return null as never;
    }
  }

  private markError(agent: PipelineAgentId, steps: PipelineStep[], message: string): void {
    const index = PIPELINE_AGENT_IDS.indexOf(agent);
    steps[index] = {
      agent,
      artifact: ARTIFACT_NAME[agent],
      status: 'error',
      input: null,
      output: null,
      error: message,
    };
  }

  /** Not a failure — the pipeline made a safe, documented decision not to run this step (STEP 11's "continue only if safe"). Reported as `error` status since the UI only has success/error, but the message says why. */
  private markSkipped(agent: PipelineAgentId, steps: PipelineStep[], message: string): void {
    const index = PIPELINE_AGENT_IDS.indexOf(agent);
    steps[index] = {
      agent,
      artifact: ARTIFACT_NAME[agent],
      status: 'error',
      input: null,
      output: null,
      error: message,
    };
  }

  private finish(
    request: PipelineRunRequest,
    steps: PipelineStep[],
    artifacts: {
      story?: StoryArchitecture | null;
      script?: NarrationScript | null;
      review?: ReviewReport | null;
      scenePlan?: ScenePlan | null;
    },
  ): PipelineRunResponse {
    const finalOutput = buildFinalOutput(request, {
      story: artifacts.story ?? null,
      script: artifacts.script ?? null,
      review: artifacts.review ?? null,
      scenePlan: artifacts.scenePlan ?? null,
    });
    return { steps, finalOutput };
  }

  // --- meta builder ---------------------------------------------------------

  private buildMeta(
    ctx: RunContext,
    extra: { strategyVersion?: string; brandVersion?: string; localeVersion?: string } = {},
  ) {
    return {
      messageId: generatePrefixedId('msg'),
      correlationId: ctx.correlationId,
      createdAt: new Date().toISOString(),
      locale: DEV_LOCALE,
      tenantId: ctx.tenantId,
      channelId: ctx.channelId,
      producer: PRODUCER,
      ...(extra.strategyVersion !== undefined ? { strategyVersion: extra.strategyVersion } : {}),
      ...(extra.brandVersion !== undefined ? { brandVersion: extra.brandVersion } : {}),
      ...(extra.localeVersion !== undefined ? { localeVersion: extra.localeVersion } : {}),
    };
  }

  // --- request builders (one per agent, each threading the real prior artifact) ---

  private buildStrategyRequest(request: PipelineRunRequest, ctx: RunContext): StrategyAgentRequest {
    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { brandVersion: '1.0.0', localeVersion: '1.0.0' }),
      data: {
        channelProfile: {
          displayName: `${request.niche} channel`,
          contentCategory: 'OTHER',
          maturity: 'NEW',
        },
        operatorIntent: {
          missionStatement: `Produce ${request.niche} videos that ${request.audience} actually finish watching, starting with: ${request.topic}.`,
          businessGoals: [{ goalKey: 'GOAL_GROWTH', goal: 'AUDIENCE_GROWTH', priority: 1, horizonDays: 90 }],
          weeklyVideoTarget: 3,
          // Composed from the user's own two fields (never invented) so short form inputs like a single
          // phrase still clear the contract's minimum-length floor on this field.
          targetAudienceDescription: `${request.audience}, interested in ${request.niche} content.`,
        },
        audienceDefinition: {
          primarySegment: request.audience,
          geographies: ['US'],
          languages: [DEV_LOCALE],
          ageBands: ['AGE_25_34'],
          expertiseLevel: 'BEGINNER',
        },
        brandBinding: {
          brandVersion: '1.0.0',
          toneDescriptors: ['CONVERSATIONAL', 'DIRECT', 'CURIOUS'],
          voicePersona: 'GUIDE',
        },
        localeBinding: {
          locale: DEV_LOCALE,
          localeVersion: '1.0.0',
          readingDirection: 'LTR',
          maxTitleLengthChars: 100,
          speakingRateWordsPerMinute: 150,
        },
        capacityConstraints: {
          weeklyProductionCapacityVideos: 3,
          minVideoDurationMs: 30_000,
          maxVideoDurationMs: 600_000,
        },
      },
    };
  }

  private buildTopicDiscoveryRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    manifest: StrategyManifest,
  ): TopicDiscoveryAgentRequest {
    const strategyBinding: StrategyBinding = {
      strategyVersion: ctx.strategyVersion,
      contentPillars: manifest.contentPillars.map((pillar) => ({
        pillarKey: pillar.pillarKey,
        name: pillar.name,
        description: pillar.description,
        targetShareRatio: pillar.targetShareRatio,
      })),
      audience: {
        primarySegment: manifest.audience.primarySegment,
        personas: manifest.audience.personas.map((persona) => ({
          personaKey: persona.personaKey,
          name: persona.name,
          expertiseLevel: persona.expertiseLevel,
        })),
        languages: manifest.audience.languages,
      },
      seoDirection: {
        topicClusters: manifest.seoDirection.topicClusters.map((cluster) => ({
          clusterKey: cluster.clusterKey,
          name: cluster.name,
          seedKeywords: cluster.seedKeywords,
          ...(cluster.pillarKey !== undefined ? { pillarKey: cluster.pillarKey } : {}),
        })),
      },
      formatStrategy: {
        formats: manifest.formatStrategy.formats.map((format) => ({
          formatKey: format.formatKey,
          formatType: format.formatType,
          targetMinDurationMs: format.targetMinDurationMs,
          targetMaxDurationMs: format.targetMaxDurationMs,
        })),
      },
      prohibitedTopics: manifest.prohibitedTopics,
    };

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: {
        strategyBinding,
        // No durable content-inventory store exists yet in this dev pipeline (STD-000 §5.8) — an empty
        // array is the schema's own valid "no history yet" case, never a fabricated inventory.
        existingContentInventory: [],
        language: DEV_LOCALE,
        requestedTopicCount: 1,
      },
    };
  }

  private buildResearchRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    topic: TopicOpportunity,
  ): ResearchAgentRequest {
    const topicOpportunity: ResearchTopicOpportunityRef = {
      topicId: topic.topicId,
      title: topic.title,
      angle: topic.angle,
      topicType: topic.topicType,
      pillarKey: topic.pillarKey,
      audienceIntent: topic.audienceIntent,
      researchPriority: topic.researchPriority,
    };

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: {
        topicOpportunity,
        // No search/document-fetch provider is wired into this dev pipeline yet — an empty array is the
        // schema's own valid "nothing supplied" case (Agent 02 is designed to report this honestly rather
        // than fabricate evidence), never invented source material.
        researchMaterials: [],
        requestedDepth: 'STANDARD',
        language: DEV_LOCALE,
      },
    };
  }

  private buildFactVerificationRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    researchPackage: ResearchPackage,
  ): FactVerificationAgentRequest {
    const researchPackageRef: ResearchPackageRef = {
      topicId: researchPackage.topicId,
      researchQuestions: researchPackage.researchQuestions,
      sources: researchPackage.sources,
      evidence: researchPackage.evidence,
      conflicts: researchPackage.conflicts,
      gaps: researchPackage.gaps,
    };

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: { researchPackage: researchPackageRef, language: DEV_LOCALE },
    };
  }

  private buildStoryVerifiedClaimRefs(verificationPackage: VerificationPackage): StoryVerifiedClaimRef[] {
    return verificationPackage.claims.map((claim) => ({
      claimId: claim.claimId,
      claimText: claim.claimText,
      claimType: claim.claimType,
      verificationStatus: claim.verificationStatus,
      downstreamSafety: claim.downstreamSafety,
      supportingEvidenceIds: claim.supportingEvidenceIds,
      isTimeSensitive: claim.freshnessAssessment.isTimeSensitive,
      freshnessConcern: claim.freshnessAssessment.freshnessConcern,
      limitations: claim.limitations,
      ...(claim.notesForDownstream !== undefined ? { notesForDownstream: claim.notesForDownstream } : {}),
    }));
  }

  private buildStoryArchitectRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    verificationPackage: VerificationPackage,
    topic: TopicOpportunity,
  ): StoryArchitectAgentRequest {
    const verificationPackageRef: StoryVerificationPackageRef = {
      topicId: verificationPackage.topicId,
      claims: this.buildStoryVerifiedClaimRefs(verificationPackage),
      overallReadiness: verificationPackage.verificationSummary.overallReadiness,
    };
    const topicOpportunity: StoryTopicOpportunityRef = {
      topicId: topic.topicId,
      title: topic.title,
      angle: topic.angle,
      topicType: topic.topicType,
      pillarKey: topic.pillarKey,
      audienceIntent: topic.audienceIntent,
    };

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: {
        verificationPackage: verificationPackageRef,
        topicOpportunity,
        targetDurationSeconds: DEFAULT_TARGET_DURATION_SECONDS,
        language: DEV_LOCALE,
      },
    };
  }

  private buildWriterVerifiedClaimRefs(verificationPackage: VerificationPackage) {
    return verificationPackage.claims.map((claim) => ({
      claimId: claim.claimId,
      claimText: claim.claimText,
      claimType: claim.claimType,
      verificationStatus: claim.verificationStatus,
      downstreamSafety: claim.downstreamSafety,
      supportingEvidenceIds: claim.supportingEvidenceIds,
      isTimeSensitive: claim.freshnessAssessment.isTimeSensitive,
      freshnessConcern: claim.freshnessAssessment.freshnessConcern,
      limitations: claim.limitations,
      ...(claim.notesForDownstream !== undefined ? { notesForDownstream: claim.notesForDownstream } : {}),
      ...(claim.quoteProvenance !== undefined
        ? {
            quoteProvenance: {
              speaker: claim.quoteProvenance.speaker,
              speakerConfirmed: claim.quoteProvenance.speakerConfirmed,
            },
          }
        : {}),
    }));
  }

  private buildStoryArchitectureRefForDownstream(story: StoryArchitecture) {
    return {
      topicId: story.topicId,
      hook: story.hook,
      beats: story.beats.map((beat) => ({
        beatId: beat.beatId,
        order: beat.order,
        beatType: beat.beatType,
        purpose: beat.purpose,
        ...(beat.viewerQuestion !== undefined ? { viewerQuestion: beat.viewerQuestion } : {}),
        expectedViewerState: beat.expectedViewerState,
        claimRefs: beat.claimRefs,
        evidenceRefs: beat.evidenceRefs,
        requiredConcepts: beat.requiredConcepts,
        ...(beat.transitionIntent !== undefined ? { transitionIntent: beat.transitionIntent } : {}),
        approxDurationSeconds: beat.approxDurationSeconds,
        importance: beat.importance,
        pacing: beat.pacing,
        ...(beat.qualification !== undefined ? { qualification: beat.qualification } : {}),
      })),
      duration: story.duration,
      payoff: story.payoff,
      conclusion: story.conclusion,
      ctaStrategy: story.ctaStrategy,
      downstreamReadiness: story.downstreamReadiness,
    };
  }

  private buildScriptWriterRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    story: StoryArchitecture,
    verificationPackage: VerificationPackage,
  ): ScriptWriterAgentRequest {
    const storyArchitecture = this.buildStoryArchitectureRefForDownstream(
      story,
    ) as unknown as WriterStoryArchitectureRef;
    const verificationPackageRef = {
      topicId: verificationPackage.topicId,
      claims: this.buildWriterVerifiedClaimRefs(verificationPackage),
    } as unknown as WriterVerificationPackageRef;

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: { storyArchitecture, verificationPackage: verificationPackageRef, language: DEV_LOCALE },
    };
  }

  private buildScriptReviewerRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    script: NarrationScript,
    story: StoryArchitecture,
    verificationPackage: VerificationPackage,
    manifest: StrategyManifest,
  ): ScriptReviewerAgentRequest {
    const scriptRef = {
      topicId: script.topicId,
      segments: script.segments,
      scriptDuration: script.scriptDuration,
      wordCount: script.wordCount,
      warnings: script.warnings,
      downstreamReadiness: script.downstreamReadiness,
      readinessRationale: script.readinessRationale,
      readinessBlockers: script.readinessBlockers,
    } as unknown as ReviewerNarrationScriptRef;
    const storyArchitecture = this.buildStoryArchitectureRefForDownstream(
      story,
    ) as unknown as ReviewerStoryArchitectureRef;
    const verificationPackageRef = {
      topicId: verificationPackage.topicId,
      claims: this.buildWriterVerifiedClaimRefs(verificationPackage),
    } as unknown as ReviewerVerificationPackageRef;
    const audienceContext: ReviewerAudienceContextRef = {
      primarySegment: manifest.audience.primarySegment,
      expertiseLevel: manifest.audience.expertiseLevel,
      toneDescriptors: manifest.toneAndPersonality.toneDescriptors.slice(0, 4),
    };

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: {
        script: scriptRef,
        storyArchitecture,
        verificationPackage: verificationPackageRef,
        audienceContext,
        language: DEV_LOCALE,
      },
    };
  }

  private buildScenePlannerRequest(
    request: PipelineRunRequest,
    ctx: RunContext,
    script: NarrationScript,
    review: ReviewReport,
    story: StoryArchitecture,
    verificationPackage: VerificationPackage,
  ): ScenePlannerAgentRequest {
    const scriptRef = {
      topicId: script.topicId,
      segments: script.segments,
      scriptDuration: script.scriptDuration,
      wordCount: script.wordCount,
      downstreamReadiness: script.downstreamReadiness,
    } as unknown as PlannerNarrationScriptRef;
    const reviewResult: ReviewResultRef = {
      topicId: review.topicId,
      decision: review.summary.decision,
      readyForScenePlanning: review.summary.readyForScenePlanning,
      nextAction: review.nextAction,
    };
    const storyArchitecture = this.buildStoryArchitectureRefForDownstream(
      story,
    ) as unknown as PlannerStoryArchitectureRef;
    const verificationPackageRef = {
      topicId: verificationPackage.topicId,
      claims: this.buildWriterVerifiedClaimRefs(verificationPackage),
    } as unknown as PlannerVerificationPackageRef;

    return {
      contractVersion: '1.0',
      contractType: 'REQUEST',
      schemaVersion: '1.0.0',
      meta: this.buildMeta(ctx, { strategyVersion: ctx.strategyVersion }),
      data: {
        script: scriptRef,
        reviewResult,
        storyArchitecture,
        verificationPackage: verificationPackageRef,
        language: DEV_LOCALE,
      },
    };
  }
}

import type { AgentId, FinalOutput, PipelineRunRequest } from '@/types/pipeline';

/**
 * Mock artifacts used only when the real `POST /api/pipeline/run` backend
 * endpoint is unavailable (see `lib/api.ts`). Field names mirror each
 * agent's real output shape closely enough for this observability tool's
 * formatted views (script / findings / scenes) to render meaningfully, but
 * these are NOT validated against the real JSON Schemas and must never be
 * treated as authoritative examples of an agent's contract.
 */

export const AGENT_ARTIFACT_NAME: Record<AgentId, string> = {
  'agent-00-strategy': 'Strategy Manifest',
  'agent-01-topic-discovery': 'Topic Candidates',
  'agent-02-research': 'Research Package',
  'agent-03-fact-verification': 'Verification Package',
  'agent-04-story-architect': 'Story Architecture',
  'agent-05-script-writer': 'Narration Script',
  'agent-06-script-reviewer': 'Review Report',
  'agent-07-scene-planner': 'Scene Plan',
};

export const AGENT_LABEL: Record<AgentId, string> = {
  'agent-00-strategy': '00 Strategy',
  'agent-01-topic-discovery': '01 Topics',
  'agent-02-research': '02 Research',
  'agent-03-fact-verification': '03 Verification',
  'agent-04-story-architect': '04 Story',
  'agent-05-script-writer': '05 Script',
  'agent-06-script-reviewer': '06 Review',
  'agent-07-scene-planner': '07 Scenes',
};

function mockStrategyManifest(req: PipelineRunRequest) {
  return {
    manifestKind: 'STRATEGY_MANIFEST',
    channelId: 'chn_mock000000000000000000',
    niche: req.niche,
    audience: { primarySegment: req.audience, languages: ['en-US'] },
    contentPillars: [
      { pillarKey: 'PILLAR_CORE', title: req.niche, description: `Core content pillar for ${req.niche}.` },
    ],
    weeklyVideoTarget: 3,
  };
}

function mockTopicCandidates(req: PipelineRunRequest) {
  return {
    setKind: 'TOPIC_OPPORTUNITY_SET',
    topics: [
      {
        topicId: 'top_mock000000000000000001',
        title: req.topic,
        angle: `A practical, ${req.audience}-focused take on ${req.topic}.`,
        pillarKey: 'PILLAR_CORE',
        score: { overall: 0.82, novelty: 0.7, relevance: 0.91 },
        researchPriority: 'HIGH',
      },
    ],
  };
}

function mockResearchPackage(req: PipelineRunRequest) {
  return {
    packageKind: 'RESEARCH_PACKAGE',
    topicId: 'top_mock000000000000000001',
    researchQuestions: [
      { questionId: 'RQ_1', text: `What does the audience need to know about ${req.topic}?` },
    ],
    sources: [
      { sourceId: 'SRC_1', title: 'Primary reference', url: 'https://example.com/source', type: 'ARTICLE' },
    ],
    evidence: [
      {
        evidenceId: 'EVIDENCE_1',
        claim: `${req.topic} affects most people in ways they rarely notice.`,
        sourceId: 'SRC_1',
        strength: 'STRONG',
      },
    ],
    completeness: { readyForFactVerification: true },
  };
}

function mockVerificationPackage(req: PipelineRunRequest) {
  return {
    packageKind: 'VERIFICATION_PACKAGE',
    topicId: 'top_mock000000000000000001',
    claims: [
      {
        claimId: 'CLAIM_MAIN',
        claimText: `${req.topic} affects most people in ways they rarely notice.`,
        claimType: 'FACT',
        verificationStatus: 'CORROBORATED',
        downstreamSafety: 'SAFE_TO_USE',
        supportingEvidenceIds: ['EVIDENCE_1'],
      },
    ],
    verificationSummary: { overallReadiness: true },
  };
}

function mockStoryArchitecture(req: PipelineRunRequest) {
  return {
    architectureKind: 'STORY_ARCHITECTURE',
    topicId: 'top_mock000000000000000001',
    storyObjective: `Explain ${req.topic} clearly enough for ${req.audience} to act on it.`,
    hook: {
      hookType: 'QUESTION',
      viewerQuestion: `Why does ${req.topic} matter more than you think?`,
      claimRefs: ['CLAIM_MAIN'],
    },
    beats: [
      {
        beatId: 'BEAT_HOOK',
        order: 1,
        beatType: 'HOOK',
        purpose: 'Open with the core tension.',
        claimRefs: ['CLAIM_MAIN'],
      },
      {
        beatId: 'BEAT_EXPLAIN',
        order: 2,
        beatType: 'EXPLANATION',
        purpose: 'Explain the mechanism.',
        claimRefs: ['CLAIM_MAIN'],
      },
      {
        beatId: 'BEAT_CTA',
        order: 3,
        beatType: 'CTA',
        purpose: 'Tell the viewer what to do next.',
        claimRefs: [],
      },
    ],
    downstreamReadiness: 'READY_FOR_SCRIPT',
  };
}

function mockNarrationScript(req: PipelineRunRequest) {
  return {
    scriptKind: 'NARRATION_SCRIPT',
    topicId: 'top_mock000000000000000001',
    segments: [
      {
        segmentId: 'SEG_HOOK',
        order: 1,
        beatRef: 'BEAT_HOOK',
        segmentType: 'HOOK',
        narration: `Have you ever wondered why ${req.topic} matters so much more than people admit?`,
        estimatedDurationSeconds: 12,
        claimRefs: ['CLAIM_MAIN'],
      },
      {
        segmentId: 'SEG_EXPLAIN',
        order: 2,
        beatRef: 'BEAT_EXPLAIN',
        segmentType: 'EXPLANATION',
        narration: `Here's the part most ${req.audience} never get told: ${req.topic} affects most people in ways they rarely notice.`,
        estimatedDurationSeconds: 20,
        claimRefs: ['CLAIM_MAIN'],
      },
      {
        segmentId: 'SEG_CTA',
        order: 3,
        beatRef: 'BEAT_CTA',
        segmentType: 'CTA',
        narration: 'If this changed how you see things, follow for more like it.',
        estimatedDurationSeconds: 6,
        claimRefs: [],
      },
    ],
    scriptDuration: { targetDurationSeconds: 38, totalEstimatedDurationSeconds: 38, withinTolerance: true },
    wordCount: 62,
    downstreamReadiness: 'READY_FOR_REVIEW',
  };
}

function mockReviewReport() {
  return {
    packageKind: 'REVIEW_REPORT',
    topicId: 'top_mock000000000000000001',
    summary: {
      decision: 'APPROVED',
      readyForScenePlanning: true,
      blockingIssueCount: 0,
      highSeverityIssueCount: 1,
    },
    nextAction: 'CONTINUE',
    issues: [
      {
        issueId: 'ISSUE_1',
        category: 'PACING',
        severity: 'MEDIUM',
        basis: 'MODEL_ASSESSED',
        location: 'SEG_EXPLAIN',
        description: 'The explanation segment runs slightly long relative to the hook and CTA.',
        affectedSegmentId: 'SEG_EXPLAIN',
        recommendation: 'Consider tightening the middle sentence for pacing.',
        repairability: 'REPAIRABLE',
      },
    ],
    recommendations: ['Tighten SEG_EXPLAIN for pacing.'],
  };
}

function mockScenePlan() {
  return {
    planKind: 'SCENE_PLAN',
    topicId: 'top_mock000000000000000001',
    scenes: [
      {
        sceneId: 'SCENE_HOOK',
        order: 1,
        segmentRefs: ['SEG_HOOK'],
        beatRef: 'BEAT_HOOK',
        startTimeSeconds: 0,
        endTimeSeconds: 12,
        durationSeconds: 12,
        sceneType: 'HOOK_VISUAL',
        visualPurpose: 'Open with a bold on-screen question to hook curiosity.',
        visualElements: [
          { type: 'TEXT_OVERLAY', description: 'Bold on-screen question', importance: 'PRIMARY' },
        ],
      },
      {
        sceneId: 'SCENE_EXPLAIN',
        order: 2,
        segmentRefs: ['SEG_EXPLAIN'],
        beatRef: 'BEAT_EXPLAIN',
        startTimeSeconds: 12,
        endTimeSeconds: 32,
        durationSeconds: 20,
        sceneType: 'EXPLAINER',
        visualPurpose: 'Show a simple diagram illustrating the mechanism.',
        visualElements: [
          { type: 'DIAGRAM', description: 'Simple explanatory diagram', importance: 'PRIMARY' },
        ],
      },
      {
        sceneId: 'SCENE_CTA',
        order: 3,
        segmentRefs: ['SEG_CTA'],
        beatRef: 'BEAT_CTA',
        startTimeSeconds: 32,
        endTimeSeconds: 38,
        durationSeconds: 6,
        sceneType: 'CTA_VISUAL',
        visualPurpose: 'Close with a follow prompt.',
        visualElements: [
          { type: 'TEXT_GRAPHIC', description: 'Follow prompt graphic', importance: 'PRIMARY' },
        ],
      },
    ],
    planDuration: { targetDurationSeconds: 38, totalPlannedDurationSeconds: 38 },
  };
}

/** Builds one agent's mocked `{ input, output }` pair, threading the prior step's output in as this step's input where that's how the real pipeline wires artifacts. */
export function buildMockStep(
  agent: AgentId,
  req: PipelineRunRequest,
  priorOutput: unknown,
): { input: unknown; output: unknown } {
  switch (agent) {
    case 'agent-00-strategy':
      return {
        input: {
          operatorIntent: { missionStatement: req.niche },
          audienceDefinition: { primarySegment: req.audience },
        },
        output: mockStrategyManifest(req),
      };
    case 'agent-01-topic-discovery':
      return { input: { strategyBinding: priorOutput }, output: mockTopicCandidates(req) };
    case 'agent-02-research':
      return { input: { topicOpportunity: priorOutput }, output: mockResearchPackage(req) };
    case 'agent-03-fact-verification':
      return { input: { researchPackage: priorOutput }, output: mockVerificationPackage(req) };
    case 'agent-04-story-architect':
      return { input: { verificationPackage: priorOutput }, output: mockStoryArchitecture(req) };
    case 'agent-05-script-writer':
      return { input: { storyArchitecture: priorOutput }, output: mockNarrationScript(req) };
    case 'agent-06-script-reviewer':
      return { input: { script: priorOutput }, output: mockReviewReport() };
    case 'agent-07-scene-planner':
      return { input: { script: priorOutput }, output: mockScenePlan() };
  }
}

/**
 * The mock-path equivalent of the backend's `src/pipeline/output-formatter.ts`
 * — same derivation logic (score from decision, title from storyObjective,
 * etc.), applied to the mocked artifacts instead of real agent output, so
 * the `FinalOutputPanel` component renders identically either way.
 */
export function buildMockFinalOutput(req: PipelineRunRequest): FinalOutput {
  const story = mockStoryArchitecture(req);
  const script = mockNarrationScript(req);
  const review = mockReviewReport();
  const scenePlan = mockScenePlan();

  let score = 100;
  score -= review.summary.blockingIssueCount * 25;
  score -= review.summary.highSeverityIssueCount * 10;
  score = Math.max(0, Math.min(100, score));

  return {
    summary: { topic: req.topic, niche: req.niche, audience: req.audience },
    story: {
      title: story.storyObjective,
      hook: story.hook.viewerQuestion,
      outline: story.beats.map((beat) => beat.purpose),
    },
    script: {
      narration: script.segments
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((segment) => segment.narration)
        .join('\n\n'),
    },
    review: {
      status: score >= 80 ? 'APPROVED' : 'NEEDS_REVISION',
      score,
      issues: review.issues.map((issue) => `[${issue.severity}] ${issue.description}`),
    },
    scenes: scenePlan.scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((scene) => ({
        sceneNumber: scene.order,
        description: scene.visualPurpose,
        visual: scene.visualElements.map((element) => element.description).join('; '),
        narrationPart: scene.segmentRefs.join(', '),
      })),
  };
}

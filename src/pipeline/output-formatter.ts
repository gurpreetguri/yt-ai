import type { StoryArchitecture } from '@agents/agent-04-story-architect/interfaces';
import type { NarrationScript } from '@agents/agent-05-script-writer/interfaces';
import type { ReviewReport } from '@agents/agent-06-script-reviewer/interfaces';
import type { ScenePlan } from '@agents/agent-07-scene-planner/interfaces';

import type {
  FinalOutput,
  FinalOutputReview,
  FinalOutputScene,
  FinalOutputScript,
  FinalOutputStory,
  PipelineRunRequest,
} from './pipeline.types';

/**
 * Pure transformation from each agent's real, already-validated JSON
 * artifact into the UI-friendly `FinalOutput` shape. Never re-invokes a
 * model, never invents content — every field here is either copied
 * verbatim from an agent's output or is a deterministic derivation
 * (string join, threshold comparison) explicitly documented at the call
 * site. This is presentation logic only; it carries no business authority
 * — the agents' own `decision`/`downstreamReadiness` fields remain the
 * actual source of truth.
 */

const APPROVAL_SCORE_THRESHOLD = 80;

/** Story architecture has no literal "title" field — `centralPromise` is the closest concise, non-fabricated stand-in (STD-000 §4.7: never invent, only derive from what the model actually said). */
export function formatStory(story: StoryArchitecture | null): FinalOutputStory | null {
  if (story === null) return null;
  return {
    title: story.storyObjective.centralPromise,
    hook: story.hook.viewerQuestion,
    outline: story.beats.map((beat) => beat.purpose),
  };
}

export function formatScript(script: NarrationScript | null): FinalOutputScript | null {
  if (script === null) return null;
  const narration = script.segments
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((segment) => segment.narration)
    .join('\n\n');
  return { narration };
}

/**
 * `ReviewReport` has no literal 0-100 "score" — this deterministically
 * derives one from the review's own already-validated fields
 * (`decision`, `blockingIssueCount`, `highSeverityIssueCount`) for a UI
 * that expects a single number. The score is presentational only; the
 * APPROVED/NEEDS_REVISION status is always driven by this same derived
 * score per STEP 10 of the commissioning brief, not by the agent's own
 * `decision` directly, so the two can occasionally disagree at the
 * boundary — that is a known, documented tradeoff of the requested
 * score-threshold status rule, not a bug.
 */
export function formatReview(review: ReviewReport | null): FinalOutputReview | null {
  if (review === null) return null;

  let score = 100;
  score -= review.summary.blockingIssueCount * 25;
  score -= review.summary.highSeverityIssueCount * 10;
  if (review.summary.decision === 'REJECTED') score = Math.min(score, 20);
  if (review.summary.decision === 'REGENERATION_REQUIRED') score = Math.min(score, 50);
  if (review.summary.decision === 'REPAIR_REQUIRED') score = Math.min(score, 79);
  score = Math.max(0, Math.min(100, score));

  const status: FinalOutputReview['status'] =
    score >= APPROVAL_SCORE_THRESHOLD ? 'APPROVED' : 'NEEDS_REVISION';

  return {
    status,
    score,
    issues: review.issues.map((issue) => `[${issue.severity}] ${issue.description}`),
  };
}

export function formatScenes(scenePlan: ScenePlan | null): readonly FinalOutputScene[] {
  if (scenePlan === null) return [];
  return scenePlan.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((scene) => ({
      sceneNumber: scene.order,
      description: scene.visualPurpose,
      visual: scene.visualElements.map((element) => element.description).join('; '),
      narrationPart: scene.segmentRefs.join(', '),
    }));
}

export function buildFinalOutput(
  request: PipelineRunRequest,
  artifacts: {
    story: StoryArchitecture | null;
    script: NarrationScript | null;
    review: ReviewReport | null;
    scenePlan: ScenePlan | null;
  },
): FinalOutput {
  return {
    summary: { topic: request.topic, niche: request.niche, audience: request.audience },
    story: formatStory(artifacts.story),
    script: formatScript(artifacts.script),
    review: formatReview(artifacts.review),
    scenes: formatScenes(artifacts.scenePlan),
  };
}

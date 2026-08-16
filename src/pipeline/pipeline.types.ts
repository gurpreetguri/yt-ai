/**
 * Types for the pipeline orchestrator's own HTTP surface only. These
 * describe the observability response shape the UI consumes
 * (`web/types/pipeline.ts` mirrors this) — they are NOT a new agent
 * contract and carry no business meaning of their own.
 */

export const PIPELINE_AGENT_IDS = [
  'agent-00-strategy',
  'agent-01-topic-discovery',
  'agent-02-research',
  'agent-03-fact-verification',
  'agent-04-story-architect',
  'agent-05-script-writer',
  'agent-06-script-reviewer',
  'agent-07-scene-planner',
] as const;

export type PipelineAgentId = (typeof PIPELINE_AGENT_IDS)[number];

export type PipelineStepStatus = 'success' | 'error';

export interface PipelineStep {
  readonly agent: PipelineAgentId;
  readonly artifact: string;
  readonly status: PipelineStepStatus;
  readonly input: unknown;
  readonly output: unknown;
  readonly error?: string;
}

export interface PipelineRunRequest {
  readonly topic: string;
  readonly niche: string;
  readonly audience: string;
}

export interface FinalOutputStory {
  readonly title: string;
  readonly hook: string;
  readonly outline: readonly string[];
}

export interface FinalOutputScript {
  readonly narration: string;
}

export interface FinalOutputReview {
  readonly status: 'APPROVED' | 'NEEDS_REVISION';
  readonly score: number;
  readonly issues: readonly string[];
}

export interface FinalOutputScene {
  readonly sceneNumber: number;
  readonly description: string;
  readonly visual: string;
  readonly narrationPart: string;
}

export interface FinalOutput {
  readonly summary: {
    readonly topic: string;
    readonly niche: string;
    readonly audience: string;
  };
  readonly story: FinalOutputStory | null;
  readonly script: FinalOutputScript | null;
  readonly review: FinalOutputReview | null;
  readonly scenes: readonly FinalOutputScene[];
}

export interface PipelineRunResponse {
  readonly steps: readonly PipelineStep[];
  /** Null when the pipeline stopped before Agent 04 ever produced a Story Architecture — there is nothing to format yet. */
  readonly finalOutput: FinalOutput | null;
}

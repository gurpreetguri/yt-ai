/**
 * Types for the developer observability UI only. These are intentionally
 * loose (`unknown` for input/output payloads) — this tool visualizes
 * whatever JSON each agent actually returns, it does not re-declare each
 * agent's own contract.
 */

export const AGENT_IDS = [
  'agent-00-strategy',
  'agent-01-topic-discovery',
  'agent-02-research',
  'agent-03-fact-verification',
  'agent-04-story-architect',
  'agent-05-script-writer',
  'agent-06-script-reviewer',
  'agent-07-scene-planner',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type StepStatus = 'idle' | 'running' | 'success' | 'error';

export interface PipelineStep {
  agent: AgentId;
  artifact: string;
  status: StepStatus;
  input: unknown;
  output: unknown;
  /** Present only when status === 'error'. */
  error?: string;
}

export interface PipelineRunRequest {
  topic: string;
  niche: string;
  audience: string;
}

/** Mirrors the backend's `src/pipeline/pipeline.types.ts` FinalOutput shape exactly. */
export interface FinalOutputStory {
  title: string;
  hook: string;
  outline: string[];
}

export interface FinalOutputScript {
  narration: string;
}

export interface FinalOutputReview {
  status: 'APPROVED' | 'NEEDS_REVISION';
  score: number;
  issues: string[];
}

export interface FinalOutputScene {
  sceneNumber: number;
  description: string;
  visual: string;
  narrationPart: string;
}

export interface FinalOutput {
  summary: { topic: string; niche: string; audience: string };
  story: FinalOutputStory | null;
  script: FinalOutputScript | null;
  review: FinalOutputReview | null;
  scenes: FinalOutputScene[];
}

export interface PipelineRunResponse {
  steps: PipelineStep[];
  finalOutput: FinalOutput | null;
}

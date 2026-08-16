import { AGENT_ARTIFACT_NAME, buildMockFinalOutput, buildMockStep } from '@/lib/mock-data';
import { AGENT_IDS } from '@/types/pipeline';
import type {
  AgentId,
  FinalOutput,
  PipelineRunRequest,
  PipelineRunResponse,
  PipelineStep,
} from '@/types/pipeline';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const PIPELINE_RUN_PATH = '/api/pipeline/run';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(): number {
  return 300 + Math.floor(Math.random() * 400); // 300-700ms, per spec.
}

/**
 * Attempts the real backend pipeline endpoint. Returns null (never throws)
 * when the endpoint is missing, unreachable, or returns something that
 * isn't a valid `PipelineRunResponse` — the caller falls back to the local
 * simulation in that case. This is the ONLY place that talks to the network.
 */
async function tryRealBackend(req: PipelineRunRequest): Promise<PipelineRunResponse | null> {
  try {
    const res = await fetch(`${API_BASE}${PIPELINE_RUN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (typeof data === 'object' && data !== null && Array.isArray((data as { steps?: unknown }).steps)) {
      const parsed = data as { steps: unknown[]; finalOutput?: unknown };
      return {
        steps: parsed.steps,
        finalOutput: (parsed.finalOutput as FinalOutput | undefined) ?? null,
      } as PipelineRunResponse;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Runs the pipeline and reports progress as each step completes, so the
 * caller can update the UI live. Tries the real backend first; if it's
 * missing or unreachable, simulates sequential agent execution with
 * realistic mocked artifacts (`lib/mock-data.ts`) and a 300-700ms delay
 * between steps, exactly as the observability tool's spec requires.
 *
 * `waitBeforeStep`, when supplied, is awaited before each step starts —
 * this is how the optional "run step-by-step" toggle pauses execution
 * until the developer clicks "Next step" (see `app/page.tsx`). Defaults to
 * an immediately-resolved promise, i.e. no pause.
 */
export async function runPipeline(
  req: PipelineRunRequest,
  onStepUpdate: (step: PipelineStep, index: number) => void,
  waitBeforeStep: () => Promise<void> = () => Promise.resolve(),
): Promise<{ usedMock: boolean; finalOutput: FinalOutput | null }> {
  const real = await tryRealBackend(req);

  if (real !== null) {
    for (let i = 0; i < real.steps.length; i += 1) {
      await waitBeforeStep();
      const step = real.steps[i];
      onStepUpdate({ ...step, status: 'running' }, i);
      await delay(200);
      onStepUpdate(step, i);
    }
    return { usedMock: false, finalOutput: real.finalOutput };
  }

  let priorOutput: unknown = null;
  for (let i = 0; i < AGENT_IDS.length; i += 1) {
    await waitBeforeStep();
    const agent: AgentId = AGENT_IDS[i];
    const artifact = AGENT_ARTIFACT_NAME[agent];
    const { input } = buildMockStep(agent, req, priorOutput);

    onStepUpdate({ agent, artifact, status: 'running', input, output: null }, i);
    await delay(randomDelayMs());

    const { output } = buildMockStep(agent, req, priorOutput);
    onStepUpdate({ agent, artifact, status: 'success', input, output }, i);
    priorOutput = output;
  }

  return { usedMock: true, finalOutput: buildMockFinalOutput(req) };
}

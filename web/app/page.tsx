'use client';

import { useRef, useState } from 'react';

import { InputForm } from '@/components/InputForm';
import { PipelineView } from '@/components/PipelineView';
import { StepDetails } from '@/components/StepDetails';
import { Button } from '@/components/ui/button';
import { runPipeline } from '@/lib/api';
import { AGENT_ARTIFACT_NAME } from '@/lib/mock-data';
import { AGENT_IDS } from '@/types/pipeline';
import type { PipelineRunRequest, PipelineStep } from '@/types/pipeline';

function idleSteps(): PipelineStep[] {
  return AGENT_IDS.map((agent) => ({
    agent,
    artifact: AGENT_ARTIFACT_NAME[agent],
    status: 'idle',
    input: null,
    output: null,
  }));
}

export default function Home() {
  const [steps, setSteps] = useState<PipelineStep[]>(idleSteps());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stepByStep, setStepByStep] = useState(false);
  const [awaitingNext, setAwaitingNext] = useState(false);

  // Resolves the promise `waitBeforeStep` in api.ts is currently awaiting,
  // so the "Next step" button can unblock execution. Not React state on
  // purpose — it holds a function reference across renders, not UI data.
  const resumeRef = useRef<(() => void) | null>(null);

  function handleRun(request: PipelineRunRequest) {
    setIsRunning(true);
    setSteps(idleSteps());
    setSelectedIndex(0);

    const waitBeforeStep = () =>
      new Promise<void>((resolve) => {
        if (!stepByStep) {
          resolve();
          return;
        }
        setAwaitingNext(true);
        resumeRef.current = () => {
          setAwaitingNext(false);
          resolve();
        };
      });

    runPipeline(
      request,
      (step, index) => {
        setSteps((prev) => {
          const next = [...prev];
          next[index] = step;
          return next;
        });
        setSelectedIndex(index);
      },
      waitBeforeStep,
    ).finally(() => setIsRunning(false));
  }

  function handleNextStep() {
    resumeRef.current?.();
    resumeRef.current = null;
  }

  const selectedStep = selectedIndex === null ? null : (steps[selectedIndex] ?? null);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Agent Pipeline Observability</h1>
          <p className="text-xs text-muted-foreground">Developer tool — not a production UI. Agents 00–07.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={stepByStep}
              onChange={(e) => setStepByStep(e.target.checked)}
              disabled={isRunning}
            />
            Run step-by-step
          </label>
          {awaitingNext && (
            <Button size="sm" onClick={handleNextStep} className="gap-1.5">
              Next step
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_260px_1fr] gap-3 overflow-hidden p-3">
        <InputForm onRun={handleRun} isRunning={isRunning} />
        <PipelineView steps={steps} selectedIndex={selectedIndex} onSelectStep={setSelectedIndex} />
        <StepDetails step={selectedStep} />
      </div>
    </main>
  );
}

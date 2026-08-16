'use client';

import { StepCard } from '@/components/StepCard';
import type { PipelineStep } from '@/types/pipeline';

interface PipelineViewProps {
  steps: PipelineStep[];
  selectedIndex: number | null;
  onSelectStep: (index: number) => void;
}

/** Middle column: the ordered list of pipeline steps, 00 through 07. */
export function PipelineView({ steps, selectedIndex, onSelectStep }: PipelineViewProps) {
  return (
    <div className="thin-scroll flex h-full flex-col gap-2 overflow-y-auto p-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</h2>
      {steps.map((step, index) => (
        <StepCard
          key={step.agent}
          step={step}
          isSelected={selectedIndex === index}
          onSelect={() => onSelectStep(index)}
        />
      ))}
    </div>
  );
}

'use client';

import { Circle, Loader2, CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PipelineStep } from '@/types/pipeline';
import { AGENT_LABEL } from '@/lib/mock-data';

interface StepCardProps {
  step: PipelineStep;
  isSelected: boolean;
  onSelect: () => void;
}

const STATUS_ICON: Record<PipelineStep['status'], React.ReactNode> = {
  idle: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
};

/** One row in the middle pipeline column. Status indicator + agent label + artifact name; clickable, highlighted when selected or currently running. */
export function StepCard({ step, isSelected, onSelect }: StepCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
        isSelected ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-accent/60',
        step.status === 'running' && 'ring-1 ring-amber-400',
      )}
    >
      {STATUS_ICON[step.status]}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{AGENT_LABEL[step.agent]}</div>
        <div className="truncate text-xs text-muted-foreground">{step.artifact}</div>
      </div>
    </button>
  );
}

'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JsonViewer } from '@/components/JsonViewer';
import { AGENT_LABEL } from '@/lib/mock-data';
import type { PipelineStep } from '@/types/pipeline';

interface StepDetailsProps {
  step: PipelineStep | null;
}

/** Right column: tabbed Input JSON / Output JSON / Formatted View for whichever step is selected. */
export function StepDetails({ step }: StepDetailsProps) {
  if (step === null) {
    return (
      <Card className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a step to inspect its input and output.</p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>{AGENT_LABEL[step.agent]}</CardTitle>
          <p className="text-xs text-muted-foreground">{step.artifact}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={step.status} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => downloadJson(step)}
            disabled={step.output === null}
          >
            <Download className="h-3.5 w-3.5" />
            Download output
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {step.status === 'error' && step.error !== undefined && (
          <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {step.error}
          </p>
        )}
        <Tabs defaultValue="formatted" className="flex h-full flex-col">
          <TabsList>
            <TabsTrigger value="formatted">Formatted View</TabsTrigger>
            <TabsTrigger value="input">Input JSON</TabsTrigger>
            <TabsTrigger value="output">Output JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="formatted" className="flex-1 overflow-auto">
            <FormattedView step={step} />
          </TabsContent>
          <TabsContent value="input" className="flex-1 overflow-auto">
            <JsonViewer data={step.input} />
          </TabsContent>
          <TabsContent value="output" className="flex-1 overflow-auto">
            {step.output === null ? (
              <p className="text-sm text-muted-foreground">No output yet.</p>
            ) : (
              <JsonViewer data={step.output} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: PipelineStep['status'] }) {
  const variant: BadgeProps['variant'] =
    status === 'success'
      ? 'success'
      : status === 'error'
        ? 'destructive'
        : status === 'running'
          ? 'warning'
          : 'muted';
  return <Badge variant={variant}>{status}</Badge>;
}

function downloadJson(step: PipelineStep) {
  const blob = new Blob([JSON.stringify(step.output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${step.agent}-output.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Per-agent readable rendering (Feature 5). Falls back to raw JSON for any agent without a dedicated formatted view, or before output exists. */
function FormattedView({ step }: { step: PipelineStep }) {
  if (step.output === null) {
    return <p className="text-sm text-muted-foreground">No output yet.</p>;
  }

  if (step.agent === 'agent-05-script-writer') return <ScriptView output={step.output} />;
  if (step.agent === 'agent-06-script-reviewer') return <ReviewView output={step.output} />;
  if (step.agent === 'agent-07-scene-planner') return <SceneView output={step.output} />;

  return <JsonViewer data={step.output} />;
}

// --- Agent 05: readable script text -----------------------------------

interface ScriptSegment {
  segmentId?: string;
  order?: number;
  segmentType?: string;
  narration?: string;
  estimatedDurationSeconds?: number;
}

function ScriptView({ output }: { output: unknown }) {
  const segments = extractArray<ScriptSegment>(output, 'segments');
  if (segments === null) return <JsonViewer data={output} />;

  return (
    <div className="thin-scroll max-h-[60vh] space-y-3 overflow-auto">
      {segments.map((segment, i) => (
        <div key={segment.segmentId ?? i} className="rounded-md border border-border p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            {segment.segmentType !== undefined && <Badge variant="outline">{segment.segmentType}</Badge>}
            {segment.estimatedDurationSeconds !== undefined && (
              <span>{segment.estimatedDurationSeconds}s</span>
            )}
          </div>
          <p className="text-sm leading-relaxed">{segment.narration ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

// --- Agent 06: findings list --------------------------------------------

interface ReviewIssue {
  issueId?: string;
  category?: string;
  severity?: string;
  location?: string;
  description?: string;
  recommendation?: string;
  repairability?: string;
}

function ReviewView({ output }: { output: unknown }) {
  const issues = extractArray<ReviewIssue>(output, 'issues');
  const summary = extractObject(output, 'summary');
  const nextAction = extractString(output, 'nextAction');

  if (issues === null) return <JsonViewer data={output} />;

  return (
    <div className="space-y-3">
      {(summary !== null || nextAction !== null) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          {summary !== null && 'decision' in summary && <Badge>{String(summary.decision)}</Badge>}
          {nextAction !== null && <Badge variant="outline">next: {nextAction}</Badge>}
          {summary !== null && 'blockingIssueCount' in summary && (
            <span className="text-muted-foreground">{String(summary.blockingIssueCount)} blocking</span>
          )}
        </div>
      )}
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings reported.</p>
      ) : (
        <div className="thin-scroll max-h-[55vh] space-y-2 overflow-auto">
          {issues.map((issue, i) => (
            <div key={issue.issueId ?? i} className="rounded-md border border-border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <SeverityBadge severity={issue.severity} />
                {issue.category !== undefined && <Badge variant="outline">{issue.category}</Badge>}
                {issue.location !== undefined && (
                  <span className="text-xs text-muted-foreground">{issue.location}</span>
                )}
              </div>
              <p className="text-sm">{issue.description ?? '—'}</p>
              {issue.recommendation !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">Recommendation: {issue.recommendation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (severity === undefined) return null;
  const variant: BadgeProps['variant'] =
    severity === 'CRITICAL' || severity === 'HIGH'
      ? 'destructive'
      : severity === 'MEDIUM'
        ? 'warning'
        : 'muted';
  return <Badge variant={variant}>{severity}</Badge>;
}

// --- Agent 07: scene breakdown -------------------------------------------

interface Scene {
  sceneId?: string;
  order?: number;
  sceneType?: string;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  visualPurpose?: string;
}

function SceneView({ output }: { output: unknown }) {
  const scenes = extractArray<Scene>(output, 'scenes');
  if (scenes === null) return <JsonViewer data={output} />;

  return (
    <div className="thin-scroll max-h-[60vh] space-y-2 overflow-auto">
      {scenes.map((scene, i) => (
        <div key={scene.sceneId ?? i} className="rounded-md border border-border p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{scene.sceneType ?? 'SCENE'}</Badge>
            {scene.startTimeSeconds !== undefined && scene.endTimeSeconds !== undefined && (
              <span>
                {scene.startTimeSeconds}s – {scene.endTimeSeconds}s
              </span>
            )}
          </div>
          <p className="text-sm">{scene.visualPurpose ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

// --- shape-safe extraction helpers (this tool visualizes whatever the agent returns, never assumes a schema) ---

function extractArray<T>(value: unknown, key: string): T[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? (field as T[]) : null;
}

function extractObject(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : null;
}

function extractString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}

'use client';

import { Sparkles } from 'lucide-react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FinalOutput } from '@/types/pipeline';

interface FinalOutputPanelProps {
  finalOutput: FinalOutput | null;
}

/**
 * The "Final Output" panel (Feature: user-ready output). Renders the
 * already-formatted `FinalOutput` the backend's `output-formatter.ts`
 * produced (or the mock-path equivalent) — story title/hook, the full
 * script narration, a colored APPROVED/NEEDS_REVISION review badge, and
 * the scene breakdown as cards. Never re-derives anything itself.
 */
export function FinalOutputPanel({ finalOutput }: FinalOutputPanelProps) {
  if (finalOutput === null) {
    return null;
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          Final Output
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {finalOutput.summary.topic} · {finalOutput.summary.niche} · {finalOutput.summary.audience}
        </p>
      </CardHeader>
      <CardContent className="thin-scroll flex-1 space-y-4 overflow-auto">
        {finalOutput.story !== null && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Story
            </h3>
            <p className="text-sm font-medium">{finalOutput.story.title}</p>
            <p className="mt-1 text-sm italic text-muted-foreground">
              &ldquo;{finalOutput.story.hook}&rdquo;
            </p>
            {finalOutput.story.outline.length > 0 && (
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
                {finalOutput.story.outline.map((beat, i) => (
                  <li key={i}>{beat}</li>
                ))}
              </ol>
            )}
          </section>
        )}

        {finalOutput.script !== null && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Script
            </h3>
            <p className="whitespace-pre-line rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed">
              {finalOutput.script.narration}
            </p>
          </section>
        )}

        {finalOutput.review !== null && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review
            </h3>
            <div className="flex items-center gap-2">
              <ReviewStatusBadge status={finalOutput.review.status} />
              <span className="text-sm text-muted-foreground">Score: {finalOutput.review.score}/100</span>
            </div>
            {finalOutput.review.issues.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {finalOutput.review.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {finalOutput.scenes.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scenes
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {finalOutput.scenes.map((scene) => (
                <div key={scene.sceneNumber} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Badge variant="outline">Scene {scene.sceneNumber}</Badge>
                  </div>
                  <p className="text-sm">{scene.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{scene.visual}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewStatusBadge({ status }: { status: 'APPROVED' | 'NEEDS_REVISION' }) {
  const variant: BadgeProps['variant'] = status === 'APPROVED' ? 'success' : 'destructive';
  return <Badge variant={variant}>{status === 'APPROVED' ? 'Approved' : 'Needs Revision'}</Badge>;
}

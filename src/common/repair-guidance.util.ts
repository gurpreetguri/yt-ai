/**
 * Turns a failed attempt's own validation findings into a targeted
 * instruction for the next (REPAIR) attempt at the SAME request, instead of
 * simply re-invoking blind and hoping for a different non-deterministic
 * result. Used by `PipelineService` (which has the prior attempt's issues)
 * and every agent's own prompt renderer (which appends the resulting text
 * to `systemPrompt` — see `strategy.prompt.ts` for why it must be
 * instruction content, never a DATA block).
 */

interface RepairIssueLike {
  readonly message: string;
  readonly details?: readonly { readonly path?: string }[];
}

/**
 * Builds the guidance text from a failed attempt's issues. Returns
 * `undefined` for an empty/absent issue list so callers can cheaply skip
 * appending anything on a first (INITIAL) attempt, which never has one.
 */
export function buildRepairGuidance(issues: readonly RepairIssueLike[] | undefined): string | undefined {
  if (issues === undefined || issues.length === 0) return undefined;
  return issues
    .map((issue) => {
      const path = issue.details?.[0]?.path;
      return path !== undefined ? `- ${path}: ${issue.message}` : `- ${issue.message}`;
    })
    .join('\n');
}

/**
 * Appends `repairGuidance` to `systemPrompt` as a clearly delimited,
 * runtime-supplied section — the approved prompt file's own text is never
 * modified, only extended. A no-op (returns `systemPrompt` unchanged) when
 * `repairGuidance` is absent or blank, so every prompt renderer can call
 * this unconditionally on every attempt, INITIAL included.
 */
export function appendRepairGuidance(systemPrompt: string, repairGuidance: string | undefined): string {
  if (repairGuidance === undefined || repairGuidance.trim().length === 0) return systemPrompt;
  return (
    `${systemPrompt}\n\n---\n## RUNTIME REPAIR GUIDANCE\n` +
    'Your previous attempt at this exact request failed validation for the reasons below. ' +
    'Correct every one of them in this response; do not repeat them, and do not otherwise ' +
    'change anything that already satisfied the instructions above.\n\n' +
    repairGuidance
  );
}

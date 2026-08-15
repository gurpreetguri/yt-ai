import exampleRequest from '@agents/agent-06-script-reviewer/examples/request.json';
import exampleResponse from '@agents/agent-06-script-reviewer/examples/response.json';

import type { ReviewReport, ScriptReviewerAgentRequest } from '@agents/agent-06-script-reviewer/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-06-script-reviewer/examples/`), not re-authored. Reusing
 * them keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as ScriptReviewerAgentRequest;
export const VALID_REVIEW_REPORT = exampleResponse.data as unknown as ReviewReport;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

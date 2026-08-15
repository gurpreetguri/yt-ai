import exampleRequest from '@agents/agent-02-research/examples/request.json';
import exampleResponse from '@agents/agent-02-research/examples/response.json';

import type { ResearchAgentRequest, ResearchPackage } from '@agents/agent-02-research/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-02-research/examples/`), not re-authored. Reusing them keeps
 * these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as ResearchAgentRequest;
export const VALID_RESEARCH_PACKAGE = exampleResponse.data as unknown as ResearchPackage;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

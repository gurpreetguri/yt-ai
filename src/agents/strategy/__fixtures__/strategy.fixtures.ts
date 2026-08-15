import exampleRequest from '@agents/agent-00-strategy/examples/request.json';
import exampleResponse from '@agents/agent-00-strategy/examples/response.json';

import type { StrategyAgentRequest, StrategyManifest } from '@agents/agent-00-strategy/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-00-strategy/examples/`), not re-authored. Reusing them keeps
 * these tests locked to the same contract instance CI validates
 * (`C-CONF-002`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as StrategyAgentRequest;
export const VALID_MANIFEST = exampleResponse.data as unknown as StrategyManifest;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

import exampleRequest from '@agents/agent-07-scene-planner/examples/request.json';
import exampleResponse from '@agents/agent-07-scene-planner/examples/response.json';

import type { ScenePlan, ScenePlannerAgentRequest } from '@agents/agent-07-scene-planner/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-07-scene-planner/examples/`), not re-authored. Reusing
 * them keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as ScenePlannerAgentRequest;
export const VALID_SCENE_PLAN = exampleResponse.data as unknown as ScenePlan;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

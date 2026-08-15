import exampleRequest from '@agents/agent-04-story-architect/examples/request.json';
import exampleResponse from '@agents/agent-04-story-architect/examples/response.json';

import type { StoryArchitectAgentRequest, StoryArchitecture } from '@agents/agent-04-story-architect/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-04-story-architect/examples/`), not re-authored. Reusing
 * them keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as StoryArchitectAgentRequest;
export const VALID_STORY_ARCHITECTURE = exampleResponse.data as unknown as StoryArchitecture;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

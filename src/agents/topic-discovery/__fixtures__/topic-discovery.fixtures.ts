import exampleRequest from '@agents/agent-01-topic-discovery/examples/request.json';
import exampleResponse from '@agents/agent-01-topic-discovery/examples/response.json';

import type { TopicDiscoveryAgentRequest, TopicOpportunitySet } from '@agents/agent-01-topic-discovery/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-01-topic-discovery/examples/`), not re-authored. Reusing
 * them keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as TopicDiscoveryAgentRequest;
export const VALID_TOPIC_SET = exampleResponse.data as unknown as TopicOpportunitySet;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

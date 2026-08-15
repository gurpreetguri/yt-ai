import exampleRequest from '@agents/agent-03-fact-verification/examples/request.json';
import exampleResponse from '@agents/agent-03-fact-verification/examples/response.json';

import type { FactVerificationAgentRequest, VerificationPackage } from '@agents/agent-03-fact-verification/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-03-fact-verification/examples/`), not re-authored. Reusing
 * them keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as FactVerificationAgentRequest;
export const VALID_VERIFICATION_PACKAGE = exampleResponse.data as unknown as VerificationPackage;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

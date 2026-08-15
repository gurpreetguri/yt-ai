import exampleRequest from '@agents/agent-05-script-writer/examples/request.json';
import exampleResponse from '@agents/agent-05-script-writer/examples/response.json';

import type { NarrationScript, ScriptWriterAgentRequest } from '@agents/agent-05-script-writer/interfaces';

/**
 * Test fixtures built from the approved package's own examples
 * (`agents/agent-05-script-writer/examples/`), not re-authored. Reusing them
 * keeps these tests locked to the same contract instance CI validates
 * (`C-CONF-001`) instead of drifting from a hand-rolled duplicate.
 */
export const VALID_REQUEST = exampleRequest as unknown as ScriptWriterAgentRequest;
export const VALID_NARRATION_SCRIPT = exampleResponse.data as unknown as NarrationScript;

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

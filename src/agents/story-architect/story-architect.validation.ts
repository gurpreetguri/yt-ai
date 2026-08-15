import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-04-story-architect/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `story-architect.module.ts` wires them.
 */
export const STORY_ARCHITECT_AJV = Symbol('STORY_ARCHITECT_AJV');
export const STORY_ARCHITECT_REQUEST_VALIDATOR = Symbol('STORY_ARCHITECT_REQUEST_VALIDATOR');
export const STORY_ARCHITECT_RESPONSE_VALIDATOR = Symbol('STORY_ARCHITECT_RESPONSE_VALIDATOR');
export const STORY_ARCHITECTURE_VALIDATOR = Symbol('STORY_ARCHITECTURE_VALIDATOR');

export type CompiledValidator = ValidateFunction;

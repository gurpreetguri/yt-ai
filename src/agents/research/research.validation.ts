import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-02-research/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `research.module.ts` wires them.
 */
export const RESEARCH_AJV = Symbol('RESEARCH_AJV');
export const RESEARCH_REQUEST_VALIDATOR = Symbol('RESEARCH_REQUEST_VALIDATOR');
export const RESEARCH_RESPONSE_VALIDATOR = Symbol('RESEARCH_RESPONSE_VALIDATOR');
export const RESEARCH_PACKAGE_VALIDATOR = Symbol('RESEARCH_PACKAGE_VALIDATOR');

export type CompiledValidator = ValidateFunction;

import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-06-script-reviewer/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `script-reviewer.module.ts` wires them.
 */
export const SCRIPT_REVIEWER_AJV = Symbol('SCRIPT_REVIEWER_AJV');
export const SCRIPT_REVIEWER_REQUEST_VALIDATOR = Symbol('SCRIPT_REVIEWER_REQUEST_VALIDATOR');
export const SCRIPT_REVIEWER_RESPONSE_VALIDATOR = Symbol('SCRIPT_REVIEWER_RESPONSE_VALIDATOR');
export const REVIEW_REPORT_VALIDATOR = Symbol('REVIEW_REPORT_VALIDATOR');

export type CompiledValidator = ValidateFunction;

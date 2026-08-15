import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-05-script-writer/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `script-writer.module.ts` wires them.
 */
export const SCRIPT_WRITER_AJV = Symbol('SCRIPT_WRITER_AJV');
export const SCRIPT_WRITER_REQUEST_VALIDATOR = Symbol('SCRIPT_WRITER_REQUEST_VALIDATOR');
export const SCRIPT_WRITER_RESPONSE_VALIDATOR = Symbol('SCRIPT_WRITER_RESPONSE_VALIDATOR');
export const NARRATION_SCRIPT_VALIDATOR = Symbol('NARRATION_SCRIPT_VALIDATOR');

export type CompiledValidator = ValidateFunction;

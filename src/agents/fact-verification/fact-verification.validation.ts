import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-03-fact-verification/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `fact-verification.module.ts` wires them.
 */
export const FACT_VERIFICATION_AJV = Symbol('FACT_VERIFICATION_AJV');
export const FACT_VERIFICATION_REQUEST_VALIDATOR = Symbol('FACT_VERIFICATION_REQUEST_VALIDATOR');
export const FACT_VERIFICATION_RESPONSE_VALIDATOR = Symbol('FACT_VERIFICATION_RESPONSE_VALIDATOR');
export const FACT_VERIFICATION_PACKAGE_VALIDATOR = Symbol('FACT_VERIFICATION_PACKAGE_VALIDATOR');

export type CompiledValidator = ValidateFunction;

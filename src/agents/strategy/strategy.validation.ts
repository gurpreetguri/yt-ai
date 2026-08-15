import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-00-strategy/validator.ts` package (implementation-checklist.md
 * §3). This module only names the tokens; `strategy.module.ts` wires them.
 */
export const STRATEGY_AJV = Symbol('STRATEGY_AJV');
export const STRATEGY_REQUEST_VALIDATOR = Symbol('STRATEGY_REQUEST_VALIDATOR');
export const STRATEGY_RESPONSE_VALIDATOR = Symbol('STRATEGY_RESPONSE_VALIDATOR');
export const STRATEGY_MANIFEST_VALIDATOR = Symbol('STRATEGY_MANIFEST_VALIDATOR');

export type CompiledValidator = ValidateFunction;

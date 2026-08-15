import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-01-topic-discovery/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `topic-discovery.module.ts` wires them.
 */
export const TOPIC_DISCOVERY_AJV = Symbol('TOPIC_DISCOVERY_AJV');
export const TOPIC_DISCOVERY_REQUEST_VALIDATOR = Symbol('TOPIC_DISCOVERY_REQUEST_VALIDATOR');
export const TOPIC_DISCOVERY_RESPONSE_VALIDATOR = Symbol('TOPIC_DISCOVERY_RESPONSE_VALIDATOR');
export const TOPIC_DISCOVERY_SET_VALIDATOR = Symbol('TOPIC_DISCOVERY_SET_VALIDATOR');

export type CompiledValidator = ValidateFunction;

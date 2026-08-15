import type { ValidateFunction } from 'ajv/dist/2020';

/**
 * DI tokens for the compiled Ajv validators. Compilation happens once, at
 * module wiring time, via `createContractValidator()` in the approved
 * `agents/agent-07-scene-planner/validator.ts` package
 * (implementation-checklist.md §3). This module only names the tokens;
 * `scene-planner.module.ts` wires them.
 */
export const SCENE_PLANNER_AJV = Symbol('SCENE_PLANNER_AJV');
export const SCENE_PLANNER_REQUEST_VALIDATOR = Symbol('SCENE_PLANNER_REQUEST_VALIDATOR');
export const SCENE_PLANNER_RESPONSE_VALIDATOR = Symbol('SCENE_PLANNER_RESPONSE_VALIDATOR');
export const SCENE_PLAN_VALIDATOR = Symbol('SCENE_PLAN_VALIDATOR');

export type CompiledValidator = ValidateFunction;

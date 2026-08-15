/**
 * Pure, deterministic capability matching for the Model Router.
 *
 * No I/O, no provider knowledge, no configuration reads — every function
 * here is a plain function of its arguments, so it is trivially unit
 * testable and safely reusable from both `model-registry.ts` (candidate
 * filtering) and `model-router.provider.ts` (ranking).
 */

import type { AiCapability, AiCapabilityRequirement } from '../types/ai-capability.types';
import type { AiModelDescriptor } from '../types/model.types';

/** Whether `modelCapabilities` contains every entry in `required`. An empty `required` list is always satisfied. */
export function supportsRequiredCapabilities(
  modelCapabilities: readonly AiCapability[],
  required: readonly AiCapability[],
): boolean {
  return required.every((capability) => modelCapabilities.includes(capability));
}

/**
 * How well `modelCapabilities` satisfies `preferred` — the count of
 * preferred capabilities the model also has, `0` when `preferred` is
 * absent or empty. Used only to RANK among candidates that already pass
 * `supportsRequiredCapabilities`; never to exclude one.
 */
export function calculateCapabilityScore(
  modelCapabilities: readonly AiCapability[],
  preferred: readonly AiCapability[] | undefined,
): number {
  if (preferred === undefined || preferred.length === 0) return 0;
  return preferred.filter((capability) => modelCapabilities.includes(capability)).length;
}

/**
 * Narrows `models` to those satisfying every `requirement.required`
 * capability. `requirement` absent (no capability constraint at all) or
 * `requirement.required` empty both return `models` unchanged — the
 * distinction between "no requirement object" and "an empty required list"
 * is intentionally not observable here, since both mean "nothing is
 * mandatory."
 */
export function filterByCapabilities<TModel extends Pick<AiModelDescriptor, 'capabilities'>>(
  models: readonly TModel[],
  requirement: AiCapabilityRequirement | undefined,
): readonly TModel[] {
  const required = requirement?.required ?? [];
  if (required.length === 0) return models;
  return models.filter((model) => supportsRequiredCapabilities(model.capabilities, required));
}

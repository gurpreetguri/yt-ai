/**
 * Provider-neutral capability vocabulary (ARC-001 §4.9). Agents describe
 * WHAT they need a model to be able to do; the router (`src/ai/router/`)
 * decides WHICH configured model/provider actually satisfies that, using
 * `AiModelDescriptor.capabilities` (`src/ai/types/model.types.ts`). No
 * agent, and nothing above the AI Abstraction Layer, ever names a provider
 * or a model to get a capability — this closed vocabulary is the only
 * channel for that.
 */
export type AiCapability = 'TEXT' | 'STRUCTURED_OUTPUT' | 'VISION' | 'TOOL_CALLING' | 'REASONING';

/**
 * What a single invocation needs from the selected model. `required`
 * capabilities that no candidate satisfies make that candidate ineligible
 * (`capability-matcher.ts` `supportsRequiredCapabilities`); `preferred`
 * capabilities only influence ranking among otherwise-eligible candidates
 * (`calculateCapabilityScore`) and never exclude one.
 */
export interface AiCapabilityRequirement {
  readonly required: readonly AiCapability[];
  readonly preferred?: readonly AiCapability[];
}

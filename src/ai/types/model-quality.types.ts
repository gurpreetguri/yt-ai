/**
 * A deterministic, operator-declared quality tier for a routable model
 * (`AiModelDescriptor.quality`) and the tier a request/policy targets
 * (`AiModelPolicy.quality`, `src/ai/router/model-policy.ts`). This is NOT a
 * benchmark result and NOT a vendor-claimed fact — it is a coarse,
 * human-assigned label (configuration-driven per provider, see
 * `src/config/ai.config.ts`) used only to break ties in ranking
 * (`src/ai/router/model-router.provider.ts`).
 */
export type AiModelQuality = 'LOW' | 'BALANCED' | 'HIGH' | 'MAX';

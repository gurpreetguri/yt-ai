import type { AiCapability } from '../types/ai-capability.types';
import type { AiModelQuality } from '../types/model-quality.types';

export type { AiModelQuality } from '../types/model-quality.types';
export type AiModelCostPolicy = 'FREE_ONLY' | 'LOW' | 'BALANCED' | 'ANY';
export type AiRouterMode = 'auto' | 'local' | 'free' | 'paid';

/**
 * The resolved routing policy for one invocation. The commissioning brief's
 * own shape, verbatim — this first version is a single GLOBAL policy
 * (`resolveModelPolicy` below, driven by `aiConfig.router`); there is no
 * per-agent policy file yet, and agents remain completely unaware this type
 * exists (README §"Model policy").
 */
export interface AiModelPolicy {
  readonly quality: AiModelQuality;
  readonly cost: AiModelCostPolicy;
  readonly localPreferred: boolean;
  readonly allowLocal: boolean;
  readonly allowFreeCloud: boolean;
  readonly allowPaidCloud: boolean;
  readonly requiredCapabilities: readonly AiCapability[];
}

/** The subset of `AiConfig.router` (`src/config/ai.config.ts`) needed to resolve a policy — kept narrow so this module never imports the full config type. */
export interface AiRouterEnvironmentConfig {
  readonly mode: AiRouterMode;
  readonly allowLocal: boolean;
  readonly allowFree: boolean;
  readonly allowPaid: boolean;
  readonly defaultQuality: AiModelQuality;
}

/**
 * Derives `AiModelPolicy` from `AI_ROUTER_MODE` and the `AI_ALLOW_*` flags
 * (commissioning brief "Environment policy" / "Model policy"):
 *
 *  - `local`: local providers only, regardless of `AI_ALLOW_*`.
 *  - `free`: local plus explicitly-configured free cloud providers.
 *  - `paid`: paid cloud providers only.
 *  - `auto`: every configured, policy-allowed provider — `AI_ALLOW_LOCAL`/
 *    `AI_ALLOW_FREE`/`AI_ALLOW_PAID` narrow this from their configured
 *    defaults; they have no effect in the other three modes, which each
 *    already fix what is allowed unconditionally.
 */
export function resolveModelPolicy(
  env: AiRouterEnvironmentConfig,
  requiredCapabilities: readonly AiCapability[] = [],
): AiModelPolicy {
  const base = { quality: env.defaultQuality, requiredCapabilities };
  switch (env.mode) {
    case 'local':
      return {
        ...base,
        cost: 'FREE_ONLY',
        localPreferred: true,
        allowLocal: true,
        allowFreeCloud: false,
        allowPaidCloud: false,
      };
    case 'free':
      return {
        ...base,
        cost: 'FREE_ONLY',
        localPreferred: true,
        allowLocal: true,
        allowFreeCloud: true,
        allowPaidCloud: false,
      };
    case 'paid':
      return {
        ...base,
        cost: 'ANY',
        localPreferred: false,
        allowLocal: false,
        allowFreeCloud: false,
        allowPaidCloud: true,
      };
    case 'auto':
    default:
      return {
        ...base,
        cost: 'BALANCED',
        localPreferred: env.allowLocal,
        allowLocal: env.allowLocal,
        allowFreeCloud: env.allowFree,
        allowPaidCloud: env.allowPaid,
      };
  }
}

/**
 * Deterministic preference ordering for each target quality tier, most
 * preferred first (commissioning brief "FIX 3" — not a benchmark, just a
 * fixed, documented ranking rule). Every tier appears exactly once in every
 * row, so every candidate always resolves to a defined position.
 */
const QUALITY_PREFERENCE_ORDER: Readonly<Record<AiModelQuality, readonly AiModelQuality[]>> = {
  LOW: ['LOW', 'BALANCED', 'HIGH', 'MAX'],
  BALANCED: ['BALANCED', 'HIGH', 'LOW', 'MAX'],
  HIGH: ['HIGH', 'MAX', 'BALANCED', 'LOW'],
  MAX: ['MAX', 'HIGH', 'BALANCED', 'LOW'],
};

/**
 * One additional deterministic ranking factor (`model-router.provider.ts`
 * `rankScore`): how well a candidate's declared `quality` matches the
 * policy's target `quality`, per `QUALITY_PREFERENCE_ORDER` above. Higher is
 * more preferred. Never a substitute for the capability/local/free/priority
 * factors already in `rankScore` — this is added alongside them, not in
 * place of them.
 */
export function qualityRankScore(target: AiModelQuality, candidate: AiModelQuality): number {
  const order = QUALITY_PREFERENCE_ORDER[target];
  const index = order.indexOf(candidate);
  return order.length - index;
}

import { Inject, Injectable } from '@nestjs/common';

import { PROVIDER_HEALTH_STORE, ProviderHealthStore } from './provider-health';

/**
 * Configured cooldown windows this first implementation applies. Sourced
 * from `aiConfig.router` (`src/config/ai.config.ts`) — never invented, and
 * never a stand-in for a real provider-reported quota. If a provider adapter
 * ever reports its own retry-after value (`recordRateLimit`'s optional
 * `retryAfterMs`), that value is preferred over the configured default.
 */
export interface QuotaCooldownConfig {
  readonly rateLimitCooldownMs: number;
  readonly quotaExhaustedCooldownMs: number;
}

/** DI token for the configured cooldown windows, injected into `QuotaManager`. */
export const QUOTA_COOLDOWN_CONFIG = Symbol('QUOTA_COOLDOWN_CONFIG');

/**
 * Translates a provider's `RATE_LIMIT` / `QUOTA_EXHAUSTED` failure into a
 * cooldown recorded on `ProviderHealthStore`. This is the ONLY place that
 * distinguishes the two: `RATE_LIMIT` is short, transient, and — when the
 * provider tells us how long — honours that reported duration exactly;
 * `QUOTA_EXHAUSTED` means a longer-lived allotment ran out and the provider
 * stays unavailable for the configured reset/cooldown window. Neither path
 * invents a quota figure that was never reported.
 */
@Injectable()
export class QuotaManager {
  constructor(
    @Inject(PROVIDER_HEALTH_STORE) private readonly health: ProviderHealthStore,
    @Inject(QUOTA_COOLDOWN_CONFIG) private readonly cooldowns: QuotaCooldownConfig,
  ) {}

  /** `retryAfterMs`, when the provider reported one, is honoured exactly instead of the configured default. */
  recordRateLimit(provider: string, retryAfterMs?: number, now: number = Date.now()): void {
    const cooldownMs = retryAfterMs ?? this.cooldowns.rateLimitCooldownMs;
    this.health.markRateLimited(provider, now + cooldownMs);
  }

  recordQuotaExhausted(provider: string, now: number = Date.now()): void {
    this.health.markQuotaExhausted(provider, now + this.cooldowns.quotaExhaustedCooldownMs);
  }
}

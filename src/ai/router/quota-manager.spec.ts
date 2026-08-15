import type { ProviderHealthStore, ProviderHealthState } from './provider-health';
import { QuotaManager } from './quota-manager';

/** FIX 2 — RATE_LIMIT cooldown honours a provider-reported retryAfterMs, falling back to the configured default when none was reported. */
describe('QuotaManager', () => {
  function fakeHealthStore(): ProviderHealthStore & {
    markRateLimitedCalls: Array<[string, number]>;
    markQuotaExhaustedCalls: Array<[string, number]>;
  } {
    const markRateLimitedCalls: Array<[string, number]> = [];
    const markQuotaExhaustedCalls: Array<[string, number]> = [];
    return {
      markRateLimitedCalls,
      markQuotaExhaustedCalls,
      get: (): ProviderHealthState => ({ provider: 'x', available: true, consecutiveFailures: 0 }),
      recordSuccess: () => undefined,
      recordFailure: () => undefined,
      markRateLimited: (provider: string, untilMs: number) => {
        markRateLimitedCalls.push([provider, untilMs]);
      },
      markQuotaExhausted: (provider: string, untilMs: number) => {
        markQuotaExhaustedCalls.push([provider, untilMs]);
      },
      isAvailable: () => true,
    };
  }

  // 2. RATE_LIMIT with retryAfterMs uses the reported cooldown.
  it('honours the provider-reported retryAfterMs instead of the configured default', () => {
    const health = fakeHealthStore();
    const quota = new QuotaManager(health, {
      rateLimitCooldownMs: 30_000,
      quotaExhaustedCooldownMs: 3_600_000,
    });
    const now = 1_000_000;

    quota.recordRateLimit('provider-a', 5_000, now);

    expect(health.markRateLimitedCalls).toEqual([['provider-a', now + 5_000]]);
  });

  // 3. RATE_LIMIT without retryAfterMs uses configured cooldown.
  it('falls back to the configured rate-limit cooldown when the provider reported none', () => {
    const health = fakeHealthStore();
    const quota = new QuotaManager(health, {
      rateLimitCooldownMs: 30_000,
      quotaExhaustedCooldownMs: 3_600_000,
    });
    const now = 1_000_000;

    quota.recordRateLimit('provider-a', undefined, now);

    expect(health.markRateLimitedCalls).toEqual([['provider-a', now + 30_000]]);
  });

  it('always uses the configured quota-exhausted cooldown (no provider-reported override exists for quota exhaustion)', () => {
    const health = fakeHealthStore();
    const quota = new QuotaManager(health, {
      rateLimitCooldownMs: 30_000,
      quotaExhaustedCooldownMs: 3_600_000,
    });
    const now = 1_000_000;

    quota.recordQuotaExhausted('provider-a', now);

    expect(health.markQuotaExhaustedCalls).toEqual([['provider-a', now + 3_600_000]]);
  });
});

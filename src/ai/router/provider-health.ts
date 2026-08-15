import { Injectable } from '@nestjs/common';

import type { AiProviderErrorKind } from '../ai-provider.interface';

/**
 * In-memory health snapshot for one provider. `rateLimitedUntil` /
 * `quotaExhaustedUntil` are epoch-millisecond deadlines (`quota-manager.ts`
 * sets them); `undefined` means "no active cooldown of that kind."
 */
export interface ProviderHealthState {
  readonly provider: string;
  readonly available: boolean;
  readonly consecutiveFailures: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
  readonly rateLimitedUntil?: number;
  readonly quotaExhaustedUntil?: number;
}

/**
 * The health-tracking contract `ModelRouterProvider` depends on. Deliberately
 * an interface, not a concrete class: this first implementation
 * (`InMemoryProviderHealthStore`) keeps state in a `Map` for the process
 * lifetime only — a future durable implementation (backed by a database or
 * a shared cache, once one exists in this project) can implement the same
 * interface and be swapped in via DI without touching the router.
 */
export interface ProviderHealthStore {
  /** The current state for `provider`. Returns a fresh "healthy, never used" state if `provider` has never been recorded. */
  get(provider: string, now?: number): ProviderHealthState;
  recordSuccess(provider: string, now?: number): void;
  /** Records a failure. Does not itself set a cooldown — `quota-manager.ts` calls `markRateLimited`/`markQuotaExhausted` separately for the failure kinds that warrant one. */
  recordFailure(provider: string, kind: AiProviderErrorKind, now?: number): void;
  markRateLimited(provider: string, untilMs: number): void;
  markQuotaExhausted(provider: string, untilMs: number): void;
  /** Whether `provider` is currently eligible for a new invocation: marked available AND no active rate-limit/quota cooldown as of `now`. */
  isAvailable(provider: string, now?: number): boolean;
}

function freshState(provider: string): ProviderHealthState {
  return { provider, available: true, consecutiveFailures: 0 };
}

/** DI token for `ProviderHealthStore` — inject this, never the concrete class, so a future durable implementation is a one-line swap. */
export const PROVIDER_HEALTH_STORE = Symbol('PROVIDER_HEALTH_STORE');

@Injectable()
export class InMemoryProviderHealthStore implements ProviderHealthStore {
  private readonly states = new Map<string, ProviderHealthState>();

  get(provider: string): ProviderHealthState {
    return this.states.get(provider) ?? freshState(provider);
  }

  recordSuccess(provider: string, now: number = Date.now()): void {
    const previous = this.get(provider);
    this.states.set(provider, {
      ...previous,
      available: true,
      consecutiveFailures: 0,
      lastSuccessAt: now,
      // A successful call proves the provider is reachable and authorised
      // again — any rate-limit/quota cooldown recorded before this success
      // no longer describes reality, so it is cleared rather than left to
      // silently expire on its own timer.
      rateLimitedUntil: undefined,
      quotaExhaustedUntil: undefined,
    });
  }

  recordFailure(provider: string, _kind: AiProviderErrorKind, now: number = Date.now()): void {
    const previous = this.get(provider);
    this.states.set(provider, {
      ...previous,
      consecutiveFailures: previous.consecutiveFailures + 1,
      lastFailureAt: now,
    });
  }

  markRateLimited(provider: string, untilMs: number): void {
    const previous = this.get(provider);
    this.states.set(provider, { ...previous, rateLimitedUntil: untilMs });
  }

  markQuotaExhausted(provider: string, untilMs: number): void {
    const previous = this.get(provider);
    this.states.set(provider, { ...previous, quotaExhaustedUntil: untilMs });
  }

  isAvailable(provider: string, now: number = Date.now()): boolean {
    const state = this.get(provider);
    if (!state.available) return false;
    if (state.rateLimitedUntil !== undefined && state.rateLimitedUntil > now) return false;
    if (state.quotaExhaustedUntil !== undefined && state.quotaExhaustedUntil > now) return false;
    return true;
  }
}

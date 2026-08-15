import { Injectable } from '@nestjs/common';

import type { AiProvider } from '../ai-provider.interface';

/**
 * How the router treats one registered provider ADAPTER (not a specific
 * model — see `model-registry.ts` for per-model metadata). `local`/`free`
 * classify the provider for `AiModelPolicy` filtering (`model-policy.ts`);
 * `priority` is a tie-breaker in ranking, never the sole deciding factor.
 */
export interface ProviderRegistration {
  readonly provider: AiProvider;
  readonly local: boolean;
  /** Explicit only — never inferred. A cloud provider is PAID unless something explicitly marks it FREE (commissioning brief "Environment policy"). */
  readonly free: boolean;
  readonly enabled: boolean;
  readonly priority: number;
}

/**
 * Holds already-constructed `AiProvider` adapter instances, keyed by
 * `providerName`. This registry NEVER instantiates a vendor SDK and NEVER
 * contains agent business logic — it is pure bookkeeping over adapters
 * that were built and configured elsewhere (`ai-provider.module.ts`) and
 * handed to it. `ModelRouterProvider` is the only reader.
 */
@Injectable()
export class ProviderRegistry {
  private readonly registrations = new Map<string, ProviderRegistration>();

  register(registration: ProviderRegistration): void {
    this.registrations.set(registration.provider.providerName, registration);
  }

  /** The provider adapter registered under `providerName`, or `undefined` if none was registered. */
  resolve(providerName: string): AiProvider | undefined {
    return this.registrations.get(providerName)?.provider;
  }

  /** The full registration (adapter + routing metadata) for `providerName`, or `undefined`. */
  resolveRegistration(providerName: string): ProviderRegistration | undefined {
    return this.registrations.get(providerName);
  }

  /** Every registered provider, in registration order. Includes disabled providers — callers filter as needed. */
  list(): readonly ProviderRegistration[] {
    return [...this.registrations.values()];
  }
}

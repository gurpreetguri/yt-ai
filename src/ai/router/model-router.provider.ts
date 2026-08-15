import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { aiConfig } from '../../config/ai.config';
import {
  AiInvocationRequest,
  AiInvocationResult,
  AiProvider,
  AiProviderError,
  AiProviderErrorKind,
} from '../ai-provider.interface';
import { calculateCapabilityScore } from './capability-matcher';
import { AiModelPolicy, qualityRankScore, resolveModelPolicy } from './model-policy';
import { ModelRegistry, RegisteredModel } from './model-registry';
import { PROVIDER_HEALTH_STORE, ProviderHealthStore } from './provider-health';
import { ProviderRegistry } from './provider-registry';
import { QuotaManager } from './quota-manager';

/**
 * Failure kinds that warrant trying the NEXT compatible candidate instead of
 * failing the whole invocation. `AUTH`, `CONFIGURATION`, and
 * `INVALID_RESPONSE` are deliberately excluded — a bad key or a malformed
 * request is a property of the REQUEST/configuration, not the provider's
 * momentary health, so retrying it against a different model would not fix
 * it and could mask a real defect (commissioning brief "Model Router" §7).
 */
const FAILOVER_KINDS: readonly AiProviderErrorKind[] = [
  'RATE_LIMIT',
  'QUOTA_EXHAUSTED',
  'TIMEOUT',
  'NETWORK',
  'PROVIDER_ERROR',
];

function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

/**
 * Provider-neutral Multi-LLM router (ARC-001 §4.9). Implements `AiProvider`
 * exactly like a single concrete adapter would — callers (agents, and
 * `AI_PROVIDER` itself) cannot tell the difference — but selects among
 * every registered, enabled, policy-allowed model at invocation time and
 * fails over to the next compatible candidate on a transient error.
 *
 * This class NEVER:
 *  - instantiates a vendor SDK (`ProviderRegistry` already holds built
 *    adapters — see `ai-provider.module.ts`);
 *  - calls `AI_PROVIDER` or itself recursively (it calls the concrete
 *    `AiProvider` adapter resolved from `ProviderRegistry` directly);
 *  - modifies `systemPrompt`/`userPrompt` (passed through unchanged to
 *    whichever adapter is attempted);
 *  - modifies a model's returned `content` (returned exactly as the
 *    adapter produced it — provenance fields (`provider`, `modelId`, ...)
 *    are the adapter's own, never rewritten to `"router"`);
 *  - retries the same candidate, or retries indefinitely (bounded by the
 *    number of eligible candidates for this one invocation).
 */
@Injectable()
export class ModelRouterProvider implements AiProvider {
  public readonly providerName = 'router';

  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly modelRegistry: ModelRegistry,
    @Inject(PROVIDER_HEALTH_STORE) private readonly health: ProviderHealthStore,
    private readonly quota: QuotaManager,
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
  ) {}

  async invoke(request: AiInvocationRequest): Promise<AiInvocationResult> {
    if (request.model !== undefined) {
      return this.invokeExplicit(request, request.model);
    }
    return this.invokeRanked(request);
  }

  /**
   * Explicit override (`AiInvocationRequest.model` supplied): resolves that
   * EXACT model, one attempt, no substitution and no failover — silently
   * picking a different model would defeat the reproducibility this option
   * exists for (commissioning brief "Explicit model override").
   */
  private async invokeExplicit(request: AiInvocationRequest, modelId: string): Promise<AiInvocationResult> {
    const matches = this.modelRegistry.findByModelId(modelId);
    if (matches.length === 0) {
      throw new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        `No enabled model is registered with modelId "${modelId}".`,
      );
    }
    if (matches.length > 1) {
      throw new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        `modelId "${modelId}" is registered by more than one provider (${matches
          .map((match) => match.descriptor.provider)
          .join(', ')}); an explicit override must resolve unambiguously.`,
      );
    }
    const candidate = matches[0];
    if (candidate === undefined) {
      throw new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        `No enabled model is registered with modelId "${modelId}".`,
      );
    }
    const registration = this.providerRegistry.resolveRegistration(candidate.descriptor.provider);
    if (registration === undefined || !registration.enabled) {
      throw new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        `Provider "${candidate.descriptor.provider}" for explicit model "${modelId}" is not registered or is disabled.`,
      );
    }
    return this.attempt(registration.provider, candidate, request);
  }

  /** No explicit override: rank every eligible candidate and attempt them in order, failing over on transient errors. */
  private async invokeRanked(request: AiInvocationRequest): Promise<AiInvocationResult> {
    const policy = resolveModelPolicy(this.config.router, request.capabilities?.required ?? []);
    const candidates = this.rankedCandidates(request, policy);

    if (candidates.length === 0) {
      throw new AiProviderError(
        'CONFIGURATION',
        this.providerName,
        'No enabled, policy-allowed, capability-matching model is available to route this request to.',
      );
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      const registration = this.providerRegistry.resolveRegistration(candidate.descriptor.provider);
      if (registration === undefined || !registration.enabled) continue;
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential failover by design: only try the next candidate after the current one has genuinely failed.
        return await this.attempt(registration.provider, candidate, request);
      } catch (error) {
        lastError = error;
        if (!this.config.router.fallbackEnabled || !this.shouldFailover(error)) {
          throw error;
        }
        // Continue to the next ranked candidate. Bounded by `candidates.length`
        // (computed once, above) — never retries the same candidate and never
        // loops indefinitely.
      }
    }

    throw (
      lastError ??
      new AiProviderError('CONFIGURATION', this.providerName, 'Every candidate model was unavailable.')
    );
  }

  /** One attempt against one resolved adapter. Records health/quota outcomes; never repairs or retries internally. */
  private async attempt(
    provider: AiProvider,
    candidate: RegisteredModel,
    request: AiInvocationRequest,
  ): Promise<AiInvocationResult> {
    const providerName = candidate.descriptor.provider;
    if (!this.health.isAvailable(providerName)) {
      throw this.unavailabilityError(providerName);
    }
    try {
      const result = await provider.invoke({ ...request, model: candidate.descriptor.modelId });
      this.health.recordSuccess(providerName);
      return result;
    } catch (error) {
      const kind = isAiProviderError(error) ? error.kind : 'PROVIDER_ERROR';
      this.health.recordFailure(providerName, kind);
      if (kind === 'RATE_LIMIT') {
        this.quota.recordRateLimit(providerName, isAiProviderError(error) ? error.retryAfterMs : undefined);
      }
      if (kind === 'QUOTA_EXHAUSTED') this.quota.recordQuotaExhausted(providerName);
      throw error;
    }
  }

  private unavailabilityError(providerName: string): AiProviderError {
    const state = this.health.get(providerName);
    const now = Date.now();
    if (state.quotaExhaustedUntil !== undefined && state.quotaExhaustedUntil > now) {
      return new AiProviderError(
        'QUOTA_EXHAUSTED',
        providerName,
        `Provider "${providerName}" quota is exhausted until ${new Date(state.quotaExhaustedUntil).toISOString()}.`,
      );
    }
    if (state.rateLimitedUntil !== undefined && state.rateLimitedUntil > now) {
      return new AiProviderError(
        'RATE_LIMIT',
        providerName,
        `Provider "${providerName}" is rate-limited until ${new Date(state.rateLimitedUntil).toISOString()}.`,
      );
    }
    return new AiProviderError(
      'CONFIGURATION',
      providerName,
      `Provider "${providerName}" is marked unavailable.`,
    );
  }

  private shouldFailover(error: unknown): boolean {
    if (!isAiProviderError(error)) return true;
    return FAILOVER_KINDS.includes(error.kind);
  }

  /**
   * Eligible candidates for this invocation, ranked deterministically
   * (commissioning brief "Model Router" §4): required-capability
   * satisfaction is already a hard filter (`ModelRegistry.candidatesForCapabilities`);
   * disabled models, unregistered/disabled providers, and providers
   * currently unhealthy or in a rate-limit/quota cooldown are removed
   * entirely, never merely deprioritised. What remains is sorted by score
   * (preferred-capability match, local preference, cost-policy alignment,
   * quality-tier alignment, descriptor/provider priority), with a final alphabetical
   * provider/modelId tie-break so ranking never depends on registration
   * order or object identity.
   */
  private rankedCandidates(request: AiInvocationRequest, policy: AiModelPolicy): readonly RegisteredModel[] {
    const now = Date.now();
    const capabilityMatched = this.modelRegistry.candidatesForCapabilities(request.capabilities);

    const eligible = capabilityMatched.filter((candidate) => {
      const registration = this.providerRegistry.resolveRegistration(candidate.descriptor.provider);
      if (registration === undefined || !registration.enabled) return false;
      if (candidate.descriptor.local && !policy.allowLocal) return false;
      if (!candidate.descriptor.local && candidate.free && !policy.allowFreeCloud) return false;
      if (!candidate.descriptor.local && !candidate.free && !policy.allowPaidCloud) return false;
      if (!this.health.isAvailable(candidate.descriptor.provider, now)) return false;
      return true;
    });

    return [...eligible].sort((a, b) => this.compareCandidates(a, b, request, policy));
  }

  private compareCandidates(
    a: RegisteredModel,
    b: RegisteredModel,
    request: AiInvocationRequest,
    policy: AiModelPolicy,
  ): number {
    const scoreDelta = this.rankScore(b, request, policy) - this.rankScore(a, request, policy);
    if (scoreDelta !== 0) return scoreDelta;
    if (a.descriptor.provider !== b.descriptor.provider) {
      return a.descriptor.provider.localeCompare(b.descriptor.provider);
    }
    return a.descriptor.modelId.localeCompare(b.descriptor.modelId);
  }

  private rankScore(candidate: RegisteredModel, request: AiInvocationRequest, policy: AiModelPolicy): number {
    const registration = this.providerRegistry.resolveRegistration(candidate.descriptor.provider);
    let score = 0;
    score +=
      calculateCapabilityScore(candidate.descriptor.capabilities, request.capabilities?.preferred) * 100;
    if (policy.localPreferred && candidate.descriptor.local) score += 50;
    if ((policy.cost === 'FREE_ONLY' || policy.cost === 'LOW') && candidate.free) score += 20;
    score += qualityRankScore(policy.quality, candidate.descriptor.quality) * 5;
    score += candidate.descriptor.priority * 10;
    score += registration?.priority ?? 0;
    return score;
  }
}

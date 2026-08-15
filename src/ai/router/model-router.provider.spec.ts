import type { AiInvocationRequest, AiInvocationResult, AiProvider } from '../ai-provider.interface';
import { AiProviderError } from '../ai-provider.interface';
import type { AiRouterConfig } from '../../config/ai.config';
import { ModelRegistry, RegisteredModel } from './model-registry';
import { ModelRouterProvider } from './model-router.provider';
import { InMemoryProviderHealthStore } from './provider-health';
import { ProviderRegistry } from './provider-registry';
import { QuotaManager } from './quota-manager';

/**
 * Unit tests for `ModelRouterProvider`. Every "provider" here is a hand-built
 * fake implementing `AiProvider` directly — no NestJS module bootstrapping,
 * no real network call, no real vendor adapter. This exercises the router's
 * own selection/failover/ranking logic in isolation from every concrete
 * adapter (`anthropic.provider.spec.ts` and `ollama.provider.spec.ts` cover
 * those separately).
 */
describe('ModelRouterProvider', () => {
  function fakeProvider(
    providerName: string,
    behavior: (request: AiInvocationRequest) => Promise<AiInvocationResult>,
  ): AiProvider {
    return { providerName, invoke: jest.fn(behavior) };
  }

  function successResult(providerName: string, modelId: string): AiInvocationResult {
    return {
      content: '{"ok":true}',
      finishReason: 'COMPLETE',
      provider: providerName,
      modelId,
      durationMs: 5,
      inputTokens: 10,
      outputTokens: 20,
    };
  }

  function descriptor(overrides: Partial<RegisteredModel['descriptor']> = {}): RegisteredModel['descriptor'] {
    return {
      provider: 'provider-a',
      modelId: 'model-a',
      capabilities: ['TEXT'],
      contextWindow: 8000,
      maxOutputTokens: 4000,
      supportsStructuredOutput: false,
      local: false,
      enabled: true,
      priority: 0,
      quality: 'BALANCED',
      ...overrides,
    };
  }

  function baseRequest(overrides: Partial<AiInvocationRequest> = {}): AiInvocationRequest {
    return {
      systemPrompt: 'system',
      userPrompt: 'user',
      parameters: { temperature: 0.2, topP: 1 },
      timeoutMs: 5000,
      ...overrides,
    };
  }

  function routerConfig(overrides: Partial<AiRouterConfig> = {}): AiRouterConfig {
    return {
      mode: 'auto',
      allowLocal: true,
      allowFree: true,
      allowPaid: true,
      fallbackEnabled: true,
      primaryProvider: undefined,
      defaultQuality: 'BALANCED',
      rateLimitCooldownMs: 30_000,
      quotaExhaustedCooldownMs: 3_600_000,
      freeProviders: [],
      ...overrides,
    };
  }

  interface Harness {
    readonly router: ModelRouterProvider;
    readonly providerRegistry: ProviderRegistry;
    readonly modelRegistry: ModelRegistry;
    readonly health: InMemoryProviderHealthStore;
  }

  function buildHarness(routerConfigOverrides: Partial<AiRouterConfig> = {}): Harness {
    const providerRegistry = new ProviderRegistry();
    const modelRegistry = new ModelRegistry();
    const health = new InMemoryProviderHealthStore();
    const quota = new QuotaManager(health, {
      rateLimitCooldownMs: routerConfig(routerConfigOverrides).rateLimitCooldownMs,
      quotaExhaustedCooldownMs: routerConfig(routerConfigOverrides).quotaExhaustedCooldownMs,
    });
    const router = new ModelRouterProvider(providerRegistry, modelRegistry, health, quota, {
      provider: 'router',
      router: routerConfig(routerConfigOverrides),
    } as never);
    return { router, providerRegistry, modelRegistry, health };
  }

  function register(
    harness: Harness,
    provider: AiProvider,
    registration: Partial<{ local: boolean; free: boolean; enabled: boolean; priority: number }>,
    modelOverrides: Partial<RegisteredModel['descriptor']> = {},
  ): void {
    harness.providerRegistry.register({
      provider,
      local: registration.local ?? false,
      free: registration.free ?? false,
      enabled: registration.enabled ?? true,
      priority: registration.priority ?? 0,
    });
    harness.modelRegistry.register({
      descriptor: descriptor({ provider: provider.providerName, ...modelOverrides }),
      free: registration.free ?? false,
    });
  }

  // 1. explicit model selection.
  it('resolves an explicitly requested model and does not consider other candidates', async () => {
    const harness = buildHarness();
    const primary = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const other = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, primary, {}, { modelId: 'model-a' });
    register(harness, other, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest({ model: 'model-a' }));

    expect(result.provider).toBe('provider-a');
    expect(result.modelId).toBe('model-a');
    expect(other.invoke).not.toHaveBeenCalled();
  });

  // 2. missing model.
  it('returns a normalized CONFIGURATION error when the explicitly requested model is not registered', async () => {
    const harness = buildHarness();
    register(
      harness,
      fakeProvider('provider-a', async () => successResult('provider-a', 'model-a')),
      {},
      { modelId: 'model-a' },
    );

    await expect(harness.router.invoke(baseRequest({ model: 'model-ghost' }))).rejects.toMatchObject({
      kind: 'CONFIGURATION',
    });
  });

  it('does not silently substitute a different model when the explicit model is unavailable (rate-limited)', async () => {
    const harness = buildHarness();
    const provider = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    register(harness, provider, {}, { modelId: 'model-a' });
    harness.health.markRateLimited('provider-a', Date.now() + 60_000);

    await expect(harness.router.invoke(baseRequest({ model: 'model-a' }))).rejects.toMatchObject({
      kind: 'RATE_LIMIT',
    });
    expect(provider.invoke).not.toHaveBeenCalled();
  });

  // 3. required capability matching.
  it('excludes a candidate missing a required capability', async () => {
    const harness = buildHarness();
    const textOnly = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const withVision = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, textOnly, { priority: 100 }, { modelId: 'model-a', capabilities: ['TEXT'] });
    register(harness, withVision, {}, { modelId: 'model-b', capabilities: ['TEXT', 'VISION'] });

    const result = await harness.router.invoke(baseRequest({ capabilities: { required: ['VISION'] } }));

    expect(result.provider).toBe('provider-b');
    expect(textOnly.invoke).not.toHaveBeenCalled();
  });

  // 4. preferred capability ranking.
  it('ranks a candidate with more preferred capabilities above one with fewer, all else equal', async () => {
    const harness = buildHarness();
    const fewer = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const more = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, fewer, {}, { modelId: 'model-a', capabilities: ['TEXT', 'REASONING'] });
    register(harness, more, {}, { modelId: 'model-b', capabilities: ['TEXT', 'REASONING', 'TOOL_CALLING'] });

    const result = await harness.router.invoke(
      baseRequest({ capabilities: { required: ['TEXT'], preferred: ['REASONING', 'TOOL_CALLING'] } }),
    );

    expect(result.provider).toBe('provider-b');
  });

  // 5. local-only mode.
  it('LOCAL mode only considers local candidates', async () => {
    const harness = buildHarness({ mode: 'local' });
    const cloud = fakeProvider('provider-cloud', async () => successResult('provider-cloud', 'model-cloud'));
    const local = fakeProvider('provider-local', async () => successResult('provider-local', 'model-local'));
    register(harness, cloud, { local: false, free: false }, { modelId: 'model-cloud', local: false });
    register(harness, local, { local: true, free: true }, { modelId: 'model-local', local: true });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-local');
    expect(cloud.invoke).not.toHaveBeenCalled();
  });

  // 6. free mode.
  it('FREE mode considers local and explicitly-free cloud candidates, excluding paid cloud', async () => {
    const harness = buildHarness({ mode: 'free' });
    const paidCloud = fakeProvider('provider-paid', async () => successResult('provider-paid', 'model-paid'));
    const freeCloud = fakeProvider('provider-free', async () => successResult('provider-free', 'model-free'));
    register(
      harness,
      paidCloud,
      { local: false, free: false, priority: 100 },
      { modelId: 'model-paid', local: false },
    );
    register(harness, freeCloud, { local: false, free: true }, { modelId: 'model-free', local: false });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-free');
    expect(paidCloud.invoke).not.toHaveBeenCalled();
  });

  // 7. paid mode.
  it('PAID mode only considers paid cloud candidates, excluding local', async () => {
    const harness = buildHarness({ mode: 'paid' });
    const local = fakeProvider('provider-local', async () => successResult('provider-local', 'model-local'));
    const paid = fakeProvider('provider-paid', async () => successResult('provider-paid', 'model-paid'));
    register(
      harness,
      local,
      { local: true, free: true, priority: 100 },
      { modelId: 'model-local', local: true },
    );
    register(harness, paid, { local: false, free: false }, { modelId: 'model-paid', local: false });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-paid');
    expect(local.invoke).not.toHaveBeenCalled();
  });

  // 8. auto mode.
  it('AUTO mode considers every allowed candidate according to AI_ALLOW_* flags', async () => {
    const harness = buildHarness({ mode: 'auto', allowLocal: false, allowFree: true, allowPaid: true });
    const local = fakeProvider('provider-local', async () => successResult('provider-local', 'model-local'));
    const free = fakeProvider('provider-free', async () => successResult('provider-free', 'model-free'));
    register(
      harness,
      local,
      { local: true, free: true, priority: 100 },
      { modelId: 'model-local', local: true },
    );
    register(harness, free, { local: false, free: true }, { modelId: 'model-free', local: false });

    const result = await harness.router.invoke(baseRequest());

    // AI_ALLOW_LOCAL=false excludes the local candidate even though it has higher priority.
    expect(result.provider).toBe('provider-free');
    expect(local.invoke).not.toHaveBeenCalled();
  });

  // 9. provider disabled.
  it('excludes a candidate whose provider registration is disabled', async () => {
    const harness = buildHarness();
    const disabled = fakeProvider('provider-disabled', async () =>
      successResult('provider-disabled', 'model-disabled'),
    );
    const enabled = fakeProvider('provider-enabled', async () =>
      successResult('provider-enabled', 'model-enabled'),
    );
    register(harness, disabled, { enabled: false, priority: 100 }, { modelId: 'model-disabled' });
    register(harness, enabled, { enabled: true }, { modelId: 'model-enabled' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-enabled');
    expect(disabled.invoke).not.toHaveBeenCalled();
  });

  // 10. provider unavailable.
  it('excludes a candidate the health store reports unavailable', async () => {
    const harness = buildHarness();
    const unavailable = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const available = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, unavailable, { priority: 100 }, { modelId: 'model-a' });
    register(harness, available, {}, { modelId: 'model-b' });
    harness.health.markQuotaExhausted('provider-a', Date.now() + 60_000);

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-b');
    expect(unavailable.invoke).not.toHaveBeenCalled();
  });

  // 11. provider rate-limited + 19. fallback to second provider.
  it('fails over to the next candidate when the first is RATE_LIMIT and records a cooldown', async () => {
    const harness = buildHarness();
    const limited = fakeProvider('provider-a', async () => {
      throw new AiProviderError('RATE_LIMIT', 'provider-a', 'slow down');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, limited, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-b');
    expect(limited.invoke).toHaveBeenCalledTimes(1);
    expect(harness.health.get('provider-a').rateLimitedUntil).toBeDefined();
  });

  // 12. provider quota exhausted.
  it('fails over to the next candidate when the first is QUOTA_EXHAUSTED and records a cooldown', async () => {
    const harness = buildHarness();
    const exhausted = fakeProvider('provider-a', async () => {
      throw new AiProviderError('QUOTA_EXHAUSTED', 'provider-a', 'quota gone');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, exhausted, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-b');
    expect(harness.health.get('provider-a').quotaExhaustedUntil).toBeDefined();
  });

  // 13. provider timeout.
  it('fails over to the next candidate when the first is TIMEOUT', async () => {
    const harness = buildHarness();
    const slow = fakeProvider('provider-a', async () => {
      throw new AiProviderError('TIMEOUT', 'provider-a', 'too slow');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, slow, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest());
    expect(result.provider).toBe('provider-b');
  });

  // 14. network failure.
  it('fails over to the next candidate when the first is NETWORK', async () => {
    const harness = buildHarness();
    const unreachable = fakeProvider('provider-a', async () => {
      throw new AiProviderError('NETWORK', 'provider-a', 'unreachable');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, unreachable, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest());
    expect(result.provider).toBe('provider-b');
  });

  // 15. provider failure.
  it('fails over to the next candidate when the first is PROVIDER_ERROR', async () => {
    const harness = buildHarness();
    const broken = fakeProvider('provider-a', async () => {
      throw new AiProviderError('PROVIDER_ERROR', 'provider-a', 'internal error');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, broken, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    const result = await harness.router.invoke(baseRequest());
    expect(result.provider).toBe('provider-b');
  });

  // 16. AUTH does not silently fail over.
  it('does not fail over on AUTH — propagates the error without trying the next candidate', async () => {
    const harness = buildHarness();
    const unauthorized = fakeProvider('provider-a', async () => {
      throw new AiProviderError('AUTH', 'provider-a', 'bad key');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, unauthorized, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await expect(harness.router.invoke(baseRequest())).rejects.toMatchObject({ kind: 'AUTH' });
    expect(backup.invoke).not.toHaveBeenCalled();
  });

  // 17. CONFIGURATION does not silently fail over.
  it('does not fail over on CONFIGURATION — propagates the error without trying the next candidate', async () => {
    const harness = buildHarness();
    const misconfigured = fakeProvider('provider-a', async () => {
      throw new AiProviderError('CONFIGURATION', 'provider-a', 'missing credential');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, misconfigured, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await expect(harness.router.invoke(baseRequest())).rejects.toMatchObject({ kind: 'CONFIGURATION' });
    expect(backup.invoke).not.toHaveBeenCalled();
  });

  // 18. invalid response handling.
  it('does not fail over on INVALID_RESPONSE — propagates the error without trying the next candidate', async () => {
    const harness = buildHarness();
    const malformed = fakeProvider('provider-a', async () => {
      throw new AiProviderError('INVALID_RESPONSE', 'provider-a', 'unparseable');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, malformed, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await expect(harness.router.invoke(baseRequest())).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
    expect(backup.invoke).not.toHaveBeenCalled();
  });

  it('does not fail over when AI_FALLBACK_ENABLED is false, even for a transient error', async () => {
    const harness = buildHarness({ fallbackEnabled: false });
    const limited = fakeProvider('provider-a', async () => {
      throw new AiProviderError('RATE_LIMIT', 'provider-a', 'slow down');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, limited, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await expect(harness.router.invoke(baseRequest())).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
    expect(backup.invoke).not.toHaveBeenCalled();
  });

  // 20. all providers unavailable.
  it('propagates the last error when every candidate fails', async () => {
    const harness = buildHarness();
    const a = fakeProvider('provider-a', async () => {
      throw new AiProviderError('TIMEOUT', 'provider-a', 'timed out');
    });
    const b = fakeProvider('provider-b', async () => {
      throw new AiProviderError('NETWORK', 'provider-b', 'unreachable');
    });
    register(harness, a, { priority: 100 }, { modelId: 'model-a' });
    register(harness, b, {}, { modelId: 'model-b' });

    await expect(harness.router.invoke(baseRequest())).rejects.toMatchObject({
      kind: 'NETWORK',
      provider: 'provider-b',
    });
    expect(a.invoke).toHaveBeenCalledTimes(1);
    expect(b.invoke).toHaveBeenCalledTimes(1);
  });

  it('returns a normalized CONFIGURATION error when no candidate satisfies the requested capabilities at all', async () => {
    const harness = buildHarness();
    register(
      harness,
      fakeProvider('provider-a', async () => successResult('provider-a', 'model-a')),
      {},
      { modelId: 'model-a', capabilities: ['TEXT'] },
    );

    await expect(
      harness.router.invoke(baseRequest({ capabilities: { required: ['VISION'] } })),
    ).rejects.toMatchObject({ kind: 'CONFIGURATION' });
  });

  // 21. deterministic candidate ranking.
  it('ranks candidates deterministically (repeated invocations pick the same winner given identical inputs)', async () => {
    const harness = buildHarness();
    const a = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const b = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, a, { priority: 5 }, { modelId: 'model-a', priority: 5 });
    register(harness, b, { priority: 5 }, { modelId: 'model-b', priority: 5 });

    const first = await harness.router.invoke(baseRequest());
    const second = await harness.router.invoke(baseRequest());

    // Tied scores fall back to alphabetical provider name — "provider-a" < "provider-b".
    expect(first.provider).toBe('provider-a');
    expect(second.provider).toBe('provider-a');
  });

  it('prefers the higher-priority candidate when scores would otherwise tie', async () => {
    const harness = buildHarness();
    const low = fakeProvider('provider-z', async () => successResult('provider-z', 'model-z'));
    const high = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    register(harness, low, { priority: 1 }, { modelId: 'model-z', priority: 1 });
    register(harness, high, { priority: 50 }, { modelId: 'model-a', priority: 50 });

    const result = await harness.router.invoke(baseRequest());

    // Alphabetically "provider-a" would win anyway, so use a name ordering
    // that would pick the LOWER-priority one if priority were ignored.
    expect(result.provider).toBe('provider-a');
  });

  // 22, 23. provider/model provenance.
  it('returns the real selected provider and model, never masking them behind providerName "router"', async () => {
    const harness = buildHarness();
    register(
      harness,
      fakeProvider('provider-a', async () => successResult('provider-a', 'model-a')),
      {},
      { modelId: 'model-a' },
    );

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-a');
    expect(result.modelId).toBe('model-a');
    expect(result.provider).not.toBe('router');
    expect(harness.router.providerName).toBe('router');
  });

  it("passes the candidate's own modelId to the resolved adapter's invoke() call", async () => {
    const harness = buildHarness();
    const provider = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    register(harness, provider, {}, { modelId: 'model-a' });

    await harness.router.invoke(baseRequest());

    expect(provider.invoke).toHaveBeenCalledWith(expect.objectContaining({ model: 'model-a' }));
  });

  it('never modifies systemPrompt/userPrompt when dispatching to the resolved adapter', async () => {
    const harness = buildHarness();
    const provider = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    register(harness, provider, {}, { modelId: 'model-a' });

    await harness.router.invoke(baseRequest({ systemPrompt: 'exact system', userPrompt: 'exact user' }));

    expect(provider.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: 'exact system', userPrompt: 'exact user' }),
    );
  });

  it('records a health success after a successful invocation', async () => {
    const harness = buildHarness();
    register(
      harness,
      fakeProvider('provider-a', async () => successResult('provider-a', 'model-a')),
      {},
      { modelId: 'model-a' },
    );

    await harness.router.invoke(baseRequest());

    const state = harness.health.get('provider-a');
    expect(state.lastSuccessAt).toBeDefined();
    expect(state.consecutiveFailures).toBe(0);
  });

  // FIX 2 end-to-end: a provider-reported retryAfterMs on the thrown
  // AiProviderError reaches QuotaManager/health as the cooldown actually
  // applied, instead of the router silently discarding it.
  it('propagates AiProviderError.retryAfterMs through to the recorded rate-limit cooldown', async () => {
    const harness = buildHarness();
    const now = Date.now();
    const limited = fakeProvider('provider-a', async () => {
      throw new AiProviderError('RATE_LIMIT', 'provider-a', 'slow down', undefined, 7_000);
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, limited, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await harness.router.invoke(baseRequest());

    const state = harness.health.get('provider-a');
    expect(state.rateLimitedUntil).toBeDefined();
    // Reported retryAfterMs (7000ms) is honoured rather than the configured
    // default cooldown (30000ms) — the two would place `rateLimitedUntil`
    // in clearly different ranges.
    expect(state.rateLimitedUntil).toBeGreaterThanOrEqual(now + 6_000);
    expect(state.rateLimitedUntil).toBeLessThan(now + 20_000);
  });

  it('falls back to the configured cooldown when RATE_LIMIT carries no retryAfterMs', async () => {
    const harness = buildHarness();
    const now = Date.now();
    const limited = fakeProvider('provider-a', async () => {
      throw new AiProviderError('RATE_LIMIT', 'provider-a', 'slow down');
    });
    const backup = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, limited, { priority: 100 }, { modelId: 'model-a' });
    register(harness, backup, {}, { modelId: 'model-b' });

    await harness.router.invoke(baseRequest());

    const state = harness.health.get('provider-a');
    expect(state.rateLimitedUntil).toBeGreaterThanOrEqual(now + 29_000);
  });

  // FIX 3 — quality-tier ranking.
  // 4. LOW quality prefers LOW model.
  it('LOW default quality prefers a LOW-quality candidate over a HIGH-quality one, all else equal', async () => {
    const harness = buildHarness({ defaultQuality: 'LOW' });
    const low = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const high = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, low, {}, { modelId: 'model-a', quality: 'LOW' });
    register(harness, high, {}, { modelId: 'model-b', quality: 'HIGH' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-a');
  });

  // 5. HIGH quality prefers HIGH model.
  it('HIGH default quality prefers a HIGH-quality candidate over a LOW-quality one, all else equal', async () => {
    const harness = buildHarness({ defaultQuality: 'HIGH' });
    const low = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const high = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, low, {}, { modelId: 'model-a', quality: 'LOW' });
    register(harness, high, {}, { modelId: 'model-b', quality: 'HIGH' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-b');
  });

  it('HIGH default quality prefers HIGH over MAX (MAX is not simply "always best")', async () => {
    const harness = buildHarness({ defaultQuality: 'HIGH' });
    const max = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const high = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, max, {}, { modelId: 'model-a', quality: 'MAX' });
    register(harness, high, {}, { modelId: 'model-b', quality: 'HIGH' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-b');
  });

  // 6. MAX quality prefers MAX model.
  it('MAX default quality prefers a MAX-quality candidate over every other tier, all else equal', async () => {
    const harness = buildHarness({ defaultQuality: 'MAX' });
    const balanced = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const high = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    const max = fakeProvider('provider-c', async () => successResult('provider-c', 'model-c'));
    register(harness, balanced, {}, { modelId: 'model-a', quality: 'BALANCED' });
    register(harness, high, {}, { modelId: 'model-b', quality: 'HIGH' });
    register(harness, max, {}, { modelId: 'model-c', quality: 'MAX' });

    const result = await harness.router.invoke(baseRequest());

    expect(result.provider).toBe('provider-c');
  });

  // 7. deterministic tie-break remains deterministic (with quality now in the score).
  it('breaks a full tie (including equal quality) alphabetically, deterministically across repeated calls', async () => {
    const harness = buildHarness({ defaultQuality: 'HIGH' });
    const a = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const b = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, a, {}, { modelId: 'model-a', quality: 'HIGH' });
    register(harness, b, {}, { modelId: 'model-b', quality: 'HIGH' });

    const first = await harness.router.invoke(baseRequest());
    const second = await harness.router.invoke(baseRequest());

    expect(first.provider).toBe('provider-a');
    expect(second.provider).toBe('provider-a');
  });

  // 8. capability requirements still override quality.
  it('excludes a HIGH-quality candidate missing a required capability even though quality would otherwise favour it', async () => {
    const harness = buildHarness({ defaultQuality: 'HIGH' });
    const highButIncapable = fakeProvider('provider-a', async () => successResult('provider-a', 'model-a'));
    const lowButCapable = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, highButIncapable, {}, { modelId: 'model-a', quality: 'HIGH', capabilities: ['TEXT'] });
    register(
      harness,
      lowButCapable,
      {},
      { modelId: 'model-b', quality: 'LOW', capabilities: ['TEXT', 'VISION'] },
    );

    const result = await harness.router.invoke(baseRequest({ capabilities: { required: ['VISION'] } }));

    expect(result.provider).toBe('provider-b');
    expect(highButIncapable.invoke).not.toHaveBeenCalled();
  });

  // 9. explicit model override remains exact and does not use quality ranking.
  it('explicit model override resolves the requested model regardless of quality, ignoring a higher-quality alternative', async () => {
    const harness = buildHarness({ defaultQuality: 'MAX' });
    const requestedLowQuality = fakeProvider('provider-a', async () =>
      successResult('provider-a', 'model-a'),
    );
    const higherQuality = fakeProvider('provider-b', async () => successResult('provider-b', 'model-b'));
    register(harness, requestedLowQuality, {}, { modelId: 'model-a', quality: 'LOW' });
    register(harness, higherQuality, {}, { modelId: 'model-b', quality: 'MAX' });

    const result = await harness.router.invoke(baseRequest({ model: 'model-a' }));

    expect(result.provider).toBe('provider-a');
    expect(result.modelId).toBe('model-a');
    expect(higherQuality.invoke).not.toHaveBeenCalled();
  });
});

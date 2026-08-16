import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../../config/ai.config';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { MockAiProvider } from '../providers/mock.provider';
import { OllamaProvider } from '../providers/ollama.provider';
import { ModelRegistry } from './model-registry';
import { ModelRouterProvider } from './model-router.provider';
import { InMemoryProviderHealthStore } from './provider-health';
import { ProviderRegistry } from './provider-registry';
import { QuotaManager } from './quota-manager';
import { RouterBootstrapService } from './router-bootstrap.service';

/**
 * Unit tests for `RouterBootstrapService` — the one place that registers
 * concrete provider adapters and model descriptors. Covers FIX 1 (empty
 * credential must disable a provider), FIX 2 (Anthropic's advertised
 * capabilities must match what the adapter actually implements today), and
 * FIX 3 (`AI_PRIMARY_PROVIDER` must be a ranking preference, applied only to
 * currently-registered providers).
 */
describe('RouterBootstrapService', () => {
  function makeConfig(overrides: Partial<ConfigType<typeof aiConfig>> = {}): ConfigType<typeof aiConfig> {
    return {
      provider: 'router',
      anthropic: {
        apiKey: undefined,
        model: 'claude-test-model',
        apiVersion: '2023-06-01',
        baseUrl: 'https://api.anthropic.invalid',
        quality: 'BALANCED',
      },
      openai: { apiKey: undefined, model: 'gpt-test-model', quality: 'BALANCED' },
      gemini: { apiKey: undefined, model: 'gemini-test-model', quality: 'BALANCED' },
      openrouter: { apiKey: undefined, model: 'openrouter-test-model', quality: 'BALANCED' },
      groq: { apiKey: undefined, model: 'groq-test-model', quality: 'BALANCED' },
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3', quality: 'BALANCED', numCtx: 8192 },
      timeoutMs: 45_000,
      maxOutputTokens: 8_000,
      router: {
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
      },
      ...overrides,
    } as ConfigType<typeof aiConfig>;
  }

  interface Harness {
    readonly service: RouterBootstrapService;
    readonly providerRegistry: ProviderRegistry;
    readonly modelRegistry: ModelRegistry;
  }

  function build(config: ConfigType<typeof aiConfig>): Harness {
    const providerRegistry = new ProviderRegistry();
    const modelRegistry = new ModelRegistry();
    const anthropic = new AnthropicProvider(config);
    const mock = new MockAiProvider();
    const ollama = new OllamaProvider(config);
    const service = new RouterBootstrapService(
      providerRegistry,
      modelRegistry,
      config,
      anthropic,
      mock,
      ollama,
    );
    service.onModuleInit();
    return { service, providerRegistry, modelRegistry };
  }

  // ---------------------------------------------------------------------
  // FIX 1 — empty/whitespace API key must not enable the provider.
  // ---------------------------------------------------------------------
  describe('FIX 1 — Anthropic enablement depends on a real credential', () => {
    // 1. undefined API key -> disabled.
    it('disables Anthropic when ANTHROPIC_API_KEY is undefined', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: undefined } }));
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.enabled).toBe(false);
      expect(harness.modelRegistry.findByModelId('claude-test-model')).toHaveLength(0);
    });

    // 2. empty API key -> disabled.
    it('disables Anthropic when ANTHROPIC_API_KEY is an empty string', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: '' } }));
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.enabled).toBe(false);
      expect(harness.modelRegistry.findByModelId('claude-test-model')).toHaveLength(0);
    });

    // 3. whitespace-only API key -> disabled.
    it('disables Anthropic when ANTHROPIC_API_KEY is whitespace-only', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: '   ' } }));
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.enabled).toBe(false);
      expect(harness.modelRegistry.findByModelId('claude-test-model')).toHaveLength(0);
    });

    // 4. non-empty API key -> enabled.
    it('enables Anthropic when ANTHROPIC_API_KEY is a real, non-empty value', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.enabled).toBe(true);
      expect(harness.modelRegistry.findByModelId('claude-test-model')).toHaveLength(1);
    });

    // 5. router with empty Anthropic key can select Ollama when Ollama is otherwise eligible.
    it('lets the router select Ollama when Anthropic has an empty credential', async () => {
      const config = makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: '' } });
      const harness = build(config);

      // Reproduce the router's own eligibility filter directly against the
      // registries this service populated: an empty-key Anthropic must not
      // appear as an enabled candidate, while Ollama must.
      const anthropicRegistration = harness.providerRegistry.resolveRegistration('anthropic');
      const ollamaRegistration = harness.providerRegistry.resolveRegistration('ollama');
      expect(anthropicRegistration?.enabled).toBe(false);
      expect(ollamaRegistration?.enabled).toBe(true);

      const eligibleModels = harness.modelRegistry.enabled();
      expect(eligibleModels.map((model) => model.descriptor.provider)).toEqual(['ollama']);
    });

    it('end-to-end: ModelRouterProvider actually selects Ollama, not Anthropic, when ANTHROPIC_API_KEY is empty', async () => {
      const config = makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: '' } });
      const harness = build(config);
      const health = new InMemoryProviderHealthStore();
      const quota = new QuotaManager(health, {
        rateLimitCooldownMs: config.router.rateLimitCooldownMs,
        quotaExhaustedCooldownMs: config.router.quotaExhaustedCooldownMs,
      });
      const router = new ModelRouterProvider(
        harness.providerRegistry,
        harness.modelRegistry,
        health,
        quota,
        config,
      );

      // Ollama is the only enabled candidate, so a real HTTP call would be
      // attempted; stub fetch to fail fast so this stays a unit test while
      // still proving Anthropic (which would throw synchronously on a
      // missing key) is never the one selected.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network unreachable')) as unknown as typeof fetch;
      try {
        await expect(
          router.invoke({
            systemPrompt: 'system',
            userPrompt: 'user',
            parameters: { temperature: 0.2, topP: 1 },
            timeoutMs: 1_000,
          }),
        ).rejects.toMatchObject({ provider: 'ollama' });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ---------------------------------------------------------------------
  // FIX 2 — Anthropic's advertised capabilities match what the adapter
  // actually implements today (text-only, no vision/tools/structured output).
  // ---------------------------------------------------------------------
  describe('FIX 2 — Anthropic capability declaration matches the real adapter', () => {
    function anthropicDescriptor(harness: Harness) {
      const [match] = harness.modelRegistry.findByModelId('claude-test-model');
      if (match === undefined) throw new Error('test setup: Anthropic descriptor expected to be registered');
      return match.descriptor;
    }

    it('does not advertise VISION', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect(anthropicDescriptor(harness).capabilities).not.toContain('VISION');
    });

    it('does not advertise TOOL_CALLING', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect(anthropicDescriptor(harness).capabilities).not.toContain('TOOL_CALLING');
    });

    it('does not advertise STRUCTURED_OUTPUT', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect(anthropicDescriptor(harness).capabilities).not.toContain('STRUCTURED_OUTPUT');
      expect(anthropicDescriptor(harness).supportsStructuredOutput).toBe(false);
    });

    it('still advertises TEXT', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect(anthropicDescriptor(harness).capabilities).toContain('TEXT');
    });

    it('advertises exactly TEXT and REASONING, nothing else', () => {
      const harness = build(makeConfig({ anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' } }));
      expect([...anthropicDescriptor(harness).capabilities].sort()).toEqual(['REASONING', 'TEXT']);
    });
  });

  // ---------------------------------------------------------------------
  // FIX 3 — AI_PRIMARY_PROVIDER is a ranking preference for currently
  // registered providers only.
  // ---------------------------------------------------------------------
  describe('FIX 3 — AI_PRIMARY_PROVIDER influences registration priority', () => {
    // 1. no primary provider -> existing deterministic ranking (Anthropic default priority 100 > Ollama's 10).
    it('preserves the existing default priorities when no primary provider is configured', () => {
      const harness = build(
        makeConfig({
          anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' },
          router: { ...makeConfig().router, primaryProvider: undefined },
        }),
      );
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.priority).toBe(100);
      expect(harness.providerRegistry.resolveRegistration('ollama')?.priority).toBe(10);
      expect(harness.providerRegistry.resolveRegistration('mock')?.priority).toBe(-1000);
    });

    // 2. primary=ollama -> Ollama preferred (ranks strictly above Anthropic's default-boosted priority).
    it('boosts Ollama above Anthropic when AI_PRIMARY_PROVIDER=ollama', () => {
      const harness = build(
        makeConfig({
          anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' },
          router: { ...makeConfig().router, primaryProvider: 'ollama' },
        }),
      );
      const anthropicPriority =
        harness.providerRegistry.resolveRegistration('anthropic')?.priority ?? -Infinity;
      const ollamaPriority = harness.providerRegistry.resolveRegistration('ollama')?.priority ?? -Infinity;
      expect(ollamaPriority).toBeGreaterThan(anthropicPriority);
      expect(ollamaPriority).toBe(10 + 1000);
    });

    // 3. primary=anthropic -> Anthropic preferred.
    it('boosts Anthropic further above Ollama when AI_PRIMARY_PROVIDER=anthropic', () => {
      const harness = build(
        makeConfig({
          anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' },
          router: { ...makeConfig().router, primaryProvider: 'anthropic' },
        }),
      );
      const anthropicPriority =
        harness.providerRegistry.resolveRegistration('anthropic')?.priority ?? -Infinity;
      const ollamaPriority = harness.providerRegistry.resolveRegistration('ollama')?.priority ?? -Infinity;
      expect(anthropicPriority).toBeGreaterThan(ollamaPriority);
      expect(anthropicPriority).toBe(100 + 1000);
    });

    // 4. primary provider unavailable (disabled here via empty credential) -> the boost has no effect on enablement.
    it('does not enable a disabled primary provider — the boost is priority-only', () => {
      const harness = build(
        makeConfig({
          anthropic: { ...makeConfig().anthropic, apiKey: '' },
          router: { ...makeConfig().router, primaryProvider: 'anthropic' },
        }),
      );
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.enabled).toBe(false);
      expect(harness.providerRegistry.resolveRegistration('anthropic')?.priority).toBe(100 + 1000);
    });

    // 5. primary provider lacks a required capability -> irrelevant to bootstrap (registered
    // descriptors are unaffected by capability requirements at registration time; the router's
    // own capability filter, exercised in model-router.provider.spec.ts, is what enforces this).
    it('does not alter capability declarations when acting as the primary provider', () => {
      const harness = build(
        makeConfig({
          anthropic: { ...makeConfig().anthropic, apiKey: 'sk-real-key' },
          router: { ...makeConfig().router, primaryProvider: 'anthropic' },
        }),
      );
      const [match] = harness.modelRegistry.findByModelId('claude-test-model');
      expect(match?.descriptor.capabilities).toEqual(['TEXT', 'REASONING']);
    });

    it('never applies the primary-provider boost to disabled future-provider placeholders', () => {
      const harness = build(makeConfig({ router: { ...makeConfig().router, primaryProvider: 'openai' } }));
      const [openaiModel] = harness.modelRegistry.findByModelId('gpt-test-model');
      // Disabled placeholders are excluded by `findByModelId` (enabled-only lookup);
      // fall back to `all()` to inspect the raw registered priority.
      const openaiEntry = harness.modelRegistry.all().find((model) => model.descriptor.provider === 'openai');
      expect(openaiModel).toBeUndefined();
      expect(openaiEntry?.descriptor.priority).toBe(90);
      expect(harness.providerRegistry.resolveRegistration('openai')).toBeUndefined();
    });
  });
});

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import { aiConfig } from '../config/ai.config';
import { AI_PROVIDER } from './ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { MockAiProvider } from './providers/mock.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { resolveAiProviderInstance } from './resolve-ai-provider.util';
import { ModelRegistry } from './router/model-registry';
import { ModelRouterProvider } from './router/model-router.provider';
import { InMemoryProviderHealthStore, PROVIDER_HEALTH_STORE } from './router/provider-health';
import { ProviderRegistry } from './router/provider-registry';
import { QUOTA_COOLDOWN_CONFIG, QuotaCooldownConfig, QuotaManager } from './router/quota-manager';
import { RouterBootstrapService } from './router/router-bootstrap.service';

/**
 * Binds `AI_PROVIDER` to a concrete implementation chosen by configuration
 * (`AI_PROVIDER` env var). This is the only place in the codebase that knows
 * every available provider class; everything else depends on the interface.
 *
 * `AI_PROVIDER=router` resolves to `ModelRouterProvider` — the provider-
 * neutral Multi-LLM router (`src/ai/router/`) that selects among every
 * registered, enabled, policy-allowed model at invocation time and fails
 * over on transient errors. `AI_PROVIDER=anthropic`, `AI_PROVIDER=openrouter`,
 * and `AI_PROVIDER=mock` continue to bind directly to a single concrete
 * adapter, byte-for-byte the same behaviour this module had before the
 * router existed — every existing agent test that overrides `AI_PROVIDER`
 * via `.overrideProvider(AI_PROVIDER).useValue(...)` never even constructs
 * this module's factory, so it is unaffected either way.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AnthropicProvider,
    GeminiProvider,
    GroqProvider,
    MockAiProvider,
    OllamaProvider,
    OpenRouterProvider,
    ProviderRegistry,
    ModelRegistry,
    { provide: PROVIDER_HEALTH_STORE, useClass: InMemoryProviderHealthStore },
    {
      provide: QUOTA_COOLDOWN_CONFIG,
      inject: [aiConfig.KEY],
      useFactory: (config: ConfigType<typeof aiConfig>): QuotaCooldownConfig => ({
        rateLimitCooldownMs: config.router.rateLimitCooldownMs,
        quotaExhaustedCooldownMs: config.router.quotaExhaustedCooldownMs,
      }),
    },
    QuotaManager,
    ModelRouterProvider,
    // Populates ProviderRegistry/ModelRegistry on module init. Not injected
    // anywhere else — Nest still constructs every provider declared in a
    // module's `providers` array and runs its lifecycle hooks, so
    // `onModuleInit` fires regardless of whether anything depends on this
    // service directly.
    RouterBootstrapService,
    {
      provide: AI_PROVIDER,
      inject: [
        aiConfig.KEY,
        AnthropicProvider,
        MockAiProvider,
        ModelRouterProvider,
        OpenRouterProvider,
        GeminiProvider,
        GroqProvider,
      ],
      useFactory: (
        config: ConfigType<typeof aiConfig>,
        anthropic: AnthropicProvider,
        mock: MockAiProvider,
        router: ModelRouterProvider,
        openrouter: OpenRouterProvider,
        gemini: GeminiProvider,
        groq: GroqProvider,
      ) => resolveAiProviderInstance(config.provider, { anthropic, mock, router, openrouter, gemini, groq }),
    },
  ],
  exports: [
    AI_PROVIDER,
    AnthropicProvider,
    MockAiProvider,
    ModelRouterProvider,
    OpenRouterProvider,
    GeminiProvider,
    GroqProvider,
  ],
})
export class AiProviderModule {}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { aiConfig } from '../../config/ai.config';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { MockAiProvider } from '../providers/mock.provider';
import { OllamaProvider } from '../providers/ollama.provider';
import type { AiModelDescriptor } from '../types/model.types';
import { ModelRegistry } from './model-registry';
import { ProviderRegistry } from './provider-registry';

/**
 * The ONE place that knows every concrete provider adapter and every
 * routable model descriptor, and wires them into `ProviderRegistry` /
 * `ModelRegistry` at module startup. Nothing else in `src/ai/router/`
 * names a vendor; nothing here instantiates a vendor SDK (the adapters
 * themselves already use bare `fetch`, per `AnthropicProvider`'s and
 * `OllamaProvider`'s own doc comments) — this service only registers
 * already-constructed `AiProvider` instances and plain descriptor data.
 *
 * Context-window and default-model values below are the vendors' own
 * publicly documented specifications (Anthropic's Claude models: 200K
 * tokens; Ollama: no fixed value exists — it depends entirely on which
 * local model was pulled, so a conservative generic default is used and
 * documented as a known limitation, never presented as a measured fact).
 * `maxOutputTokens` is sourced from the shared `aiConfig.maxOutputTokens`
 * so there is exactly one configured ceiling, not a second hardcoded one.
 */
@Injectable()
export class RouterBootstrapService implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly modelRegistry: ModelRegistry,
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
    private readonly anthropic: AnthropicProvider,
    private readonly mock: MockAiProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  onModuleInit(): void {
    this.registerAnthropic();
    this.registerOllama();
    this.registerMock();
    this.registerFutureProviderPlaceholders();
  }

  private isFree(providerName: string): boolean {
    return this.config.router.freeProviders.includes(providerName);
  }

  /**
   * `AI_PRIMARY_PROVIDER` (FIX 3) is a ranking PREFERENCE only — applied
   * here, at registration priority, so it flows through the router's
   * existing `rankScore()` exactly like any other priority value. It never
   * bypasses capability filtering, health/rate-limit/quota state, or
   * local/free/paid policy (`model-router.provider.ts` `rankedCandidates()`
   * already removes ineligible candidates before priority is ever
   * consulted), and it is never applied to the disabled future-provider
   * placeholders, which cannot be selected at all.
   */
  private providerPriority(providerName: string, defaultPriority: number): number {
    if (this.config.router.primaryProvider === providerName) {
      return defaultPriority + 1000;
    }
    return defaultPriority;
  }

  /**
   * An empty or whitespace-only credential must disable the provider exactly
   * like an absent one (FIX 1) — `apiKey !== undefined` alone treats
   * `ANTHROPIC_API_KEY=` (present but empty) as configured, which could
   * make the router select Anthropic, hit AUTH/CONFIGURATION, and stop
   * instead of failing over to a genuinely eligible provider like Ollama.
   * `AUTH` itself remains non-failover (`model-router.provider.ts`
   * `FAILOVER_KINDS`) — this only changes whether Anthropic is a candidate
   * in the first place.
   */
  private hasCredential(apiKey: string | undefined): boolean {
    return Boolean(apiKey?.trim());
  }

  private registerAnthropic(): void {
    const priority = this.providerPriority('anthropic', 100);
    const enabled = this.hasCredential(this.config.anthropic.apiKey);
    this.providerRegistry.register({
      provider: this.anthropic,
      local: false,
      free: this.isFree('anthropic'),
      enabled,
      priority,
    });
    const descriptor: AiModelDescriptor = {
      provider: 'anthropic',
      modelId: this.config.anthropic.model,
      // The adapter currently sends text-only messages: no image input, no
      // tool definitions/tool_choice, no function/tool invocation (FIX 2).
      // Advertising VISION/TOOL_CALLING/STRUCTURED_OUTPUT here would let the
      // router select this model for a requirement it cannot actually
      // honour — only declare what the adapter genuinely implements today.
      capabilities: ['TEXT', 'REASONING'],
      contextWindow: 200_000,
      maxOutputTokens: this.config.maxOutputTokens,
      supportsStructuredOutput: false,
      local: false,
      enabled,
      priority,
      quality: this.config.anthropic.quality,
    };
    this.modelRegistry.register({ descriptor, free: this.isFree('anthropic') });
  }

  private registerOllama(): void {
    const priority = this.providerPriority('ollama', 10);
    this.providerRegistry.register({
      provider: this.ollama,
      local: true,
      free: true,
      enabled: true,
      priority,
    });
    const descriptor: AiModelDescriptor = {
      provider: 'ollama',
      modelId: this.config.ollama.model,
      capabilities: ['TEXT'],
      // No fixed context window exists for "Ollama" in the abstract — it
      // depends on the specific local model pulled. This conservative
      // generic default is a documented limitation (README), never a
      // measured spec for the actual model in use.
      contextWindow: 8_192,
      maxOutputTokens: this.config.maxOutputTokens,
      supportsStructuredOutput: false,
      local: true,
      enabled: true,
      priority,
      quality: this.config.ollama.quality,
    };
    this.modelRegistry.register({ descriptor, free: true });
  }

  private registerMock(): void {
    // Registered for observability/explicit resolution only. Deliberately
    // NOT given a `ModelRegistry` descriptor, so ranked (non-explicit)
    // routing never selects it automatically — `MockAiProvider` always
    // refuses (see its own doc comment), which must never be silently
    // substituted for a real model's judgement.
    this.providerRegistry.register({
      provider: this.mock,
      local: false,
      free: true,
      enabled: true,
      priority: this.providerPriority('mock', -1000),
    });
  }

  /**
   * OpenAI, Gemini, OpenRouter, and Groq are registry-ready but not yet
   * implemented (commissioning brief "Provider adapters" — "the other
   * providers may remain registry-ready but disabled"). Their model
   * descriptors are registered so the shape of the system already
   * accommodates them, but every one is `enabled: false`; none has a
   * corresponding `ProviderRegistry` entry (there is no adapter instance to
   * register), which independently guarantees the router can never select
   * one even if a future change accidentally flipped `enabled` without also
   * adding the adapter.
   */
  private registerFutureProviderPlaceholders(): void {
    const placeholders: readonly AiModelDescriptor[] = [
      {
        provider: 'openai',
        modelId: this.config.openai.model,
        capabilities: ['TEXT', 'STRUCTURED_OUTPUT', 'VISION', 'TOOL_CALLING', 'REASONING'],
        contextWindow: 128_000,
        maxOutputTokens: this.config.maxOutputTokens,
        supportsStructuredOutput: true,
        local: false,
        enabled: false,
        priority: 90,
        quality: this.config.openai.quality,
      },
      {
        provider: 'gemini',
        modelId: this.config.gemini.model,
        capabilities: ['TEXT', 'STRUCTURED_OUTPUT', 'VISION', 'TOOL_CALLING', 'REASONING'],
        contextWindow: 1_000_000,
        maxOutputTokens: this.config.maxOutputTokens,
        supportsStructuredOutput: true,
        local: false,
        enabled: false,
        priority: 90,
        quality: this.config.gemini.quality,
      },
      {
        provider: 'openrouter',
        modelId: this.config.openrouter.model,
        capabilities: ['TEXT'],
        contextWindow: 32_000,
        maxOutputTokens: this.config.maxOutputTokens,
        supportsStructuredOutput: false,
        local: false,
        enabled: false,
        priority: 50,
        quality: this.config.openrouter.quality,
      },
      {
        provider: 'groq',
        modelId: this.config.groq.model,
        capabilities: ['TEXT', 'TOOL_CALLING'],
        contextWindow: 128_000,
        maxOutputTokens: this.config.maxOutputTokens,
        supportsStructuredOutput: false,
        local: false,
        enabled: false,
        priority: 60,
        quality: this.config.groq.quality,
      },
    ];
    for (const descriptor of placeholders) {
      this.modelRegistry.register({ descriptor, free: this.isFree(descriptor.provider) });
    }
  }
}

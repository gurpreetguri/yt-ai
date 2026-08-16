import { registerAs } from '@nestjs/config';

import type { AiModelQuality, AiRouterMode } from '../ai/router/model-policy';

function isAiModelQuality(value: string | undefined): value is AiModelQuality {
  return value === 'LOW' || value === 'BALANCED' || value === 'HIGH' || value === 'MAX';
}

/**
 * An operator-declared quality tier for one provider's configured model
 * (FIX 3 "make the values configuration-driven ... rather than embedding
 * subjective claims"). Defaults to `BALANCED` for every provider — this
 * file makes no claim about any vendor's actual model quality; an operator
 * who wants a provider ranked as HIGH/MAX/LOW sets the corresponding
 * `*_MODEL_QUALITY` environment variable explicitly (see `.env.example`).
 */
function envModelQuality(name: string): AiModelQuality {
  const raw = process.env[name];
  return isAiModelQuality(raw) ? raw : 'BALANCED';
}

/**
 * AI provider configuration (STD-000 §14). Nothing here is a secret literal —
 * every value is read from the process environment. See `.env.example` for
 * the complete list of supported variables.
 *
 * `router` configures `ModelRouterProvider` (`src/ai/router/model-router.provider.ts`)
 * — the multi-LLM router `AI_PROVIDER` resolves to when `provider === 'router'`
 * (`ai-provider.module.ts`). It has no effect when `provider` is `'anthropic'`
 * or `'mock'`, both of which continue to bind `AI_PROVIDER` directly to a
 * single concrete adapter exactly as before this router existed.
 */
export interface ProviderCredentialConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
  /** Operator-declared quality tier for `model` above — see `envModelQuality`. */
  readonly quality: AiModelQuality;
}

export interface AiRouterConfig {
  readonly mode: AiRouterMode;
  readonly allowLocal: boolean;
  readonly allowFree: boolean;
  readonly allowPaid: boolean;
  readonly fallbackEnabled: boolean;
  /** Advisory only in this first version — informs bootstrap provider priority (`ai-provider.module.ts`); does not itself force selection. */
  readonly primaryProvider: string | undefined;
  readonly defaultQuality: AiModelQuality;
  /** Cooldown applied when a provider reports `RATE_LIMIT` and gives no retry-after value of its own (`quota-manager.ts`). */
  readonly rateLimitCooldownMs: number;
  /** Cooldown applied when a provider reports `QUOTA_EXHAUSTED` (`quota-manager.ts`). Never a stand-in for a real reported quota. */
  readonly quotaExhaustedCooldownMs: number;
  /** Explicit allow-list of provider names treated as FREE cloud providers for `AiModelPolicy.allowFreeCloud` filtering. A provider absent from this list is PAID unless `local`. Never inferred (commissioning brief "Environment policy"). */
  readonly freeProviders: readonly string[];
}

export interface AiConfig {
  /** Which provider implementation the DI container wires up. `'router'` enables the Multi-LLM router; `'anthropic'`/`'mock'` bind directly to a single adapter, unchanged from before the router existed. */
  readonly provider: 'anthropic' | 'mock' | 'router';
  readonly anthropic: {
    readonly apiKey: string | undefined;
    readonly model: string;
    readonly apiVersion: string;
    readonly baseUrl: string;
    readonly quality: AiModelQuality;
  };
  readonly openai: ProviderCredentialConfig;
  readonly gemini: ProviderCredentialConfig;
  readonly openrouter: ProviderCredentialConfig;
  readonly groq: ProviderCredentialConfig;
  readonly ollama: {
    readonly baseUrl: string;
    readonly model: string;
    readonly quality: AiModelQuality;
  };
  /** Hard ceiling on a single invocation; the runtime, not the provider SDK, enforces this. */
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly router: AiRouterConfig;
}

function envBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw === 'true';
}

function envRouterMode(): AiRouterMode {
  const raw = process.env.AI_ROUTER_MODE;
  return raw === 'local' || raw === 'free' || raw === 'paid' || raw === 'auto' ? raw : 'auto';
}

function envQuality(): AiModelQuality {
  const raw = process.env.AI_DEFAULT_QUALITY;
  return raw === 'LOW' || raw === 'BALANCED' || raw === 'HIGH' || raw === 'MAX' ? raw : 'BALANCED';
}

/**
 * `AI_PROVIDER` accepts exactly `mock` | `anthropic` | `router` (to reach
 * Ollama/DeepSeek — or any other router-registered provider — set
 * `AI_PROVIDER=router`, never the provider's own name). An unrecognized
 * value used to fall through to `mock` silently; that produced a confusing
 * "why is this refusing" debugging session, so it now logs a visible
 * startup warning identifying exactly what was misconfigured.
 */
function envProvider(): AiConfig['provider'] {
  const raw = process.env.AI_PROVIDER;
  if (raw === undefined || raw === 'mock' || raw === 'anthropic' || raw === 'router') {
    return raw ?? 'mock';
  }
  // eslint-disable-next-line no-console -- startup-time misconfiguration diagnostic; no Logger/DI context exists inside a plain registerAs factory.
  console.warn(
    `[ai.config] AI_PROVIDER="${raw}" is not a recognized value (expected "mock", "anthropic", or "router" ` +
      'to reach a provider registered in the router, e.g. Ollama). Falling back to "mock" — no AI provider ' +
      'will actually be called until this is corrected.',
  );
  return 'mock';
}

export const aiConfig = registerAs('ai', (): AiConfig => ({
  provider: envProvider(),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
    apiVersion: process.env.ANTHROPIC_API_VERSION ?? '2023-06-01',
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
    quality: envModelQuality('ANTHROPIC_MODEL_QUALITY'),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    quality: envModelQuality('OPENAI_MODEL_QUALITY'),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-pro',
    quality: envModelQuality('GEMINI_MODEL_QUALITY'),
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL ?? 'openrouter/auto',
    quality: envModelQuality('OPENROUTER_MODEL_QUALITY'),
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    quality: envModelQuality('GROQ_MODEL_QUALITY'),
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'deepseek-coder:latest',
    quality: envModelQuality('OLLAMA_MODEL_QUALITY'),
  },
  timeoutMs: process.env.AI_TIMEOUT_MS ? Number(process.env.AI_TIMEOUT_MS) : 45_000,
  maxOutputTokens: process.env.AI_MAX_OUTPUT_TOKENS ? Number(process.env.AI_MAX_OUTPUT_TOKENS) : 8_000,
  router: {
    mode: envRouterMode(),
    allowLocal: envBoolean('AI_ALLOW_LOCAL', true),
    allowFree: envBoolean('AI_ALLOW_FREE', true),
    allowPaid: envBoolean('AI_ALLOW_PAID', true),
    fallbackEnabled: envBoolean('AI_FALLBACK_ENABLED', true),
    primaryProvider: process.env.AI_PRIMARY_PROVIDER,
    defaultQuality: envQuality(),
    rateLimitCooldownMs: process.env.AI_RATE_LIMIT_COOLDOWN_MS
      ? Number(process.env.AI_RATE_LIMIT_COOLDOWN_MS)
      : 30_000,
    quotaExhaustedCooldownMs: process.env.AI_QUOTA_COOLDOWN_MS
      ? Number(process.env.AI_QUOTA_COOLDOWN_MS)
      : 3_600_000,
    freeProviders: (process.env.AI_FREE_PROVIDERS ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  },
}));

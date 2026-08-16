import type { ConfigType } from '@nestjs/config';

import type { aiConfig } from '../config/ai.config';
import type { AiProvider } from './ai-provider.interface';

/**
 * Picks the concrete provider instance a given provider-name string
 * resolves to. Shared by `AiProviderModule`'s global `AI_PROVIDER` binding
 * and every agent module's own local override (`AGENT_<ID>_PROVIDER`) so
 * "which string maps to which instance" is declared exactly once.
 */
export function resolveAiProviderInstance(
  providerName: ConfigType<typeof aiConfig>['provider'],
  providers: {
    readonly anthropic: AiProvider;
    readonly mock: AiProvider;
    readonly router: AiProvider;
    readonly openrouter: AiProvider;
    readonly gemini: AiProvider;
    readonly groq: AiProvider;
  },
): AiProvider {
  if (providerName === 'anthropic') return providers.anthropic;
  if (providerName === 'openrouter') return providers.openrouter;
  if (providerName === 'gemini') return providers.gemini;
  if (providerName === 'groq') return providers.groq;
  if (providerName === 'router') return providers.router;
  return providers.mock;
}

import { registerAs } from '@nestjs/config';

/**
 * AI provider configuration (STD-000 §14). Nothing here is a secret literal —
 * every value is read from the process environment. See `.env.example` for
 * the complete list of supported variables.
 */
export interface AiConfig {
  /** Which provider implementation the DI container wires up. */
  readonly provider: 'anthropic' | 'mock';
  readonly anthropic: {
    readonly apiKey: string | undefined;
    readonly model: string;
    readonly apiVersion: string;
    readonly baseUrl: string;
  };
  /** Hard ceiling on a single invocation; the runtime, not the provider SDK, enforces this. */
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export const aiConfig = registerAs('ai', (): AiConfig => ({
  provider: (process.env.AI_PROVIDER as AiConfig['provider'] | undefined) ?? 'mock',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
    apiVersion: process.env.ANTHROPIC_API_VERSION ?? '2023-06-01',
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  },
  timeoutMs: process.env.AI_TIMEOUT_MS ? Number(process.env.AI_TIMEOUT_MS) : 45_000,
  maxOutputTokens: process.env.AI_MAX_OUTPUT_TOKENS ? Number(process.env.AI_MAX_OUTPUT_TOKENS) : 8_000,
}));

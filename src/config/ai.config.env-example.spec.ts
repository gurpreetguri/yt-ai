import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FIX 1 — verifies `.env.example` actually documents every supported
 * configuration variable read by `ai.config.ts`, rather than trusting that
 * the two files were kept in sync by hand. A variable name is considered
 * "documented" when it appears at the start of a line as `NAME=` (with or
 * without a value) — comment-only mentions don't count.
 */
describe('.env.example', () => {
  const envExample = readFileSync(join(__dirname, '../../.env.example'), 'utf8');
  const documentedNames = new Set(
    envExample
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter((name): name is string => name !== undefined),
  );

  const requiredVariables = [
    'AI_PROVIDER',
    'AI_ROUTER_MODE',
    'AI_ALLOW_LOCAL',
    'AI_ALLOW_FREE',
    'AI_ALLOW_PAID',
    'AI_FALLBACK_ENABLED',
    'AI_PRIMARY_PROVIDER',
    'AI_DEFAULT_QUALITY',
    'AI_RATE_LIMIT_COOLDOWN_MS',
    'AI_QUOTA_COOLDOWN_MS',
    'AI_FREE_PROVIDERS',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_API_VERSION',
    'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'OPENROUTER_API_KEY',
    'OPENROUTER_MODEL',
    'GROQ_API_KEY',
    'GROQ_MODEL',
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'AI_TIMEOUT_MS',
    'AI_MAX_OUTPUT_TOKENS',
  ] as const;

  it.each(requiredVariables)('documents %s', (name) => {
    expect(documentedNames.has(name)).toBe(true);
  });

  it('never assigns a non-empty value to any *_API_KEY variable (no real credentials committed)', () => {
    const apiKeyLines = envExample.split('\n').filter((line) => /^[A-Z0-9_]*_API_KEY=/.test(line));
    expect(apiKeyLines.length).toBeGreaterThan(0);
    for (const line of apiKeyLines) {
      expect(line).toMatch(/^[A-Z0-9_]+_API_KEY=$/);
    }
  });
});

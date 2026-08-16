import type { AiProvider } from './ai-provider.interface';
import { resolveAiProviderInstance } from './resolve-ai-provider.util';

describe('resolveAiProviderInstance', () => {
  function makeProviders() {
    const named = (name: string): AiProvider => ({ providerName: name, invoke: jest.fn() });
    return {
      anthropic: named('anthropic'),
      mock: named('mock'),
      router: named('router'),
      openrouter: named('openrouter'),
      gemini: named('gemini'),
      groq: named('groq'),
    };
  }

  it.each([
    ['anthropic', 'anthropic'],
    ['openrouter', 'openrouter'],
    ['gemini', 'gemini'],
    ['groq', 'groq'],
    ['router', 'router'],
  ] as const)('resolves "%s" to the %s provider', (providerName, expectedName) => {
    const providers = makeProviders();
    const resolved = resolveAiProviderInstance(providerName, providers);
    expect(resolved.providerName).toBe(expectedName);
  });

  it('falls back to mock for "mock"', () => {
    const providers = makeProviders();
    expect(resolveAiProviderInstance('mock', providers).providerName).toBe('mock');
  });
});

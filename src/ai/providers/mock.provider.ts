import { Injectable } from '@nestjs/common';

import { AiInvocationRequest, AiInvocationResult, AiProvider } from '../ai-provider.interface';

/**
 * Deterministic no-op provider for local development and environments without
 * a configured vendor credential. Never used in unit tests — tests mock
 * `AiProvider` directly so the Strategy Agent is exercised independently of
 * any concrete provider (including this one).
 *
 * It always refuses, because a mock manifest fabricated here would be
 * indistinguishable from a real model's judgement, which STD-000 §2.13
 * (fail loud, fail safe) forbids.
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  public readonly providerName = 'mock';

  async invoke(_request: AiInvocationRequest): Promise<AiInvocationResult> {
    const startedAt = Date.now();
    return {
      content: JSON.stringify({
        refusal: {
          reasonCode: 'OUT_OF_SCOPE',
          details:
            'No AI provider is configured (AI_PROVIDER=mock). Configure a real provider to generate a strategy manifest.',
        },
      }),
      finishReason: 'COMPLETE',
      provider: this.providerName,
      modelId: 'mock-refusal-provider',
      durationMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

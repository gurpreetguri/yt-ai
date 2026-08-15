import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import { aiConfig } from '../config/ai.config';
import { AI_PROVIDER } from './ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockAiProvider } from './providers/mock.provider';

/**
 * Binds `AI_PROVIDER` to a concrete implementation chosen by configuration
 * (`AI_PROVIDER` env var). This is the only place in the codebase that knows
 * every available provider class; everything else depends on the interface.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AnthropicProvider,
    MockAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [aiConfig.KEY, AnthropicProvider, MockAiProvider],
      useFactory: (
        config: ConfigType<typeof aiConfig>,
        anthropic: AnthropicProvider,
        mock: MockAiProvider,
      ) => (config.provider === 'anthropic' ? anthropic : mock),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiProviderModule {}

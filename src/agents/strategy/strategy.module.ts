import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  MANIFEST_SCHEMA_POINTER,
  OUTPUT_SCHEMA_ID,
} from '@agents/agent-00-strategy/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
import { AI_PROVIDER } from '../../ai/ai-provider.interface';
import { AnthropicProvider } from '../../ai/providers/anthropic.provider';
import { GeminiProvider } from '../../ai/providers/gemini.provider';
import { GroqProvider } from '../../ai/providers/groq.provider';
import { MockAiProvider } from '../../ai/providers/mock.provider';
import { OpenRouterProvider } from '../../ai/providers/openrouter.provider';
import { ModelRouterProvider } from '../../ai/router/model-router.provider';
import { resolveAiProviderInstance } from '../../ai/resolve-ai-provider.util';
import { aiConfig } from '../../config/ai.config';
import { StrategyPromptService } from './strategy.prompt';
import { StrategyService } from './strategy.service';
import {
  STRATEGY_AJV,
  STRATEGY_MANIFEST_VALIDATOR,
  STRATEGY_REQUEST_VALIDATOR,
  STRATEGY_RESPONSE_VALIDATOR,
} from './strategy.validation';

/**
 * AGT-00 Strategy Agent module.
 *
 * Ajv wiring follows `agents/agent-00-strategy/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here.
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    StrategyPromptService,
    StrategyService,
    // Local override for AI_PROVIDER — takes precedence over AiProviderModule's
    // @Global() binding for StrategyService specifically (Nest resolves a
    // module's own provider registrations before falling back to a global
    // one for the same token). Lets AGENT_00_STRATEGY_PROVIDER assign this
    // agent a different concrete provider than the AI_PROVIDER default,
    // without this agent's own code ever knowing a provider name exists.
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
      ) =>
        resolveAiProviderInstance(config.agentProviders['agent-00-strategy'] ?? config.provider, {
          anthropic,
          mock,
          router,
          openrouter,
          gemini,
          groq,
        }),
    },
    {
      provide: STRATEGY_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: STRATEGY_REQUEST_VALIDATOR,
      inject: [STRATEGY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`strategy-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: STRATEGY_RESPONSE_VALIDATOR,
      inject: [STRATEGY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`strategy-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: STRATEGY_MANIFEST_VALIDATOR,
      inject: [STRATEGY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(MANIFEST_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `strategy-agent: manifest schema pointer "${MANIFEST_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [StrategyService],
})
export class StrategyModule {}

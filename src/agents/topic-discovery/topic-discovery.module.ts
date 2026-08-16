import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  TOPIC_SET_SCHEMA_POINTER,
} from '@agents/agent-01-topic-discovery/validator';

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
import { TopicDiscoveryPromptService } from './topic-discovery.prompt';
import { TopicDiscoveryService } from './topic-discovery.service';
import {
  TOPIC_DISCOVERY_AJV,
  TOPIC_DISCOVERY_REQUEST_VALIDATOR,
  TOPIC_DISCOVERY_RESPONSE_VALIDATOR,
  TOPIC_DISCOVERY_SET_VALIDATOR,
} from './topic-discovery.validation';

/**
 * AGT-01 Topic Discovery Agent module.
 *
 * Ajv wiring follows `agents/agent-01-topic-discovery/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) Agent 00 already registers; this module
 * introduces no second AI provider abstraction and no second configuration
 * mechanism.
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    TopicDiscoveryPromptService,
    TopicDiscoveryService,
    // Local override for AI_PROVIDER — takes precedence over AiProviderModule's
    // @Global() binding for TopicDiscoveryService specifically (Nest resolves a
    // module's own provider registrations before falling back to a global
    // one for the same token). Lets AGENT_01_TOPIC_DISCOVERY_PROVIDER assign this
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
        resolveAiProviderInstance(config.agentProviders['agent-01-topic-discovery'] ?? config.provider, {
          anthropic,
          mock,
          router,
          openrouter,
          gemini,
          groq,
        }),
    },
    {
      provide: TOPIC_DISCOVERY_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: TOPIC_DISCOVERY_REQUEST_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`topic-discovery-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: TOPIC_DISCOVERY_RESPONSE_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`topic-discovery-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: TOPIC_DISCOVERY_SET_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(TOPIC_SET_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `topic-discovery-agent: topic set schema pointer "${TOPIC_SET_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [TopicDiscoveryService],
})
export class TopicDiscoveryModule {}

import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  STORY_ARCHITECTURE_SCHEMA_POINTER,
} from '@agents/agent-04-story-architect/validator';

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
import { StoryArchitectPromptService } from './story-architect.prompt';
import { StoryArchitectService } from './story-architect.service';
import {
  STORY_ARCHITECTURE_VALIDATOR,
  STORY_ARCHITECT_AJV,
  STORY_ARCHITECT_REQUEST_VALIDATOR,
  STORY_ARCHITECT_RESPONSE_VALIDATOR,
} from './story-architect.validation';

/**
 * AGT-04 Story Architect Agent module.
 *
 * Ajv wiring follows `agents/agent-04-story-architect/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) Agent 00/01/02/03 already register; this
 * module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client is wired here, deliberately: this agent
 * architects a story from the `verificationPackage` the caller already
 * supplied, it does not hold network egress capability of its own
 * (README §3).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    StoryArchitectPromptService,
    StoryArchitectService,
    // Local override for AI_PROVIDER — takes precedence over AiProviderModule's
    // @Global() binding for StoryArchitectService specifically (Nest resolves a
    // module's own provider registrations before falling back to a global
    // one for the same token). Lets AGENT_04_STORY_ARCHITECT_PROVIDER assign this
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
        resolveAiProviderInstance(config.agentProviders['agent-04-story-architect'] ?? config.provider, {
          anthropic,
          mock,
          router,
          openrouter,
          gemini,
          groq,
        }),
    },
    {
      provide: STORY_ARCHITECT_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: STORY_ARCHITECT_REQUEST_VALIDATOR,
      inject: [STORY_ARCHITECT_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`story-architect-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: STORY_ARCHITECT_RESPONSE_VALIDATOR,
      inject: [STORY_ARCHITECT_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`story-architect-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: STORY_ARCHITECTURE_VALIDATOR,
      inject: [STORY_ARCHITECT_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(STORY_ARCHITECTURE_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `story-architect-agent: story architecture schema pointer "${STORY_ARCHITECTURE_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [StoryArchitectService],
})
export class StoryArchitectModule {}

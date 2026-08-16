import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  SCENE_PLAN_SCHEMA_POINTER,
} from '@agents/agent-07-scene-planner/validator';

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
import { ScenePlannerPromptService } from './scene-planner.prompt';
import { ScenePlannerService } from './scene-planner.service';
import {
  SCENE_PLANNER_AJV,
  SCENE_PLANNER_REQUEST_VALIDATOR,
  SCENE_PLANNER_RESPONSE_VALIDATOR,
  SCENE_PLAN_VALIDATOR,
} from './scene-planner.validation';

/**
 * AGT-07 Scene Planner Agent module.
 *
 * Ajv wiring follows `agents/agent-07-scene-planner/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) every prior agent already registers; this
 * module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client, and no image/video generation client, is wired
 * here, deliberately: this agent plans scenes from the `script`,
 * `reviewResult`, `storyArchitecture`, and `verificationPackage` the caller
 * already supplied, it does not hold network egress capability of its own
 * and never generates or selects an asset (README §2).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    ScenePlannerPromptService,
    ScenePlannerService,
    // Local override for AI_PROVIDER — takes precedence over AiProviderModule's
    // @Global() binding for ScenePlannerService specifically (Nest resolves a
    // module's own provider registrations before falling back to a global
    // one for the same token). Lets AGENT_07_SCENE_PLANNER_PROVIDER assign this
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
        resolveAiProviderInstance(config.agentProviders['agent-07-scene-planner'] ?? config.provider, {
          anthropic,
          mock,
          router,
          openrouter,
          gemini,
          groq,
        }),
    },
    {
      provide: SCENE_PLANNER_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: SCENE_PLANNER_REQUEST_VALIDATOR,
      inject: [SCENE_PLANNER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`scene-planner-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: SCENE_PLANNER_RESPONSE_VALIDATOR,
      inject: [SCENE_PLANNER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`scene-planner-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: SCENE_PLAN_VALIDATOR,
      inject: [SCENE_PLANNER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(SCENE_PLAN_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `scene-planner-agent: scene plan schema pointer "${SCENE_PLAN_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [ScenePlannerService],
})
export class ScenePlannerModule {}

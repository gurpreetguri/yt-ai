import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  SCENE_PLAN_SCHEMA_POINTER,
} from '@agents/agent-07-scene-planner/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
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

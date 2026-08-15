import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  MANIFEST_SCHEMA_POINTER,
  OUTPUT_SCHEMA_ID,
} from '@agents/agent-00-strategy/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
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

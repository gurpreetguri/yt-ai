import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  RESEARCH_PACKAGE_SCHEMA_POINTER,
} from '@agents/agent-02-research/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
import { aiConfig } from '../../config/ai.config';
import { ResearchPromptService } from './research.prompt';
import { ResearchService } from './research.service';
import {
  RESEARCH_AJV,
  RESEARCH_PACKAGE_VALIDATOR,
  RESEARCH_REQUEST_VALIDATOR,
  RESEARCH_RESPONSE_VALIDATOR,
} from './research.validation';

/**
 * AGT-02 Research Agent module.
 *
 * Ajv wiring follows `agents/agent-02-research/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) Agent 00 and Agent 01 already register;
 * this module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client is wired here, deliberately: this agent
 * transforms `researchMaterials` the caller already supplied, it does not
 * hold network egress capability of its own (README §16,
 * implementation-checklist.md §9).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    ResearchPromptService,
    ResearchService,
    {
      provide: RESEARCH_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: RESEARCH_REQUEST_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`research-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: RESEARCH_RESPONSE_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`research-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: RESEARCH_PACKAGE_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(RESEARCH_PACKAGE_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `research-agent: research package schema pointer "${RESEARCH_PACKAGE_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [ResearchService],
})
export class ResearchModule {}

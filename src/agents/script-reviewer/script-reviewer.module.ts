import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  REVIEW_REPORT_SCHEMA_POINTER,
} from '@agents/agent-06-script-reviewer/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
import { aiConfig } from '../../config/ai.config';
import { ScriptReviewerPromptService } from './script-reviewer.prompt';
import { ScriptReviewerService } from './script-reviewer.service';
import {
  REVIEW_REPORT_VALIDATOR,
  SCRIPT_REVIEWER_AJV,
  SCRIPT_REVIEWER_REQUEST_VALIDATOR,
  SCRIPT_REVIEWER_RESPONSE_VALIDATOR,
} from './script-reviewer.validation';

/**
 * AGT-06 Script Reviewer Agent module.
 *
 * Ajv wiring follows `agents/agent-06-script-reviewer/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) every prior agent already registers; this
 * module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client is wired here, deliberately: this agent reviews
 * a script from the `script`, `storyArchitecture`, `verificationPackage`,
 * and `audienceContext` the caller already supplied, it does not hold
 * network egress capability of its own (README §2).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    ScriptReviewerPromptService,
    ScriptReviewerService,
    {
      provide: SCRIPT_REVIEWER_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: SCRIPT_REVIEWER_REQUEST_VALIDATOR,
      inject: [SCRIPT_REVIEWER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`script-reviewer-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: SCRIPT_REVIEWER_RESPONSE_VALIDATOR,
      inject: [SCRIPT_REVIEWER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`script-reviewer-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: REVIEW_REPORT_VALIDATOR,
      inject: [SCRIPT_REVIEWER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(REVIEW_REPORT_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `script-reviewer-agent: review report schema pointer "${REVIEW_REPORT_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [ScriptReviewerService],
})
export class ScriptReviewerModule {}

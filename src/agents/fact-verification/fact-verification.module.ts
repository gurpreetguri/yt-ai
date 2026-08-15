import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  OUTPUT_SCHEMA_ID,
  VERIFICATION_PACKAGE_SCHEMA_POINTER,
} from '@agents/agent-03-fact-verification/validator';

import { AiProviderModule } from '../../ai/ai-provider.module';
import { aiConfig } from '../../config/ai.config';
import { FactVerificationPromptService } from './fact-verification.prompt';
import { FactVerificationService } from './fact-verification.service';
import {
  FACT_VERIFICATION_AJV,
  FACT_VERIFICATION_PACKAGE_VALIDATOR,
  FACT_VERIFICATION_REQUEST_VALIDATOR,
  FACT_VERIFICATION_RESPONSE_VALIDATOR,
} from './fact-verification.validation';

/**
 * AGT-03 Fact Verification Agent module.
 *
 * Ajv wiring follows `agents/agent-03-fact-verification/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) Agent 00/01/02 already register; this
 * module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client is wired here, deliberately: this agent grades
 * the `researchPackage` the caller already supplied, it does not hold
 * network egress capability of its own (README §3, §16).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    FactVerificationPromptService,
    FactVerificationService,
    {
      provide: FACT_VERIFICATION_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: FACT_VERIFICATION_REQUEST_VALIDATOR,
      inject: [FACT_VERIFICATION_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`fact-verification-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: FACT_VERIFICATION_RESPONSE_VALIDATOR,
      inject: [FACT_VERIFICATION_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`fact-verification-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: FACT_VERIFICATION_PACKAGE_VALIDATOR,
      inject: [FACT_VERIFICATION_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(VERIFICATION_PACKAGE_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `fact-verification-agent: verification package schema pointer "${VERIFICATION_PACKAGE_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [FactVerificationService],
})
export class FactVerificationModule {}

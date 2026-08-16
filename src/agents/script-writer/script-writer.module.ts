import Ajv2020 from 'ajv/dist/2020';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import {
  createContractValidator,
  INPUT_SCHEMA_ID,
  NARRATION_SCRIPT_SCHEMA_POINTER,
  OUTPUT_SCHEMA_ID,
} from '@agents/agent-05-script-writer/validator';

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
import { ScriptWriterPromptService } from './script-writer.prompt';
import { ScriptWriterService } from './script-writer.service';
import {
  NARRATION_SCRIPT_VALIDATOR,
  SCRIPT_WRITER_AJV,
  SCRIPT_WRITER_REQUEST_VALIDATOR,
  SCRIPT_WRITER_RESPONSE_VALIDATOR,
} from './script-writer.validation';

/**
 * AGT-05 Script Writer Agent module.
 *
 * Ajv wiring follows `agents/agent-05-script-writer/implementation-checklist.md`
 * §3 exactly: both schemas are compiled ONCE, at module init, from the
 * approved `validator.ts`/`input.schema.json`/`output.schema.json` package —
 * never per request, and never re-implemented here. Reuses the same
 * `AiProviderModule` (`ARC-001` §4.9 vendor containment line) and the same
 * global `aiConfig` (STD-000 §14) every prior agent already registers; this
 * module introduces no second AI provider abstraction and no second
 * configuration mechanism.
 *
 * No search or fetch client is wired here, deliberately: this agent writes a
 * script from the `storyArchitecture` and `verificationPackage` the caller
 * already supplied, it does not hold network egress capability of its own
 * (README §2).
 */
@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiProviderModule],
  providers: [
    ScriptWriterPromptService,
    ScriptWriterService,
    // Local override for AI_PROVIDER — takes precedence over AiProviderModule's
    // @Global() binding for ScriptWriterService specifically (Nest resolves a
    // module's own provider registrations before falling back to a global
    // one for the same token). Lets AGENT_05_SCRIPT_WRITER_PROVIDER assign this
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
        resolveAiProviderInstance(config.agentProviders['agent-05-script-writer'] ?? config.provider, {
          anthropic,
          mock,
          router,
          openrouter,
          gemini,
          groq,
        }),
    },
    {
      provide: SCRIPT_WRITER_AJV,
      useFactory: (): Ajv2020 => createContractValidator(),
    },
    {
      provide: SCRIPT_WRITER_REQUEST_VALIDATOR,
      inject: [SCRIPT_WRITER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(INPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`script-writer-agent: input schema "${INPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: SCRIPT_WRITER_RESPONSE_VALIDATOR,
      inject: [SCRIPT_WRITER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(OUTPUT_SCHEMA_ID);
        if (validate === undefined) {
          throw new Error(`script-writer-agent: output schema "${OUTPUT_SCHEMA_ID}" did not compile.`);
        }
        return validate;
      },
    },
    {
      provide: NARRATION_SCRIPT_VALIDATOR,
      inject: [SCRIPT_WRITER_AJV],
      useFactory: (ajv: Ajv2020) => {
        const validate = ajv.getSchema(NARRATION_SCRIPT_SCHEMA_POINTER);
        if (validate === undefined) {
          throw new Error(
            `script-writer-agent: narration script schema pointer "${NARRATION_SCRIPT_SCHEMA_POINTER}" did not compile.`,
          );
        }
        return validate;
      },
    },
  ],
  exports: [ScriptWriterService],
})
export class ScriptWriterModule {}

import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ValidateFunction } from 'ajv/dist/2020';

import {
  STRUCTURAL_RULE_ID,
  structuralValidate,
  validateResearchPackage,
  validateResearchRequest,
} from '@agents/agent-02-research/validator';
import type {
  ExecutionAttemptType,
  ExecutionBlock,
  RefusalReasonCode,
  ResearchAgentErrorResponse,
  ResearchAgentRequest,
  ResearchAgentRefusal,
  ResearchAgentResponseMeta,
  ResearchPackage,
  StandardError,
  ValidationFinding,
} from '@agents/agent-02-research/interfaces';

import researchPackageOutputSchema from '@agents/agent-02-research/output.schema.json';

import { AI_PROVIDER, AiInvocationResult, AiProvider } from '../../ai/ai-provider.interface';
import { generatePrefixedId } from '../../common/id.util';
import { extractJsonPayload } from '../../common/json-extraction.util';
import { aiConfig } from '../../config/ai.config';
import {
  AGENT_ID,
  AGENT_VERSION,
  buildRuntimeError,
  classifyProviderErrorKind,
  isAiProviderError,
  mapInputFindingToErrorCode,
  mapOutputFindingToErrorCode,
  mapProviderErrorKindToCode,
  providerSafeUserMessage,
  redactKnownSecret,
} from './research.errors';
import { RESEARCH_PROMPT_ID, ResearchPromptService } from './research.prompt';
import {
  RESEARCH_PACKAGE_VALIDATOR,
  RESEARCH_REQUEST_VALIDATOR,
  RESEARCH_RESPONSE_VALIDATOR,
} from './research.validation';
import { ResearchExecutionOutcome, ResearchRuntimeError } from './research.types';

const RUNTIME_PRODUCER = { name: 'ytv-agent-runtime', version: '0.1.0' } as const;

/** Matches `output.schema.json` `$defs.errorResponse.properties.issues.maxItems` — the wire contract's own cap. */
const MAX_REPORTED_ISSUES = 50;

/**
 * The Research Package's JSON Schema definition, extracted from the
 * already-approved `output.schema.json` (never re-authored), passed to the
 * AI provider abstraction as a structured-output HINT
 * (`AiStructuredOutputRequest`). Whether any given provider honours it or
 * ignores it, this service always runs the same `validateResearchPackage`
 * pass on the result — see `ai-provider.interface.ts` for why that hint can
 * never replace validation.
 */
const RESEARCH_PACKAGE_JSON_SCHEMA: unknown = (
  researchPackageOutputSchema as { $defs: { researchPackage: unknown } }
).$defs.researchPackage;

/**
 * Sampling parameters fixed by the agent's own prompt contract
 * (system-prompt.md header table: Extractor class, temperature 0, topP 1.0,
 * max output tokens 8000) — declared here as call-site literals, the same
 * way `strategy.service.ts` and `topic-discovery.service.ts` fix their own
 * agents' parameters, rather than sourced from the shared `aiConfig`.
 * `aiConfig` remains the source for genuinely cross-agent operational knobs
 * (provider selection, the `timeoutMs` ceiling); it does not own any single
 * agent's declared temperature or token budget, which are part of that
 * agent's frozen prompt contract, not an environment-tunable setting.
 */
const INVOCATION_PARAMETERS = { temperature: 0, topP: 1.0, maxOutputTokens: 8000 } as const;

const REFUSAL_REASON_TO_ERROR: Readonly<
  Record<
    RefusalReasonCode,
    { readonly code: StandardError['code']; readonly category: StandardError['category'] }
  >
> = {
  INPUT_MISSING: { code: 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING', category: 'VALIDATION' },
  INPUT_MALFORMED: { code: 'VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED', category: 'VALIDATION' },
  INPUT_CONTRADICTORY: { code: 'VALIDATION.INPUT.SOURCE_COUNT_BOUNDS_CONTRADICTORY', category: 'VALIDATION' },
  OUT_OF_SCOPE: { code: 'VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY', category: 'VALIDATION' },
  INSTRUCTION_IN_DATA: { code: 'SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK', category: 'SECURITY' },
};

export interface ExecuteOptions {
  /**
   * Set by the caller (the agent runtime / workflow), never inferred here.
   * A `REPAIR` or `REGENERATION` attempt is still a single, non-looping
   * invocation of this service — the workflow decides to call again, this
   * service never decides to call itself again (GDE-002 §10.1).
   */
  readonly attemptType?: ExecutionAttemptType;
}

/**
 * AGT-02 Research Agent — NestJS runtime.
 *
 * Implements exactly the slice of ARC-001 §4.8 (Agent Runtime) this agent
 * needs: validate input, render the approved prompt, invoke the AI provider
 * abstraction, validate output, and return a typed result. It never calls
 * Agent 01, never calls Agent 03, never orchestrates a workflow, never
 * performs a network request or web search itself (README §16), and never
 * persists anything (README §3).
 *
 * `researchMaterials` (the request's one UNTRUSTED block) is expected to
 * already be populated by the workflow's research/search provider before
 * this service is invoked — this service transforms supplied materials into
 * a structured research package, it does not go and fetch more (README §16,
 * system-prompt.md rule 35).
 */
@Injectable()
export class ResearchService {
  constructor(
    @Inject(RESEARCH_REQUEST_VALIDATOR) private readonly requestValidator: ValidateFunction,
    @Inject(RESEARCH_PACKAGE_VALIDATOR) private readonly researchPackageValidator: ValidateFunction,
    @Inject(RESEARCH_RESPONSE_VALIDATOR) private readonly responseValidator: ValidateFunction,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
    private readonly promptService: ResearchPromptService,
  ) {}

  /**
   * Public entry point. Runs the full pipeline (`runPipeline`) and then
   * performs one final, mandatory check that does not belong to any earlier
   * stage: is the envelope this runtime just built actually a conformant
   * `research-agent-output/v1` contract?
   *
   *   AI output -> research package schema validation -> business validation
   *   -> runtime envelope creation -> FINAL RESPONSE CONTRACT VALIDATION -> return
   *
   * This is deliberately separate from research-package validation (step 7
   * in `runPipeline`): that step checks the model's raw output against the
   * `researchPackage` definition; this step checks the envelope THIS
   * SERVICE assembled — meta, status, execution, references, and (for a
   * success) the already-validated `data` — against the full
   * `output.schema.json` `oneOf` (`successResponse` | `errorResponse`). A
   * defect here is always a bug in this runtime, never a symptom of bad
   * input or a bad model response (those are already reported by the time
   * this check runs), so it fails loudly with an internal/configuration
   * error rather than ever returning a non-conformant contract.
   */
  async execute(
    request: ResearchAgentRequest,
    options: ExecuteOptions = {},
  ): Promise<ResearchExecutionOutcome> {
    const outcome = await this.runPipeline(request, options);

    const envelopeIssues = structuralValidate(this.responseValidator, outcome.response);
    if (envelopeIssues.length === 0) {
      return outcome;
    }

    return this.internalEnvelopeFailure(request, options, envelopeIssues);
  }

  /**
   * Fallback used only when the envelope this runtime just assembled is not
   * itself a conformant `research-agent-output/v1` contract. Always a bug in
   * this codebase; never returns the invalid envelope to the caller.
   */
  private internalEnvelopeFailure(
    request: ResearchAgentRequest,
    options: ExecuteOptions,
    envelopeIssues: readonly ValidationFinding[],
  ): ResearchExecutionOutcome {
    const attempt = request.meta.attempt ?? 1;
    const attemptType = options.attemptType ?? 'INITIAL';
    const paths = envelopeIssues.map((issue) => issue.path).join(', ');
    return this.failure(
      request,
      [
        buildRuntimeError({
          code: 'CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID',
          category: 'CONFIGURATION',
          retryable: false,
          stage: 'OUTPUT_VALIDATION',
          message: `Runtime constructed a response envelope that fails structural validation against output.schema.json (${envelopeIssues.length} finding(s) at: ${paths}).`,
          userMessage: 'This request could not be completed due to an internal configuration error.',
          correlationId: request.meta.correlationId,
          runId: request.meta.runId,
          nodeId: request.meta.nodeId,
          attempt,
        }),
      ],
      { attempt, attemptType, durationMs: 0, costMicroUsd: 0, outcome: 'FAILURE' },
      { retryable: false },
    );
  }

  private async runPipeline(
    request: ResearchAgentRequest,
    options: ExecuteOptions,
  ): Promise<ResearchExecutionOutcome> {
    const startedAt = Date.now();
    const attempt = request.meta.attempt ?? 1;
    const attemptType = options.attemptType ?? 'INITIAL';
    const correlationId = request.meta.correlationId;

    // 1. Structural + business validation of the request. A failure here is a
    //    workflow defect (the caller assembled a bad request): do not dispatch
    //    to the model, do not retry (implementation-checklist.md §4).
    const inputReport = validateResearchRequest(this.requestValidator, request);
    if (inputReport.outcome === 'FAILED') {
      return this.failure(
        request,
        inputReport.findings.map((finding) =>
          this.inputFindingToRuntimeError(
            finding,
            correlationId,
            request.meta.runId,
            request.meta.nodeId,
            attempt,
          ),
        ),
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE'),
        { retryable: false },
      );
    }

    // 2. Render the approved prompt with strict variable resolution. Required
    //    variables are guaranteed present by step 1; this only fails on a
    //    genuine prompt-asset defect, which is a configuration problem, not a
    //    request problem.
    let rendered: ReturnType<ResearchPromptService['render']>;
    try {
      rendered = this.promptService.render(request.data);
    } catch (error) {
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: 'VALIDATION.INPUT.REQUIRED_FIELD_MISSING',
            category: 'VALIDATION',
            retryable: false,
            stage: 'INPUT_VALIDATION',
            message: `Prompt rendering failed: ${errorMessage(error)}`,
            userMessage: 'This request could not be prepared for the research agent.',
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE'),
        { retryable: false },
      );
    }

    // 3. Invoke the AI provider abstraction. The service never knows which
    //    vendor is behind `this.aiProvider` (ARC-001 §4.9).
    let aiResult: AiInvocationResult;
    try {
      aiResult = await this.aiProvider.invoke({
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        parameters: INVOCATION_PARAMETERS,
        timeoutMs: this.config.timeoutMs,
        structuredOutput: { schemaName: 'researchPackage', schema: RESEARCH_PACKAGE_JSON_SCHEMA },
      });
    } catch (error) {
      const kind = isAiProviderError(error) ? error.kind : 'PROVIDER_ERROR';
      const classification = classifyProviderErrorKind(kind);
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: mapProviderErrorKindToCode(kind),
            category: classification.category,
            retryable: classification.retryable,
            stage: 'INVOCATION',
            // Internal diagnostic only — "for engineers, specific" (interfaces.ts).
            // May legitimately echo non-sensitive provider-supplied error text;
            // never place this in `userMessage`. The configured provider
            // credential is redacted defensively in case a provider ever
            // echoes a submitted value back in its own error body.
            message: isAiProviderError(error)
              ? redactKnownSecret(error.message, this.config.anthropic.apiKey)
              : 'Unexpected error during AI provider invocation.',
            // Sanitized, provider-agnostic text — never the raw provider error,
            // never a payload, never a credential, never a path (research.errors.ts).
            userMessage: providerSafeUserMessage(kind),
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE'),
        { retryable: classification.retryable },
      );
    }

    // 4. A non-terminal stop reason is checked on the provider's normalised
    //    finish reason, never inferred from content (system-prompt.md §5).
    if (aiResult.finishReason === 'TRUNCATED') {
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: 'AI_OUTPUT.CONTENT.TRUNCATED',
            category: 'AI_OUTPUT',
            retryable: true,
            stage: 'OUTPUT_PARSE',
            message: `Model response was truncated (finishReason=TRUNCATED) after ${aiResult.outputTokens ?? 'an unknown number of'} output tokens.`,
            userMessage:
              'The research package could not be completed within the response budget. It may succeed on retry.',
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
        { retryable: true, suggestedNextAttemptType: 'REGENERATION' },
      );
    }
    if (aiResult.finishReason === 'ERROR') {
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: 'AI_PROVIDER.INVOCATION.REQUEST_FAILED',
            category: 'AI_PROVIDER',
            retryable: true,
            stage: 'INVOCATION',
            message: 'Model invocation ended with a normalised finishReason of ERROR.',
            userMessage: 'Research could not be completed right now. It may succeed on retry.',
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
        { retryable: true },
      );
    }

    // 4b. A provider-level REFUSED finish reason is handled explicitly, before
    //    any normal research-package processing. Two distinct outcomes,
    //    NEITHER of which is retryable: a refusal — whether the model's own
    //    prompted refusal or an upstream safety filter — is non-recoverable,
    //    because retrying an identical request is expected to be refused
    //    again (implementation-checklist.md §6, "the agent itself retries
    //    nothing"; a refusal MUST NOT consume the retry/regeneration budget):
    //     - the content still carries the structured refusal payload the
    //       prompt's contract requires (system-prompt.md §6) — map it exactly
    //       as an in-band refusal would be mapped (case 6 below), which is
    //       already non-retryable via `refusalFailure`;
    //     - the provider refused without that payload (e.g. an upstream
    //       safety filter, not the model's own prompted refusal, or a
    //       payload that parses but is not shaped as a refusal) — this is
    //       still a refusal, not a generic parse failure, and must never
    //       fall through to research-package parsing/validation or be
    //       treated as retryable.
    if (aiResult.finishReason === 'REFUSED') {
      let refusedContent: unknown;
      try {
        refusedContent = JSON.parse(extractJsonPayload(aiResult.content));
      } catch {
        refusedContent = undefined;
      }
      if (isResearchRefusal(refusedContent)) {
        return this.refusalFailure(refusedContent, request, correlationId, attempt, attemptType, startedAt, aiResult);
      }
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: 'AI_OUTPUT.JSON.PARSE_FAILED',
            category: 'AI_OUTPUT',
            retryable: false,
            stage: 'OUTPUT_PARSE',
            message:
              'Provider signalled finishReason=REFUSED without a structured refusal payload matching the prompt contract (system-prompt.md §6). Provider-level refusals are non-recoverable and are not retried.',
            userMessage:
              'The AI provider declined to complete this request. This request will not be retried automatically.',
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
        { retryable: false },
      );
    }

    // 5. Parse the raw model output. Never strip code fences and retry silently
    //    — that would hide a prompt regression.
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonPayload(aiResult.content));
    } catch (error) {
      return this.failure(
        request,
        [
          buildRuntimeError({
            code: 'AI_OUTPUT.JSON.PARSE_FAILED',
            category: 'AI_OUTPUT',
            retryable: true,
            stage: 'OUTPUT_PARSE',
            message: `Model output was not valid JSON: ${errorMessage(error)}`,
            userMessage:
              'The research package could not be prepared from the model response. It may succeed on retry.',
            correlationId,
            runId: request.meta.runId,
            nodeId: request.meta.nodeId,
            attempt,
          }),
        ],
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
        { retryable: true, suggestedNextAttemptType: 'REGENERATION' },
      );
    }

    // 6. A structured refusal is a valid, complete answer under the prompt's
    //    contract (system-prompt.md §6) — map it to a registered error code
    //    and stop. Never attempt to salvage a partial research package from it.
    if (isResearchRefusal(parsed)) {
      return this.refusalFailure(parsed, request, correlationId, attempt, attemptType, startedAt, aiResult);
    }

    // 7. Validate the research package structurally, then against business
    //    rules (validator.ts — deterministic, side-effect free, run in that
    //    order). Grounding rules (source provenance, evidence references,
    //    the SEARCH_RESULT-vs-FETCHED distinction, conflict evidence
    //    uniqueness and question alignment) require the request's own data,
    //    which is why `request.data` is threaded through here.
    const researchPackageReport = validateResearchPackage(this.researchPackageValidator, parsed, request.data);
    if (researchPackageReport.outcome === 'FAILED') {
      // output.schema.json's errorResponse.issues caps at 50 items (wire
      // contract); mapping every finding unbounded could violate that cap
      // and turn a normal, retryable validation failure into a misleading
      // non-retryable envelope-invalid error.
      const issues = researchPackageReport.findings.slice(0, MAX_REPORTED_ISSUES).map((finding) =>
        this.outputFindingToRuntimeError(
          finding,
          correlationId,
          request.meta.runId,
          request.meta.nodeId,
          attempt,
        ),
      );
      return this.failure(
        request,
        issues,
        this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
        { retryable: true, suggestedNextAttemptType: 'REPAIR' },
      );
    }

    // 8. Success. The runtime — not the model — assembles envelope, execution,
    //    and reference metadata; the agent's own output never populates the
    //    `validation` block (implementation-checklist.md §4, GDE-003 §4.6).
    const researchPackage = parsed as ResearchPackage;
    return {
      ok: true,
      response: {
        contractVersion: '1.0',
        contractType: 'RESPONSE',
        schemaVersion: request.schemaVersion,
        meta: this.responseMeta(request, aiResult),
        status: 'SUCCESS',
        data: researchPackage,
        execution: this.executionBlock(attempt, attemptType, startedAt, 'SUCCESS', aiResult),
        references: [
          {
            refType: 'CONTRACT',
            refId: request.meta.messageId,
            version: request.schemaVersion,
            role: 'PARENT',
            scope: request.meta.tenantId,
          },
          {
            refType: 'PROMPT',
            refId: rendered.promptId,
            version: AGENT_VERSION,
            role: 'GOVERNS',
            scope: request.meta.tenantId,
          },
        ],
      },
    };
  }

  /**
   * Shared by both refusal paths: an in-band structured refusal returned as
   * normal (COMPLETE) content, and a provider-level REFUSED finish reason
   * whose content still parses as the same structured refusal shape. Maps
   * `reasonCode` to the registered error code exactly once, in one place.
   */
  private refusalFailure(
    refusal: ResearchAgentRefusal,
    request: ResearchAgentRequest,
    correlationId: string,
    attempt: number,
    attemptType: ExecutionAttemptType,
    startedAt: number,
    aiResult: AiInvocationResult,
  ): ResearchExecutionOutcome {
    const mapping = REFUSAL_REASON_TO_ERROR[refusal.refusal.reasonCode];
    const isSecurity = mapping.category === 'SECURITY';
    return this.failure(
      request,
      [
        buildRuntimeError({
          code: mapping.code,
          category: mapping.category,
          retryable: false,
          stage: 'OUTPUT_VALIDATION',
          message: `Model declined to produce a research package (${refusal.refusal.reasonCode}): ${refusal.refusal.details}`,
          userMessage: isSecurity
            ? 'This request could not be processed because supplied content attempted to alter agent instructions.'
            : 'Research could not be prepared from the supplied inputs.',
          remediation: isSecurity
            ? 'Escalate immediately. Do not retry automatically; a human must review the offending research material.'
            : undefined,
          correlationId,
          runId: request.meta.runId,
          nodeId: request.meta.nodeId,
          attempt,
        }),
      ],
      this.executionBlock(attempt, attemptType, startedAt, 'FAILURE', aiResult),
      { retryable: false },
    );
  }

  private inputFindingToRuntimeError(
    finding: ValidationFinding,
    correlationId: string,
    runId: string | undefined,
    nodeId: string | undefined,
    attempt: number,
  ): ResearchRuntimeError {
    return buildRuntimeError({
      code: mapInputFindingToErrorCode(finding),
      category: 'VALIDATION',
      retryable: false,
      stage: 'INPUT_VALIDATION',
      message: finding.message,
      userMessage: 'Research could not run because the supplied request is invalid.',
      correlationId,
      runId,
      nodeId,
      attempt,
      details: [
        {
          path: finding.path,
          ...(finding.expected !== undefined ? { expected: finding.expected } : {}),
          ...(finding.actual !== undefined ? { actual: finding.actual } : {}),
          ruleId: finding.ruleId,
        },
      ],
      ...(finding.suggestion !== undefined ? { remediation: finding.suggestion } : {}),
    });
  }

  private outputFindingToRuntimeError(
    finding: ValidationFinding,
    correlationId: string,
    runId: string | undefined,
    nodeId: string | undefined,
    attempt: number,
  ): ResearchRuntimeError {
    const isStructural = finding.ruleId === STRUCTURAL_RULE_ID;
    return buildRuntimeError({
      code: isStructural ? 'AI_OUTPUT.SCHEMA.VALIDATION_FAILED' : mapOutputFindingToErrorCode(finding),
      category: 'AI_OUTPUT',
      retryable: true,
      stage: 'OUTPUT_VALIDATION',
      message: finding.message,
      userMessage: 'The prepared research package did not meet the required quality bar. It may succeed on retry.',
      correlationId,
      runId,
      nodeId,
      attempt,
      details: [
        {
          path: finding.path,
          ...(finding.expected !== undefined ? { expected: finding.expected } : {}),
          ...(finding.actual !== undefined ? { actual: finding.actual } : {}),
          ruleId: finding.ruleId,
        },
      ],
      ...(finding.suggestion !== undefined ? { remediation: finding.suggestion } : {}),
    });
  }

  private failure(
    request: ResearchAgentRequest,
    issues: readonly ResearchRuntimeError[],
    execution: ExecutionBlock,
    retry: { readonly retryable: boolean; readonly suggestedNextAttemptType?: 'REPAIR' | 'REGENERATION' },
  ): ResearchExecutionOutcome {
    const response: ResearchAgentErrorResponse = {
      contractVersion: '1.0',
      contractType: 'ERROR',
      schemaVersion: request.schemaVersion,
      meta: this.responseMeta(request),
      status: 'FAILURE',
      // The wire schema's errorObject.code accepts any CATEGORY.SUBJECT.CONDITION
      // string (output.schema.json pattern); `StandardError.code` in
      // interfaces.ts narrows this to AGT-02's own registered vocabulary.
      // Transport/provider-layer issues use the additive codes documented in
      // research.types.ts, which satisfy the wire schema but sit outside
      // that narrower TS union by design (see research.errors.ts for the
      // rationale).
      issues: issues as unknown as readonly StandardError[],
      execution,
    };
    return { ok: false, response, retry };
  }

  private responseMeta(request: ResearchAgentRequest, aiResult?: AiInvocationResult): ResearchAgentResponseMeta {
    return {
      messageId: generatePrefixedId('msg'),
      correlationId: request.meta.correlationId,
      causationId: request.meta.messageId,
      ...(request.meta.runId !== undefined ? { runId: request.meta.runId } : {}),
      ...(request.meta.nodeId !== undefined ? { nodeId: request.meta.nodeId } : {}),
      ...(request.meta.attempt !== undefined ? { attempt: request.meta.attempt } : {}),
      createdAt: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z'),
      locale: request.meta.locale,
      tenantId: request.meta.tenantId,
      channelId: request.meta.channelId,
      ...(request.meta.strategyVersion !== undefined ? { strategyVersion: request.meta.strategyVersion } : {}),
      producer: RUNTIME_PRODUCER,
      agentId: AGENT_ID,
      agentVersion: AGENT_VERSION,
      promptVersion: RESEARCH_PROMPT_ID,
      ...(aiResult !== undefined
        ? {
            provider: aiResult.provider,
            modelId: aiResult.modelId,
            ...(aiResult.modelVersion !== undefined ? { modelVersion: aiResult.modelVersion } : {}),
            parameters: INVOCATION_PARAMETERS,
          }
        : {}),
    };
  }

  private executionBlock(
    attempt: number,
    attemptType: ExecutionAttemptType,
    startedAt: number,
    outcome: 'SUCCESS' | 'FAILURE',
    aiResult?: AiInvocationResult,
  ): ExecutionBlock {
    return {
      attempt,
      attemptType,
      durationMs: Date.now() - startedAt,
      costMicroUsd: aiResult?.costMicroUsd ?? 0,
      ...(aiResult?.inputTokens !== undefined ? { inputTokens: aiResult.inputTokens } : {}),
      ...(aiResult?.outputTokens !== undefined ? { outputTokens: aiResult.outputTokens } : {}),
      ...(aiResult !== undefined ? { finishReason: aiResult.finishReason } : {}),
      outcome,
    };
  }
}

function isResearchRefusal(value: unknown): value is ResearchAgentRefusal {
  if (typeof value !== 'object' || value === null || !('refusal' in value)) return false;
  const refusal = (value as { refusal: unknown }).refusal;
  if (typeof refusal !== 'object' || refusal === null) return false;
  const reasonCode = (refusal as { reasonCode?: unknown }).reasonCode;
  const details = (refusal as { details?: unknown }).details;
  return (
    typeof reasonCode === 'string' && reasonCode in REFUSAL_REASON_TO_ERROR && typeof details === 'string'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

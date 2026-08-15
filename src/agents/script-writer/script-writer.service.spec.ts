import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { ValidateFunction } from 'ajv/dist/2020';

import { structuralValidate } from '@agents/agent-05-script-writer/validator';
import type { NarrationScript, VerifiedClaimRef } from '@agents/agent-05-script-writer/interfaces';

import { AI_PROVIDER, AiInvocationResult, AiProvider, AiProviderError } from '../../ai/ai-provider.interface';
import { aiConfig } from '../../config/ai.config';
import { ScriptWriterModule } from './script-writer.module';
import { ScriptWriterService } from './script-writer.service';
import { SCRIPT_WRITER_RESPONSE_VALIDATOR } from './script-writer.validation';
import { deepClone, VALID_NARRATION_SCRIPT, VALID_REQUEST } from './__fixtures__/script-writer.fixtures';

/**
 * Unit tests for AGT-05's NestJS runtime.
 *
 * The AI provider is always mocked (`AI_PROVIDER` token override) — these
 * tests never make a real network call. Test numbers in comments correspond
 * to the 46 scenarios enumerated in `test-cases.md` / the commissioning
 * brief's "Testing" section. Prompt-injection scenarios (#30, #31) are
 * covered in `script-writer.prompt.spec.ts` instead, since they concern
 * rendering, not the runtime pipeline.
 */
describe('ScriptWriterService', () => {
  let service: ScriptWriterService;
  let aiProvider: jest.Mocked<AiProvider>;
  let moduleRef: TestingModule;
  let responseValidator: ValidateFunction;

  const baseAiResult = (
    content: string,
    overrides: Partial<AiInvocationResult> = {},
  ): AiInvocationResult => ({
    content,
    finishReason: 'COMPLETE',
    provider: 'test-provider',
    modelId: 'test-model',
    inputTokens: 100,
    outputTokens: 200,
    durationMs: 10,
    ...overrides,
  });

  beforeEach(async () => {
    aiProvider = { providerName: 'test-provider', invoke: jest.fn() };

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [aiConfig] }), ScriptWriterModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiProvider)
      .compile();

    service = moduleRef.get(ScriptWriterService);
    responseValidator = moduleRef.get(SCRIPT_WRITER_RESPONSE_VALIDATOR);
  });

  function findSegment(script: NarrationScript, segmentId: string) {
    const segment = script.segments.find((item) => item.segmentId === segmentId);
    if (segment === undefined) throw new Error(`fixture missing segment ${segmentId}`);
    return segment;
  }

  function withExtraClaim(claim: VerifiedClaimRef) {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { verificationPackage: { claims: VerifiedClaimRef[] } };
    };
    request.data.verificationPackage.claims.push(claim);
    return request as unknown as typeof VALID_REQUEST;
  }

  const doNotUseClaim = (claimId: string, verificationStatus: string): VerifiedClaimRef => ({
    claimId,
    claimText: `A claim that Agent 03 determined must not be used (${verificationStatus}).`,
    claimType: 'OTHER',
    verificationStatus: verificationStatus as VerifiedClaimRef['verificationStatus'],
    downstreamSafety: 'DO_NOT_USE',
    supportingEvidenceIds: [],
    isTimeSensitive: false,
    freshnessConcern: 'NONE',
    limitations: [],
  });

  // 1. Valid script.
  it('produces a SUCCESS response for a valid request and a valid, schema-conformant AI response', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.contractType).toBe('RESPONSE');
    expect(outcome.response.status).toBe('SUCCESS');
    expect(outcome.response.data.packageKind).toBe('NARRATION_SCRIPT');
    expect(outcome.response.data).toEqual(VALID_NARRATION_SCRIPT);
    expect(outcome.response.validation).toBeUndefined();
    expect(outcome.response.meta.agentId).toBe('script-writer-agent');
    expect(outcome.response.meta.promptVersion).toBe('prm_script_writer_agent');
    expect(outcome.response.execution?.outcome).toBe('SUCCESS');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });

  // 2. Invalid input.
  it('fails structural input validation for an unregistered downstreamReadiness enum value and does not call the provider', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.storyArchitecture as unknown as { downstreamReadiness: string }).downstreamReadiness = 'MAYBE';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 3. Missing story architecture.
  it('fails with REQUIRED_FIELD_MISSING and does not call the AI provider when storyArchitecture is absent', async () => {
    const request = deepClone(VALID_REQUEST);
    delete (request.data as { storyArchitecture?: unknown }).storyArchitecture;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REQUIRED_FIELD_MISSING');
    expect(outcome.response.issues[0]?.retryable).toBe(false);
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 4. Unknown beat reference (R-BUS-003).
  it('fails with UNGROUNDED_CLAIM when a segment cites an undeclared beat', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT);
    (findSegment(script, 'SEG_HOOK') as unknown as { beatRef: string }).beatRef = 'BEAT_GHOST';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-003',
      ),
    ).toBe(true);
  });

  // 5. Unknown claim reference (R-BUS-004).
  it('fails with UNGROUNDED_CLAIM when a segment cites an undeclared claim', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT);
    (findSegment(script, 'SEG_HOOK') as unknown as { claimRefs: string[] }).claimRefs = ['CLAIM_GHOST'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-004',
      ),
    ).toBe(true);
  });

  // 6. Unknown evidence reference (R-BUS-005).
  it('fails with UNGROUNDED_CLAIM when a segment cites undeclared evidence', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT);
    (findSegment(script, 'SEG_HOOK') as unknown as { evidenceRefs: string[] }).evidenceRefs = ['EVIDENCE_GHOST'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-005',
      ),
    ).toBe(true);
  });

  // 7. Duplicate segment ID (R-BUS-001).
  it('fails with BUSINESS.RULE_VIOLATED when two segments share the same segmentId', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
    const second = script.segments[1];
    if (second === undefined) throw new Error('fixture has fewer than 2 segments');
    second.segmentId = 'SEG_HOOK';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-001',
      ),
    ).toBe(true);
  });

  // 8. Duplicate segment order (R-BUS-002).
  it('fails with BUSINESS.RULE_VIOLATED when two segments share the same order', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
    const second = script.segments[1];
    if (second === undefined) throw new Error('fixture has fewer than 2 segments');
    second.order = 1;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-002',
      ),
    ).toBe(true);
  });

  // 9-13. DO_NOT_USE protection (R-BUS-006), covering every verificationStatus
  // Agent 03's fixed mapping resolves to downstreamSafety DO_NOT_USE.
  describe('DO_NOT_USE protection (R-BUS-006)', () => {
    it.each([
      ['generic DO_NOT_USE (#9)', 'CONTRADICTED'],
      ['UNSUPPORTED (#10)', 'UNSUPPORTED'],
      ['CONTRADICTED (#11)', 'CONTRADICTED'],
      ['INSUFFICIENT_EVIDENCE (#12)', 'INSUFFICIENT_EVIDENCE'],
      ['NOT_VERIFIABLE (#13)', 'NOT_VERIFIABLE'],
    ])('fails with UNSAFE_CLAIM_USAGE for %s', async (_label, verificationStatus) => {
      const claimId = `CLAIM_DNU_${verificationStatus}`;
      const request = withExtraClaim(doNotUseClaim(claimId, verificationStatus));
      const script = deepClone(VALID_NARRATION_SCRIPT);
      (findSegment(script, 'SEG_CTA') as unknown as { claimRefs: string[] }).claimRefs = [claimId];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(request);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE' && issue.details?.[0]?.ruleId === 'R-BUS-006',
        ),
      ).toBe(true);
    });

    it('accepts a script in which no segment cites a DO_NOT_USE claim', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });
  });

  // 14-15. USE_WITH_QUALIFICATION (R-BUS-007).
  describe('qualification preservation (R-BUS-007)', () => {
    it('accepts the baseline segment citing a USE_WITH_QUALIFICATION claim with its qualification preserved', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const segment = findSegment(outcome.response.data, 'SEG_STAT');
      expect(segment.qualification).toBeDefined();
      expect((segment.qualification ?? '').length).toBeGreaterThan(0);
    });

    it('fails with QUALIFICATION_LOST when a segment citing a USE_WITH_QUALIFICATION claim omits qualification', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
      const segment = script.segments.find((item) => item.segmentId === 'SEG_STAT');
      if (segment === undefined) throw new Error('fixture missing SEG_STAT');
      delete segment.qualification;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST' && issue.details?.[0]?.ruleId === 'R-BUS-007',
        ),
      ).toBe(true);
    });
  });

  // 16-17. Quotation integrity (R-BUS-014, R-BUS-015).
  describe('quotation integrity (R-BUS-014, R-BUS-015)', () => {
    it('accepts the baseline quotation, which reproduces the claim text and speaker exactly', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const segment = findSegment(outcome.response.data, 'SEG_QUOTE');
      expect(segment.quotation?.quotedText).toBe('Most withholding errors are simple to fix once you know where to look.');
    });

    it('fails with FABRICATED_QUOTE when quotedText does not exactly match the referenced claim\'s claimText', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as {
        segments: Array<{ segmentId: string; quotation?: { quotedText: string } }>;
      };
      const segment = script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
      if (segment === undefined || segment.quotation === undefined) throw new Error('fixture missing SEG_QUOTE quotation');
      segment.quotation.quotedText = 'Withholding errors are basically impossible to avoid.';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.FABRICATED_QUOTE' && issue.details?.[0]?.ruleId === 'R-BUS-014',
        ),
      ).toBe(true);
    });
  });

  // 18-19. Numeric provenance (R-BUS-016).
  describe('numeric provenance (R-BUS-016)', () => {
    it('fails with UNSUPPORTED_NUMBER when narration contains a figure absent from every referenced claim', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as {
        segments: Array<{ segmentId: string; narration: string }>;
      };
      const segment = script.segments.find((item) => item.segmentId === 'SEG_EXPLAIN');
      if (segment === undefined) throw new Error('fixture missing SEG_EXPLAIN');
      segment.narration = 'Your paycheck is reduced by exactly 42% due to federal withholding.';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER' && issue.details?.[0]?.ruleId === 'R-BUS-016',
        ),
      ).toBe(true);
    });

    it('accepts the baseline segment whose narrated figure (30%) traces to its referenced claim', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const segment = findSegment(outcome.response.data, 'SEG_STAT');
      expect(segment.narration).toContain('30%');
    });
  });

  // 20-21. Claim/evidence provenance within a segment (R-BUS-008).
  describe('evidence-to-claim provenance within a segment (R-BUS-008)', () => {
    it('fails with UNGROUNDED_CLAIM when a segment cites evidence belonging only to a claim it does not reference', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT);
      // SEG_EXPLAIN keeps claimRefs=[CLAIM_MAIN] but is pointed at evidence
      // that belongs only to CLAIM_STAT.
      (findSegment(script, 'SEG_EXPLAIN') as unknown as { evidenceRefs: string[] }).evidenceRefs = [
        'EVIDENCE_WITHHOLDING_SURVEY',
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-008',
        ),
      ).toBe(true);
    });

    it('accepts the baseline segment whose evidenceRefs are reachable via its own claimRefs', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const segment = findSegment(outcome.response.data, 'SEG_EXPLAIN');
      expect(segment.claimRefs).toEqual(['CLAIM_MAIN']);
      expect(segment.evidenceRefs).toEqual(['EVIDENCE_WITHHOLDING_MECHANISM']);
    });
  });

  // 22-24. Duration reconciliation (R-BUS-017, R-BUS-018, R-BUS-019).
  describe('duration reconciliation', () => {
    it('fails with BUSINESS.RULE_VIOLATED when scriptDuration.targetDurationSeconds does not echo the request (R-BUS-018)', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT);
      (script.scriptDuration as unknown as { targetDurationSeconds: number }).targetDurationSeconds = 999;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-018',
        ),
      ).toBe(true);
    });

    it('fails with BUSINESS.RULE_VIOLATED when totalEstimatedDurationSeconds does not match the actual sum (R-BUS-017)', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT);
      (script.scriptDuration as unknown as { totalEstimatedDurationSeconds: number }).totalEstimatedDurationSeconds = 999;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-017',
        ),
      ).toBe(true);
    });

    it('accepts the baseline duration reconciliation (target 100s, total 95s, within 0.15 tolerance)', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      expect(outcome.response.data.scriptDuration.withinTolerance).toBe(true);
    });
  });

  // 25-26. Word count consistency (R-BUS-021).
  describe('word count consistency (R-BUS-021)', () => {
    it('fails with BUSINESS.RULE_VIOLATED when declared wordCount does not match the calculated value', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { wordCount: number };
      script.wordCount = 999;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-021',
        ),
      ).toBe(true);
    });

    it('accepts the baseline declared wordCount (103), which matches the calculated value', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      expect(outcome.response.data.wordCount).toBe(103);
    });
  });

  // 27. Missing hook (R-BUS-011).
  it('fails with BUSINESS.RULE_VIOLATED when the first segment does not open with the hook', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
    const first = script.segments.find((item) => item.order === 1);
    if (first === undefined) throw new Error('fixture missing order=1 segment');
    first.segmentType = 'CONTEXT';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-011',
      ),
    ).toBe(true);
  });

  // 28. Missing conclusion (R-BUS-012).
  it('fails with BUSINESS.RULE_VIOLATED when the last segment is neither CONCLUSION nor CTA', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
    const last = script.segments.reduce((a, b) => ((a.order as number) > (b.order as number) ? a : b));
    last.segmentType = 'EXPLANATION';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-012',
      ),
    ).toBe(true);
  });

  // 29. Invalid segment type.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered segmentType enum value', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as { segments: Array<Record<string, unknown>> };
    const firstSegment = script.segments[0];
    if (firstSegment === undefined) throw new Error('fixture has no segments');
    firstSegment.segmentType = 'CLIFFHANGER';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 30, 31. Prompt injection in claim / evidence text — see script-writer.prompt.spec.ts.

  // 32. Provider failure.
  it('fails with a retryable AI_PROVIDER.INVOCATION.REQUEST_FAILED when the provider rejects', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('PROVIDER_ERROR', 'test-provider', 'simulated provider failure'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_PROVIDER.INVOCATION.REQUEST_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 33. Timeout.
  it('fails with a retryable TIMEOUT.INVOCATION.EXCEEDED when the provider times out', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('TIMEOUT', 'test-provider', 'timed out'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('TIMEOUT.INVOCATION.EXCEEDED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 34. Refusal.
  it('fails non-retryably when the model returns a structured refusal', async () => {
    aiProvider.invoke.mockResolvedValue(
      baseAiResult(JSON.stringify({ refusal: { reasonCode: 'INPUT_CONTRADICTORY', details: 'beat references a claim absent from verificationPackage' } })),
    );

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.DUPLICATE_CLAIM_ID');
    expect(outcome.retry.retryable).toBe(false);
  });

  // 35. Truncated response.
  it('fails with a retryable AI_OUTPUT.CONTENT.TRUNCATED when finishReason is TRUNCATED', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('{"incomplete":', { finishReason: 'TRUNCATED' }));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.CONTENT.TRUNCATED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 36. Invalid JSON.
  it('fails with a retryable AI_OUTPUT.JSON.PARSE_FAILED when the model output is not valid JSON', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('not json at all'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.JSON.PARSE_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 37. Output schema failure.
  it('fails with SCHEMA.VALIDATION_FAILED when the model omits a required field', async () => {
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as Record<string, unknown>;
    delete script.scriptDuration;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 38. Business validation failure — see #4-#29 above for concrete instances.

  // 39-40. Downstream readiness (R-BUS-022, R-BUS-023).
  describe('downstream readiness', () => {
    it('accepts the baseline READY_FOR_REVIEW script with zero readinessBlockers and duration within tolerance', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      expect(outcome.response.data.downstreamReadiness).toBe('READY_FOR_REVIEW');
    });

    it('fails with BUSINESS.RULE_VIOLATED when READY_FOR_REVIEW is declared with an out-of-tolerance duration', async () => {
      const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as {
        scriptDuration: { withinTolerance: boolean };
      };
      script.scriptDuration.withinTolerance = false;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-023',
        ),
      ).toBe(true);
    });
  });

  // 41-42. CTA consistency (R-BUS-013).
  describe('CTA consistency (R-BUS-013)', () => {
    it('accepts the baseline script, which includes a CTA segment because ctaStrategy.ctaType is SUBSCRIBE', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      expect(outcome.response.data.segments.some((segment) => segment.segmentType === 'CTA')).toBe(true);
    });

    it('fails with BUSINESS.RULE_VIOLATED when a CTA segment is present but ctaStrategy.ctaType is NONE', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { storyArchitecture: { ctaStrategy: { ctaType: string } } };
      };
      request.data.storyArchitecture.ctaStrategy.ctaType = 'NONE';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-013',
        ),
      ).toBe(true);
    });
  });

  // 43. Conflicting claim handled safely (USE_WITH_QUALIFICATION variant).
  it('accepts a segment citing a CONFLICTING-status claim (downstreamSafety USE_WITH_QUALIFICATION) with its qualification preserved', async () => {
    const conflictingClaim: VerifiedClaimRef = {
      claimId: 'CLAIM_CONFLICTING',
      claimText: 'Sources disagree on how quickly this change takes effect.',
      claimType: 'OTHER',
      verificationStatus: 'CONFLICTING',
      downstreamSafety: 'USE_WITH_QUALIFICATION',
      supportingEvidenceIds: [],
      isTimeSensitive: true,
      freshnessConcern: 'MODERATE',
      limitations: ['Reports conflict and could not be resolved.'],
    };
    const request = withExtraClaim(conflictingClaim);
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as {
      segments: Array<{ segmentId: string; claimRefs: string[]; qualification?: string }>;
    };
    const segment = script.segments.find((item) => item.segmentId === 'SEG_CTA');
    if (segment === undefined) throw new Error('fixture missing SEG_CTA');
    segment.claimRefs = ['CLAIM_CONFLICTING'];
    segment.qualification = 'Sources disagree on timing; present both possibilities without asserting either as certain.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(true);
  });

  // 44. Outdated claim handled safely (USE_WITH_QUALIFICATION variant).
  it('accepts a segment citing an OUTDATED-status claim (downstreamSafety USE_WITH_QUALIFICATION) with its qualification preserved', async () => {
    const outdatedClaim: VerifiedClaimRef = {
      claimId: 'CLAIM_OUTDATED',
      claimText: 'This figure reflects last year\'s guidance and may have since changed.',
      claimType: 'OTHER',
      verificationStatus: 'OUTDATED',
      downstreamSafety: 'USE_WITH_QUALIFICATION',
      supportingEvidenceIds: [],
      isTimeSensitive: true,
      freshnessConcern: 'SEVERE',
      limitations: ['No current-year confirmation was found.'],
    };
    const request = withExtraClaim(outdatedClaim);
    const script = deepClone(VALID_NARRATION_SCRIPT) as unknown as {
      segments: Array<{ segmentId: string; claimRefs: string[]; qualification?: string }>;
    };
    const segment = script.segments.find((item) => item.segmentId === 'SEG_CTA');
    if (segment === undefined) throw new Error('fixture missing SEG_CTA');
    segment.claimRefs = ['CLAIM_OUTDATED'];
    segment.qualification = 'This figure is from last year\'s guidance and may no longer be current.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(script)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(true);
  });

  // 45, 46. Valid success / failure envelope shape.
  it('every issue on a failure response conforms to the registered contract shape', async () => {
    const request = deepClone(VALID_REQUEST);
    delete (request.data as { language?: unknown }).language;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    const findings = structuralValidate(responseValidator, outcome.response);
    expect(findings).toEqual([]);
    if (!outcome.ok) {
      for (const issue of outcome.response.issues) {
        expect(issue.code).toEqual(expect.any(String));
        expect(issue.category).toEqual(expect.any(String));
        expect(issue.severity).toEqual(expect.any(String));
        expect(typeof issue.retryable).toBe('boolean');
        expect(issue.message.length).toBeGreaterThan(0);
        expect(issue.source.component).toBe('script-writer-agent');
        expect(issue.context.correlationId).toBe(request.meta.correlationId);
        expect(issue.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    }
  });

  // Regression: response schemaVersion must always be the fixed AGT-05 output
  // version, never copied from the request's own (independently validated)
  // schemaVersion — mirrors the fix applied to Agent 03's and Agent 04's runtimes.
  it('always emits the fixed output schemaVersion regardless of the request schemaVersion', async () => {
    const request = deepClone(VALID_REQUEST);
    (request as unknown as { schemaVersion: string }).schemaVersion = '1.9.9';
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_NARRATION_SCRIPT)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });
});

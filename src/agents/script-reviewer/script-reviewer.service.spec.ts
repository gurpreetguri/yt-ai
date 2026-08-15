import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { ValidateFunction } from 'ajv/dist/2020';

import { structuralValidate } from '@agents/agent-06-script-reviewer/validator';
import type { ReviewIssue, ReviewReport, VerifiedClaimRef } from '@agents/agent-06-script-reviewer/interfaces';

import { AI_PROVIDER, AiInvocationResult, AiProvider, AiProviderError } from '../../ai/ai-provider.interface';
import { aiConfig } from '../../config/ai.config';
import { ScriptReviewerModule } from './script-reviewer.module';
import { ScriptReviewerService } from './script-reviewer.service';
import { SCRIPT_REVIEWER_RESPONSE_VALIDATOR } from './script-reviewer.validation';
import { deepClone, VALID_REQUEST, VALID_REVIEW_REPORT } from './__fixtures__/script-reviewer.fixtures';

/**
 * Unit tests for AGT-06's NestJS runtime.
 *
 * The AI provider is always mocked (`AI_PROVIDER` token override) — these
 * tests never make a real network call. Test numbers in comments correspond
 * to the 53 scenarios enumerated in `test-cases.md` / the commissioning
 * brief's "Testing" section. Prompt-injection scenarios (#28, #29) are
 * covered in `script-reviewer.prompt.spec.ts` instead, since they concern
 * rendering, not the runtime pipeline.
 */
describe('ScriptReviewerService', () => {
  let service: ScriptReviewerService;
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
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [aiConfig] }), ScriptReviewerModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiProvider)
      .compile();

    service = moduleRef.get(ScriptReviewerService);
    responseValidator = moduleRef.get(SCRIPT_REVIEWER_RESPONSE_VALIDATOR);
  });

  function withExtraClaim(claim: VerifiedClaimRef) {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { verificationPackage: { claims: VerifiedClaimRef[] } };
    };
    request.data.verificationPackage.claims.push(claim);
    return request as unknown as typeof VALID_REQUEST;
  }

  const doNotUseClaim = (claimId: string): VerifiedClaimRef => ({
    claimId,
    claimText: 'A claim that Agent 03 determined must not be used.',
    claimType: 'OTHER',
    verificationStatus: 'CONTRADICTED',
    downstreamSafety: 'DO_NOT_USE',
    supportingEvidenceIds: [],
    isTimeSensitive: false,
    freshnessConcern: 'NONE',
    limitations: [],
  });

  const baseIssue = (overrides: Partial<ReviewIssue>): ReviewIssue => ({
    issueId: 'ISSUE_ONE',
    category: 'ENGAGEMENT',
    severity: 'MEDIUM',
    basis: 'MODEL_ASSESSED',
    location: 'segment SEG_HOOK',
    description: 'The hook could create slightly stronger curiosity.',
    affectedClaimIds: [],
    affectedEvidenceIds: [],
    recommendation: 'Consider sharpening the opening question in a future revision.',
    repairability: 'REPAIRABLE',
    blocking: false,
    confidence: 0.7,
    ...overrides,
  });

  // 1. Valid approved script.
  it('produces a SUCCESS response for a valid request and a valid, schema-conformant AI response', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.contractType).toBe('RESPONSE');
    expect(outcome.response.status).toBe('SUCCESS');
    expect(outcome.response.data.packageKind).toBe('REVIEW_REPORT');
    expect(outcome.response.data).toEqual(VALID_REVIEW_REPORT);
    expect(outcome.response.data.summary.decision).toBe('APPROVED');
    expect(outcome.response.validation).toBeUndefined();
    expect(outcome.response.meta.agentId).toBe('script-reviewer-agent');
    expect(outcome.response.meta.promptVersion).toBe('prm_script_reviewer_agent');
    expect(outcome.response.execution?.outcome).toBe('SUCCESS');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });

  // 2. Invalid input.
  it('fails structural input validation for an unregistered expertiseLevel enum value and does not call the provider', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.audienceContext as unknown as { expertiseLevel: string }).expertiseLevel = 'GENIUS';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 3. Missing script.
  it('fails with REQUIRED_FIELD_MISSING and does not call the AI provider when script is absent', async () => {
    const request = deepClone(VALID_REQUEST);
    delete (request.data as { script?: unknown }).script;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REQUIRED_FIELD_MISSING');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 4. Missing story architecture.
  it('fails with REQUIRED_FIELD_MISSING when storyArchitecture is absent', async () => {
    const request = deepClone(VALID_REQUEST);
    delete (request.data as { storyArchitecture?: unknown }).storyArchitecture;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REQUIRED_FIELD_MISSING');
  });

  // 5. Missing verification package.
  it('fails with REQUIRED_FIELD_MISSING when verificationPackage is absent', async () => {
    const request = deepClone(VALID_REQUEST);
    delete (request.data as { verificationPackage?: unknown }).verificationPackage;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REQUIRED_FIELD_MISSING');
  });

  // 6, 44. Unknown segment reference (R-BUS-002).
  it('fails with UNGROUNDED_CLAIM when an issue references an undeclared segment', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { issues: ReviewIssue[] };
    report.issues = [baseIssue({ issueId: 'ISSUE_BAD_SEGMENT', affectedSegmentId: 'SEG_GHOST' })];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-002',
      ),
    ).toBe(true);
  });

  // 7, 44. Unknown claim reference (R-BUS-004).
  it('fails with UNGROUNDED_CLAIM when an issue references an undeclared claim', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { issues: ReviewIssue[] };
    report.issues = [baseIssue({ issueId: 'ISSUE_BAD_CLAIM', affectedClaimIds: ['CLAIM_GHOST'] })];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-004',
      ),
    ).toBe(true);
  });

  // 8, 44. Unknown evidence reference (R-BUS-005).
  it('fails with UNGROUNDED_CLAIM when an issue references undeclared evidence', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { issues: ReviewIssue[] };
    report.issues = [baseIssue({ issueId: 'ISSUE_BAD_EVIDENCE', affectedEvidenceIds: ['EVIDENCE_GHOST'] })];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-005',
      ),
    ).toBe(true);
  });

  // 9. DO_NOT_USE claim used, missed by the review (R-BUS-014, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when the script uses a DO_NOT_USE claim and the review fails to report it', async () => {
    const request = withExtraClaim(doNotUseClaim('CLAIM_DNU'));
    (request as unknown as {
      data: { script: { segments: Array<{ segmentId: string; claimRefs: string[] }> } };
    }).data.script.segments.find((segment) => segment.segmentId === 'SEG_CTA')!.claimRefs = ['CLAIM_DNU'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-014',
      ),
    ).toBe(true);
  });

  // 10, 14, 15. Missing qualification, missed by the review (R-BUS-015, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when a USE_WITH_QUALIFICATION claim loses its qualification and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; qualification?: string }> } };
    };
    const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_STAT');
    if (segment === undefined) throw new Error('fixture missing SEG_STAT');
    delete segment.qualification;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-015',
      ),
    ).toBe(true);
  });

  // 11, 12. Numeric drift, missed by the review (R-BUS-016, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when narration contains an ungrounded number and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; narration: string }> } };
    };
    const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_EXPLAIN');
    if (segment === undefined) throw new Error('fixture missing SEG_EXPLAIN');
    segment.narration = 'Your paycheck is reduced by exactly 42% due to federal withholding.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-016',
      ),
    ).toBe(true);
  });

  // 13. Unsupported/fabricated quote, missed by the review (R-BUS-017, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when a quotation is fabricated and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; quotation?: { quotedText: string } }> } };
    };
    const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
    if (segment === undefined || segment.quotation === undefined) throw new Error('fixture missing SEG_QUOTE quotation');
    segment.quotation.quotedText = 'Withholding errors are basically impossible to avoid.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-017',
      ),
    ).toBe(true);
  });

  // 16, 17. Unsupported causal claim / unsupported comparison — MODEL_ASSESSED, no ground-truth rule.
  it('accepts a review that reports a MODEL_ASSESSED unsupported causal or comparison issue', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
    (report as unknown as { issues: ReviewIssue[] }).issues = [
      baseIssue({
        issueId: 'ISSUE_CAUSAL',
        category: 'UNSUPPORTED_CAUSAL_CLAIM',
        severity: 'MEDIUM',
        location: 'segment SEG_EXPLAIN',
        description: 'Narration implies a causal link the cited claim does not establish.',
        repairability: 'NOT_REPAIRABLE',
      }),
    ];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
  });

  // 18. Missing hook, missed by the review (R-BUS-018, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when the script does not open with a HOOK segment and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; segmentType: string }> } };
    };
    const first = request.data.script.segments.find((item) => item.segmentId === 'SEG_HOOK');
    if (first === undefined) throw new Error('fixture missing SEG_HOOK');
    first.segmentType = 'CONTEXT';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-018',
      ),
    ).toBe(true);
  });

  // 19. Missing conclusion/CTA close, missed by the review (R-BUS-019, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when the script does not close with CONCLUSION/CTA and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; segmentType: string }> } };
    };
    const last = request.data.script.segments.find((item) => item.segmentId === 'SEG_CTA');
    if (last === undefined) throw new Error('fixture missing SEG_CTA');
    last.segmentType = 'EXPLANATION';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-019',
      ),
    ).toBe(true);
  });

  // 20. Missing major story beat, missed by the review (R-BUS-021, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when a story beat is never narrated and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; beatRef: string }> } };
    };
    const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
    if (segment === undefined) throw new Error('fixture missing SEG_QUOTE');
    segment.beatRef = 'BEAT_EXPLAIN'; // leaves BEAT_QUOTE entirely unnarrated

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-021',
      ),
    ).toBe(true);
  });

  // 21. Story order violation, missed by the review (R-BUS-022, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when narration order violates beat order and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { segments: Array<{ segmentId: string; order: number }> } };
    };
    const hook = request.data.script.segments.find((item) => item.segmentId === 'SEG_HOOK');
    const quote = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
    if (hook === undefined || quote === undefined) throw new Error('fixture missing expected segments');
    // Narrate BEAT_QUOTE (order 3) before BEAT_HOOK (order 1) in spoken sequence.
    hook.order = 4;
    quote.order = 1;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    // Both R-BUS-011 (opens with hook) and R-BUS-022 (order) are plausibly
    // implicated by this mutation; assert the order-violation ground truth
    // specifically fired among the reported findings.
    expect(
      outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-022'),
    ).toBe(true);
  });

  // 22, 23. Duration overrun/underrun, missed by the review (R-BUS-020, ground truth).
  it('fails with MISSED_CRITICAL_ISSUE when the script duration is out of tolerance and the review fails to report it', async () => {
    const request = deepClone(VALID_REQUEST) as unknown as {
      data: { script: { scriptDuration: { totalEstimatedDurationSeconds: number; withinTolerance: boolean } } };
    };
    request.data.script.scriptDuration.totalEstimatedDurationSeconds = 500;
    request.data.script.scriptDuration.withinTolerance = false;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-020',
      ),
    ).toBe(true);
  });

  // 24-27. MODEL_ASSESSED dimensions accepted structurally (audience/clarity/repetition/transitions).
  it('accepts a review reporting MODEL_ASSESSED audience-fit and spoken-language-quality issues', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
    (report as unknown as { issues: ReviewIssue[] }).issues = [
      baseIssue({ issueId: 'ISSUE_AUDIENCE', category: 'AUDIENCE_FIT', severity: 'LOW', repairability: 'NOT_REPAIRABLE' }),
      baseIssue({ issueId: 'ISSUE_LANGUAGE', category: 'SPOKEN_LANGUAGE_QUALITY', severity: 'LOW', repairability: 'NOT_REPAIRABLE' }),
    ];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
  });

  // 30-33. Severity levels.
  describe('severity levels', () => {
    it('accepts a CRITICAL, blocking issue paired with a non-APPROVED decision', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_CRITICAL',
          category: 'SAFETY',
          severity: 'CRITICAL',
          blocking: true,
          repairability: 'NOT_REPAIRABLE',
        }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REJECTED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 0,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REJECT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });

    it('accepts a HIGH-severity issue reflected in highSeverityIssueCount', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [baseIssue({ issueId: 'ISSUE_HIGH', severity: 'HIGH' })];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 0,
        highSeverityIssueCount: 1,
        repairableIssueCount: 1,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });

    it('accepts a MEDIUM-severity issue', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [baseIssue({ issueId: 'ISSUE_MEDIUM', severity: 'MEDIUM' })];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 0,
        highSeverityIssueCount: 0,
        repairableIssueCount: 1,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });

    it('accepts a LOW-severity issue alongside an APPROVED decision', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({ issueId: 'ISSUE_LOW', severity: 'LOW', repairability: 'NOT_REPAIRABLE' }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });
  });

  // 34-37. Decisions.
  describe('decisions', () => {
    it('accepts APPROVED with zero issues', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));
      const outcome = await service.execute(VALID_REQUEST);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      expect(outcome.response.data.summary.decision).toBe('APPROVED');
      expect(outcome.response.data.nextAction).toBe('CONTINUE');
    });

    it('accepts REPAIR_REQUIRED with a repairable issue', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [baseIssue({ issueId: 'ISSUE_REPAIR' })];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 0,
        highSeverityIssueCount: 0,
        repairableIssueCount: 1,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(VALID_REQUEST);
      expect(outcome.ok).toBe(true);
    });

    it('accepts REGENERATION_REQUIRED with a not-repairable issue', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({ issueId: 'ISSUE_REGEN', severity: 'HIGH', blocking: true, repairability: 'NOT_REPAIRABLE' }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REGENERATION_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 1,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REGENERATE_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(VALID_REQUEST);
      expect(outcome.ok).toBe(true);
    });

    it('accepts REJECTED with a CRITICAL issue', async () => {
      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({ issueId: 'ISSUE_REJECT', category: 'SAFETY', severity: 'CRITICAL', blocking: true, repairability: 'NOT_REPAIRABLE' }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REJECTED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 0,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REJECT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(VALID_REQUEST);
      expect(outcome.ok).toBe(true);
    });
  });

  // 38. Invalid decision.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered decision enum value', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { summary: Record<string, unknown> };
    report.summary.decision = 'MAYBE_APPROVED';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 39. Invalid next action.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered nextAction enum value', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { nextAction: unknown };
    report.nextAction = 'DO_SOMETHING';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 40. Decision/next-action mismatch (R-BUS-013).
  it('fails with INCONSISTENT_DECISION when nextAction does not match decision', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { nextAction: unknown };
    report.nextAction = 'REPAIR_SCRIPT'; // decision remains APPROVED from the baseline fixture

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION' && issue.details?.[0]?.ruleId === 'R-BUS-013',
      ),
    ).toBe(true);
  });

  // 41. Decision/readiness mismatch (R-BUS-009).
  it('fails with INCONSISTENT_DECISION when readyForScenePlanning does not match decision', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { summary: Record<string, unknown> };
    report.summary.readyForScenePlanning = false; // decision remains APPROVED

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION' && issue.details?.[0]?.ruleId === 'R-BUS-009',
      ),
    ).toBe(true);
  });

  // 42. Invalid issue count (R-BUS-006).
  it('fails with INCONSISTENT_DECISION when blockingIssueCount disagrees with the actual count', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as { summary: Record<string, unknown> };
    report.summary.blockingIssueCount = 5;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.INCONSISTENT_DECISION' && issue.details?.[0]?.ruleId === 'R-BUS-006',
      ),
    ).toBe(true);
  });

  // 43. Valid issue references.
  it('accepts an issue whose affectedSegmentId/affectedClaimIds/affectedEvidenceIds all resolve', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
    (report as unknown as { issues: ReviewIssue[] }).issues = [
      baseIssue({
        issueId: 'ISSUE_VALID_REFS',
        affectedSegmentId: 'SEG_HOOK',
        affectedBeatId: 'BEAT_HOOK',
        affectedClaimIds: ['CLAIM_MAIN'],
        affectedEvidenceIds: ['EVIDENCE_WITHHOLDING_MECHANISM'],
      }),
    ];
    (report as unknown as { summary: ReviewReport['summary'] }).summary = {
      decision: 'REPAIR_REQUIRED',
      readyForScenePlanning: false,
      blockingIssueCount: 0,
      highSeverityIssueCount: 0,
      repairableIssueCount: 1,
    };
    (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
  });

  // 45. Provider failure.
  it('fails with a retryable AI_PROVIDER.INVOCATION.REQUEST_FAILED when the provider rejects', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('PROVIDER_ERROR', 'test-provider', 'simulated provider failure'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_PROVIDER.INVOCATION.REQUEST_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 46. Timeout.
  it('fails with a retryable TIMEOUT.INVOCATION.EXCEEDED when the provider times out', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('TIMEOUT', 'test-provider', 'timed out'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('TIMEOUT.INVOCATION.EXCEEDED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 47. Refusal.
  it('fails non-retryably when the model returns a structured refusal', async () => {
    aiProvider.invoke.mockResolvedValue(
      baseAiResult(JSON.stringify({ refusal: { reasonCode: 'INPUT_CONTRADICTORY', details: 'a beat references a claim absent from verificationPackage' } })),
    );

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.DUPLICATE_CLAIM_ID');
    expect(outcome.retry.retryable).toBe(false);
  });

  // 48. Truncated response.
  it('fails with a retryable AI_OUTPUT.CONTENT.TRUNCATED when finishReason is TRUNCATED', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('{"incomplete":', { finishReason: 'TRUNCATED' }));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.CONTENT.TRUNCATED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 49. Invalid JSON.
  it('fails with a retryable AI_OUTPUT.JSON.PARSE_FAILED when the model output is not valid JSON', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('not json at all'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.JSON.PARSE_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 50. Output schema failure.
  it('fails with SCHEMA.VALIDATION_FAILED when the model omits a required field', async () => {
    const report = deepClone(VALID_REVIEW_REPORT) as unknown as Record<string, unknown>;
    delete report.dimensions;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 51. Business validation failure — see #6-#23, #38-#42 above for concrete instances.

  // 52, 53. Envelope shape for both success and failure responses.
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
        expect(issue.source.component).toBe('script-reviewer-agent');
        expect(issue.context.correlationId).toBe(request.meta.correlationId);
        expect(issue.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    }
  });

  // FIX 3 regression tests: proving the severity/blocking downgrade bypass
  // is closed. Before this fix, R-BUS-014-022 only checked that an issue
  // with the right category existed — a model could report the correct
  // category at LOW severity or non-blocking (or pointed at the wrong
  // segment/beat) and still pass ground-truth validation. Every case below
  // exercises that exact bypass and asserts it is now rejected.
  describe('ground-truth severity/blocking/target enforcement (FIX 3 regression)', () => {
    // 1. DO_NOT_USE defect + LOW/non-blocking issue → MUST FAIL.
    it('rejects a DO_NOT_USE defect reported at LOW severity and non-blocking', async () => {
      const request = withExtraClaim(doNotUseClaim('CLAIM_DNU'));
      (request as unknown as {
        data: { script: { segments: Array<{ segmentId: string; claimRefs: string[] }> } };
      }).data.script.segments.find((segment) => segment.segmentId === 'SEG_CTA')!.claimRefs = ['CLAIM_DNU'];

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_DNU_DOWNGRADED',
          category: 'DO_NOT_USE_VIOLATION',
          severity: 'LOW',
          blocking: false,
          affectedSegmentId: 'SEG_CTA',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-014',
        ),
      ).toBe(true);
    });

    // 2. DO_NOT_USE defect + CRITICAL/non-blocking issue → MUST FAIL.
    it('rejects a DO_NOT_USE defect reported as CRITICAL but not blocking', async () => {
      const request = withExtraClaim(doNotUseClaim('CLAIM_DNU'));
      (request as unknown as {
        data: { script: { segments: Array<{ segmentId: string; claimRefs: string[] }> } };
      }).data.script.segments.find((segment) => segment.segmentId === 'SEG_CTA')!.claimRefs = ['CLAIM_DNU'];

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_DNU_NONBLOCKING',
          category: 'DO_NOT_USE_VIOLATION',
          severity: 'CRITICAL',
          blocking: false,
          affectedSegmentId: 'SEG_CTA',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-014',
        ),
      ).toBe(true);
    });

    // 3. DO_NOT_USE defect + CRITICAL/blocking issue → PASS ground-truth rule.
    it('accepts a DO_NOT_USE defect reported as CRITICAL and blocking, referencing the offending segment', async () => {
      const request = withExtraClaim(doNotUseClaim('CLAIM_DNU'));
      (request as unknown as {
        data: { script: { segments: Array<{ segmentId: string; claimRefs: string[] }> } };
      }).data.script.segments.find((segment) => segment.segmentId === 'SEG_CTA')!.claimRefs = ['CLAIM_DNU'];

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_DNU_CORRECT',
          category: 'DO_NOT_USE_VIOLATION',
          severity: 'CRITICAL',
          blocking: true,
          affectedSegmentId: 'SEG_CTA',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REJECTED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 0,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REJECT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request);

      expect(outcome.ok).toBe(true);
    });

    // 4. Numeric drift + LOW/non-blocking issue → MUST FAIL.
    it('rejects a numeric-drift defect reported at LOW severity and non-blocking', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; narration: string }> } };
      };
      const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_EXPLAIN');
      if (segment === undefined) throw new Error('fixture missing SEG_EXPLAIN');
      segment.narration = 'Your paycheck is reduced by exactly 42% due to federal withholding.';

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_NUMERIC_DOWNGRADED',
          category: 'NUMERIC_DRIFT',
          severity: 'LOW',
          blocking: false,
          affectedSegmentId: 'SEG_EXPLAIN',
          repairability: 'REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-016',
        ),
      ).toBe(true);
    });

    // 5. Unsupported quote + HIGH/blocking issue → MUST FAIL because quote violations are CRITICAL.
    it('rejects a fabricated-quote defect reported as HIGH severity even though it is blocking', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; quotation?: { quotedText: string } }> } };
      };
      const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
      if (segment === undefined || segment.quotation === undefined) throw new Error('fixture missing SEG_QUOTE quotation');
      segment.quotation.quotedText = 'Withholding errors are basically impossible to avoid.';

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_QUOTE_WRONG_SEVERITY',
          category: 'UNSUPPORTED_QUOTE',
          severity: 'HIGH',
          blocking: true,
          affectedSegmentId: 'SEG_QUOTE',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-017',
        ),
      ).toBe(true);
    });

    // 6. Missing story beat + generic STORY_ALIGNMENT issue for another beat → MUST FAIL.
    it('rejects a missing-beat defect when the reported STORY_ALIGNMENT issue targets a different beat', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; beatRef: string }> } };
      };
      const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
      if (segment === undefined) throw new Error('fixture missing SEG_QUOTE');
      segment.beatRef = 'BEAT_EXPLAIN'; // leaves BEAT_QUOTE entirely unnarrated

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_WRONG_BEAT',
          category: 'STORY_ALIGNMENT',
          severity: 'HIGH',
          blocking: true,
          affectedBeatId: 'BEAT_EXPLAIN', // wrong beat — BEAT_QUOTE is the one left uncovered
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-021',
        ),
      ).toBe(true);
    });

    // 7. Missing story beat + correct affectedBeatId + blocking=true → PASS.
    it('accepts a missing-beat defect when the reported STORY_ALIGNMENT issue targets the exact uncovered beat and is blocking', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; beatRef: string }> } };
      };
      const segment = request.data.script.segments.find((item) => item.segmentId === 'SEG_QUOTE');
      if (segment === undefined) throw new Error('fixture missing SEG_QUOTE');
      segment.beatRef = 'BEAT_EXPLAIN'; // leaves BEAT_QUOTE entirely unnarrated

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_CORRECT_BEAT',
          category: 'STORY_ALIGNMENT',
          severity: 'HIGH',
          blocking: true,
          affectedBeatId: 'BEAT_QUOTE',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 1,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });

    // 8. Missing hook + unrelated STRUCTURAL_COMPLETENESS issue → MUST FAIL.
    it('rejects a missing-hook defect when the reported STRUCTURAL_COMPLETENESS issue targets a different segment', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; segmentType: string }> } };
      };
      const first = request.data.script.segments.find((item) => item.segmentId === 'SEG_HOOK');
      if (first === undefined) throw new Error('fixture missing SEG_HOOK');
      first.segmentType = 'CONTEXT';

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_WRONG_STRUCTURAL_SEGMENT',
          category: 'STRUCTURAL_COMPLETENESS',
          severity: 'HIGH',
          blocking: true,
          affectedSegmentId: 'SEG_EXPLAIN', // wrong segment — SEG_HOOK is the one that opens the script
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-018',
        ),
      ).toBe(true);
    });

    // 9. Missing hook + correct structural issue + blocking=true → PASS.
    it('accepts a missing-hook defect when the reported STRUCTURAL_COMPLETENESS issue targets the actual first segment and is blocking', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { segments: Array<{ segmentId: string; segmentType: string }> } };
      };
      const first = request.data.script.segments.find((item) => item.segmentId === 'SEG_HOOK');
      if (first === undefined) throw new Error('fixture missing SEG_HOOK');
      first.segmentType = 'CONTEXT';

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_CORRECT_HOOK_SEGMENT',
          category: 'STRUCTURAL_COMPLETENESS',
          severity: 'HIGH',
          blocking: true,
          affectedSegmentId: 'SEG_HOOK',
          repairability: 'NOT_REPAIRABLE',
        }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 1,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });

    // 10. Duration violation + unrelated (non-blocking) DURATION issue → MUST FAIL.
    it('rejects a duration defect reported as a non-blocking DURATION issue', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { scriptDuration: { totalEstimatedDurationSeconds: number; withinTolerance: boolean } } };
      };
      request.data.script.scriptDuration.totalEstimatedDurationSeconds = 500;
      request.data.script.scriptDuration.withinTolerance = false;

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_DURATION_NONBLOCKING',
          category: 'DURATION',
          severity: 'MEDIUM',
          blocking: false,
          repairability: 'NOT_REPAIRABLE',
        }),
      ];

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some(
          (issue) => issue.code === 'AI_OUTPUT.CONTENT.MISSED_CRITICAL_ISSUE' && issue.details?.[0]?.ruleId === 'R-BUS-020',
        ),
      ).toBe(true);
    });

    // 11. Duration violation + correct DURATION issue + blocking=true → PASS.
    it('accepts a duration defect reported as a blocking DURATION issue', async () => {
      const request = deepClone(VALID_REQUEST) as unknown as {
        data: { script: { scriptDuration: { totalEstimatedDurationSeconds: number; withinTolerance: boolean } } };
      };
      request.data.script.scriptDuration.totalEstimatedDurationSeconds = 500;
      request.data.script.scriptDuration.withinTolerance = false;

      const report = deepClone(VALID_REVIEW_REPORT) as unknown as ReviewReport;
      (report as unknown as { issues: ReviewIssue[] }).issues = [
        baseIssue({
          issueId: 'ISSUE_DURATION_BLOCKING',
          category: 'DURATION',
          severity: 'HIGH',
          blocking: true,
          repairability: 'NOT_REPAIRABLE',
        }),
      ];
      (report as unknown as { summary: ReviewReport['summary'] }).summary = {
        decision: 'REPAIR_REQUIRED',
        readyForScenePlanning: false,
        blockingIssueCount: 1,
        highSeverityIssueCount: 1,
        repairableIssueCount: 0,
      };
      (report as unknown as { nextAction: ReviewReport['nextAction'] }).nextAction = 'REPAIR_SCRIPT';

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(report)));
      const outcome = await service.execute(request as unknown as typeof VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });
  });

  // Regression: response schemaVersion must always be the fixed AGT-06 output
  // version, never copied from the request's own (independently validated)
  // schemaVersion — mirrors the fix applied to every prior agent's runtime.
  it('always emits the fixed output schemaVersion regardless of the request schemaVersion', async () => {
    const request = deepClone(VALID_REQUEST);
    (request as unknown as { schemaVersion: string }).schemaVersion = '1.9.9';
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_REVIEW_REPORT)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });
});

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { ValidateFunction } from 'ajv/dist/2020';

import { structuralValidate } from '@agents/agent-07-scene-planner/validator';
import type { Scene, ScenePlan, VerifiedClaimRef } from '@agents/agent-07-scene-planner/interfaces';

import { AI_PROVIDER, AiInvocationResult, AiProvider, AiProviderError } from '../../ai/ai-provider.interface';
import { aiConfig } from '../../config/ai.config';
import { ScenePlannerModule } from './scene-planner.module';
import { ScenePlannerService } from './scene-planner.service';
import { SCENE_PLANNER_RESPONSE_VALIDATOR } from './scene-planner.validation';
import { deepClone, VALID_REQUEST, VALID_SCENE_PLAN } from './__fixtures__/scene-planner.fixtures';

/**
 * Unit tests for AGT-07's NestJS runtime.
 *
 * The AI provider is always mocked (`AI_PROVIDER` token override) — these
 * tests never make a real network call. Test numbers in comments correspond
 * to the 50 scenarios enumerated in `test-cases.md` / the commissioning
 * brief's "Testing" section. Prompt-injection scenarios (#36-#38) are
 * covered in `scene-planner.prompt.spec.ts` instead, since they concern
 * rendering, not the runtime pipeline.
 */
describe('ScenePlannerService', () => {
  let service: ScenePlannerService;
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
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [aiConfig] }), ScenePlannerModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiProvider)
      .compile();

    service = moduleRef.get(ScenePlannerService);
    responseValidator = moduleRef.get(SCENE_PLANNER_RESPONSE_VALIDATOR);
  });

  function findScene(plan: ScenePlan, sceneId: string): Scene {
    const scene = plan.scenes.find((item) => item.sceneId === sceneId);
    if (scene === undefined) throw new Error(`fixture missing scene ${sceneId}`);
    return scene;
  }

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

  // 1. Valid scene plan.
  it('produces a SUCCESS response for a valid request and a valid, schema-conformant AI response', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.contractType).toBe('RESPONSE');
    expect(outcome.response.status).toBe('SUCCESS');
    expect(outcome.response.data.packageKind).toBe('SCENE_PLAN');
    expect(outcome.response.data).toEqual(VALID_SCENE_PLAN);
    expect(outcome.response.validation).toBeUndefined();
    expect(outcome.response.meta.agentId).toBe('scene-planner-agent');
    expect(outcome.response.meta.promptVersion).toBe('prm_scene_planner_agent');
    expect(outcome.response.execution?.outcome).toBe('SUCCESS');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });

  // 2. Invalid input.
  it('fails structural input validation for an unregistered decision enum value and does not call the provider', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.reviewResult as unknown as { decision: string }).decision = 'MAYBE_APPROVED';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 3. Script not approved.
  it('fails with SCRIPT_NOT_READY when script.downstreamReadiness is NOT_READY_FOR_REVIEW', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.script as unknown as { downstreamReadiness: string }).downstreamReadiness = 'NOT_READY_FOR_REVIEW';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.SCRIPT_NOT_READY');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 4. Agent 06 not APPROVED.
  it('fails with REVIEW_NOT_APPROVED when reviewResult.decision is not APPROVED', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.reviewResult as unknown as { decision: string }).decision = 'REPAIR_REQUIRED';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REVIEW_NOT_APPROVED');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  // 5. Wrong nextAction.
  it('fails with REVIEW_NOT_APPROVED when reviewResult.nextAction is not CONTINUE', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.reviewResult as unknown as { nextAction: string }).nextAction = 'REPAIR_SCRIPT';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REVIEW_NOT_APPROVED');
    expect(aiProvider.invoke).not.toHaveBeenCalled();
  });

  it('fails with REVIEW_NOT_APPROVED when reviewResult.readyForScenePlanning is false', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.reviewResult as unknown as { readyForScenePlanning: boolean }).readyForScenePlanning = false;

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.REVIEW_NOT_APPROVED');
  });

  // 6, 7. Topic ID / Script ID mismatch.
  it('fails with TOPIC_ID_MISMATCH when script.topicId disagrees with storyArchitecture.topicId', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.script as unknown as { topicId: string }).topicId = 'TOPIC_OTHER';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'VALIDATION.INPUT.TOPIC_ID_MISMATCH' && issue.details?.[0]?.ruleId === 'R-IN-007',
      ),
    ).toBe(true);
  });

  // 8. Story architecture ID mismatch.
  it('fails with TOPIC_ID_MISMATCH when reviewResult.topicId disagrees with storyArchitecture.topicId', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.reviewResult as unknown as { topicId: string }).topicId = 'TOPIC_OTHER';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'VALIDATION.INPUT.TOPIC_ID_MISMATCH' && issue.details?.[0]?.ruleId === 'R-IN-008',
      ),
    ).toBe(true);
  });

  // 9. Verification package mismatch.
  it('fails with TOPIC_ID_MISMATCH when verificationPackage.topicId disagrees with storyArchitecture.topicId', async () => {
    const request = deepClone(VALID_REQUEST);
    (request.data.verificationPackage as unknown as { topicId: string }).topicId = 'TOPIC_OTHER';

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'VALIDATION.INPUT.TOPIC_ID_MISMATCH' && issue.details?.[0]?.ruleId === 'R-IN-006',
      ),
    ).toBe(true);
  });

  it('fails with DUPLICATE_CLAIM_ID when two supplied claims share a claimId', async () => {
    const request = withExtraClaim({ ...doNotUseClaim('CLAIM_MAIN'), claimId: 'CLAIM_MAIN' });

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.DUPLICATE_CLAIM_ID');
  });

  // 11. Duplicate scene ID.
  it('fails with BUSINESS.RULE_VIOLATED when two scenes share the same sceneId', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const second = plan.scenes[1];
    if (second === undefined) throw new Error('fixture has fewer than 2 scenes');
    second.sceneId = 'SCENE_HOOK';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-001',
      ),
    ).toBe(true);
  });

  // 12. Duplicate scene order.
  it('fails with BUSINESS.RULE_VIOLATED when two scenes share the same order', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const second = plan.scenes[1];
    if (second === undefined) throw new Error('fixture has fewer than 2 scenes');
    second.order = 1;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-002',
      ),
    ).toBe(true);
  });

  // 13. Unknown segment reference (R-BUS-003).
  it('fails with UNGROUNDED_CLAIM when a scene cites an undeclared segment', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    (findScene(plan, 'SCENE_HOOK') as unknown as { segmentRefs: string[] }).segmentRefs = ['SEG_GHOST'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-003',
      ),
    ).toBe(true);
  });

  // 14. Unknown beat reference (R-BUS-004).
  it('fails when a scene cites an undeclared beat', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    (findScene(plan, 'SCENE_HOOK') as unknown as { beatRef: string }).beatRef = 'BEAT_GHOST';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-004'),
    ).toBe(true);
  });

  // 15. Unknown claim reference (R-BUS-005).
  it('fails with UNGROUNDED_CLAIM when a scene cites an undeclared claim', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    (findScene(plan, 'SCENE_HOOK') as unknown as { claimRefs: string[] }).claimRefs = ['CLAIM_GHOST'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-005',
      ),
    ).toBe(true);
  });

  // 16. Unknown evidence reference (R-BUS-006).
  it('fails with UNGROUNDED_CLAIM when a scene cites undeclared evidence', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    (findScene(plan, 'SCENE_HOOK') as unknown as { evidenceRefs: string[] }).evidenceRefs = ['EVIDENCE_GHOST'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-006',
      ),
    ).toBe(true);
  });

  // 17. Evidence belongs to unrelated claim (R-BUS-007).
  it('fails when a scene cites evidence belonging only to a claim it does not reference', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    // SCENE_HOOK keeps claimRefs=[CLAIM_MAIN] but is pointed at evidence
    // belonging only to CLAIM_STAT.
    (findScene(plan, 'SCENE_HOOK') as unknown as { evidenceRefs: string[] }).evidenceRefs = [
      'EVIDENCE_WITHHOLDING_SURVEY',
    ];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM' && issue.details?.[0]?.ruleId === 'R-BUS-007',
      ),
    ).toBe(true);
  });

  // 18. DO_NOT_USE claim (R-BUS-008).
  it('fails with UNSAFE_CLAIM_USAGE when a scene cites a DO_NOT_USE claim', async () => {
    const request = withExtraClaim(doNotUseClaim('CLAIM_DNU'));
    const plan = deepClone(VALID_SCENE_PLAN);
    (findScene(plan, 'SCENE_CTA') as unknown as { claimRefs: string[] }).claimRefs = ['CLAIM_DNU'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE' && issue.details?.[0]?.ruleId === 'R-BUS-008',
      ),
    ).toBe(true);
  });

  // 19. Missing qualification (R-BUS-009).
  it('fails with QUALIFICATION_LOST when a scene citing a USE_WITH_QUALIFICATION claim omits qualification', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    delete scene.qualification;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.QUALIFICATION_LOST' && issue.details?.[0]?.ruleId === 'R-BUS-009',
      ),
    ).toBe(true);
  });

  // 20. Numeric drift (R-BUS-010).
  it('fails with UNSUPPORTED_NUMBER when scene text contains a figure absent from every referenced claim', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; visualPurpose: string }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    scene.visualPurpose = 'Explain that withholding reduces pay by exactly 42% for most filers.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER' && issue.details?.[0]?.ruleId === 'R-BUS-010',
      ),
    ).toBe(true);
  });

  // 21. Unsupported quote (R-BUS-011).
  it('fails with FABRICATED_QUOTE when quotedText does not exactly match the referenced claim\'s claimText', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; quotation?: { quotedText: string } }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_QUOTE');
    if (scene === undefined || scene.quotation === undefined) throw new Error('fixture missing SCENE_QUOTE quotation');
    scene.quotation.quotedText = 'Withholding errors are basically impossible to avoid.';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.FABRICATED_QUOTE' && issue.details?.[0]?.ruleId === 'R-BUS-011',
      ),
    ).toBe(true);
  });

  it('fails when a quotation is attached to a claim that is not itself a QUOTE claim', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; claimRefs: string[]; quotation?: { claimId: string; quotedText: string; speaker: string } }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
    if (scene === undefined) throw new Error('fixture missing SCENE_HOOK');
    scene.quotation = { claimId: 'CLAIM_MAIN', speaker: 'N/A', quotedText: 'Federal income tax withholding reduces an employee\'s paycheck before net pay is deposited, which is why take-home pay is lower than gross salary.' };

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-012'),
    ).toBe(true);
  });

  // 22. Missing required scene coverage (R-BUS-014).
  it('fails when a non-TRANSITION script segment is left uncovered by every scene', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; segmentRefs: string[] }> };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_QUOTE');
    if (scene === undefined) throw new Error('fixture missing SCENE_QUOTE');
    scene.segmentRefs = ['SEG_EXPLAIN']; // leaves SEG_QUOTE entirely uncovered

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-014'),
    ).toBe(true);
  });

  // 23. Scene order violation (R-BUS-015).
  it('fails when scene order does not follow the referenced segments\' own order', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; segmentRefs: string[] }> };
    const hookScene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
    const quoteScene = plan.scenes.find((item) => item.sceneId === 'SCENE_QUOTE');
    if (hookScene === undefined || quoteScene === undefined) throw new Error('fixture missing expected scenes');
    // Swap which segment each of the first two scenes (by `order`) covers,
    // so the earliest-ordered scene now covers a later-ordered segment.
    hookScene.segmentRefs = ['SEG_QUOTE'];
    quoteScene.segmentRefs = ['SEG_HOOK'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-015'),
    ).toBe(true);
  });

  // 24. Overlapping scenes (R-BUS-017).
  it('fails when a scene overlaps the preceding scene', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; startTimeSeconds: number; durationSeconds: number; endTimeSeconds: number }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    scene.startTimeSeconds = 10; // overlaps SCENE_HOOK, which ends at 15
    scene.durationSeconds = scene.endTimeSeconds - scene.startTimeSeconds;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-017',
      ),
    ).toBe(true);
  });

  // 25. Negative duration — structural.
  it('fails with SCHEMA.VALIDATION_FAILED for a non-positive durationSeconds', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const scene = plan.scenes[0];
    if (scene === undefined) throw new Error('fixture has no scenes');
    scene.durationSeconds = -5;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 26. Incorrect duration arithmetic (R-BUS-016).
  it('fails when durationSeconds does not equal endTimeSeconds - startTimeSeconds', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; durationSeconds: number }> };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
    if (scene === undefined) throw new Error('fixture missing SCENE_HOOK');
    scene.durationSeconds = 999;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-016',
      ),
    ).toBe(true);
  });

  // 27. Timeline gap (R-BUS-017).
  it('fails when a scene leaves an unexplained timeline gap after the preceding scene', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; startTimeSeconds: number; endTimeSeconds: number; durationSeconds: number }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    scene.startTimeSeconds = 20; // SCENE_HOOK ends at 15, leaving a 5s gap
    scene.durationSeconds = scene.endTimeSeconds - scene.startTimeSeconds;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-017',
      ),
    ).toBe(true);
  });

  // 28. Timeline exceeds target (R-BUS-018).
  it('fails when the final scene ends outside the approved target duration tolerance', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; startTimeSeconds: number; endTimeSeconds: number; durationSeconds: number }>;
      planDuration: { totalPlannedDurationSeconds: number; withinTolerance: boolean };
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_CTA');
    if (scene === undefined) throw new Error('fixture missing SCENE_CTA');
    scene.endTimeSeconds = 500;
    scene.durationSeconds = scene.endTimeSeconds - scene.startTimeSeconds;
    plan.planDuration.totalPlannedDurationSeconds = 500 - 80 + 80; // recompute below via actual sum
    const total = plan.scenes.reduce((sum, item) => sum + (item as unknown as { durationSeconds: number }).durationSeconds, 0);
    plan.planDuration.totalPlannedDurationSeconds = total;
    plan.planDuration.withinTolerance = false;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-018',
      ),
    ).toBe(true);
  });

  // 29. Target duration mismatch (R-BUS-021).
  it('fails when planDuration.targetDurationSeconds does not echo the request', async () => {
    const plan = deepClone(VALID_SCENE_PLAN);
    (plan.planDuration as unknown as { targetDurationSeconds: number }).targetDurationSeconds = 999;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-021',
      ),
    ).toBe(true);
  });

  // 30. First scene not starting at zero (R-BUS-017).
  it('fails when the first scene does not start at 0', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; startTimeSeconds: number }>;
    };
    const first = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
    if (first === undefined) throw new Error('fixture missing SCENE_HOOK');
    first.startTimeSeconds = 5;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.TIMELINE_INVALID' && issue.details?.[0]?.ruleId === 'R-BUS-017',
      ),
    ).toBe(true);
  });

  // 31. Invalid scene type.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered sceneType enum value', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const scene = plan.scenes[0];
    if (scene === undefined) throw new Error('fixture has no scenes');
    scene.sceneType = 'CLIFFHANGER';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 32. Invalid transition.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered transition enum value', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<Record<string, unknown>> };
    const scene = plan.scenes[0];
    if (scene === undefined) throw new Error('fixture has no scenes');
    scene.transition = 'ZOOM';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 33. Invalid asset requirement.
  it('fails with SCHEMA.VALIDATION_FAILED for an unregistered assetRequirements category', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ assetRequirements: Array<Record<string, unknown>> }>;
    };
    const scene = plan.scenes[0];
    if (scene === undefined) throw new Error('fixture has no scenes');
    const asset = scene.assetRequirements[0];
    if (asset === undefined) throw new Error('fixture scene has no assetRequirements');
    asset.category = 'HOLOGRAM';

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 34. Invalid on-screen text reference (R-BUS-013).
  it('fails when a STATISTIC on-screen text entry has no claimRef', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; onScreenTextIntent: Array<{ kind: string; text: string; claimRef?: string }> }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    const statistic = scene.onScreenTextIntent.find((item) => item.kind === 'STATISTIC');
    if (statistic === undefined) throw new Error('fixture missing STATISTIC on-screen text');
    delete statistic.claimRef;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER' && issue.details?.[0]?.ruleId === 'R-BUS-013',
      ),
    ).toBe(true);
  });

  // 35. Unsupported factual visual (same mechanism as #20, different text surface).
  it('fails when informationToShow states a fact not traceable to any referenced claim', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as {
      scenes: Array<{ sceneId: string; informationToShow: string[] }>;
    };
    const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
    if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
    scene.informationToShow = ['Withholding was introduced in 1943'];

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER' && issue.details?.[0]?.ruleId === 'R-BUS-010',
      ),
    ).toBe(true);
  });

  // 36-38. Prompt injection — see scene-planner.prompt.spec.ts.

  // 40. Invalid downstream readiness (R-BUS-024).
  it('fails when READY_FOR_VISUAL_DIRECTION is declared with an out-of-tolerance timeline', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as { planDuration: { withinTolerance: boolean } };
    plan.planDuration.withinTolerance = false;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(
      outcome.response.issues.some(
        (issue) => issue.code === 'AI_OUTPUT.BUSINESS.RULE_VIOLATED' && issue.details?.[0]?.ruleId === 'R-BUS-024',
      ),
    ).toBe(true);
  });

  // 41. Valid downstream readiness.
  it('accepts the baseline READY_FOR_VISUAL_DIRECTION plan with zero readinessBlockers and timeline within tolerance', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.data.downstreamReadiness).toBe('READY_FOR_VISUAL_DIRECTION');
  });

  // 42. Provider failure.
  it('fails with a retryable AI_PROVIDER.INVOCATION.REQUEST_FAILED when the provider rejects', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('PROVIDER_ERROR', 'test-provider', 'simulated provider failure'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_PROVIDER.INVOCATION.REQUEST_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 43. Timeout.
  it('fails with a retryable TIMEOUT.INVOCATION.EXCEEDED when the provider times out', async () => {
    aiProvider.invoke.mockRejectedValue(new AiProviderError('TIMEOUT', 'test-provider', 'timed out'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('TIMEOUT.INVOCATION.EXCEEDED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 44. Refusal.
  it('fails non-retryably when the model returns a structured refusal', async () => {
    aiProvider.invoke.mockResolvedValue(
      baseAiResult(JSON.stringify({ refusal: { reasonCode: 'INPUT_CONTRADICTORY', details: 'a scene references a claim absent from verificationPackage' } })),
    );

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('VALIDATION.INPUT.DUPLICATE_CLAIM_ID');
    expect(outcome.retry.retryable).toBe(false);
  });

  // 45. Truncated response.
  it('fails with a retryable AI_OUTPUT.CONTENT.TRUNCATED when finishReason is TRUNCATED', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('{"incomplete":', { finishReason: 'TRUNCATED' }));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.CONTENT.TRUNCATED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 46. Invalid JSON.
  it('fails with a retryable AI_OUTPUT.JSON.PARSE_FAILED when the model output is not valid JSON', async () => {
    aiProvider.invoke.mockResolvedValue(baseAiResult('not json at all'));

    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.JSON.PARSE_FAILED');
    expect(outcome.retry.retryable).toBe(true);
  });

  // 47. Output schema failure.
  it('fails with SCHEMA.VALIDATION_FAILED when the model omits a required field', async () => {
    const plan = deepClone(VALID_SCENE_PLAN) as unknown as Record<string, unknown>;
    delete plan.planDuration;

    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
    const outcome = await service.execute(VALID_REQUEST);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.response.issues[0]?.code).toBe('AI_OUTPUT.SCHEMA.VALIDATION_FAILED');
  });

  // 48. Business validation failure — see #11-#30, #34-#35, #40 above for concrete instances.

  // 49, 50. Envelope shape for both success and failure responses.
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
        expect(issue.source.component).toBe('scene-planner-agent');
        expect(issue.context.correlationId).toBe(request.meta.correlationId);
        expect(issue.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    }
  });

  // R-BUS-027 regression tests: scene.beatRef must be consistent with the
  // beatRef(s) of the script segments the scene actually covers.
  describe('scene beatRef consistency with referenced segment beatRefs (R-BUS-027)', () => {
    // 1. One segment → matching beatRef → PASS.
    it('accepts the baseline single-segment scene whose beatRef matches its one covered segment', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const scene = findScene(outcome.response.data, 'SCENE_HOOK');
      expect(scene.segmentRefs).toEqual(['SEG_HOOK']);
      expect(scene.beatRef).toBe('BEAT_HOOK');
    });

    // 2. One segment → wrong beatRef → FAIL.
    it('rejects a single-segment scene whose beatRef names a different beat than its segment belongs to', async () => {
      const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; beatRef?: string }> };
      const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
      if (scene === undefined) throw new Error('fixture missing SCENE_HOOK');
      scene.beatRef = 'BEAT_EXPLAIN'; // SEG_HOOK actually belongs to BEAT_HOOK

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-027'),
      ).toBe(true);
    });

    // 3. One segment → missing beatRef → FAIL.
    it('rejects a single-segment scene whose beatRef is omitted', async () => {
      const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; beatRef?: string }> };
      const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
      if (scene === undefined) throw new Error('fixture missing SCENE_HOOK');
      delete scene.beatRef;

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-027'),
      ).toBe(true);
    });

    // 4. Two segments with the same beatRef → matching beatRef → PASS.
    it('accepts the baseline two-segment scene whose beatRef matches the single beat both segments belong to', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const scene = findScene(outcome.response.data, 'SCENE_EXPLAIN');
      expect(scene.segmentRefs).toEqual(['SEG_EXPLAIN', 'SEG_STAT']); // both belong to BEAT_EXPLAIN
      expect(scene.beatRef).toBe('BEAT_EXPLAIN');
    });

    // 5. Two segments with the same beatRef → wrong beatRef → FAIL.
    it('rejects a two-segment, single-beat scene whose beatRef names a different beat', async () => {
      const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; beatRef?: string }> };
      const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_EXPLAIN');
      if (scene === undefined) throw new Error('fixture missing SCENE_EXPLAIN');
      scene.beatRef = 'BEAT_HOOK'; // SEG_EXPLAIN and SEG_STAT both actually belong to BEAT_EXPLAIN

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-027'),
      ).toBe(true);
    });

    // 6, 7. Two segments belonging to different beats → beatRef omitted (PASS) vs. supplied (FAIL).
    //
    // Reshapes the baseline into an alternate, fully valid four-scene plan
    // where the third scene deliberately spans two beats (BEAT_EXPLAIN via
    // SEG_STAT, BEAT_QUOTE via SEG_QUOTE) to exercise the multi-beat case
    // end-to-end, not just the single rule in isolation.
    const buildMultiBeatScenePlan = (thirdSceneBeatRef?: string) => ({
      packageKind: 'SCENE_PLAN' as const,
      topicId: 'TOPIC_PAYCHECK_WITHHOLDING',
      scenes: [
        {
          sceneId: 'SCENE_HOOK',
          order: 1,
          segmentRefs: ['SEG_HOOK'],
          beatRef: 'BEAT_HOOK',
          startTimeSeconds: 0,
          endTimeSeconds: 15,
          durationSeconds: 15,
          sceneType: 'HOOK_VISUAL',
          visualPurpose: 'Open with the surprising gap between salary and take-home pay to hook viewer curiosity.',
          visualElements: [
            { type: 'TEXT_OVERLAY', description: 'Bold on-screen question contrasting salary versus take-home pay', importance: 'PRIMARY' },
          ],
          informationToShow: [],
          claimRefs: ['CLAIM_MAIN'],
          evidenceRefs: ['EVIDENCE_WITHHOLDING_MECHANISM'],
          transition: 'CUT',
          onScreenTextIntent: [{ kind: 'TITLE', text: 'Why is your paycheck smaller than your salary?' }],
          assetRequirements: [
            { category: 'TEXT_GRAPHIC', description: 'Animated title card contrasting salary and take-home pay', importance: 'PRIMARY' },
          ],
        },
        {
          sceneId: 'SCENE_EXPLAIN_ONLY',
          order: 2,
          segmentRefs: ['SEG_EXPLAIN'],
          beatRef: 'BEAT_EXPLAIN',
          startTimeSeconds: 15,
          endTimeSeconds: 35,
          durationSeconds: 20,
          sceneType: 'DIAGRAM',
          visualPurpose: 'Explain the withholding mechanism.',
          visualElements: [
            { type: 'DIAGRAM', description: 'Simple diagram showing gross pay minus withholding equals take-home pay', importance: 'PRIMARY' },
          ],
          informationToShow: ['Gross pay minus withholding equals take-home pay'],
          claimRefs: ['CLAIM_MAIN'],
          evidenceRefs: ['EVIDENCE_WITHHOLDING_MECHANISM'],
          transition: 'FADE',
          onScreenTextIntent: [],
          assetRequirements: [
            { category: 'DIAGRAM', description: 'Withholding mechanism diagram', importance: 'PRIMARY' },
          ],
        },
        {
          sceneId: 'SCENE_STAT_AND_QUOTE',
          order: 3,
          segmentRefs: ['SEG_STAT', 'SEG_QUOTE'], // SEG_STAT belongs to BEAT_EXPLAIN, SEG_QUOTE belongs to BEAT_QUOTE
          ...(thirdSceneBeatRef !== undefined ? { beatRef: thirdSceneBeatRef } : {}),
          startTimeSeconds: 35,
          endTimeSeconds: 80,
          durationSeconds: 45,
          sceneType: 'QUOTE',
          visualPurpose: 'Show the preliminary survey figure and ground it in the IRS\'s own public statement.',
          visualElements: [
            { type: 'CHART', description: 'Small chart illustrating the about 30% early-season misjudgment figure', importance: 'PRIMARY' },
            { type: 'TEXT_OVERLAY', description: 'On-screen quote card attributed to the IRS spokesperson', importance: 'SECONDARY' },
          ],
          informationToShow: ['About 30% of first-time filers misjudge withholding early in the season'],
          claimRefs: ['CLAIM_STAT', 'CLAIM_QUOTE'],
          evidenceRefs: ['EVIDENCE_WITHHOLDING_SURVEY', 'EVIDENCE_IRS_STATEMENT'],
          qualification: 'Early filing data suggests about 30% of first-time filers misjudge withholding; the figure may shift as the season continues.',
          quotation: {
            claimId: 'CLAIM_QUOTE',
            speaker: 'Jane Doe, IRS Public Affairs',
            quotedText: 'Most withholding errors are simple to fix once you know where to look.',
          },
          transition: 'CUT',
          onScreenTextIntent: [{ kind: 'STATISTIC', text: '~30% early-season figure', claimRef: 'CLAIM_STAT' }],
          assetRequirements: [
            { category: 'CHART', description: 'Early-season misjudgment chart', importance: 'PRIMARY' },
            { category: 'TEXT_GRAPHIC', description: 'Quote card graphic with attribution', importance: 'SECONDARY' },
          ],
        },
        {
          sceneId: 'SCENE_CTA',
          order: 4,
          segmentRefs: ['SEG_CTA'],
          beatRef: 'BEAT_CTA',
          startTimeSeconds: 80,
          endTimeSeconds: 95,
          durationSeconds: 15,
          sceneType: 'CTA',
          visualPurpose: 'Invite the viewer to subscribe for the next explainer.',
          visualElements: [
            { type: 'TEXT_OVERLAY', description: 'Subscribe call-to-action graphic with channel branding placeholder', importance: 'PRIMARY' },
          ],
          informationToShow: [],
          claimRefs: [],
          evidenceRefs: [],
          transition: 'NONE',
          onScreenTextIntent: [{ kind: 'TITLE', text: 'Subscribe for the next explainer' }],
          assetRequirements: [
            { category: 'TEXT_GRAPHIC', description: 'Subscribe CTA animation', importance: 'PRIMARY' },
          ],
        },
      ],
      planDuration: { targetDurationSeconds: 100, totalPlannedDurationSeconds: 95, toleranceRatio: 0.15, withinTolerance: true },
      warnings: [],
      downstreamReadiness: 'READY_FOR_VISUAL_DIRECTION' as const,
      readinessRationale: 'Every non-transition script segment is covered, scene order follows the script, timeline is contiguous and within tolerance, and the multi-beat scene omits a single-beat beatRef because it truthfully spans two beats.',
      readinessBlockers: [],
    });

    // 6. Two segments belonging to different beats → beatRef omitted → PASS.
    it('accepts a scene spanning two beats when beatRef is correctly omitted', async () => {
      const plan = buildMultiBeatScenePlan(undefined);

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected success');
      const scene = findScene(outcome.response.data, 'SCENE_STAT_AND_QUOTE');
      expect(scene.segmentRefs).toEqual(['SEG_STAT', 'SEG_QUOTE']);
      expect(scene.beatRef).toBeUndefined();
    });

    // 7. Two segments belonging to different beats → beatRef supplied → FAIL.
    it('rejects a scene spanning two beats when beatRef is supplied anyway', async () => {
      const plan = buildMultiBeatScenePlan('BEAT_EXPLAIN');

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-027'),
      ).toBe(true);
    });

    // 8. Invalid segmentRef → R-BUS-003 handles it; R-BUS-027 must not add a misleading duplicate finding.
    it('does not report R-BUS-027 for a scene whose segmentRefs cannot be resolved at all (R-BUS-003 owns that defect)', async () => {
      const plan = deepClone(VALID_SCENE_PLAN) as unknown as { scenes: Array<{ sceneId: string; segmentRefs: string[]; beatRef?: string }> };
      const scene = plan.scenes.find((item) => item.sceneId === 'SCENE_HOOK');
      if (scene === undefined) throw new Error('fixture missing SCENE_HOOK');
      scene.segmentRefs = ['SEG_GHOST'];
      scene.beatRef = 'BEAT_HOOK'; // still present, but every segmentRef is unresolvable

      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(plan)));
      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected failure');
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-003'),
      ).toBe(true);
      expect(
        outcome.response.issues.some((issue) => issue.details?.[0]?.ruleId === 'R-BUS-027'),
      ).toBe(false);
    });

    // 9. Existing valid baseline response → PASS.
    it('accepts the unmodified baseline scene plan in full', async () => {
      aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

      const outcome = await service.execute(VALID_REQUEST);

      expect(outcome.ok).toBe(true);
    });
  });

  // Regression: response schemaVersion must always be the fixed AGT-07 output
  // version, never copied from the request's own (independently validated)
  // schemaVersion — mirrors the fix applied to every prior agent's runtime.
  it('always emits the fixed output schemaVersion regardless of the request schemaVersion', async () => {
    const request = deepClone(VALID_REQUEST);
    (request as unknown as { schemaVersion: string }).schemaVersion = '1.9.9';
    aiProvider.invoke.mockResolvedValue(baseAiResult(JSON.stringify(VALID_SCENE_PLAN)));

    const outcome = await service.execute(request);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.response.schemaVersion).toBe('1.0.0');
  });
});

# AGT-07 — Scene Planner Agent · Implementation Checklist

## 1. Contract package

- [x] `input.schema.json` — Draft 2020-12, `additionalProperties: false` throughout, closed enumerations.
- [x] `output.schema.json` — `oneOf` success/error envelope, `additionalProperties: false` throughout.
- [x] `interfaces.ts` — types only, no runtime values, mirrors both schemas exactly.
- [x] `validator.ts` — `createContractValidator()`, structural + `R-IN-*` + `R-BUS-*` business rules, pure and deterministic. Includes `R-BUS-027` (scene `beatRef` must be consistent with the `beatRef`(s) of the segments the scene's own `segmentRefs` actually cover — existence checks alone, `R-BUS-003`/`R-BUS-004`, do not catch a scene pointing at a real but unrelated segment/beat pair).
- [x] `system-prompt.md` — eight canonical blocks, no vendor syntax, refusal contract, security rules, explicit "no asset/prompt generation" boundary.
- [x] `README.md`, `test-cases.md` — narrative documentation and coverage matrix.
- [x] `examples/request.json`, `examples/response.json`, `examples/failure.json` — all three validate against their schemas and report zero business-rule findings on the success path (delivery report §confirmed).

## 2. Scope discipline

- [x] No web search, no external fetch client, no image/video generation client wired into this agent's runtime or module.
- [x] No dependency on Agent 08 (Visual Director) — not implemented, not referenced.
- [x] No field anywhere in the output contract capable of holding a final image prompt, a final video prompt, a rendered asset, a caption, or a voice instruction.
- [x] Agents 00–06 (contracts, `src/agents/{strategy,topic-discovery,research,fact-verification,story-architect,script-writer,script-reviewer}/`) were read for reference only — zero files under those trees were modified.
- [x] The six approved architecture documents (`docs/000`–`docs/005`) were read for reference only — zero modifications.

## 3. Ajv wiring (module init, never per-request)

- [x] `createContractValidator()` compiles both schemas once via a module factory (`scene-planner.module.ts`), exactly mirroring `agents/agent-06-script-reviewer`'s own wiring.
- [x] Three DI tokens: request validator (`INPUT_SCHEMA_ID`), response validator (`OUTPUT_SCHEMA_ID`), and a schema-pointer validator scoped to `#/$defs/scenePlan` (`SCENE_PLAN_SCHEMA_POINTER`) for validating the model's bare output before envelope assembly.

## 4. Runtime pipeline (`scene-planner.service.ts`)

1. Structural + business validation of the request (`validateScenePlannerRequest`) — this is where the Script Reviewer approval gate (`R-IN-002`–`004`) is enforced, before the model is ever invoked. A failure here is a workflow defect: no dispatch, no retry.
2. Render the approved prompt (`ScenePlannerPromptService.render`) — strict variable resolution, delimiter neutralisation applied to the entire `script`, `storyArchitecture`, and `verificationPackage` blocks.
3. Invoke the AI provider abstraction (`AiProvider.invoke`) with a structured-output hint built from `output.schema.json#/$defs/scenePlan` — a hint only, never a substitute for step 6's validation.
4. Handle `finishReason` explicitly: `TRUNCATED` → retryable failure (`AI_OUTPUT.CONTENT.TRUNCATED`); `ERROR` → retryable failure; `REFUSED` → parse for the structured refusal payload, map `reasonCode` to a registered error code, always non-retryable.
5. `JSON.parse` the raw content. A parse failure is reported, never silently repaired.
6. Check for an in-band structured refusal before assuming success.
7. `validateScenePlan` — structural against the schema pointer, then every `R-BUS-*` business rule against the request's own data (claim/evidence/segment provenance and timeline arithmetic all require the request, exactly as every prior agent's own validation does).
8. On success, the runtime — never the model — assembles the envelope: fixed `schemaVersion`, generated `messageId`, execution block, references. The agent's own output never populates `validation`.
9. `execute()`'s final step re-validates the assembled envelope against `output.schema.json` in full before returning; a failure here is always a runtime bug (`CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID`), never a symptom of bad input or a bad model response.

Invalid model output is never repaired automatically. No missing claim is ever invented. No asset is ever invented or selected.

## 5. Error catalogue mapping (`scene-planner.errors.ts`)

`INPUT_RULE_TO_ERROR_CODE`:

| Rule | Code |
|---|---|
| `R-IN-001` | `VALIDATION.INPUT.SCRIPT_NOT_READY` |
| `R-IN-002`, `R-IN-003`, `R-IN-004` | `VALIDATION.INPUT.REVIEW_NOT_APPROVED` |
| `R-IN-005` | `VALIDATION.INPUT.STORY_NOT_READY` |
| `R-IN-006`, `R-IN-007`, `R-IN-008` | `VALIDATION.INPUT.TOPIC_ID_MISMATCH` |
| `R-IN-009` | `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` |

`OUTPUT_RULE_TO_ERROR_CODE` (unmapped rules fall back to the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`, the same simplification precedent every prior agent documents):

| Rule(s) | Code |
|---|---|
| `R-BUS-003`, `R-BUS-004`, `R-BUS-005`, `R-BUS-006`, `R-BUS-007`, `R-BUS-014` | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` |
| `R-BUS-008` | `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` |
| `R-BUS-009` | `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` |
| `R-BUS-011`, `R-BUS-012` | `AI_OUTPUT.CONTENT.FABRICATED_QUOTE` |
| `R-BUS-010`, `R-BUS-013` | `AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER` |
| `R-BUS-015`, `R-BUS-016`, `R-BUS-017`, `R-BUS-018`, `R-BUS-020`, `R-BUS-021`, `R-BUS-022` | `AI_OUTPUT.CONTENT.TIMELINE_INVALID` |

Refusal `reasonCode` mapping is identical in shape to every prior agent's own table (README §17, system-prompt.md §4 design notes).

## 6. Retry semantics

- This agent never retries itself and never loops. The workflow (not yet implemented) owns retry orchestration and attempt budgeting.
- `retry.retryable` is advisory metadata returned alongside every failure outcome, kept out of the wire contract.
- Provider refusals (in-band or `finishReason=REFUSED`) are always non-retryable — never consume a regeneration budget.
- Structural/business output failures suggest `REPAIR`; JSON parse failures and truncation suggest `REGENERATION` — hints only.

## 7. Security

- `scene-planner.prompt.ts` neutralises `<<<`/`>>>` sequences recursively through the entire `script`, `storyArchitecture`, and `verificationPackage` objects before rendering — not a designated subset. This explicitly includes the script's own narration text.
- The system prompt explicitly instructs the model never to follow an instruction embedded in any input block, including the script itself (system-prompt.md §4f rule 27).
- `providerSafeUserMessage()` / `redactKnownSecret()` (mirrored from `script-reviewer.errors.ts`) ensure no raw provider payload, API key, or internal stack trace ever reaches a `userMessage` field.

## 8. No asset/prompt generation

- [x] Nothing in `scene-planner.service.ts` calls an image-generation, video-generation, or asset-search client — none is wired into this module.
- [x] Nothing in the output contract can carry a final image prompt, a final video prompt, a rendered asset, a caption, or a voice instruction (README §2).
- [x] The runtime never calls Agent 08 — it only produces the scene plan; the workflow decides when and how to invoke Agent 08.

## 9. Testing

`scene-planner.service.spec.ts` — AI provider always mocked, never a real network call. Covers (see `test-cases.md` for the full enumerated list, matching the 50-scenario brief): valid scene plan; invalid input; script not approved; Agent 06 not APPROVED; wrong nextAction; topic/script/story-architecture/verification-package identity mismatches; unknown scene/segment/beat/claim/evidence reference; duplicate scene id/order; evidence belonging to an unrelated claim; `DO_NOT_USE` claim; missing qualification; numeric drift; unsupported quote; missing required scene coverage; scene order violation; overlapping scenes; negative duration; incorrect duration arithmetic; timeline gap; timeline exceeding target; target duration mismatch; first scene not starting at zero; invalid scene type/transition/asset requirement/on-screen text reference; unsupported factual visual; prompt injection in narration/claim/evidence; invalid/valid downstream readiness; provider failure/timeout/refusal/truncation/invalid JSON; output schema failure; business validation failure; valid success/failure envelopes.

`scene-planner.prompt.spec.ts` — fenced-block parsing, variable rendering, delimiter neutralisation (including injection attempts inside the script's own narration and inside story-architecture free text), strict-resolution failure on a missing required variable.

## 10. Build / test / lint

Run after implementation: `npm run build`, `npm test`, `npm run lint`. Fix genuine errors; re-run. Confirm via `git status`/`git diff` that only Agent 07 contract/implementation/test/example files, plus the minimal shared wiring files every prior agent's addition also touched (`tsconfig.json`, `package.json` jest `moduleNameMapper`, `scripts/copy-prompt-asset.js`, `src/app.module.ts`), changed.

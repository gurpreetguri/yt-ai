# AGT-07 — Scene Planner Agent

## 1. Purpose and deliverable

Agent 07 transforms an approved Agent 05 narration script — together with the Agent 06 approval that cleared it, the Agent 04 story architecture it was built from, and the Agent 03 verified claims that ground it — into **the Scene Plan**, a structured visual blueprint for downstream visual production. It is the single deliverable of this agent (`#/$defs/scenePlan` in `output.schema.json`).

Pipeline position:

```
Agent 04 Story Architect
      ↓
Agent 05 Script Writer
      ↓
Agent 06 Script Reviewer
      ↓
Agent 07 Scene Planner   ← this package
      ↓
Agent 08 Visual Director (not yet implemented)
```

## 2. Responsibilities and boundary

Agent 07 describes **what** each scene needs to communicate and show. It never decides **how** to execute a scene visually — that is Agent 08's job. Concretely, Agent 07 never:

- generates a final image prompt or a final video-generation prompt;
- generates, selects, searches for, or downloads an actual asset;
- generates a voice instruction or a caption;
- rewrites, paraphrases, or modifies the script's narration;
- introduces a new factual claim, statistic, date, price, or quotation not already grounded in `verificationPackage`.

Every field in `output.schema.json` is structural planning direction; there is no field anywhere capable of holding a rendered image, a rendered video, a final generation prompt, or an actual selected asset.

## 3. The approval gate — Agent 07 cannot bypass Script Reviewer

Per the commissioning brief's explicit requirement, the input is invalid if the script is not ready for scene planning, or Agent 06's `decision` is not `APPROVED`, or Agent 06's `nextAction` is not `CONTINUE`. This is enforced deterministically at the input boundary, before the model is ever invoked:

| Rule | Check |
|---|---|
| `R-IN-001` | `script.downstreamReadiness` is `READY_FOR_REVIEW`. |
| `R-IN-002` | `reviewResult.decision` is `APPROVED`. |
| `R-IN-003` | `reviewResult.nextAction` is `CONTINUE`. |
| `R-IN-004` | `reviewResult.readyForScenePlanning` is `true`. |

Any one of these failing is a workflow defect — the caller dispatched a script the reviewer had not cleared — never retried, never silently bypassed.

## 4. Source of truth — the hierarchy this agent respects

```
Agent 03 Verified Claims      → factual truth
      ↓
Agent 04 Story Architecture   → narrative structure
      ↓
Agent 05 Narration Script     → exact narration
      ↓
Agent 06 Review Approval      → review approval
      ↓
Agent 07 Scene Plan           → visual scene structure
```

Agent 07 never overrides an upstream factual decision: `downstreamSafety`, `verificationStatus`, beat sequencing, and the narration text itself are all consumed exactly as supplied.

## 5. Scene model

`Scene` (`interfaces.ts`) is the unit of visual planning. Every scene carries: `sceneId`, `order`, `segmentRefs`, an optional `beatRef`, `startTimeSeconds`/`endTimeSeconds`/`durationSeconds`, `sceneType`, `visualPurpose`, `visualElements`, `informationToShow`, `claimRefs`, `evidenceRefs`, an optional `qualification`, an optional `quotation`, an optional `continuity`, `transition`, `onScreenTextIntent`, `assetRequirements`, and an optional `downstreamNotes`.

`sceneType` is a 20-value controlled taxonomy for faceless YouTube production (`TITLE_CARD`, `HOOK_VISUAL`, `TALKING_POINT`, `CONCEPT`, `DIAGRAM`, `DATA`, `COMPARISON`, `PRODUCT_DEMO`, `SCREEN_RECORDING`, `CODE`, `UI`, `DOCUMENT`, `TIMELINE`, `QUOTE`, `MAP`, `PROCESS`, `B_ROLL`, `TRANSITION`, `PAYOFF`, `CTA`). Not every value is required to appear in every plan.

A scene may cover more than one script segment (`segmentRefs` is 1-10 items) when the visual treatment genuinely does not change between them — this is the mechanism that prevents "one sentence = one scene," while scene boundaries still exist wherever the visual treatment changes meaningfully, preventing the opposite failure ("one scene = the entire video").

## 6. Script preservation

Agent 07 never creates narration and never copies large amounts of it — every scene references the script by `segmentRefs` (and, where appropriate, `beatRef`), never by restating narration text. The scene plan preserves the script's exact ordering: scene order must follow the referenced segments' own order, never reordering narration through visual planning (`R-BUS-015`).

## 7. Script and story coverage

Every non-`TRANSITION` script segment must be covered by at least one scene's `segmentRefs` (`R-BUS-014`) — a segment with `segmentType: TRANSITION` is a purely structural bridge and may be exempt, exactly as the commissioning brief allows. Story beat coverage is not separately re-validated: every beat is already guaranteed at least one narrating segment by Agent 05's own frozen `R-BUS-009`, so segment coverage transitively guarantees beat coverage without a redundant rule.

`segmentRefs` and `beatRef` are each validated for existence independently (`R-BUS-003`, `R-BUS-004`), but existence alone is not enough — a scene could reference a real segment and a real beat that have nothing to do with each other. `R-BUS-027` closes that gap: it resolves every one of a scene's `segmentRefs` to that segment's own `beatRef` (skipping any entry `R-BUS-003` already reported as unresolvable, so the two rules never produce a misleading duplicate finding for the same defect) and requires the result to be truthful. When every referenced segment belongs to exactly one beat, `beatRef` MUST be present and MUST equal that beat — it cannot be omitted, and it cannot name a different beat. When the referenced segments span more than one beat (the deliberate multi-segment grouping described above, §5), `beatRef` MUST be absent, because no single value could truthfully represent more than one beat at once. `beatRef` remains optional in the schema for exactly this reason — its optionality is not relaxed provenance, it is the mechanism that lets a multi-beat scene say so honestly.

## 8. Claim/evidence provenance

Identical provenance principle to every prior content agent (Agent 05 README §5, Agent 06 README §5): `claimRefs` must resolve to a supplied claim (`R-BUS-005`), `evidenceRefs` must resolve to a supportingEvidenceIds entry of **one of that same scene's own `claimRefs`** — not merely to some claim elsewhere in the package (`R-BUS-006`, `R-BUS-007`). `DO_NOT_USE` claims are blocked from all factual usage, deterministically, with no way for the model to bypass it (`R-BUS-008`). `USE_WITH_QUALIFICATION` claims require a preserved `qualification` on every citing scene (`R-BUS-009`).

## 9. Numbers, quotes, and on-screen text

Every numeric token appearing in `informationToShow`, `onScreenTextIntent[].text`, `visualElements[].description`, or `visualPurpose` must trace verbatim to the `claimText` of a claim the same scene references (`R-BUS-010`) — the identical deterministic string-containment technique Agent 05 and Agent 06 already use, extended here across four text surfaces instead of one narration field. A `quotation` must reproduce its claim's `claimText` and `quoteProvenance.speaker` exactly (`R-BUS-011`) and may only attach to a `QUOTE`-type claim already in the scene's own `claimRefs` (`R-BUS-012`). A `STATISTIC`-kind `onScreenTextIntent` entry must carry a grounding `claimRef` belonging to the same scene (`R-BUS-013`).

## 10. Timeline

Deterministic scene timing, reusing the same fixed ±15% tolerance every upstream agent already uses (`SCENE_PLANNER_DURATION_TOLERANCE_RATIO` in `validator.ts` — never a new, possibly-divergent tolerance):

- `durationSeconds` always equals `endTimeSeconds - startTimeSeconds` (`R-BUS-016`).
- The timeline is contiguous: the first scene starts at `0`, and every subsequent scene's `startTimeSeconds` equals the immediately preceding scene's `endTimeSeconds` exactly — no overlap, no unexplained gap (`R-BUS-017`).
- The final scene's `endTimeSeconds` must land within tolerance of `script.scriptDuration.targetDurationSeconds` (`R-BUS-018`) — timeline coverage.
- `planDuration.totalPlannedDurationSeconds` is the exact sum of every scene's `durationSeconds` (`R-BUS-020`); `planDuration.targetDurationSeconds` is inherited from the script and never altered (`R-BUS-021`); `withinTolerance` is a deterministic recomputation, never trusted from the model (`R-BUS-022`).

## 11. Faceless-channel handling

The system prompt instructs the model to avoid requiring a presenter's face, talking-head footage, or host appearance in any scene, and to prefer screen recordings, UI captures, diagrams, product demonstrations, generated visuals, B-roll, charts, documents, code, animation concepts, and text graphics (system-prompt.md §4e). This is prompt-level guidance, not a deterministic validator rule — recognising a "presenter's face" requirement in a structured scene description is a semantic judgement no reference-graph or string check can reliably make; the contract instead ensures the model is never handed a channel-configuration signal that would justify one (this agent's minimum-context input carries no such override).

## 12. Asset requirements

`assetRequirements` names an asset CATEGORY only (`PRODUCT_SCREENSHOT`, `UI_CAPTURE`, `ICON`, `DIAGRAM`, `CHART`, `STOCK_VIDEO`, `STOCK_IMAGE`, `GENERATED_IMAGE`, `GENERATED_VIDEO`, `SCREEN_RECORDING`, `TEXT_GRAPHIC`) with a short description of what that category should show — never a selected asset, a URL, a downloaded file, or a generation prompt. Agent 09 (not yet implemented) manages actual assets.

## 13. On-screen text

`onScreenTextIntent` describes what information should appear on screen (title, statistic, feature name, comparison label, diagram label, key takeaway) — never rendered caption text, which is Agent 11's responsibility (not yet implemented).

## 14. Security — untrusted content

`script`, `storyArchitecture`, and `verificationPackage` are provenance-**TRUSTED** (already-validated platform artifacts) but their embedded free text is treated as **untrusted data** — identical discipline to every prior agent, extended here to explicitly cover the script's own narration, since it is exactly the surface an adversarial prompt-injection attempt would target. `scene-planner.prompt.ts` neutralises the `<<<`/`>>>` delimiter sequences recursively through all three blocks before rendering; the system prompt explicitly instructs the model never to follow an embedded instruction regardless of claimed authority.

## 15. Topic identity

This pipeline uses `topicId` as its sole cross-artifact identity primitive — no durable script id or story-architecture id is minted by any upstream frozen agent, consistent with `STD-000`'s "response-local keys only, no durable platform identifier minted by content" principle. Agent 07 therefore cross-checks `topicId` across all four sources it consumes, using `storyArchitecture` as the hub (`R-IN-006` verificationPackage↔storyArchitecture, `R-IN-007` script↔storyArchitecture, `R-IN-008` reviewResult↔storyArchitecture), and echoes it on output (`R-BUS-026`).

## 16. Validation rules — summary

Structural (`R-STRUCT-001`): both JSON Schemas, Draft 2020-12, `additionalProperties: false` throughout, closed enumerations.

Input business rules (`R-IN-001`–`009`, evaluated before dispatch — a violation is a workflow defect, never retried): script/story readiness, the four-part approval gate (§3), topic identity (§15), and verified-claim-id uniqueness.

Output business rules (`R-BUS-001`–`027`, full list in `validator.ts` and `test-cases.md`): scene id/order integrity (001–002), segment/beat/claim/evidence provenance (003–007), `DO_NOT_USE` protection (008), qualification preservation (009), numeric provenance (010), quotation integrity (011–012), on-screen statistic grounding (013), segment coverage and ordering (014–015), timeline arithmetic and contiguity (016–018), duration reconciliation (020–022), readiness consistency (023–024), placeholder residue (025), topic identity echo (026), scene `beatRef` ↔ referenced-segment `beatRef` consistency (027, §7).

## 17. Failure conditions and error codes

| Error code | Category | Meaning |
|---|---|---|
| `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | Structural: a required input field is absent. |
| `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | Structural: a closed enum received an unregistered value. |
| `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` | `VALIDATION` | R-IN-009. |
| `VALIDATION.INPUT.TOPIC_ID_MISMATCH` | `VALIDATION` | R-IN-006, R-IN-007, R-IN-008. |
| `VALIDATION.INPUT.SCRIPT_NOT_READY` | `VALIDATION` | R-IN-001. |
| `VALIDATION.INPUT.STORY_NOT_READY` | `VALIDATION` | R-IN-005. |
| `VALIDATION.INPUT.REVIEW_NOT_APPROVED` | `VALIDATION` | R-IN-002, R-IN-003, R-IN-004. |
| `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | Refusal: `OUT_OF_SCOPE`. |
| `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | Model output was not valid JSON. |
| `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | Structural output failure (any `R-STRUCT-001` finding). |
| `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | R-BUS-003 through R-BUS-007, R-BUS-014. |
| `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` | `AI_OUTPUT` | R-BUS-008. |
| `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` | `AI_OUTPUT` | R-BUS-009. |
| `AI_OUTPUT.CONTENT.FABRICATED_QUOTE` | `AI_OUTPUT` | R-BUS-011, R-BUS-012. |
| `AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER` | `AI_OUTPUT` | R-BUS-010, R-BUS-013. |
| `AI_OUTPUT.CONTENT.TIMELINE_INVALID` | `AI_OUTPUT` | R-BUS-015 through R-BUS-018, R-BUS-020 through R-BUS-022. |
| `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `finishReason=TRUNCATED`. |
| `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | Every other output rule (generic fallback — same simplification precedent every prior agent documents). |
| `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | Refusal: `INSTRUCTION_IN_DATA`. |

## 18. Reused infrastructure

Nothing in this package duplicates existing platform infrastructure:

- AI provider abstraction — `src/ai/ai-provider.interface.ts` (`AiProvider`, `AI_PROVIDER` token), the same one every prior agent uses.
- Ajv2020 contract validator wiring pattern — `createContractValidator()`, compiled once at module init, identical shape to `agents/agent-06-script-reviewer/validator.ts`.
- Prompt loader/renderer pattern — fenced-block parsing, delimiter neutralisation, strict variable resolution — identical mechanism to `src/agents/script-reviewer/script-reviewer.prompt.ts`, applied to this package's own `system-prompt.md`.
- `generatePrefixedId()` (`src/common/id.util.ts`) for response `messageId` generation.
- `aiConfig` (`src/config/ai.config.ts`) for provider/timeout configuration — no second configuration mechanism introduced.
- NestJS module/DI conventions — Symbol-based validator tokens, `ConfigModule.forFeature`, identical structure to `script-reviewer.module.ts`.

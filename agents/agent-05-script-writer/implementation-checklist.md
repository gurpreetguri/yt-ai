# AGT-05 — Script Writer Agent · Implementation Checklist

## 1. Contract package

- [x] `input.schema.json` — Draft 2020-12, `additionalProperties: false` throughout, closed enumerations.
- [x] `output.schema.json` — `oneOf` success/error envelope, `additionalProperties: false` throughout.
- [x] `interfaces.ts` — types only, no runtime values, mirrors both schemas exactly.
- [x] `validator.ts` — `createContractValidator()`, structural + `R-IN-*` + `R-BUS-*` business rules, pure and deterministic.
- [x] `system-prompt.md` — eight canonical blocks, no vendor syntax, refusal contract, security rules.
- [x] `README.md`, `test-cases.md` — narrative documentation and coverage matrix.
- [x] `examples/request.json`, `examples/response.json`, `examples/failure.json` — all three validate against their schemas and report zero business-rule findings on the success path (delivery report §confirmed).

## 2. Scope discipline

- [x] No web search, no external fetch client wired into this agent's runtime or module.
- [x] No dependency on Agent 06 (Script Reviewer) — not implemented, not referenced.
- [x] No scene plan / image prompt / voice setting / caption field anywhere in the output contract.
- [x] Agents 00–04 (contracts, `src/agents/{strategy,topic-discovery,research,fact-verification,story-architect}/`) were read for reference only — zero files under those trees were modified.
- [x] The six approved architecture documents (`docs/000`–`docs/005`) were read for reference only — zero modifications.

## 3. Ajv wiring (module init, never per-request)

- [x] `createContractValidator()` compiles both schemas once via `STORY_ARCHITECT`-equivalent module factory (`script-writer.module.ts`), exactly mirroring `agents/agent-04-story-architect`'s own wiring.
- [x] Three DI tokens: request validator (`INPUT_SCHEMA_ID`), response validator (`OUTPUT_SCHEMA_ID`), and a schema-pointer validator scoped to `#/$defs/narrationScript` (`NARRATION_SCRIPT_SCHEMA_POINTER`) for validating the model's bare output before envelope assembly.

## 4. Runtime pipeline (`script-writer.service.ts`)

1. Structural + business validation of the request (`validateScriptWriterRequest`). A failure here is a workflow defect: no dispatch, no retry.
2. Render the approved prompt (`ScriptWriterPromptService.render`) — strict variable resolution, delimiter neutralisation applied to the entire `storyArchitecture` and `verificationPackage` blocks.
3. Invoke the AI provider abstraction (`AiProvider.invoke`) with a structured-output hint built from `output.schema.json#/$defs/narrationScript` — a hint only, never a substitute for step 5's validation.
4. Handle `finishReason` explicitly: `TRUNCATED` → retryable failure (`AI_OUTPUT.CONTENT.TRUNCATED`); `ERROR` → retryable failure; `REFUSED` → parse for the structured refusal payload, map `reasonCode` to a registered error code, always non-retryable.
5. `JSON.parse` the raw content. A parse failure is reported, never silently repaired.
6. Check for an in-band structured refusal (valid JSON matching `{"refusal": {...}}`) before assuming success.
7. `validateNarrationScript` — structural against the schema pointer, then every `R-BUS-*` business rule against the request's own data (claim/evidence/beat provenance requires the request, exactly as Agent 04's `validateStoryArchitecture` does).
8. On success, the runtime — never the model — assembles the envelope: fixed `schemaVersion`, generated `messageId`, execution block, references. The agent's own output never populates `validation`.
9. `execute()`'s final step re-validates the assembled envelope against `output.schema.json` in full before returning; a failure here is always a runtime bug (`CONFIGURATION.RUNTIME.RESPONSE_ENVELOPE_INVALID`), never a symptom of bad input or a bad model response.

Invalid model output is never repaired automatically. No missing fact is ever invented to fill a gap.

## 5. Error catalogue mapping (`script-writer.errors.ts`)

`INPUT_RULE_TO_ERROR_CODE`:

| Rule | Code |
|---|---|
| `R-IN-001` | `VALIDATION.INPUT.STORY_NOT_READY` |
| `R-IN-002` | `VALIDATION.INPUT.TOPIC_ID_MISMATCH` |
| `R-IN-003` | `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` |

`OUTPUT_RULE_TO_ERROR_CODE` (unmapped rules fall back to the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`, the same simplification precedent Agent 02/03/04 document):

| Rule(s) | Code |
|---|---|
| `R-BUS-003`, `R-BUS-004`, `R-BUS-005`, `R-BUS-008`, `R-BUS-009` | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` |
| `R-BUS-006` | `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` |
| `R-BUS-007` | `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` |
| `R-BUS-014`, `R-BUS-015` | `AI_OUTPUT.CONTENT.FABRICATED_QUOTE` |
| `R-BUS-016` | `AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER` |

Refusal `reasonCode` mapping is identical in shape to Agent 04's own table (README §19, system-prompt.md §4 design notes).

## 6. Retry semantics

- This agent never retries itself and never loops. The workflow (not yet implemented) owns retry orchestration and attempt budgeting.
- `retry.retryable` is advisory metadata returned alongside every failure outcome, kept out of the wire contract.
- Provider refusals (in-band or `finishReason=REFUSED`) are always non-retryable — never consume a regeneration budget.
- Structural/business output failures suggest `REPAIR`; JSON parse failures and truncation suggest `REGENERATION` — hints only.

## 7. Security

- `script-writer.prompt.ts` neutralises `<<<`/`>>>` sequences recursively through the entire `storyArchitecture` and `verificationPackage` objects before rendering — not a designated subset.
- The system prompt explicitly instructs the model never to follow an instruction embedded in either input block (system-prompt.md §4c rule 34).
- `providerSafeUserMessage()` / `redactKnownSecret()` (mirrored from `story-architect.errors.ts`) ensure no raw provider payload, API key, or internal stack trace ever reaches a `userMessage` field.

## 8. Testing

`script-writer.service.spec.ts` — AI provider always mocked, never a real network call. Covers (see `test-cases.md` for the full enumerated list, matching the 46-scenario brief): valid script; invalid input; missing story architecture; unknown beat/claim/evidence reference; duplicate segment id/order; `DO_NOT_USE`/`UNSUPPORTED`/`CONTRADICTED`/`INSUFFICIENT_EVIDENCE`/`NOT_VERIFIABLE` claim protection (all resolve to the fixed `DO_NOT_USE` `downstreamSafety` mapping — one rule, R-BUS-006, covers all five per Agent 03's own fixed mapping); `USE_WITH_QUALIFICATION` with/without qualification; valid quote / quote without provenance; unsupported number / valid numerical claim; claim/evidence mismatch / valid mapping; target duration mismatch / invalid total / valid duration; incorrect/valid declared word count; missing hook / missing conclusion; invalid segment type; prompt injection in claim/evidence; provider failure/timeout/refusal/truncation/invalid JSON; output schema failure; business validation failure; valid/invalid downstream readiness; CTA requested/disabled; conflicting/outdated claim handled safely; valid success/failure envelopes.

`script-writer.prompt.spec.ts` — fenced-block parsing, variable rendering, delimiter neutralisation, strict-resolution failure on a missing required variable.

## 9. Build / test / lint

Run after implementation: `npm run build`, `npm test`, `npm run lint`. Fix genuine errors; re-run. Confirm via `git status`/`git diff` that only Agent 05 contract/implementation/test/example files, plus the minimal shared wiring files every prior agent's addition also touched (`tsconfig.json`, `package.json` jest `moduleNameMapper`, `scripts/copy-prompt-asset.js`, `src/app.module.ts`), changed.

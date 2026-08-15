# AGT-05 — Script Writer Agent

## 1. Purpose and deliverable

Agent 05 transforms an approved Agent 04 Story Architecture, together with the Agent 03 verified claims it was built from, into **the Narration Script** — complete, natural-language, spoken-ready narration, segment by segment, in the story's own order. It is the single deliverable of this agent (`#/$defs/narrationScript` in `output.schema.json`).

Pipeline position:

```
Agent 00 Strategy
      ↓
Agent 01 Topic Discovery
      ↓
Agent 02 Research
      ↓
Agent 03 Fact Verification
      ↓
Agent 04 Story Architect
      ↓
Agent 05 Script Writer   ← this package
      ↓
Agent 06 Script Reviewer (not yet implemented)
```

## 2. Responsibilities

Agent 05 is a **writer**. Given a structural blueprint (Agent 04's beats, hook, payoff, conclusion, CTA strategy) and a closed set of verified claims (Agent 03's claims, each with a fixed `verificationStatus` and `downstreamSafety`), it composes the actual spoken words a narrator would read — nothing more, nothing less.

It does not:

- research anything (no web search, no external calls of any kind — see `implementation-checklist.md` §2);
- verify or re-verify anything (Agent 03's `verificationStatus`/`downstreamSafety` are consumed as given, never re-derived);
- restructure the story (Agent 04's beat sequence, hook, payoff, and CTA strategy are consumed as given, never redesigned);
- invent a fact, a statistic, a date, a price, a ranking, a benchmark, a quotation, a source, or a URL that does not already trace to a supplied verified claim.

## 3. Boundaries — what Agent 05 is NOT

The Narration Script contains narration only. It never contains:

- a scene plan or shot list;
- an image or video generation prompt;
- a voice/TTS setting (voice id, pitch, speed, SSML);
- a caption or subtitle track;
- publishing metadata (title, description, thumbnail).

Those all belong to later stages (Agent 06 Script Reviewer, and further downstream production agents not yet implemented). Emitting any of them is a schema violation (`additionalProperties: false` throughout `output.schema.json`).

## 4. Downstream safety — respected absolutely

Agent 03's `downstreamSafety` on each verified claim is fixed and non-negotiable (identical rule to Agent 04's own README §6):

| `downstreamSafety` | Meaning here |
|---|---|
| `SAFE_TO_USE` | May be stated as settled factual narration. |
| `USE_WITH_QUALIFICATION` | May be narrated ONLY with its qualification preserved in the segment's own `qualification` field (R-BUS-007). |
| `DO_NOT_USE` | MUST NOT appear as factual narration anywhere — not via `claimRefs`, not indirectly via `evidenceRefs` belonging to it (R-BUS-006). |

Agent 05 never upgrades `USE_WITH_QUALIFICATION` to `SAFE_TO_USE`, never narrates a `DO_NOT_USE` claim, and never second-guesses Agent 03's determination. This is enforced deterministically by `validator.ts`, not left to prompt compliance alone.

## 5. Field traceability — the provenance chain

Every factual script segment traces through a fixed chain:

```
Script Segment
      ↓ beatRef
Story Beat (Agent 04)
      ↓ claimRefs
Verified Claim (Agent 03)
      ↓ evidenceRefs → supportingEvidenceIds
Evidence
```

`validator.ts` enforces every link deterministically:

- `beatRef` must resolve to a beat Agent 04 actually supplied (R-BUS-003), and every supplied beat must be narrated by at least one segment (R-BUS-009) — no beat silently skipped, no beat invented.
- `claimRefs` must resolve to a claim Agent 03 actually supplied (R-BUS-004).
- `evidenceRefs` must resolve to a `supportingEvidenceIds` entry of **one of that same segment's own `claimRefs`** (R-BUS-005, R-BUS-008) — not merely to some claim elsewhere in the package. Identical provenance principle to Agent 04's own R-BUS-022.

This is strictly reference-graph validation — string/set membership checks, never semantic understanding of narration content (with the single deliberate exception of R-BUS-016's numeric-token check, itself a string match, not semantic analysis).

## 6. Topic identity

`data.topicId` must echo the request's `storyArchitecture.topicId` exactly (R-BUS-025). `verificationPackage.topicId` and `storyArchitecture.topicId` must name the same topic at the input boundary (R-IN-002) — the same defect class Agent 04 rejects as `R-IN-002` for its own two topic references.

## 7. Script segments

`ScriptSegment` (`interfaces.ts`) is the unit of narration. Every segment carries: `segmentId`, `order`, `beatRef`, `segmentType`, `narration`, `estimatedDurationSeconds`, `claimRefs`, `evidenceRefs`, an optional `qualification`, an optional `quotation`, `deliveryIntent`, an optional `transition`, `emphasis`, and an optional `notes`.

`segmentType` is a controlled taxonomy distinct from Agent 04's `beatType` — narration style is not required to mirror structural beat type one-for-one (a single `EXPLANATION` beat may, for example, be narrated across an `EXPLANATION` segment and a following `EVIDENCE` segment): `HOOK`, `INTRO`, `CONTEXT`, `PROBLEM`, `QUESTION`, `EXPLANATION`, `EVIDENCE`, `EXAMPLE`, `COMPARISON`, `COUNTERPOINT`, `ESCALATION`, `REVEAL`, `PAYOFF`, `CONCLUSION`, `CTA`, `TRANSITION`. Not every value is required to appear in every script.

Segment order must follow the story's own beat order — once a later-ordered beat has been narrated, no segment may narrate an earlier-ordered beat afterward (R-BUS-010). Multiple segments may share the same `beatRef` (splitting a beat's material across more than one spoken unit is allowed); a beat may never be entirely unnarrated (R-BUS-009).

`transition` and `notes` are editorial, not spoken — they are excluded from `wordCount` and from `scriptDuration` entirely, mirroring how Agent 04's `beat.transitionIntent` is structural guidance rather than final content.

## 8. Story beat coverage

See §5 and §7. Every one of the request's `storyArchitecture.beats` entries must be covered by at least one segment (R-BUS-009); the first segment must open with the `HOOK` beat (R-BUS-011); the last must close with `CONCLUSION` or `CTA` (R-BUS-012) — the same opening/closing invariant Agent 04 itself enforces on its own beat sequence (its README §10, rules R-BUS-012/013).

## 9. Hook

The hook segment is built from `storyArchitecture.hook` — its `curiosityMechanism`, `viewerQuestion`, and `payoffExpectation` — never replaced with an invented claim. If `storyArchitecture.hook.qualification` is present (meaning the hook's underlying claim is `USE_WITH_QUALIFICATION`), the hook segment must carry that same qualification via the general per-segment qualification mechanism (§4, R-BUS-007) — there is no separate hook-specific qualification rule, because the hook beat's own `claimRefs`/qualification already flow through the same generic check every other segment goes through.

## 10. Quotations

A `Quotation` (`claimId`, `speaker`, `quotedText`) may only be attached to a segment that already cites a `QUOTE`-type claim via `claimRefs` (R-BUS-015). `quotedText` MUST equal that claim's `claimText` exactly, and `speaker` MUST equal that claim's `quoteProvenance.speaker` exactly (R-BUS-014) — never a fabricated quote, never a paraphrase promoted into quotation marks. A claim with no `quoteProvenance` supplied (non-`QUOTE` claim types never carry one) cannot be quoted.

## 11. Numbers and statistics

Every numeric token (a percentage, a date, a price, a count, a measurement) appearing in a segment's `narration` must appear, verbatim, in the `claimText` of a claim that same segment references via `claimRefs` (R-BUS-016). This is a deterministic string-containment check — it does not understand units, magnitude, or meaning, and it does not attempt to validate numbers appearing only in a `transition` or `notes` field (those are not spoken narration; see §7). It catches invented figures and any narrowing of a qualified figure (`"up to 30%"` rewritten as `"30%"`) whenever the narrowed figure's digits do not appear in the source claim text; it does not by itself detect a loosened figure (`"30%"` rewritten as `"around 30%"`) if the digits still match — that class of drift is a prompt-compliance concern (system-prompt.md §4b rule 12), not a distinct deterministic rule, matching this project's established precedent of using prompt discipline plus schema/reference-graph enforcement rather than natural-language understanding inside the validator (`STD-000` §6.2, `GDE-002` §9.1).

## 12. Comparisons

A comparison segment may compare only what supplied claims establish. There is no dedicated comparison-specific rule: an invented winner, benchmark, price, or preference is caught by the same claim/evidence provenance mechanism (§5) and numeric-token check (§11) every other factual statement goes through — a fabricated comparison necessarily either cites no grounding claim (R-BUS-004 failure) or introduces an ungrounded number (R-BUS-016 failure).

## 13. Duration

`ScriptDuration` mirrors Agent 04's own `StoryDuration` model exactly, retargeted to segments:

- `targetDurationSeconds` MUST equal the request's `storyArchitecture.duration.targetDurationSeconds` exactly (R-BUS-018) — inherited from upstream, never altered by this agent.
- `totalEstimatedDurationSeconds` MUST equal the sum of `segments[].estimatedDurationSeconds` (R-BUS-017).
- `withinTolerance` MUST equal the deterministic comparison `|totalEstimatedDurationSeconds − targetDurationSeconds| / targetDurationSeconds <= toleranceRatio` (R-BUS-019), using the same fixed `±15%` (`SCRIPT_DURATION_TOLERANCE_RATIO` in `validator.ts`) tolerance Agent 04 uses for its own duration reconciliation. This tolerance is fixed and is never changed by this agent's implementation.

## 14. Words per minute

`scriptDuration.wordsPerMinute` is a fixed platform constant, `150` (`SCRIPT_WORDS_PER_MINUTE` in `validator.ts`), enforced by both the output schema (`const: 150`) and a dedicated business rule (R-BUS-020). The project has no shared, project-level speech-rate configuration yet (`src/config/ai.config.ts` covers provider/timeout/token concerns only); rather than invent a cross-cutting configuration surface for this one agent, this contract fixes its own deterministic value, the same pattern Agent 04 uses for its own fixed duration tolerance. A future shared speech-rate configuration, if the project adds one, is a contract change here — never a silent runtime override of what this schema declares.

## 15. Word count

`wordCount` MUST equal the actual word count of every segment's `narration`, concatenated and whitespace-split (R-BUS-021, `calculateWordCount()` in `validator.ts`). The model's own declared value is never trusted over the calculated one — identical philosophy to Agent 03/04's duration and count reconciliation rules throughout this project.

## 16. Warnings and readiness

`warnings` is a structured, non-blocking surface for the model's own concerns about the script it produced (for example, heavy reliance on `USE_WITH_QUALIFICATION` material). `downstreamReadiness` is `READY_FOR_REVIEW` only when `readinessBlockers` is empty and `scriptDuration.withinTolerance` is true (R-BUS-022, R-BUS-023) — otherwise `NOT_READY_FOR_REVIEW` with at least one structured blocker. A thin, heavily-qualified but honestly-flagged script is a **success**, never a refusal (system-prompt.md §6).

## 17. Security — untrusted content

`storyArchitecture` and `verificationPackage` are provenance-**TRUSTED** (already-validated platform artifacts, produced by already-validated Agent 03/04 invocations) but their embedded free text (claim text, beat purposes, limitations, notes) is treated as **untrusted data** by the prompt — identical discipline to every prior agent's handling of its own upstream input (Agent 04 README §15, Agent 03 README §17). `script-writer.prompt.ts` neutralises the `<<<`/`>>>` delimiter sequences recursively through both entire blocks before rendering, and the system prompt explicitly instructs the model never to follow an embedded instruction regardless of claimed authority (system-prompt.md §4c rule 34).

## 18. Validation rules — summary

Structural (`R-STRUCT-001`): both JSON Schemas, Draft 2020-12, `additionalProperties: false` throughout, closed enumerations.

Input business rules (`R-IN-*`, evaluated before dispatch — a violation is a workflow defect, never retried):

| Rule | Check |
|---|---|
| `R-IN-001` | `storyArchitecture.downstreamReadiness` is `READY_FOR_SCRIPT`. |
| `R-IN-002` | `verificationPackage.topicId` and `storyArchitecture.topicId` name the same topic. |
| `R-IN-003` | Supplied verified claim ids are unique. |

Output business rules (`R-BUS-*`, full list in `validator.ts` and `test-cases.md`): segment id/order integrity (001–002), beat/claim/evidence provenance (003–005, 008), `DO_NOT_USE` protection (006), qualification preservation (007), beat coverage and sequencing (009–010), hook/close/CTA structure (011–013), quotation integrity (014–015), numeric provenance (016), duration reconciliation (017–019), words-per-minute and word-count consistency (020–021), readiness consistency (022–023), placeholder residue (024), topic identity echo (025).

## 19. Failure conditions and error codes

| Error code | Category | Meaning |
|---|---|---|
| `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | Structural: a required input field is absent. |
| `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | Structural: a closed enum received an unregistered value. |
| `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` | `VALIDATION` | R-IN-003. |
| `VALIDATION.INPUT.TOPIC_ID_MISMATCH` | `VALIDATION` | R-IN-002. |
| `VALIDATION.INPUT.STORY_NOT_READY` | `VALIDATION` | R-IN-001. |
| `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | Refusal: `OUT_OF_SCOPE`. |
| `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | Model output was not valid JSON. |
| `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | Structural output failure (any `R-STRUCT-001` finding). |
| `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | R-BUS-003, R-BUS-004, R-BUS-005, R-BUS-008, R-BUS-009. |
| `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` | `AI_OUTPUT` | R-BUS-006. |
| `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` | `AI_OUTPUT` | R-BUS-007. |
| `AI_OUTPUT.CONTENT.FABRICATED_QUOTE` | `AI_OUTPUT` | R-BUS-014, R-BUS-015. |
| `AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER` | `AI_OUTPUT` | R-BUS-016. |
| `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `finishReason=TRUNCATED`. |
| `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | Every other output rule (generic fallback — same simplification precedent Agent 02/03/04 document). |
| `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | Refusal: `INSTRUCTION_IN_DATA`. |

## 20. Reused infrastructure

Nothing in this package duplicates existing platform infrastructure:

- AI provider abstraction — `src/ai/ai-provider.interface.ts` (`AiProvider`, `AI_PROVIDER` token), the same one Agents 00–04 use.
- Ajv2020 contract validator wiring pattern — `createContractValidator()`, compiled once at module init, identical shape to `agents/agent-04-story-architect/validator.ts`.
- Prompt loader/renderer pattern — fenced-block parsing, delimiter neutralisation, strict variable resolution — identical mechanism to `src/agents/story-architect/story-architect.prompt.ts`, applied to this package's own `system-prompt.md`.
- `generatePrefixedId()` (`src/common/id.util.ts`) for response `messageId` generation.
- `aiConfig` (`src/config/ai.config.ts`) for provider/timeout configuration — no second configuration mechanism introduced.
- NestJS module/DI conventions — Symbol-based validator tokens, `ConfigModule.forFeature`, identical structure to `story-architect.module.ts`.

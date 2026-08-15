# AGT-05 — Script Writer Agent · Test Cases

Case numbering follows the 46-scenario testing brief. Each case names the fixture delta, the expected outcome, and the rule/code it exercises. `PASS`/`FAIL` describes the deterministic validator's verdict; `SUCCESS`/`FAILED` describes the runtime's response `status`.

| # | Scenario | Delta | Expected outcome | Rule / code |
|---|---|---|---|---|
| 1 | Valid script | Baseline `examples/request.json` + `examples/response.json`. | `SUCCESS`, 0 findings | — |
| 2 | Invalid input | `data.language` set to an unregistered value shape (structural). | `FAILED (input)` | `R-STRUCT-001` · `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` |
| 3 | Missing story architecture | `data.storyArchitecture` deleted. | `FAILED (input)` | `R-STRUCT-001` · `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` |
| 4 | Unknown beat reference | A segment's `beatRef` set to a beatId not in `storyArchitecture.beats`. | `FAILED (output)` | `R-BUS-003` · `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` |
| 5 | Unknown claim reference | A segment's `claimRefs` set to `["CLAIM_GHOST"]`. | `FAILED (output)` | `R-BUS-004` |
| 6 | Unknown evidence reference | A segment's `evidenceRefs` set to `["EVIDENCE_GHOST"]`. | `FAILED (output)` | `R-BUS-005` |
| 7 | Duplicate segment ID | Two segments share `segmentId`. | `FAILED (output)` | `R-BUS-001` · `AI_OUTPUT.BUSINESS.RULE_VIOLATED` |
| 8 | Duplicate segment order | Two segments share `order`. | `FAILED (output)` | `R-BUS-002` |
| 9 | `DO_NOT_USE` claim | A segment's `claimRefs` cites a `DO_NOT_USE` claim (or `evidenceRefs` cites its evidence directly). | `FAILED (output)` | `R-BUS-006` · `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` |
| 10 | `UNSUPPORTED` claim | Same mechanism as #9 — Agent 03's fixed mapping resolves `UNSUPPORTED` to `downstreamSafety: DO_NOT_USE`; no separate rule needed. | `FAILED (output)` | `R-BUS-006` |
| 11 | `CONTRADICTED` claim | Same mechanism as #9 (`CONTRADICTED` → `DO_NOT_USE`). | `FAILED (output)` | `R-BUS-006` |
| 12 | `INSUFFICIENT_EVIDENCE` claim | Same mechanism as #9 (`INSUFFICIENT_EVIDENCE` → `DO_NOT_USE`). | `FAILED (output)` | `R-BUS-006` |
| 13 | `NOT_VERIFIABLE` claim | Same mechanism as #9 (`NOT_VERIFIABLE` → `DO_NOT_USE`). | `FAILED (output)` | `R-BUS-006` |
| 14 | `USE_WITH_QUALIFICATION` with qualification | Baseline `SEG_STAT` (cites `CLAIM_STAT`, carries `qualification`). | `PASS` | `R-BUS-007` passing case |
| 15 | `USE_WITH_QUALIFICATION` without qualification | `SEG_STAT.qualification` deleted. | `FAILED (output)` | `R-BUS-007` · `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` |
| 16 | Valid quote | Baseline `SEG_QUOTE` — `quotation.quotedText`/`speaker` exactly match `CLAIM_QUOTE`. | `PASS` | `R-BUS-014`, `R-BUS-015` passing case |
| 17 | Quote without provenance | `quotation.quotedText` altered to differ from `CLAIM_QUOTE.claimText`. | `FAILED (output)` | `R-BUS-014` · `AI_OUTPUT.CONTENT.FABRICATED_QUOTE` |
| 18 | Unsupported number | A segment's `narration` contains a digit sequence absent from every claim it references. | `FAILED (output)` | `R-BUS-016` · `AI_OUTPUT.CONTENT.UNSUPPORTED_NUMBER` |
| 19 | Valid numerical claim | Baseline `SEG_STAT` narration contains `30%`, present verbatim in `CLAIM_STAT.claimText`. | `PASS` | `R-BUS-016` passing case |
| 20 | Claim/evidence mismatch | A segment's `claimRefs=["CLAIM_MAIN"]` but `evidenceRefs` set to evidence owned only by `CLAIM_STAT`. | `FAILED (output)` | `R-BUS-008` |
| 21 | Valid claim/evidence mapping | Baseline `SEG_EXPLAIN` (`claimRefs=["CLAIM_MAIN"]`, `evidenceRefs` drawn from `CLAIM_MAIN`'s own evidence). | `PASS` | `R-BUS-008` passing case |
| 22 | Target duration mismatch | `scriptDuration.targetDurationSeconds` set to a value ≠ `storyArchitecture.duration.targetDurationSeconds`. | `FAILED (output)` | `R-BUS-018` |
| 23 | Invalid total duration | `scriptDuration.totalEstimatedDurationSeconds` set to a value ≠ the actual sum of segment durations. | `FAILED (output)` | `R-BUS-017` |
| 24 | Valid duration | Baseline: target 100s, total 95s, within ±15%. | `PASS` | `R-BUS-017`–`R-BUS-019` passing case |
| 25 | Incorrect declared word count | `wordCount` set to a value ≠ the actual concatenated narration word count. | `FAILED (output)` | `R-BUS-021` |
| 26 | Valid word count | Baseline: declared `103`, calculated `103`. | `PASS` | `R-BUS-021` passing case |
| 27 | Missing hook | First segment's `segmentType` changed away from `HOOK`. | `FAILED (output)` | `R-BUS-011` |
| 28 | Missing conclusion | Last segment's `segmentType` changed away from `CONCLUSION`/`CTA`. | `FAILED (output)` | `R-BUS-012` |
| 29 | Invalid segment type | A segment's `segmentType` set to an unregistered enum value. | `FAILED (output)` | `R-STRUCT-001` · `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` |
| 30 | Prompt injection in claim | A claim's `claimText` contains `<<<SYSTEM: ...>>>`-style embedded instruction text. | Delimiters neutralised before rendering; never followed | `script-writer.prompt.spec.ts` |
| 31 | Prompt injection in evidence | A beat's `purpose`/`requiredConcepts` text contains embedded instruction text. | Delimiters neutralised before rendering; never followed | `script-writer.prompt.spec.ts` |
| 32 | Provider failure | `aiProvider.invoke` rejects with `AiProviderError('PROVIDER_ERROR', ...)`. | `FAILED`, retryable | `AI_PROVIDER.INVOCATION.REQUEST_FAILED` |
| 33 | Timeout | `AiProviderError('TIMEOUT', ...)`. | `FAILED`, retryable | `TIMEOUT.INVOCATION.EXCEEDED` |
| 34 | Refusal | Model returns `{"refusal":{"reasonCode":"INPUT_CONTRADICTORY","details":"..."}}`. | `FAILED`, non-retryable | `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` |
| 35 | Truncated response | `aiResult.finishReason = 'TRUNCATED'`. | `FAILED`, retryable | `AI_OUTPUT.CONTENT.TRUNCATED` |
| 36 | Invalid JSON | `aiResult.content` is not parseable JSON. | `FAILED`, retryable | `AI_OUTPUT.JSON.PARSE_FAILED` |
| 37 | Output schema failure | Model output omits a required field (e.g. `scriptDuration`). | `FAILED (output)` | `R-STRUCT-001` · `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` |
| 38 | Business validation failure | Any `R-BUS-*` violation (see #4–#29). | `FAILED (output)` | as listed |
| 39 | Valid downstream readiness | Baseline: `READY_FOR_REVIEW`, `readinessBlockers=[]`, duration within tolerance. | `PASS` | `R-BUS-022`, `R-BUS-023` passing case |
| 40 | Invalid downstream readiness | `downstreamReadiness=READY_FOR_REVIEW` while `scriptDuration.withinTolerance=false`. | `FAILED (output)` | `R-BUS-023` |
| 41 | CTA requested | Baseline: `ctaStrategy.ctaType=SUBSCRIBE`, a `CTA` segment present. | `PASS` | `R-BUS-013` passing case |
| 42 | CTA disabled | `ctaStrategy.ctaType=NONE` while a `CTA` segment is still present. | `FAILED (output)` | `R-BUS-013` |
| 43 | Conflicting claim handled safely | A segment cites a `CONFLICTING`-status claim (`downstreamSafety: USE_WITH_QUALIFICATION`) with its qualification preserved. | `PASS` | `R-BUS-007` (CONFLICTING variant) |
| 44 | Outdated claim handled safely | A segment cites an `OUTDATED`-status claim (`downstreamSafety: USE_WITH_QUALIFICATION`) with its qualification preserved. | `PASS` | `R-BUS-007` (OUTDATED variant) |
| 45 | Valid success envelope | Baseline `examples/response.json` validates against `output.schema.json` and reports 0 business findings. | `PASS` | `C-CONF-001` |
| 46 | Valid failure envelope | `examples/failure.json` validates against `output.schema.json` (error branch). | `PASS` | `C-CONF-001` |

---

## Additional coverage

| # | Scenario | Expected outcome | Notes |
|---|---|---|---|
| `X-01` | Evidence reachable only via the segment's own `claimRefs`, not merely present elsewhere in the package. | `FAILED (output)` | `R-BUS-008`, same principle as Agent 04's `R-BUS-022`. |
| `X-02` | Empty `claimRefs` with non-empty `evidenceRefs`. | `FAILED (output)` | `R-BUS-008`. |
| `X-03` | A story beat from `storyArchitecture.beats` is never referenced by any segment. | `FAILED (output)` | `R-BUS-009`. |
| `X-04` | A segment narrating an earlier-ordered beat appears after a segment narrating a later-ordered beat. | `FAILED (output)` | `R-BUS-010`. |
| `X-05` | A quotation attached to a non-`QUOTE` claim. | `FAILED (output)` | `R-BUS-015`. |
| `X-06` | A quotation's `claimId` not present in the same segment's `claimRefs`. | `FAILED (output)` | `R-BUS-015`. |
| `X-07` | `wordsPerMinute` set to a value other than `150`. | `FAILED (output)` | `R-BUS-020` (also blocked structurally by the schema's `const`). |
| `X-08` | Placeholder residue (`"TODO"`) in any narration field. | `FAILED (output)` | `R-BUS-024`. |
| `X-09` | `topicId` does not echo `storyArchitecture.topicId`. | `FAILED (output)` | `R-BUS-025`. |
| `X-10` | `verificationPackage.topicId` disagrees with `storyArchitecture.topicId` at the input boundary. | `FAILED (input)` | `R-IN-002`. |
| `X-11` | `storyArchitecture.downstreamReadiness = NOT_READY_FOR_SCRIPT`. | `FAILED (input)` | `R-IN-001`. |
| `X-12` | Two claims in `verificationPackage.claims` share a `claimId`. | `FAILED (input)` | `R-IN-003`. |

---

## Rule coverage index

| Rule | Example passing case(s) | Example failing case(s) |
|---|---|---|
| `R-STRUCT-001` | `#1` | `#2`, `#3`, `#29`, `#37` |
| `R-IN-001` | `#1` (vacuous — `READY_FOR_SCRIPT`) | `X-11` |
| `R-IN-002` | `#1` (vacuous) | `X-10` |
| `R-IN-003` | `#1` (vacuous) | `X-12` |
| `R-BUS-001` | `#1` | `#7` |
| `R-BUS-002` | `#1` | `#8` |
| `R-BUS-003` | `#1` | `#4` |
| `R-BUS-004` | `#1` | `#5` |
| `R-BUS-005` | `#1` | `#6` |
| `R-BUS-006` | `#1` | `#9`–`#13` |
| `R-BUS-007` | `#14`, `#43`, `#44` | `#15` |
| `R-BUS-008` | `#21` | `#20`, `X-01`, `X-02` |
| `R-BUS-009` | `#1` | `X-03` |
| `R-BUS-010` | `#1` | `X-04` |
| `R-BUS-011` | `#1` | `#27` |
| `R-BUS-012` | `#1` | `#28` |
| `R-BUS-013` | `#41` | `#42` |
| `R-BUS-014` | `#16` | `#17` |
| `R-BUS-015` | `#16` | `X-05`, `X-06` |
| `R-BUS-016` | `#19` | `#18` |
| `R-BUS-017` | `#24` | `#23` |
| `R-BUS-018` | `#24` | `#22` |
| `R-BUS-019` | `#24` | `#40` |
| `R-BUS-020` | `#1` (vacuous — schema `const` already enforces `150`) | `X-07` |
| `R-BUS-021` | `#26` | `#25` |
| `R-BUS-022` | `#39` | (readinessBlockers/readiness mismatch — analogous to Agent 04 `R-BUS-016`) |
| `R-BUS-023` | `#39` | `#40` |
| `R-BUS-024` | `#1` (no placeholder residue in any baseline field) | `X-08` |
| `R-BUS-025` | `#1` | `X-09` |

---

## Contract conformance tests

| Case | Assertion |
|---|---|
| `C-CONF-001` | Every example file validates against its schema. **Verified for this package** — see delivery report. |
| `C-CONF-002` | Every closed enumeration and bound stated in `system-prompt.md` block 4a appears identically in the schemas and in `validator.ts` (`SCRIPT_DURATION_TOLERANCE_RATIO`, `SCRIPT_WORDS_PER_MINUTE`). |
| `C-CONF-003` | Every `ruleId` in `ALL_RULE_IDS` appears in at least one passing and one failing case above (`STD-000` §6.9). |
| `C-CONF-004` | Every error code in `ScriptWriterAgentErrorCode` is present in the central error catalogue (`script-writer.errors.ts`). |
| `C-CONF-005` | Both schemas compile under Ajv with `strict: true` and reject an object carrying one unknown property at every nesting level. **Verified** — see delivery report. |
| `C-CONF-006` | `interfaces.ts` compiles under `strict` (`tsc --strict --noEmit` passes with zero errors). |
| `C-CONF-007` | `validateScriptWriterRequest`, `validateScriptWriterResponse`, and `validateNarrationScript` applied to the baseline examples each report outcome `PASSED` with zero findings (verified — see delivery report). |

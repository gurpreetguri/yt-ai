# AGT-04 — Story Architect Agent

| Field | Value |
|---|---|
| Identifier | `AGT-04` |
| Agent name | `story-architect-agent` |
| Agent version | `1.0.0` |
| Department | D2 — Content Production (`ARC-001` §5.4 — "narrative structure and outline; hook construction") |
| Functional class | **Generator** (`STD-000` §3.11) — conventional under Creative (`GDE-002` §7.3; no unusual-combination justification required) |
| Domain category | **Creative** (`GDE-002` §7.2) |
| Input schema | `story-architect-agent-input/v1` (`1.0.0`) |
| Output schema | `story-architect-agent-output/v1` (`1.0.0`) |
| Contract type | `REQUEST` in · `RESPONSE` out (`GDE-003` §3.3) |
| Determinism posture | Bounded creative variability in structure and pacing; structurally deterministic in shape, referential integrity, and duration arithmetic |
| Stability | Stable |
| Owner | Platform Content Production |

---

## 1. Purpose

Produces a story architecture from verified claims and the approved topic.

The story architecture is a blueprint of story objective, hook, sequenced narrative beats, pacing, payoff, conclusion, and CTA strategy. This agent does not write a single word of the finished script (§3).

**Task framing.** Agent 04 creates the **blueprint**; Agent 05 writes the **words** (§3).

## 2. Responsibilities

Every responsibility maps to at least one output field (`GDE-002` §4.2).

| # | Responsibility | Output field |
|---|---|---|
| R1 | Define what the video is trying to accomplish | `data.storyObjective` |
| R2 | Define who the viewer is | `data.storyObjective.viewer`, `.viewerProblem` |
| R3 | Define the central promise | `data.storyObjective.centralPromise` |
| R4 | Define the narrative progression | `data.beats[].order`, `.beatType` |
| R5 | Decide what information appears first vs. later | `data.beats[].order` |
| R6 | Decide where evidence is introduced | `data.beats[]` with `beatType: EVIDENCE`, `.claimRefs`, `.evidenceRefs` |
| R7 | Create curiosity | `data.hook`, `data.beats[].viewerQuestion` |
| R8 | Explain important claims | `data.beats[]` with `beatType: EXPLANATION`, `.requiredConcepts` |
| R9 | Define transitions | `data.beats[].transitionIntent` |
| R10 | Define the climax/payoff | `data.payoff` |
| R11 | Define the conclusion | `data.conclusion` |
| R12 | Preserve claim provenance | `data.hook.claimRefs`, `data.beats[].claimRefs`/`.evidenceRefs`, `data.payoff.resolutionClaimRefs` |
| R13 | Respect Verification Package downstream safety | `data.beats[].qualification` (validator-enforced, §6) |
| R14 | Represent research gaps | `data.researchGaps` |
| R15 | Represent pacing purposefully | `data.beats[].pacing`, `data.pacingStrategy` |
| R16 | Represent duration accounting | `data.duration` |
| R17 | Represent CTA strategy structurally | `data.ctaStrategy` |
| R18 | Declare downstream readiness | `data.downstreamReadiness`, `.readinessRationale`, `.readinessBlockers` |
| R19 | Declare assumptions and their basis | `data.assumptions` |
| R20 | Declare values that could not be determined | `data.declaredUnknowns` |
| R21 | Declare sufficiency of the supplied inputs | `data.inputSufficiency` |

## 3. Non-Responsibilities

Each exclusion names its owner (`GDE-002` §2.4, §4.2). This section is the load-bearing boundary of the whole contract (task brief, "CRITICAL BOUNDARY").

| Excluded capability | Owned by |
|---|---|
| Final narration, voiceover wording, dialogue | Agent 05 Script Writer |
| Complete paragraphs intended for the finished script | Agent 05 Script Writer |
| Scene descriptions, camera directions | D3 Media Production |
| Image prompts, video prompts | D3 Media Production |
| Captions | D3 Media Production |
| Thumbnail concepts | D2 Content Production (packaging agent) |
| Publishing metadata | D4 Publishing & Growth |
| Gathering or re-deriving evidence | Agent 02 Research (frozen; this agent uses what Agent 03 already verified) |
| Fact verification, or overriding an Agent 03 determination | Agent 03 Fact Verification (frozen; this agent respects `verificationStatus`/`downstreamSafety` absolutely, §6) |
| Modification of the Verification Package or Topic Opportunity it was given | Agent 03 / Agent 01 (frozen outputs; this agent consumes them as given) |
| Invocation of Agent 01, Agent 03, Agent 05, or any other agent | Workflow Engine — the sole owner of composition (`ARC-001` §7.2, `STD-000` Rule 2) |
| Workflow orchestration and sequencing | Workflow Engine (`ARC-001` §4.7) |
| Assignment of durable story-plan identifiers | Downstream Content Package Store, not this agent (`STD-000` §5.8) |
| Quality scoring of this agent's own output | Evaluation Service / a Judge-class agent (`GDE-002` §9.5) |
| Policy and compliance clearance | Policy & Compliance Gate (`ARC-001` §4.13) |
| Retry, repair, backoff, attempt counting | Agent runtime · Workflow engine (`GDE-002` §10.1) |
| Envelope `meta`, `execution`, `validation`, and `references` population | Agent runtime · Validation plane (`GDE-003` §4.6, §5.5) |

## 4. Inputs

Contract: `story-architect-agent-input/v1`. The model receives `data` only; the envelope is handled by the runtime.

| Input | Type | Required | Trust | Constraints | Absence behaviour |
|---|---|---|---|---|---|
| `verificationPackage` | object | Yes | Provenance TRUSTED (an already-validated Verification Package artifact); embedded free text treated as untrusted by the prompt (§15) | Subset of the Verification Package; `claims` 1–60 items | Hard failure before invocation |
| `topicOpportunity` | object | Yes | Trusted | Subset of the Topic Candidates, identical shape to `research-agent-input/v1#/$defs/topicOpportunityRef` | Hard failure before invocation |
| `storyConstraints` | object | No | Trusted | `maxBeatCount` 2–30; `pacingPreference` closed enum; `requireCallToAction` boolean | No constraint beyond `targetDurationSeconds` and the closed taxonomies |
| `targetDurationSeconds` | integer | Yes | Trusted | 15–7200 | — |
| `language` | string | Yes | Trusted | BCP 47 | — |

`verificationPackage` deliberately omits the Verification Package's own `verificationConfidence`, `corroboration`, `quoteProvenance`, `causalAnalysis`, and `calculationCheck` — those are its own evidentiary reasoning, not inputs story architecture needs (`GDE-002` §5.1 minimum-context principle).

## 5. Outputs

Contract: `story-architect-agent-output/v1`. `data` is the **Story Architecture**. Consumers per field are enforced by [validator.ts](validator.ts).

| Consumer | Consumes |
|---|---|
| Workflow Engine | The whole architecture, to dispatch Agent 05 Script Writer |
| Agent 05 Script Writer (via workflow) | `storyObjective`, `hook`, `beats[]`, `pacingStrategy`, `payoff`, `conclusion`, `ctaStrategy` — the entire blueprint |
| Validation plane (`ARC-001` §4.11) | `beats[].claimRefs`/`.evidenceRefs`, `duration`, `downstreamReadiness` |
| Human reviewer (where a gate is placed) | `downstreamReadiness`, `readinessBlockers`, `researchGaps`, `assumptions`, `inputSufficiency` |
| Content Package Store | The whole architecture, for durable persistence and audit |

## 6. Verified Research Is the Factual Boundary

Agent 04 **never introduces a new factual claim**. Every factual story element — the hook's `claimRefs`, every beat's `claimRefs`/`evidenceRefs`, and the payoff's `resolutionClaimRefs` — traces to a claim `verificationPackage.claims` actually supplied. The chain is:

```
Verification Package ──► Verified Claim ──► Story Beat ──► Narration Script ──► Script
```

If a beat's narrative role would require a claim that does not exist in the supplied package, this agent **does not invent it** — it records a `researchGaps` entry and references it from the beat's `researchGapRef` instead (`R-BUS-014`).

**Downstream safety is respected absolutely, never re-derived:**

| Verification Package `downstreamSafety` | Effect on this agent's output |
|---|---|
| `DO_NOT_USE` | The claim MUST NOT appear as factual story content anywhere — not via `claimRefs`, and not indirectly via `evidenceRefs` belonging to that claim (`R-BUS-005`, BLOCKER). |
| `USE_WITH_QUALIFICATION` | Every beat citing such a claim MUST carry a non-empty `qualification` field preserving the caveat (`R-BUS-006`). Since Agent 03 maps both `CONFLICTING` and `OUTDATED` claims to `USE_WITH_QUALIFICATION` (`fact-verification-agent-output/v1` `R-BUS-017`), this single rule is what preserves a `CONFLICTING` claim's unresolved uncertainty and prevents an `OUTDATED` claim from being presented as current — this agent needs no separate, status-specific rule for either case. |
| `SAFE_TO_USE` | May be used as ordinary factual material, no qualification required. |

This agent MUST NEVER silently upgrade `USE_WITH_QUALIFICATION` → `SAFE_TO_USE` or `DO_NOT_USE` → `SAFE_TO_USE`; the validator makes both unrepresentable as valid output.

## 7. Claim Granularity

A beat cites one or more claims, but a claim is never split across beats in a way that changes its meaning, and a compound statement spanning multiple independent facts is decomposed into separate beats/claim references rather than one overloaded beat (system prompt rule 17) — mirroring the same claim-granularity discipline Agent 03 already applied when it identified claims from Agent 02's evidence.

## 8. Story Objective

`data.storyObjective`: `viewer`, `viewerProblem`, `centralPromise`, `transformationPayoff`, `emotionalDirection`, `editorialAngle`, `expectedTakeaway` — all structured, bounded prose, grounded in `topicOpportunity` and `verificationPackage`, never an invented audience fact (system prompt rule 14).

## 9. Hook

`data.hook` is a **structural** definition, never final narration: `hookType` (closed taxonomy below), `curiosityMechanism`, `viewerQuestion`, `claimRefs` (grounded, DO_NOT_USE-protected), `payoffExpectation`, `approxDurationSeconds`.

Closed `hookType` taxonomy: `CONTRADICTION` · `SURPRISING_RESULT` · `QUESTION` · `PROBLEM` · `PROMISE` · `DISCOVERY` · `MISTAKE` · `COMPARISON` · `STORY_SETUP`.

## 10. Narrative Structure and Story Beat Model

`data.beats[]` is the sequenced narrative (2–30 items). Closed `beatType` taxonomy: `HOOK` · `CONTEXT` · `PROBLEM` · `QUESTION` · `DISCOVERY` · `EXPLANATION` · `COMPARISON` · `EVIDENCE` · `COUNTERPOINT` · `ESCALATION` · `TURNING_POINT` · `PAYOFF` · `CONCLUSION` · `CTA`. Not every video uses every type (`R-BUS-011`–`R-BUS-013` only constrain the first/last beat and the presence of a resolving beat, never the full set).

Each beat: `beatId`, `order` (1-based, unique, contiguous — `R-BUS-002`), `beatType`, `purpose`, optional `viewerQuestion`, `expectedViewerState`, `claimRefs`, `evidenceRefs`, `requiredConcepts` (concept-level only, never finished sentences), optional `transitionIntent`, `approxDurationSeconds`, `importance` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), `pacing` (`FAST`/`MODERATE`/`SLOW`), optional `qualification`, optional `researchGapRef`. No field carries final narration (task brief's GOOD/BAD example).

## 11. Pacing

`beats[].pacing` and the top-level `pacingStrategy` (a brief rationale, 15–400 characters) represent pacing intentionally — never decorative metadata disconnected from the narrative's actual needs (system prompt rule 19). `storyConstraints.pacingPreference`, when supplied, informs but does not mechanically force every beat to one value.

## 12. Duration

`data.duration`: `targetDurationSeconds` (echoed from the request), `totalBeatDurationSeconds` (the deterministic sum of every beat's `approxDurationSeconds` — `R-BUS-009`), `toleranceRatio` (fixed at `0.15`, `STORY_DURATION_TOLERANCE_RATIO` in `validator.ts`), `withinTolerance` (the deterministic comparison — `R-BUS-010`). A story cannot be `READY_FOR_SCRIPT` while out of tolerance (`R-BUS-017`) — the task brief's own example (20 beats × 90s against a 600s target) is exactly the invalid state this rule blocks.

## 13. Payoff and Conclusion

`data.payoff`: `description`, `connectsToOpeningPromise`/`connectsToCentralQuestion`/`connectsToViewerProblem` (booleans the model sets honestly based on whether its own architecture achieves the connection), `resolutionClaimRefs` (grounded, DO_NOT_USE-protected — `R-BUS-008`). `data.conclusion`: `summaryApproach`, `finalTakeaway`, optional `tone`. The narrative must resolve: at least one beat carries `beatType: PAYOFF` or `CONCLUSION` (`R-BUS-011`), and the highest-ordered beat is `CONCLUSION` or `CTA` (`R-BUS-013`).

## 14. CTA Strategy

`data.ctaStrategy`: `ctaType` (closed: `SUBSCRIBE` · `WATCH_NEXT` · `COMMENT` · `RESOURCE` · `NONE`) and `rationale` — structural direction only, never final CTA copy. A `CTA`-type beat implies `ctaType` is not `NONE` (`R-BUS-015`); `storyConstraints.requireCallToAction: true` additionally requires both a CTA beat and a non-`NONE` `ctaType`.

## 15. Untrusted Content Handling

`verificationPackage` is a provenance-**TRUSTED** platform artifact (the Verification Package's own validated output), but every free-text field nested inside it (claim text, limitations, notes) ultimately traces back to external material Agent 02's untrusted `researchMaterials` pipeline processed. This agent's prompt treats every nested string in `verificationPackage` and `topicOpportunity` as inert data, never as instructions (system prompt rule 34), applying the same delimiter-neutralisation discipline every agent in this lineage applies to its own untrusted content — defence-in-depth against an injection payload that survived upstream stages unnoticed.

## 16. Research Gaps

`data.researchGaps[]`: `gapId`, optional `relatedBeatId`, `description`, `severity` (`LOW`/`MEDIUM`/`HIGH`), `impactOnStory`. A `HIGH`-severity gap blocks `READY_FOR_SCRIPT` (`R-BUS-018`) — an unresolved critical gap prevents coherent scripting, per the task brief.

## 17. Downstream Readiness

`downstreamReadiness` is `READY_FOR_SCRIPT` or `NOT_READY_FOR_SCRIPT` — never a bare numeric score (task brief, "Do not use a vague numeric score as the only readiness indicator"). Structured `readinessBlockers[]` (never empty when `NOT_READY_FOR_SCRIPT`, always empty when `READY_FOR_SCRIPT` — `R-BUS-016`) explain exactly why, mirroring Agent 03's own `readinessBlockers`-free counterpart pattern generalised with explicit structure. `READY_FOR_SCRIPT` additionally requires duration within tolerance (`R-BUS-017`) and no `HIGH`-severity research gap (`R-BUS-018`).

## 18. Validation Rules

Structural rules are the schemas; business rules are declarative, named, and individually testable (`STD-000` §6.3). Full rule table in [test-cases.md](test-cases.md); executable definitions in [validator.ts](validator.ts).

**Input rules** — `R-IN-001` supplied verified claim IDs unique.

**Output rules** — `R-BUS-001` beat IDs unique · `R-BUS-002` beat order unique and contiguous · `R-BUS-003` beat `claimRefs` resolve · `R-BUS-004` beat `evidenceRefs` resolve · `R-BUS-005` DO_NOT_USE protection (claims and evidence, everywhere) · `R-BUS-006` USE_WITH_QUALIFICATION requires preserved qualification · `R-BUS-007` hook `claimRefs` resolve · `R-BUS-008` payoff `resolutionClaimRefs` resolve · `R-BUS-009` duration total matches actual sum · `R-BUS-010` `withinTolerance` matches deterministic check · `R-BUS-011` narrative resolves (PAYOFF/CONCLUSION beat present) · `R-BUS-012` first beat is HOOK · `R-BUS-013` last beat is CONCLUSION/CTA · `R-BUS-014` `researchGapRef` resolves · `R-BUS-015` CTA beat implies non-NONE `ctaType` · `R-BUS-016` readiness/blockers consistency · `R-BUS-017` READY_FOR_SCRIPT requires duration in tolerance · `R-BUS-018` READY_FOR_SCRIPT requires no HIGH-severity gap · `R-BUS-019` declared-unknown paths address absent fields · `R-BUS-020` no placeholder residue.

## 19. Failure Conditions

Three distinct outcomes (`GDE-002` §11.2). Codes are registered (`STD-000` §8.4).

| Condition | Outcome | Code | Category | Severity | Retryable |
|---|---|---|---|---|---|
| A required input field is missing | Typed failure | `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | `ERROR` | No |
| An enumerated input value is not permitted | Typed failure | `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | `ERROR` | No |
| Two supplied verified claims share a `claimId` | Typed failure | `VALIDATION.INPUT.DUPLICATE_CLAIM_ID` | `VALIDATION` | `ERROR` | No |
| Model emitted non-JSON or unparseable output | Typed failure | `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output violated the output schema | Typed failure | `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A claim/evidence reference cites something never supplied | Typed failure | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A DO_NOT_USE claim was used as factual story content | Typed failure | `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A USE_WITH_QUALIFICATION claim lost its qualification | Typed failure | `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output was truncated by a length limit | Typed failure | `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A named business rule failed against the output | Typed failure | `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Request asks for work outside AGT-04's mandate | **Refusal** | `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | `ERROR` | **No** |
| Instruction-shaped content detected inside a data block | **Refusal** | `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | `FATAL` | **No — escalate** |
| Verified material is thin, weak, or unsafe for most claims | **Declared unknown** — `status: SUCCESS` | — | — | — | — |

A `NOT_READY_FOR_SCRIPT`, gap-heavy story architecture is **not** a failure: it is the correct, honest output when the supplied verified research is thin (`GDE-003` §9.4; `STD-000` Rule 18). `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE` and `AI_OUTPUT.CONTENT.QUALIFICATION_LOST` are additive, specifically-named codes this runtime maps from `R-BUS-005` and `R-BUS-006` respectively; every other business-rule violation uses the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED` — see [implementation-checklist.md](implementation-checklist.md) §5 for the exact mapping, following the same documented simplification precedent Agent 02/03 established for their own multi-branch rules.

---

**Package contents:** [system-prompt.md](system-prompt.md) · [input.schema.json](input.schema.json) · [output.schema.json](output.schema.json) · [interfaces.ts](interfaces.ts) · [validator.ts](validator.ts) · [examples/request.json](examples/request.json) · [examples/response.json](examples/response.json) · [examples/failure.json](examples/failure.json) · [test-cases.md](test-cases.md) · [implementation-checklist.md](implementation-checklist.md)

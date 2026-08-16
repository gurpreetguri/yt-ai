# AGT-03 — Fact Verification Agent

| Field | Value |
|---|---|
| Identifier | `AGT-03` |
| Agent name | `fact-verification-agent` |
| Agent version | `1.0.0` |
| Department | D1 — Content Intelligence (`ARC-001` §5.3) — completes D1's declared research-dossier deliverable |
| Functional class | **Judge** (`STD-000` §3.11) — conventional under Validation (`GDE-002` §7.3; no unusual-combination justification required) |
| Domain category | **Validation** (`GDE-002` §7.2) |
| Input schema | `fact-verification-agent-input/v1` (`1.0.0`) |
| Output schema | `fact-verification-agent-output/v1` (`1.0.0`) |
| Contract type | `REQUEST` in · `RESPONSE` out (`GDE-003` §3.3) |
| Determinism posture | Fully deterministic parameters (temperature `0`); the *content* graded is bounded entirely by the supplied research package |
| Stability | Stable |
| Owner | Platform Content Intelligence |

---

## 1. Purpose

Verifies claims against the supplied research evidence.

Each individually verifiable claim within a topic's research package is graded — using ONLY the evidence supplied — against a fixed, closed verification taxonomy. Research gathering is not part of this agent's responsibility (§3); it verifies evidence already gathered.

**Task framing.** The distinction that defines this agent's boundary:

- **Agent 02 asks:** *"I found evidence related to this claim."*
- **Agent 03 asks:** *"Does the supplied evidence support, contradict, or fail to establish this claim?"*

Agent 03 never invents new evidence, never treats its own model knowledge as evidence, and never performs research. It grades what it was given (§3).

## 2. Responsibilities

Every responsibility maps to at least one output field (`GDE-002` §4.2).

| # | Responsibility | Output field |
|---|---|---|
| R1 | Identify verifiable claims from the research package | `data.claims[].claimText`, `.claimType` |
| R2 | Evaluate each claim against supplied evidence | `data.claims[].supportingEvidenceIds`, `.contradictingEvidenceIds` |
| R3 | Determine whether evidence supports the claim | `data.claims[].verificationStatus` (`VERIFIED`, `PARTIALLY_SUPPORTED`) |
| R4 | Determine whether evidence contradicts the claim | `data.claims[].verificationStatus` (`CONTRADICTED`) |
| R5 | Detect insufficient evidence | `data.claims[].verificationStatus` (`INSUFFICIENT_EVIDENCE`) |
| R6 | Detect unresolved conflicts | `data.claims[].verificationStatus` (`CONFLICTING`), `data.conflicts[]` |
| R7 | Compare evidence from multiple sources | `data.claims[].corroboration` |
| R8 | Evaluate source quality | `data.claims[].verificationConfidence.sourceAuthority` |
| R9 | Evaluate source freshness; identify outdated claims | `data.claims[].freshnessAssessment`, `verificationStatus` (`OUTDATED`) |
| R10 | Identify unsupported claims | `data.claims[].verificationStatus` (`UNSUPPORTED`) |
| R11 | Identify overgeneralized claims | `data.claims[].verificationStatus` (`PARTIALLY_SUPPORTED`), `.limitations` |
| R12 | Identify claims requiring additional verification | `data.claims[].verificationStatus` (`INSUFFICIENT_EVIDENCE`), `.notesForDownstream` |
| R13 | Produce claim-level verification results | `data.claims[]` |
| R14 | Preserve source/evidence provenance | `data.claims[].supportingEvidenceIds`, `.contradictingEvidenceIds`, `.sourceIds` |
| R15 | Produce a structured verification summary | `data.verificationSummary` |
| R16 | Declare downstream usability | `data.claims[].downstreamSafety` |
| R17 | Declare assumptions and their basis | `data.assumptions` |
| R18 | Declare values that could not be determined | `data.declaredUnknowns` |
| R19 | Declare sufficiency of the supplied inputs | `data.inputSufficiency` |

## 3. Non-Responsibilities

Each exclusion names its owner (`GDE-002` §2.4, §4.2).

| Excluded capability | Owned by |
|---|---|
| Gathering new evidence, sources, or research materials | Agent 02 Research (frozen; this agent verifies what it already gathered) |
| Web search, document fetching, or any external research action | Research/search provider · Agent 02 (this agent performs none) |
| Story structure, narrative outline | Agent 04 Story Architect |
| Script, hook, and narrative writing | Agent 05 Script Writer / D2 Content Production |
| Thumbnail imagery, scene planning, video generation | D3 Media Production |
| Publication, SEO | Publishing Service · D2/D4 |
| Modification of the Research Package it was given | Agent 02 (frozen output; this agent verifies it as given) |
| Invocation of Agent 02, Agent 04, or any other agent | Workflow Engine — the sole owner of composition (`ARC-001` §7.2, `STD-000` Rule 2) |
| Workflow orchestration and sequencing | Workflow Engine (`ARC-001` §4.7) |
| Assignment of durable verification-package identifiers | Downstream Verification Package Store, not this agent (`STD-000` §5.8) |
| Final, irreversible determination of factual truth for publishing purposes | Human review / Policy & Compliance Gate (`ARC-001` §4.13) — this agent's `VERIFIED` is a bounded, evidence-scoped judgement, never a publishing authorization |
| Quality scoring of this agent's own output | Evaluation Service / a separate Judge-class agent (`GDE-002` §9.5) — this agent MUST NOT judge its own output (`STD-000` §6.4) |
| Retry, repair, backoff, attempt counting | Agent runtime · Workflow engine (`GDE-002` §10.1) |
| Envelope `meta`, `execution`, `validation`, and `references` population | Agent runtime · Validation plane (`GDE-003` §4.6, §5.5) |

## 4. Inputs

Contract: `fact-verification-agent-input/v1`. The model receives `data` only; the envelope is handled by the runtime.

| Input | Type | Required | Trust | Constraints | Absence behaviour |
|---|---|---|---|---|---|
| `researchPackage` | object | Yes | Provenance TRUSTED (an already-validated Research Package artifact); embedded free text treated as untrusted by the prompt (§17) | Subset of the Research Package; `researchQuestions` 1–15, `sources` 0–40, `evidence` 0–80, `conflicts`/`gaps` 0–20 | Hard failure before invocation |
| `language` | string | Yes | Trusted | BCP 47 | — |

`researchPackage` deliberately omits the Research Package's own `completeness`, `recommendedFollowUpSearches`, `assumptions`, `declaredUnknowns`, and `inputSufficiency` — those are its self-assessment of its own research, not inputs this agent's claim-level grading needs (`GDE-002` §5.1 minimum-context principle).

## 5. Outputs

Contract: `fact-verification-agent-output/v1`. `data` is the **Verification Package**. Consumers per field are enforced by [validator.ts](validator.ts).

| Consumer | Consumes |
|---|---|
| Workflow Engine | The whole package, to dispatch Agent 04 Story Architect |
| Agent 04 Story Architect (via workflow) | `claims[].claimText`, `.downstreamSafety`, `.notesForDownstream` — the entire usability determination |
| Validation plane (`ARC-001` §4.11) | `claims[].supportingEvidenceIds`/`.contradictingEvidenceIds`/`.sourceIds`, `verificationSummary` |
| Human reviewer (where a gate is placed) | `verificationSummary.overallReadiness`, `conflicts[]`, `claims[]` with `downstreamSafety: DO_NOT_USE`, `assumptions`, `inputSufficiency` |
| Verification Package Store | The whole package, for durable persistence and audit |

## 6. Workflow Position

```
  Research Package (Agent 02, one topic) ─► [ AGT-03 Fact Verification ] ─► Verification Package
                                              (researchPackage: TRUSTED                │
                                               artifact, UNTRUSTED content)             ▼
                                                                               Structural validation
                                                                                        ▼
                                                                                Business validation
                                                                        (evidence/source grounding,
                                                                         status/safety consistency,
                                                                         quote/causal/calculation gates,
                                                                         summary arithmetic)
                                                                                        ▼
                                                                       Workflow dispatches Agent 04
                                                                            Story Architect
```

Agent 03 runs on the **production loop**, immediately after Agent 02 gathers evidence (`ARC-001` §5.3). Its output is a set of **graded claims**, never a rewrite of the research and never a publishing authorization. Agent 03 does not decide "is this true in the world"; it decides "does the supplied evidence, examined under this contract, support this claim" (task framing, §1).

## 7. Downstream Consumers

Direct consumers: the Workflow Engine (which dispatches Agent 04 from `data`), the Validation Engine, and any human reviewer a workflow chooses to gate on `verificationSummary.overallReadiness: false` or a material count of `downstreamSafety: DO_NOT_USE` claims. `topicId` keeps every verification attributable to the topic that motivated it (`GDE-003` §5.4).

## 8. Claim Model

Each claim (`data.claims[]`) states exactly one independently verifiable proposition (§7 below), never a compound sentence. Every claim carries: `claimId`, `claimText`, `claimType`, `researchQuestionId`, `supportingEvidenceIds`/`contradictingEvidenceIds`/`sourceIds` (provenance), `verificationStatus`, `verificationConfidence` (§10), `rationale`, `corroboration` (§11), `freshnessAssessment` (§12), `limitations`, `downstreamSafety` (§16), and type-conditional fields (`quoteProvenance` for `QUOTE`, `causalAnalysis` for `CAUSAL_CLAIM`, `calculationCheck` where arithmetic is involved).

## 9. Claim Types

Closed taxonomy: `STATISTIC` · `DATE` · `DEFINITION` · `TECHNICAL_FACT` · `PRODUCT_FACT` · `COMPARISON` · `PRICE` · `REGULATION` · `EVENT` · `HISTORICAL_FACT` · `QUOTE` · `CAUSAL_CLAIM` · `OPINION` · `FORECAST` · `OTHER`.

**`OPINION` and `FORECAST` are never ordinary factual claims** (`R-BUS-018`): their `verificationStatus` is always `NOT_VERIFIABLE`, regardless of how much supporting material exists — evidence can show that an opinion or a forecast *was stated*, never that it is *true*.

## 10. Verification Statuses

Eight closed, non-overlapping statuses (system prompt §4b defines each exactly):

`VERIFIED` · `PARTIALLY_SUPPORTED` · `UNSUPPORTED` · `CONTRADICTED` · `INSUFFICIENT_EVIDENCE` · `CONFLICTING` · `OUTDATED` · `NOT_VERIFIABLE`.

`UNSUPPORTED` (zero evidence found) and `INSUFFICIENT_EVIDENCE` (evidence exists but is too weak) are deliberately distinct (`R-BUS-012`, `R-BUS-022`) — collapsing them would hide the difference between "nothing was found" and "something was found but it doesn't hold up," which downstream reviewers need to distinguish.

## 11. Corroboration

`data.claims[].corroboration` distinguishes `independentSourceIds` from `derivativeSourceIds` — two copies, syndications, or restatements of the same underlying origin are never both counted as independent (`R-BUS-019`; prompt rule 16). This mirrors Agent 02's own `sourceQuality.corroboration` dimension, applied at the claim level rather than the single-source level.

## 12. Freshness

`data.claims[].freshnessAssessment` records whether a claim is time-sensitive (prices, regulations, software versions, product specifications, current events, policies, statistics, availability, rankings, market information) and a `freshnessConcern` (`NONE`/`MINOR`/`MODERATE`/`SEVERE`). `OUTDATED` requires a `MODERATE` or `SEVERE` concern (`R-BUS-023`) — a source's plausibility is never a substitute for checking its date, and a newer source is never assumed more authoritative purely by virtue of being newer (prompt rule 22).

## 13. Causal Claims

`claimType: CAUSAL_CLAIM` requires `causalAnalysis` (`R-BUS-014`). Correlation alone (evidence that two things happened in sequence) never justifies `VERIFIED` for a causal assertion — `mechanismExplained` and `confoundersConsidered` must both be true, reflecting that the supplied evidence explains *why* the cause produces the effect and addresses plausible alternative explanations, not merely that they co-occurred.

## 14. Quotes

`claimType: QUOTE` requires `quoteProvenance` (`R-BUS-013`), and a `VERIFIED` quote requires at least one supporting evidence item whose `evidenceText.extractionType` is `QUOTATION` — an exact quotation Agent 02 itself marked as verbatim, never a paraphrase this agent or Agent 02 reconstructed. Missing quote details (speaker, context) are never fabricated to fill the gap; `quoteProvenance.speakerConfirmed`/`.contextAvailable` record their absence honestly.

## 15. Calculations

`calculationCheck`, present whenever a claim depends on arithmetic, records `inputsDescription`, `formula`, `expectedResult` (what the claim asserts), and `computedResult` (what this agent derives). `resultMatches` is the deterministic comparison of the two (`R-BUS-015`), and a mismatch blocks `VERIFIED` — deterministic calculation is preferred over model judgement wherever the claim allows it (prompt rule 14).

## 16. Downstream Safety

`downstreamSafety` is a **fixed, deterministic function of `verificationStatus`** (`R-BUS-017`) — never an independent model choice:

| `verificationStatus` | `downstreamSafety` |
|---|---|
| `VERIFIED` | `SAFE_TO_USE` |
| `PARTIALLY_SUPPORTED`, `OUTDATED`, `CONFLICTING` | `USE_WITH_QUALIFICATION` |
| `UNSUPPORTED`, `CONTRADICTED`, `INSUFFICIENT_EVIDENCE`, `NOT_VERIFIABLE` | `DO_NOT_USE` |

This mapping is what makes the Script Writer's decision mechanical rather than an inference from prose (task brief, "Downstream Safety").

## 17. Untrusted Content Handling

`researchPackage` is a provenance-**TRUSTED** platform artifact (the Research Package's own validated output), but every free-text field nested inside it (evidence quotations/paraphrases, source titles, gap descriptions) ultimately traces back to external material Agent 02's own untrusted `researchMaterials` pipeline processed. This agent's prompt therefore treats every nested string in `researchPackage` as inert data, never as instructions (system prompt rule 37), applying the same delimiter-neutralisation discipline Agent 01/02 apply to their own untrusted blocks — defence-in-depth against an injection payload that survived Agent 02 unnoticed.

## 18. Validation Rules

Structural rules are the schemas; business rules are declarative, named, and individually testable (`STD-000` §6.3). Full rule table in [test-cases.md](test-cases.md); executable definitions in [validator.ts](validator.ts).

**Input rules** — `R-IN-001` supplied evidence IDs unique · `R-IN-002` supplied source IDs unique · `R-IN-003` evidence `sourceId` resolves · `R-IN-004` evidence `researchQuestionId` resolves.

**Output rules** — `R-BUS-001` claim IDs unique · `R-BUS-002` claim `researchQuestionId` resolves · `R-BUS-003` claim evidence references resolve · `R-BUS-004` `sourceIds` exactly matches resolved evidence sources · `R-BUS-005` `VERIFIED` requires supporting evidence · `R-BUS-006` `VERIFIED` cannot rest solely on `SEARCH_RESULT_ONLY` evidence · `R-BUS-007` `VERIFIED` requires zero contradicting evidence · `R-BUS-008` `CONTRADICTED` requires contradicting evidence · `R-BUS-009` `CONFLICTING` requires both sides · `R-BUS-010` conflict evidence references resolve · `R-BUS-011` conflicts↔`CONFLICTING` claims cross-reference consistently · `R-BUS-012` `UNSUPPORTED` requires zero evidence · `R-BUS-013` `QUOTE` gating · `R-BUS-014` `CAUSAL_CLAIM` gating · `R-BUS-015` calculation consistency · `R-BUS-016` summary tallies match · `R-BUS-017` `downstreamSafety` mapping · `R-BUS-018` `OPINION`/`FORECAST` → `NOT_VERIFIABLE` · `R-BUS-019` corroboration set consistency · `R-BUS-020` declared-unknown paths address absent fields · `R-BUS-021` no placeholder residue · `R-BUS-022` `INSUFFICIENT_EVIDENCE` requires some evidence · `R-BUS-023` `OUTDATED` gating.

## 19. Failure Conditions

Three distinct outcomes (`GDE-002` §11.2). Codes are registered (`STD-000` §8.4).

| Condition | Outcome | Code | Category | Severity | Retryable |
|---|---|---|---|---|---|
| A required input field is missing | Typed failure | `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | `ERROR` | No |
| An enumerated input value is not permitted | Typed failure | `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | `ERROR` | No |
| Two supplied evidence items share an `evidenceId` | Typed failure | `VALIDATION.INPUT.DUPLICATE_EVIDENCE_ID` | `VALIDATION` | `ERROR` | No |
| Two supplied sources share a `sourceId` | Typed failure | `VALIDATION.INPUT.DUPLICATE_SOURCE_ID` | `VALIDATION` | `ERROR` | No |
| Supplied evidence cites a source/question never supplied | Typed failure | `VALIDATION.INPUT.EVIDENCE_REFERENCE_UNRESOLVABLE` | `VALIDATION` | `ERROR` | No |
| Model emitted non-JSON or unparseable output | Typed failure | `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output violated the output schema | Typed failure | `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A claim's evidence references cite something never supplied | Typed failure | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A claim's provenance cites evidence/sources inconsistent with the supplied package | Typed failure | `AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE` | `AI_OUTPUT` | `ERROR` | No — repairable |
| `VERIFIED`/`CONTRADICTED`/`CONFLICTING` asserted without the evidence the rule requires | Typed failure | `AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output was truncated by a length limit | Typed failure | `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A named business rule failed against the output | Typed failure | `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Request asks for work outside AGT-03's mandate | **Refusal** | `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | `ERROR` | **No** |
| Instruction-shaped content detected inside a data block | **Refusal** | `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | `FATAL` | **No — escalate** |
| Evidence is thin, weak, or absent for most claims | **Declared unknown** — `status: SUCCESS` | — | — | — | — |

A mostly-`UNSUPPORTED`/`INSUFFICIENT_EVIDENCE` verification package is **not** a failure: it is the correct, honest output when the supplied research is thin (`GDE-003` §9.4; `STD-000` Rule 18). `AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE` and `AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY` are additive, specifically-named codes this runtime maps from particular `R-BUS-*` rules (`R-BUS-003`/`R-BUS-004` and `R-BUS-005`–`R-BUS-009` respectively); every other business-rule violation uses the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED` — see `research.errors.ts`'s documented precedent in [Agent 02](../agent-02-research/README.md) §18 for why a ruleId-keyed map cannot always reproduce every nuance of free-text documentation, and [implementation-checklist.md](implementation-checklist.md) §5 for this agent's exact mapping.

---

**Package contents:** [system-prompt.md](system-prompt.md) · [input.schema.json](input.schema.json) · [output.schema.json](output.schema.json) · [interfaces.ts](interfaces.ts) · [validator.ts](validator.ts) · [examples/request.json](examples/request.json) · [examples/response.json](examples/response.json) · [examples/failure.json](examples/failure.json) · [test-cases.md](test-cases.md) · [implementation-checklist.md](implementation-checklist.md)

# AGT-02 — Research Agent

| Field | Value |
|---|---|
| Identifier | `AGT-02` |
| Agent name | `research-agent` |
| Agent version | `1.0.0` |
| Department | D1 — Content Intelligence (`ARC-001` §5.3) |
| Functional class | **Extractor** (`STD-000` §3.11) — conventional under Research (`GDE-002` §7.3; no unusual-combination justification required) |
| Domain category | **Research** (`GDE-002` §7.2) |
| Input schema | `research-agent-input/v1` (`1.0.0`) |
| Output schema | `research-agent-output/v1` (`1.0.0`) |
| Contract type | `REQUEST` in · `RESPONSE` out (`GDE-003` §3.3) |
| Determinism posture | Fully deterministic parameters (temperature `0`); the *content* extracted is bounded entirely by the supplied materials |
| Stability | Stable |
| Owner | Platform Content Intelligence |

---

## 1. Purpose

Gather, organise, and assess structured research evidence for a topic opportunity selected by Agent 01, so that Agent 03 Fact Verification has a grounded, provenance-complete basis to determine what is actually true.

**Task framing.** Three D1 agents ask three different questions about the same subject, and the boundary between them is the platform's constitution for this department:

- Agent 01 asks: *is this topic worth researching?*
- **Agent 02 asks: *what information and evidence can we gather about this topic?***
- Agent 03 asks: *which claims are actually verified?*

Agent 02 must never become the Fact Verification Agent. It never states that a claim is definitively true. It states evidence, its strength, and a bounded verification status (§3, §10).

## 2. Responsibilities

Every responsibility maps to at least one output field (`GDE-002` §4.2).

| # | Responsibility | Output field |
|---|---|---|
| R1 | Understand the research objective from the topic opportunity | `data.researchQuestions[]` (derivation basis) |
| R2 | Identify structured research questions before collecting evidence | `data.researchQuestions[].questionText`, `.questionType` |
| R3 | Identify claims and questions requiring evidence | `data.researchQuestions[]`, `data.evidence[].claim` |
| R4 | Organise search results and fetched documents into sources | `data.sources[]` |
| R5 | Collect source metadata | `data.sources[].publisher`, `.author`, `.language`, `.publishedAt`, `.lastUpdatedAt`, `.accessedAt` |
| R6 | Identify source type | `data.sources[].sourceType` |
| R7 | Identify source authority and reliability indicators | `data.sources[].sourceQuality` |
| R8 | Capture URLs and references | `data.sources[].url`, `.derivedFromMaterialId`, `.derivedFromExistingSourceRefId` |
| R9 | Capture evidence snippets and quotations where contractually appropriate | `data.evidence[].evidenceText` |
| R10 | Associate evidence with research questions and sources | `data.evidence[].researchQuestionId`, `.sourceId` |
| R11 | Distinguish search results from actually-read sources | `data.sources[].sourceStatus` |
| R12 | Identify conflicting sources | `data.conflicts[]` |
| R13 | Identify information gaps | `data.gaps[]` |
| R14 | Identify stale information | `data.gaps[]` (`STALE_INFORMATION`), `data.sources[].sourceQuality.freshness` |
| R15 | Preserve provenance for every finding | `data.sources[].derivedFromMaterialId` / `.derivedFromExistingSourceRefId`, `data.evidence[].sourceId` |
| R16 | Produce a research completeness assessment | `data.completeness` |
| R17 | Recommend further research where a gap is closable | `data.recommendedFollowUpSearches[]` |
| R18 | Produce structured research findings | `data.researchQuestions`, `data.sources`, `data.evidence`, `data.conflicts`, `data.gaps` |
| R19 | Declare assumptions and their basis | `data.assumptions` |
| R20 | Declare values that could not be determined | `data.declaredUnknowns` |
| R21 | Declare sufficiency of the supplied inputs | `data.inputSufficiency` |

## 3. Non-Responsibilities

Each exclusion names its owner (`GDE-002` §2.4, §4.2).

| Excluded capability | Owned by |
|---|---|
| Final determination of whether a claim is true | Agent 03 Fact Verification |
| Performing network requests, web searches, or document fetches | Research/search provider, mediated by the workflow — this agent organises supplied materials only (§13) |
| Script, hook, and narrative writing | D2 Content Production |
| Thumbnail imagery and scene planning | D3 Media Production |
| Video asset generation | D3 Media Production |
| Final SEO optimization | D2 Content Production (SEO metadata agent) |
| Publication scheduling, quota arbitration | Publishing Service · Quota Ledger (`ARC-001` §4.19) |
| Modification of the Topic Opportunity it was given | Agent 01 (frozen output; this agent researches it as given) |
| Modification of the Strategy Manifest | Strategy Store · Agent 00 (frozen; `STD-000` Rule 2 — this agent never reads or calls it) |
| Invocation of Agent 01, Agent 03, or any other agent | Workflow Engine — the sole owner of composition (`ARC-001` §7.2, `STD-000` Rule 2) |
| Workflow orchestration and sequencing | Workflow Engine (`ARC-001` §4.7) |
| Assignment of durable source or research-package identifiers | Downstream Research Package Store, not this agent (`STD-000` §5.8) |
| Duplicate/originality checking of the topic itself | Agent 01 (§9), Originality Service (`ARC-001` §4.12) |
| Quality scoring of this agent's own output | Evaluation Service / Judge-class agent (`GDE-002` §9.5) |
| Policy and compliance clearance | Policy & Compliance Gate (`ARC-001` §4.13) |
| Retry, repair, backoff, attempt counting | Agent runtime · Workflow engine (`GDE-002` §10.1) |
| Envelope `meta`, `execution`, `validation`, and `references` population | Agent runtime · Validation plane (`GDE-003` §4.6, §5.5) |

## 4. Inputs

Contract: `research-agent-input/v1`. The model receives `data` only; the envelope is handled by the runtime.

| Input | Type | Required | Trust | Constraints | Absence behaviour |
|---|---|---|---|---|---|
| `topicOpportunity` | object | Yes | Trusted | Subset of Agent 01's output only (`GDE-002` §5.4); never the full Topic Opportunity Set | — |
| `researchConstraints` | object | No | Trusted | `minSources` <= `maxSources`; source types drawn from the closed taxonomy | No constraint beyond `requestedDepth`'s default posture |
| `existingResearch` | object | No | Trusted | Prior vetted sources, for extension rather than re-derivation | This is the first research pass for the topic |
| `researchMaterials` | array | Yes | **UNTRUSTED** | 0–40 items; each item's `content` ≤ 6000 code points | Empty array is valid; recorded as `MATERIALS_INSUFFICIENT` gaps, never fabricated |
| `requestedDepth` | string | Yes | Trusted | `SURFACE` \| `STANDARD` \| `DEEP` | — |
| `language` | string | Yes | Trusted | BCP 47 | — |

## 5. Outputs

Contract: `research-agent-output/v1`. `data` is the **Research Package** — the D1 research dossier deliverable (`ARC-001` §5.3, §4.3). Consumers per field are enforced by [validator.ts](validator.ts).

| Consumer | Consumes |
|---|---|
| Workflow Engine | The whole package, to dispatch the Agent 03 Fact Verification invocation |
| Agent 03 Fact Verification (via workflow) | `researchQuestions[]`, `sources[]`, `evidence[]`, `conflicts[]` — the entire evidentiary basis for verification |
| Validation plane (`ARC-001` §4.11) | `sources[].derivedFromMaterialId` / `.derivedFromExistingSourceRefId`, `evidence[].sourceId` / `.researchQuestionId`, `completeness` |
| Research/search provider (via workflow) | `recommendedFollowUpSearches[]`, to schedule further searches on later iterations |
| Human reviewer (where a gate is placed) | `completeness.readyForFactVerification`, `gaps[]`, `conflicts[]`, `assumptions`, `inputSufficiency` |
| Research Package Store | The whole package, for durable persistence and future `existingResearch` reuse |

## 6. Workflow Position

```
  Topic Opportunity (Agent 01, one entry) ───┐
  Research constraints ───────────────────────┤
  Existing research (prior pass) ─────────────┼─► [ AGT-02 Research ] ─► Research Package
  Research materials (search/fetch provider) ─┘   (untrusted)                  │
                                                                                 ▼
                                                                       Structural validation
                                                                                 ▼
                                                                        Business validation
                                                                (source/evidence grounding,
                                                                 completeness arithmetic,
                                                                 search-result/source distinction)
                                                                                 ▼
                                                               Workflow dispatches Agent 03
                                                                    Fact Verification
```

Agent 02 runs on the **production loop**, immediately after Agent 01 selects and prioritises a topic (`ARC-001` §5.3). Its output is a set of **evidence**, never verified facts — Agent 03 and later stages decide what is actually true. Agent 02 does not decide "what is true"; it decides "what can be found, and how well-supported is it" (task framing, §1).

## 7. Downstream Consumers

Direct consumers: the Workflow Engine (which dispatches the Agent 03 Fact Verification invocation from `data`), the Validation Engine, the workflow's research/search provider (as a consumer of `recommendedFollowUpSearches`), and any human reviewer a workflow chooses to gate on `completeness.readyForFactVerification: false` or `conflicts[]` of material severity. `topicId` keeps every finding attributable to the topic that motivated it (`GDE-003` §5.4).

## 8. Research Question Model

Research questions are formed **before** evidence is collected (README §2 R2; prompt rule 1) — never derived retroactively to match whatever was found. Each question carries a closed `questionType` naming the kind of gap it addresses:

| `questionType` | Meaning |
|---|---|
| `CORE_CLAIM` | The central assertion the topic's angle depends on |
| `SUPPORTING_FACT` | A fact that substantiates the core claim without being the claim itself |
| `STATISTIC` | A number requiring a resolvable, dated source |
| `DATE_OR_TIMELINE` | When something happened, changed, or takes effect |
| `DEFINITION` | What a term or mechanism precisely means |
| `OFFICIAL_POSITION` | What an authoritative body has stated |
| `COMPETING_EXPLANATION` | An alternative account that must be represented, not suppressed |
| `RECENT_CHANGE` | What has changed since the general understanding of the subject formed |
| `LIMITATION_OR_EXCEPTION` | Where the core claim does not hold |
| `OTHER` | Any question not covered by the above |

Not every category applies to every topic (prompt rule 15); an empty category is not an error.

## 9. Source Model

Each source carries structured metadata and a closed `sourceType` taxonomy — not all types carry equal authority (`STD-000` §6.4; prompt rule 20):

`OFFICIAL_DOCUMENTATION` · `GOVERNMENT` · `ACADEMIC_PAPER` · `STANDARDS_ORGANIZATION` · `COMPANY` · `PRIMARY_SOURCE` · `REPUTABLE_NEWS` · `INDUSTRY_PUBLICATION` · `EXPERT_SOURCE` · `SECONDARY_SOURCE` · `COMMUNITY_DISCUSSION` · `SEARCH_RESULT` · `OTHER`

Every source declares `publisher`, `author`, `language`, `publishedAt`, `lastUpdatedAt` where available, and `accessedAt` always (when the underlying material was retrieved). Absent fields are omitted, never defaulted (`STD-000` Rule 18).

## 10. Evidence Model

Each evidence item traces a `claim` to exactly one `sourceId` and exactly one `researchQuestionId` (`R-BUS-004`, `R-BUS-005`). `evidenceText` is a discriminated union on `extractionType`:

- `QUOTATION` — the text appears verbatim in the cited material.
- `PARAPHRASE` — the text is this agent's restatement, used whenever exact quotation is unavailable. Never labelled as a quotation (prompt rule 7).

`evidenceStrength` (`STRONG` \| `MODERATE` \| `WEAK` \| `ANECDOTAL`) and `verificationStatus` (`REQUIRES_VERIFICATION` \| `CORROBORATED` \| `CONFLICTING` \| `UNRESOLVED`) are this agent's own bounded judgements — never a final determination (§3). `verificationStatus` is deliberately not named "verified" or "true": Agent 03 owns that word.

## 11. Conflicting Sources

Disagreement between sources is represented explicitly, never silently resolved by picking a side (`STD-000` §2.13). A `conflict` names the research question at stake, cites at least two disagreeing, distinct, resolving `evidence` items (`R-BUS-009` — at least two entries, no evidence item cited twice within the same conflict, every cited id resolves), each of which must itself answer the same research question the conflict names (`R-BUS-019`), and may offer a `possibleReason` — a hypothesis, never a resolution. Agent 03 resolves factual status; this agent only surfaces the disagreement. Structural eligibility is all `validator.ts` checks — it never judges whether two evidence items *genuinely* disagree, only that a cited conflict is well-formed enough to be meaningful.

## 12. Information Gaps and Staleness

A `researchGap` names what is missing and why, using a closed `gapType`: `UNANSWERED_QUESTION`, `INSUFFICIENT_SOURCES`, `WEAK_SOURCES_ONLY`, `STALE_INFORMATION`, `NO_PRIMARY_SOURCE`, `CONFLICTING_UNRESOLVED`, `OUT_OF_SCOPE_FOR_SUPPLIED_MATERIALS`. A gap-heavy, mostly-`UNANSWERED` package produced from sparse materials is the correct, honest output — never a reason to fabricate coverage (`STD-000` Rule 18; system prompt §6).

## 13. Search Result vs. Source

The pipeline this agent enforces:

```
SEARCH_RESULT  ─────►  SOURCE_FETCHED  ─────►  EVIDENCE_EXTRACTED
(snippet only)         (content read)          (claim traced to text)
```

An input `researchMaterial` carries `materialKind`: `SEARCH_RESULT` (a snippet, never fetched) or `FETCHED_DOCUMENT` (the provider retrieved the actual content). This propagates to the output source's `sourceStatus`: `SEARCH_RESULT_ONLY` or `FETCHED` (`R-BUS-006` grounding; prompt rule 5), and `R-BUS-018` deterministically enforces that the propagation is correct — a source grounded in a `SEARCH_RESULT` material MUST declare `sourceStatus: SEARCH_RESULT_ONLY`, and a source grounded in a `FETCHED_DOCUMENT` material MUST declare `sourceStatus: FETCHED`; a `SEARCH_RESULT` can never be upgraded to `FETCHED`. A search snippet is never represented as fully verified source evidence (`STD-000` §2.13): `R-BUS-007` blocks `STRONG` evidence and `R-BUS-008` blocks `CORROBORATED` verification status from any `SEARCH_RESULT_ONLY` source. Search and fetch are deliberately performed **outside this agent's invocation**, by the workflow's research/search provider — see §16.

## 14. Source Quality

Six explicit, independently-scored dimensions per source (`data.sources[].sourceQuality`) — no single unexplained authority number (`STD-000` §6.4):

| Dimension | `0.0` means | `1.0` means |
|---|---|---|
| `authority` | No institutional backing, unverifiable origin | The definitive authority for this claim (original documentation, government registry, standards body, or the primary party the claim is about) |
| `relevance` | Tangential to the research question it is attached to | Directly and specifically addresses it |
| `freshness` | Stale relative to the topic's rate of change | Current as of `accessedAt`, or the topic is evergreen |
| `primarySourceStatus` | A secondary rehash of someone else's reporting | The original party, document, or dataset the claim is about |
| `specificity` | Vague, general-purpose content | Specific to the exact claim, figure, or date cited |
| `corroboration` | The only source found for this material | Independently corroborated by another supplied source of a different `sourceType` |

Every score carries a rationale naming the specific evidence behind it (prompt rule 8) — the methodology is never hidden behind a bare number.

## 15. Research Completeness

`data.completeness` is a structured assessment, never a single unexplained score (`STD-000` §6.4):

- `totalQuestions`, `answeredCount`, `partiallyAnsweredCount`, `unansweredCount`, `conflictingCount` — deterministic tallies, cross-checked by `R-BUS-014` against `researchQuestions[].status`.
- `weakOrIndirectSourceIds` — sources this agent judges weak or indirect for the claims they support.
- `readyForFactVerification` — a `MODEL_ASSESSED` judgement (`STD-000` §6.5) with `readinessRationale`: is there enough structured evidence to attempt fact verification? Not a guarantee every claim will verify.

## 16. Search / Tool Boundary

This agent does not hold network access, a search API, or a browsing tool, and the prompt explicitly forbids claiming to have used one (system prompt rule 35). Search and document retrieval are performed by a **provider-neutral research/search capability** external to this contract, invoked by the workflow ahead of this agent's dispatch; the results arrive as `researchMaterials`. Later implementations may back that capability with web search, browser tools, official-documentation APIs, databases, or academic search — none of that choice is visible to, or a dependency of, this agent's contract (`ARC-001` §2.2, Replaceability). This agent's only channel for requesting *more* search is `recommendedFollowUpSearches`, a declared output the workflow may act on (`STD-000` §3.10, Rule 4) — never a call this agent makes itself.

## 17. Validation Rules

Structural rules are the schemas; business rules are declarative, named, and individually testable (`STD-000` §6.3). Full rule table in [test-cases.md](test-cases.md); executable definitions in [validator.ts](validator.ts).

**Input rules** — `R-IN-001` `minSources` <= `maxSources` · `R-IN-002` `researchMaterials` `materialId` values unique · `R-IN-003` `existingResearch.sources` `existingSourceRefId` values unique · `R-IN-004` untrusted material bounds (count and per-item length).

**Output rules** — `R-BUS-001` research question IDs unique · `R-BUS-002` source IDs unique · `R-BUS-003` evidence IDs unique · `R-BUS-004` evidence `sourceId` resolves · `R-BUS-005` evidence `researchQuestionId` resolves · `R-BUS-006` every source grounded in exactly one supplied provenance reference · `R-BUS-007` `SEARCH_RESULT_ONLY` sources cannot support `STRONG` evidence · `R-BUS-008` `SEARCH_RESULT_ONLY` sources cannot yield `CORROBORATED` evidence · `R-BUS-009` conflicts cite >= 2 distinct, resolving evidence items (no evidence item cited twice within the same conflict) · `R-BUS-010` conflict `researchQuestionId` resolves · `R-BUS-011` gap `researchQuestionId`, when present, resolves · `R-BUS-012` answered/partially-answered/conflicting questions carry evidence · `R-BUS-013` unanswered questions carry no evidence · `R-BUS-014` completeness counts match the actual tallies · `R-BUS-015` declared-unknown paths address absent fields · `R-BUS-016` no placeholder residue · `R-BUS-017` every question addressed by evidence or a gap · `R-BUS-018` `sourceStatus` matches the `materialKind` of the material it is grounded in (§13) · `R-BUS-019` every conflict's cited evidence answers the conflict's own `researchQuestionId`.

## 18. Failure Conditions

Three distinct outcomes (`GDE-002` §11.2). Codes are registered (`STD-000` §8.4).

| Condition | Outcome | Code | Category | Severity | Retryable |
|---|---|---|---|---|---|
| A required input field is missing | Typed failure | `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | `ERROR` | No |
| An enumerated input value is not permitted | Typed failure | `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | `ERROR` | No |
| `minSources` exceeds `maxSources` | Typed failure | `VALIDATION.INPUT.SOURCE_COUNT_BOUNDS_CONTRADICTORY` | `VALIDATION` | `ERROR` | No |
| Untrusted material count or length exceeds declared bounds | Typed failure | `VALIDATION.INPUT.MATERIAL_BOUNDS_EXCEEDED` | `VALIDATION` | `ERROR` | No |
| Two research materials share a `materialId` | Typed failure | `VALIDATION.INPUT.DUPLICATE_MATERIAL_ID` | `VALIDATION` | `ERROR` | No |
| Two `existingResearch` sources share an `existingSourceRefId` | Typed failure | `VALIDATION.INPUT.DUPLICATE_EXISTING_SOURCE_ID` | `VALIDATION` | `ERROR` | No |
| Model emitted non-JSON or unparseable output | Typed failure | `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output violated the output schema | Typed failure | `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output asserted a claim absent from the supplied materials | Typed failure | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A source cites a `materialId`/`existingSourceRefId` never supplied | Typed failure | `AI_OUTPUT.CONTENT.FABRICATED_SOURCE` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A quotation does not appear verbatim in its cited material | Typed failure | `AI_OUTPUT.CONTENT.FABRICATED_QUOTATION` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output was truncated by a length limit | Typed failure | `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A named business rule failed against the output | Typed failure | `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Request asks for work outside AGT-02's mandate | **Refusal** | `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | `ERROR` | **No** |
| Instruction-shaped content detected inside a data block | **Refusal** | `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | `FATAL` | **No — escalate** |
| Materials are sparse, absent, or insufficient to answer a question | **Declared unknown / gap** — `status: SUCCESS` | — | — | — | — |

A declared unknown or a gap is **not** a failure: the field is recorded in `data.declaredUnknowns` or `data.gaps` and the research package is still emitted (`GDE-003` §9.4). The agent never invents, estimates, or defaults a value (`STD-000` Rule 18). `AI_OUTPUT.CONTENT.FABRICATED_QUOTATION` is only mechanically detectable by `validator.ts` when a quotation's cited source was never fetched (`sourceStatus: SEARCH_RESULT_ONLY`, caught by `R-BUS-007`/`R-BUS-008`); verifying that a `FETCHED` source's quotation is actually verbatim in its material content is a consistency-stage check, not a deterministic business rule — see [test-cases.md](test-cases.md) case `25-B`.

---

**Package contents:** [system-prompt.md](system-prompt.md) · [input.schema.json](input.schema.json) · [output.schema.json](output.schema.json) · [interfaces.ts](interfaces.ts) · [validator.ts](validator.ts) · [examples/request.json](examples/request.json) · [examples/response.json](examples/response.json) · [examples/failure.json](examples/failure.json) · [test-cases.md](test-cases.md) · [implementation-checklist.md](implementation-checklist.md)

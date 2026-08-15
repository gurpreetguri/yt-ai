# AGT-01 — Topic Discovery Agent

| Field | Value |
|---|---|
| Identifier | `AGT-01` |
| Agent name | `topic-discovery-agent` |
| Agent version | `1.0.0` |
| Department | D1 — Content Intelligence (`ARC-001` §5.3) |
| Functional class | **Generator** (`STD-000` §3.11) — unusual-but-justified under Research (`GDE-002` §7.3; see §1 below) |
| Domain category | **Research** (`GDE-002` §7.2) |
| Input schema | `topic-discovery-agent-input/v1` (`1.0.0`) |
| Output schema | `topic-discovery-agent-output/v1` (`1.0.0`) |
| Contract type | `REQUEST` in · `RESPONSE` out (`GDE-003` §3.3) |
| Determinism posture | Bounded creative variability in ideation; structurally deterministic in shape and score arithmetic |
| Stability | Stable |
| Owner | Platform Content Intelligence |

---

## 1. Purpose

Generate, score, and rank candidate video topics that fit the channel's approved Strategy Manifest, so that the research stage knows which topics are worth investigating and in what order.

**On functional class.** `GDE-002` §7.3 classifies Research-category agents as typically Extractor or Transformer, and lists Generator as unusual — requiring justification. This agent claims Generator because topic ideation is a creative task: `GDE-004` §4.5 names "regression to generic output" as Generation's distinctive risk, and a zero-temperature Extractor posture would deterministically surface the same handful of obvious topics on every invocation — defeating the differentiation responsibility this agent exists to serve (`STD-000` §1.5 makes differentiation a monetization-relevant engineering requirement, not a preference). The score dimensions the agent also emits are `MODEL_ASSESSED` judgements about the *generated candidates*, which is distinct from an agent assessing its own output quality (`STD-000` §6.4 forbids the latter; scoring a topic's merit is this agent's declared job). See §17 (Future Improvements) in [system-prompt.md](system-prompt.md) design notes for the known tension this combination creates and the deferred mitigation.

## 2. Responsibilities

Every responsibility maps to at least one output field (`GDE-002` §4.2).

| # | Responsibility | Output field |
|---|---|---|
| R1 | Generate candidate video topics | `data.topics[].title`, `data.topics[].angle` |
| R2 | Align topics with channel strategy | `data.topics[].pillarKey` |
| R3 | Align topics with target audience | `data.topics[].targetPersonaKey`, `data.topics[].audienceIntent` |
| R4 | Use approved content pillars | `data.topics[].pillarKey` |
| R5 | Evaluate audience intent | `data.topics[].audienceIntent`, `data.topics[].scoreBreakdown.audienceIntent` |
| R6 | Evaluate strategic fit | `data.topics[].scoreBreakdown.strategicFit` |
| R7 | Evaluate differentiation | `data.topics[].scoreBreakdown.differentiation` |
| R8 | Evaluate timeliness | `data.topics[].scoreBreakdown.timeliness`, `data.topics[].timelinessWindow` |
| R9 | Evaluate evergreen potential | `data.topics[].scoreBreakdown.evergreenPotential` |
| R10 | Evaluate production feasibility | `data.topics[].scoreBreakdown.productionFeasibility`, `data.topics[].productionConsiderations` |
| R11 | Evaluate growth potential | `data.topics[].scoreBreakdown.growthPotential` |
| R12 | Detect exact duplicates | `data.topics[].duplicateStatus` (`EXACT_DUPLICATE`) |
| R13 | Detect near-duplicate topics | `data.topics[].duplicateStatus` (`NEAR_DUPLICATE`, `SAME_SUBJECT_DIFFERENT_ANGLE`, `TRIVIAL_WORDING_VARIANT`) |
| R14 | Rank topic opportunities | `data.topics[].rank` |
| R15 | Assign transparent score dimensions | `data.topics[].scoreBreakdown`, `data.topics[].overallScore` |
| R16 | Identify research priority | `data.topics[].researchPriority` |
| R17 | Identify topic risks | `data.topics[].risks` |
| R18 | Produce structured topic opportunities | `data.topics`, `data.setKind` |
| R19 | Classify topic type | `data.topics[].topicType` |
| R20 | Declare assumptions and their basis | `data.assumptions` |
| R21 | Declare values that could not be determined | `data.declaredUnknowns` |
| R22 | Declare sufficiency of the supplied inputs | `data.inputSufficiency` |

## 3. Non-Responsibilities

Each exclusion names its owner (`GDE-002` §2.4, §4.2).

| Excluded capability | Owned by |
|---|---|
| Deep research, source gathering, fact establishment | D1 Content Intelligence — research dossier (Agent 02 Research) |
| Fact verification of any claim in a topic's title, angle, or rationale | Agent 02 Research / D2 factual verification |
| Script, hook, and narrative writing | D2 Content Production |
| Thumbnail imagery and scene planning | D3 Media Production |
| Video asset generation | D3 Media Production |
| Publication scheduling, quota arbitration | Publishing Service · Quota Ledger (`ARC-001` §4.19) |
| Final SEO optimization of titles, descriptions, or tags for a specific video | D2 Content Production (SEO metadata agent) |
| Modification of the Strategy Manifest | Strategy Store · Agent 00 (frozen; `STD-000` Rule 2 — this agent never calls it) |
| Invocation of Agent 00, Agent 02, or any other agent | Workflow Engine — the sole owner of composition (`ARC-001` §7.2, `STD-000` Rule 2) |
| Workflow orchestration and sequencing | Workflow Engine (`ARC-001` §4.7) |
| Assignment of durable topic identifiers (`top_…`) on commission | Downstream Topic/Content Registry, not this agent (`STD-000` §5.8) |
| Semantic-embedding similarity search | Originality Service (`ARC-001` §4.12) — deliberately deferred; this agent performs exact and normalised-text duplicate detection only, per commissioning scope (§6 below) |
| Quality scoring of this agent's own output | Evaluation Service / Judge-class agent (`GDE-002` §9.5) |
| Policy and compliance clearance | Policy & Compliance Gate (`ARC-001` §4.13) |
| Retry, repair, backoff, attempt counting | Agent runtime · Workflow engine (`GDE-002` §10.1) |
| Envelope `meta`, `execution`, `validation`, and `references` population | Agent runtime · Validation plane (`GDE-003` §4.6, §5.5) |

## 4. Inputs

Contract: `topic-discovery-agent-input/v1`. The model receives `data` only; the envelope is handled by the runtime.

| Input | Type | Required | Trust | Constraints | Absence behaviour |
|---|---|---|---|---|---|
| `strategyBinding` | object | Yes | Trusted | 2–6 content pillars; relevant subset only (`GDE-002` §5.4), never the full Strategy Manifest | — |
| `existingContentInventory` | array | Yes | Trusted | 0–300 items; empty array is valid | — |
| `discoveryConstraints` | object | No | Trusted | `requiredPillarKeys`/`excludePillarKeys` disjoint and resolvable | Every pillar and topic type is eligible |
| `trendContext` | object | No | **UNTRUSTED** | ≤ 30 observations, each ≤ 500 chars | Timeliness scoring relies on inherent topic nature only; recorded in `assumptions` |
| `language` | string | Yes | Trusted | BCP 47; must be in `strategyBinding.audience.languages` | — |
| `requestedTopicCount` | integer | Yes | Trusted | 1–50 | — |

## 5. Outputs

Contract: `topic-discovery-agent-output/v1`. `data` is the **Topic Opportunity Set**. Consumers per field are enforced by [validator.ts](validator.ts).

| Consumer | Consumes |
|---|---|
| Workflow Engine | The whole set, to dispatch the next Agent 02 Research invocation per topic |
| Agent 02 Research (via workflow) | `topics[].title`, `topics[].angle`, `topics[].researchPriority`, `topics[].pillarKey` |
| Validation plane (`ARC-001` §4.11) | `topics[].pillarKey`, `topics[].duplicateStatus`, `topics[].rank`, `topics[].overallScore` |
| Originality Service (`ARC-001` §4.12) | `topics[].title`, `topics[].duplicateStatus` as a first-pass signal ahead of semantic search |
| Human reviewer (where a gate is placed) | `topics[].scoreBreakdown`, `topics[].risks`, `assumptions`, `inputSufficiency` |
| Insight & Feedback Service (`ARC-001` §4.21) | `topics[].pillarKey`, `topics[].topicType`, `topics[].researchPriority` for later attribution |

## 6. Workflow Position

```
  Strategy Manifest (Agent 00, approved) ─┐
  Existing content inventory ─────────────┤
  Discovery constraints ──────────────────┼─► [ AGT-01 Topic Discovery ] ─► Topic Opportunity Set
  Trend context ───────────────────────────┘  (untrusted)                        │
                                                                                    ▼
                                                                          Structural validation
                                                                                    ▼
                                                                           Business validation
                                                                     (pillar/persona resolution,
                                                                      score & rank arithmetic,
                                                                      duplicate grounding)
                                                                                    ▼
                                                                    Workflow dispatches per-topic
                                                                         Agent 02 Research
```

Agent 01 runs on the **production loop**, ahead of research (`ARC-001` §5.3). Its output is a set of **opportunities**, never verified facts and never commissioned topics — Agent 02 Research and later stages decide what is actually true and what is actually produced. Agent 01 does not decide "which topics get made"; it decides "which topics are worth researching, and in what order" (task framing, §1).

## 7. Downstream Consumers

Direct consumers: the Workflow Engine (which dispatches Agent 02 Research invocations from `topics[]`), the Validation Engine, the Originality Service (as a first-pass signal), and any human reviewer a workflow chooses to gate on `researchPriority: URGENT` or `risks` severity `HIGH`. `strategyVersion` carried in `meta` (provenance) and echoed structurally via `pillarKey` resolution keeps every topic attributable to the strategy that shaped it (`GDE-003` §5.4).

## 8. Scoring Model

Seven dimensions, each an independent `[0.0, 1.0]` judgement with a mandatory rationale (`data.topics[].scoreBreakdown`). No dimension is an unexplained number (`STD-000` §6.4 — judges return per-criterion scores with justification, never an overall figure alone).

| Dimension | Meaning | Weight |
|---|---|---|
| `audienceIntent` | How precisely the topic matches a real, identifiable reason the audience seeks this content | 0.15 |
| `strategicFit` | How well the topic serves its pillar's stated intent and the channel's positioning | 0.20 |
| `differentiation` | How distinguishable the topic's angle is from the obvious, generic treatment of its subject | 0.15 |
| `timeliness` | How much near-term relevance the topic carries, grounded in `trendContext` where supplied | 0.10 |
| `evergreenPotential` | How much value the topic retains after its initial publish window | 0.15 |
| `productionFeasibility` | How readily the topic fits the declared format and duration envelopes without unusual production burden | 0.10 |
| `growthPotential` | How plausible it is that the topic reaches viewers beyond the existing audience | 0.15 |

**`overallScore` = Σ(weight × score)**, rounded to 2 decimal places. Weights sum to 1.00. Ranking is by descending `overallScore`, ties broken at the producer's discretion but ranks must remain a contiguous 1..N sequence (`R-BUS-006`, `R-BUS-007`).

**What the score is not.** Every score is `MODEL_ASSESSED` — a single model's structured judgement, not a measured fact, not a guarantee of audience response, and not independently calibrated against outcomes at this stage (`STD-000` §6.5). A human reviewer or a later Judge-class agent may disagree; the rationale field exists precisely so that disagreement is possible to locate and act on.

## 9. Duplicate Detection

Three levels are supported, per `STD-000` §6.6 and the task's explicit scope (deterministic handling only; semantic-embedding infrastructure is deferred to the Originality Service, `ARC-001` §4.12):

1. **Exact duplicate** — candidate title equivalent to an existing topic's title after case and whitespace normalisation. Mechanically detectable and mechanically enforced (`R-BUS-009`).
2. **Near duplicate / same subject, different angle / trivial wording variant** — the model's own judgement, expressed as a closed classification with a cited `matchedTopicRefId` and a `similarityBasis` rationale. The validator enforces that the citation resolves to a supplied existing topic (`R-BUS-010`); it does not and cannot independently judge subject similarity — that grounding check is the boundary of what a deterministic validator can do without semantic infrastructure.
4. **No match** — `classification: NONE`, the default when nothing in `existingContentInventory` covers the same subject.

`duplicateStatus` is a discriminated union on `classification` (`GDE-003` §6.7): the `NONE` variant carries no further fields, and every matched variant requires both `matchedTopicRefId` and `similarityBasis`, so the shape itself makes an unsupported duplicate claim unrepresentable.

## 10. Validation Rules

Structural rules are the schemas; business rules are declarative, named, and individually testable (`STD-000` §6.3). Full rule table in [test-cases.md](test-cases.md); executable definitions in [validator.ts](validator.ts).

**Input rules** — `R-IN-001` requested language present in strategy audience languages · `R-IN-002` required/excluded pillar keys disjoint · `R-IN-003` required pillar keys resolve · `R-IN-004` excluded pillar keys resolve · `R-IN-005` excluded pillars do not cover every declared pillar · `R-IN-006` untrusted trend context within size bounds.

**Output rules** — `R-BUS-001` delivered count equals topic array length · `R-BUS-002` a count shortfall is explained · `R-BUS-003` every topic maps to a declared pillar · `R-BUS-004` target persona keys resolve · `R-BUS-005` overall score matches the declared weighted formula · `R-BUS-006` ranks unique and contiguous from 1 · `R-BUS-007` rank order non-increasing in overall score · `R-BUS-008` topic titles unique within the set · `R-BUS-009` exact matches against existing content classified as exact duplicates · `R-BUS-010` duplicate match references resolve to supplied existing content · `R-BUS-011` timeliness window presence matches topic type · `R-BUS-012` no topic touches a prohibited subject · `R-BUS-013` declared-unknown paths address absent fields · `R-BUS-014` no placeholder residue.

## 11. Failure Conditions

Three distinct outcomes (`GDE-002` §11.2). Codes are registered (`STD-000` §8.4).

| Condition | Outcome | Code | Category | Severity | Retryable |
|---|---|---|---|---|---|
| A required input field is missing | Typed failure | `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | `ERROR` | No |
| An enumerated input value is not permitted | Typed failure | `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | `ERROR` | No |
| Required and excluded pillar constraints conflict | Typed failure | `VALIDATION.INPUT.PILLAR_CONSTRAINTS_CONTRADICTORY` | `VALIDATION` | `ERROR` | No |
| A discovery constraint pillar key does not resolve | Typed failure | `VALIDATION.INPUT.PILLAR_KEY_UNRESOLVABLE` | `VALIDATION` | `ERROR` | No |
| Requested language is not among the strategy's audience languages | Typed failure | `VALIDATION.INPUT.LANGUAGE_MISMATCH` | `VALIDATION` | `ERROR` | No |
| Excluded pillars leave no eligible discovery space | Typed failure | `VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE` | `VALIDATION` | `ERROR` | No |
| Model emitted non-JSON or unparseable output | Typed failure | `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output violated the output schema | Typed failure | `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output asserted a fact absent from the supplied inputs | Typed failure | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output was truncated by a length limit | Typed failure | `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| A named business rule failed against the output | Typed failure | `AI_OUTPUT.BUSINESS.RULE_VIOLATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Request asks for work outside AGT-01's mandate | **Refusal** | `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | `ERROR` | **No** |
| Instruction-shaped content detected inside a data block | **Refusal** | `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | `FATAL` | **No — escalate** |
| A single value, or the full requested count, cannot be determined | **Declared unknown** — `status: SUCCESS` | — | — | — | — |

A declared unknown is **not** a failure: the field is omitted (or `deliveredCount` is reduced) and the path is recorded in `data.declaredUnknowns` or `data.assumptions` (`GDE-003` §9.4). The agent never invents, estimates, or defaults a value (`STD-000` Rule 18).

---

**Package contents:** [system-prompt.md](system-prompt.md) · [input.schema.json](input.schema.json) · [output.schema.json](output.schema.json) · [interfaces.ts](interfaces.ts) · [validator.ts](validator.ts) · [examples/request.json](examples/request.json) · [examples/response.json](examples/response.json) · [examples/failure.json](examples/failure.json) · [test-cases.md](test-cases.md) · [implementation-checklist.md](implementation-checklist.md)

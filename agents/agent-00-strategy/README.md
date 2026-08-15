# AGT-00 — Strategy Agent

| Field | Value |
|---|---|
| Identifier | `AGT-00` |
| Agent name | `strategy-agent` |
| Agent version | `1.0.0` |
| Department | D0 — Strategy (`ARC-001` §5.2) |
| Functional class | **Planner** (`STD-000` §3.11) |
| Domain category | **Planning** (`GDE-002` §7.2) |
| Input schema | `strategy-agent-input/v1` (`1.0.0`) |
| Output schema | `strategy-agent-output/v1` (`1.0.0`) |
| Contract type | `REQUEST` in · `RESPONSE` out (`GDE-003` §3.3) |
| Determinism posture | Structurally deterministic; reproducible where the provider supports seeding |
| Stability | Stable |
| Owner | Platform Strategy |

---

## 1. Purpose

Produce a complete, internally consistent **Strategy Manifest** for one channel from operator intent, audience definition, capacity constraints, brand and locale bindings, and — on revision cycles — evidenced insight proposals.

## 2. Responsibilities

Every responsibility maps to at least one output field (`GDE-002` §4.2).

| # | Responsibility | Output field |
|---|---|---|
| R1 | State channel mission, positioning, and differentiators | `data.mission` |
| R2 | Define the audience and its personas | `data.audience` |
| R3 | Define content pillars and their intended share of output | `data.contentPillars` |
| R4 | Define format mix, aspect ratios, and duration envelopes | `data.formatStrategy` |
| R5 | Define publishing cadence and recurring slots | `data.publishingCadence` |
| R6 | Define tone, narration person, and vocabulary posture | `data.toneAndPersonality` |
| R7 | Define packaging direction for titles, thumbnails, and hooks | `data.packagingDirection` |
| R8 | Define SEO topic clusters and keyword posture | `data.seoDirection` |
| R9 | Define call-to-action strategy | `data.callToActionStrategy` |
| R10 | Define monetization models and their constraints | `data.monetizationStrategy` |
| R11 | Define measurable success metrics bound to business goals | `data.successMetrics` |
| R12 | Define growth milestones and expansion candidates | `data.growthPlan` |
| R13 | Define competitive positioning and white space | `data.competitivePositioning` |
| R14 | Define seasonal emphasis periods | `data.seasonalPlan` |
| R15 | Declare strategic risks and their mitigations | `data.riskAssessment` |
| R16 | Emit machine-checkable strategy conformance rules for the validation plane | `data.conformanceRules` |
| R17 | Carry forward prohibited topics as strategy-level prohibitions | `data.prohibitedTopics` |
| R18 | Declare derivation lineage and, on revision, a per-change rationale with evidence | `data.derivation` |
| R19 | Declare assumptions and their basis | `data.assumptions` |
| R20 | Declare values that could not be determined | `data.declaredUnknowns` |
| R21 | Declare sufficiency of the supplied inputs | `data.inputSufficiency` |

## 3. Non-Responsibilities

Each exclusion names its owner (`GDE-002` §2.4, §4.2).

| Excluded capability | Owned by |
|---|---|
| Topic ideation, topic selection, angle definition | D1 Content Intelligence — topic brief |
| Research, fact establishment, source citation | D1 Content Intelligence — research dossier |
| Script, hook, and narrative writing | D2 Content Production |
| Title, description, and tag generation for a specific video | D2 Content Production (SEO metadata agent) |
| Thumbnail imagery, scene planning, media generation | D3 Media Production |
| Publication scheduling of a specific video, quota arbitration | Publishing Service · Quota Ledger (`ARC-001` §4.19) |
| Approval of this manifest, assignment of `strategyVersion`, custody, channel binding | Strategy Store · Approval Service (`ARC-001` §4.3, §4.14) |
| Assignment of durable identifiers (`plr_…`, `str_…`) | Strategy Store (`STD-000` §5.8) |
| Quality scoring of this manifest | Evaluation Service / Judge-class agent (`GDE-002` §9.5) |
| Policy and compliance clearance | Policy & Compliance Gate (`ARC-001` §4.13) |
| Originality checking against channel history | Originality Service (`ARC-001` §4.12) |
| Statistical analysis of performance; production of insight proposals | D4 Insight & Feedback Service (`ARC-001` §4.21) |
| Retry, repair, backoff, attempt counting | Agent runtime · Workflow engine (`GDE-002` §10.1) |
| Envelope `meta`, `execution`, `validation`, and `references` population | Agent runtime · Validation plane (`GDE-003` §4.6, §5.5) |

## 4. Inputs

Contract: `strategy-agent-input/v1`. The model receives `data` only; the envelope is handled by the runtime.

| Input | Type | Required | Trust | Constraints | Absence behaviour |
|---|---|---|---|---|---|
| `channelProfile` | object | Yes | Trusted | Display name 3–80; `contentCategory`, `maturity` closed enums | — |
| `operatorIntent` | object | Yes | Trusted | 1–5 business goals, unique `goal` and unique `priority`; `weeklyVideoTarget` 1–14 | — |
| `audienceDefinition` | object | Yes | Trusted | 1–20 ISO 3166-1 alpha-2; 1–5 BCP 47; 1–6 age bands | — |
| `brandBinding` | object | Yes | Trusted | Relevant brand subset only (`GDE-002` §5.4) | — |
| `localeBinding` | object | Yes | Trusted | BCP 47 locale; `maxTitleLengthChars` 20–100 | — |
| `capacityConstraints` | object | Yes | Trusted | `minVideoDurationMs` ≤ `maxVideoDurationMs` | — |
| `marketContext` | object | No | **UNTRUSTED** | ≤ 30 observations, each ≤ 500 chars | `competitivePositioning.whiteSpace` is emitted empty and the omission is recorded in `assumptions` |
| `insightProposals` | array | No | Trusted | 0–20 items; requires `priorStrategy` | Cycle is `INITIAL`; no `changeSummary` is produced |
| `priorStrategy` | object | No | Trusted | Pinned `strategyVersion` | Cycle is `INITIAL`; `supersedesStrategyVersion` is omitted |

## 5. Outputs

Contract: `strategy-agent-output/v1`. `data` is the **Strategy Manifest**. Consumers per field are listed in [interfaces.ts](interfaces.ts) and enforced by [validator.ts](validator.ts).

| Consumer | Consumes |
|---|---|
| Strategy Store (`ARC-001` §4.3) | The whole manifest, for approval, versioning, and channel binding |
| Validation plane (`ARC-001` §4.11) | `conformanceRules`, `prohibitedTopics`, `contentPillars`, `formatStrategy` |
| D1 Content Intelligence | `contentPillars`, `seoDirection`, `prohibitedTopics`, `audience`, `seasonalPlan` |
| D2 Content Production | `toneAndPersonality`, `packagingDirection`, `formatStrategy`, `callToActionStrategy` |
| D3 Media Production | `packagingDirection.thumbnailDirection`, `formatStrategy.formats[].aspectRatio` |
| Publishing Service | `publishingCadence`, `monetizationStrategy` |
| Insight & Feedback Service (`ARC-001` §4.21) | `successMetrics`, `contentPillars[].pillarKey`, `derivation` |
| Human approver | `mission`, `assumptions`, `riskAssessment`, `derivation.changeSummary`, `inputSufficiency` |

## 6. Workflow Position

```
  Operator intent ─┐
  Channel config ──┤
  Brand · Locale ──┼─► [ AGT-00 Strategy Agent ] ─► Strategy Manifest
  Capacity ────────┤                                      │
  Market context ──┤  (untrusted)                          ▼
  Insight props. ──┘  (revision cycles only)      Structural validation
                                                          ▼
                                                  Business validation
                                                          ▼
                                              ► HUMAN APPROVAL GATE ◄
                                                 (non-delegable, ARC-001 §5.2)
                                                          ▼
                                                   Strategy Store
                                             (assigns strategyVersion, pins)
                                                          ▼
                                         Every production run, as a pinned binding
```

The agent runs on the **strategy loop** (weeks to quarters), never inside the production loop (`ARC-001` §1.3, §5.2). Its output is a **proposal**; approval is a human act that this agent cannot perform, request, or assume (`STD-000` Rule 38, `GDE-002` §8.4).

## 7. Downstream Consumers

`strategyVersion` derived from this manifest is recorded on every artifact produced under it (`GDE-003` §5.4), which is what makes strategy attributable in `ARC-001` §13. Direct consumers: Strategy Store, Validation Engine, D1/D2/D3 agents via the resolved strategy binding, Publishing Service, Insight & Feedback Service, and the human approver.

## 8. Validation Rules

Structural rules are the schemas; business rules are declarative, named, and individually testable (`STD-000` §6.3). Full rule table in [test-cases.md](test-cases.md); executable definitions in [validator.ts](validator.ts).

**Input rules** — `R-IN-001` language coherence · `R-IN-002` duration bounds ordered · `R-IN-003` goal priorities unique · `R-IN-004` goals unique · `R-IN-005` weekly target within capacity · `R-IN-006` non-negotiables disjoint from prohibited topics · `R-IN-007` insight proposals require a prior strategy · `R-IN-008` untrusted market context within size bounds.

**Output rules** — `R-BUS-001` pillar names unique after normalisation · `R-BUS-002` pillar keys unique · `R-BUS-003` pillar shares sum to 1.0 ± 0.01 · `R-BUS-005` cadence within capacity · `R-BUS-006` slot count equals weekly count · `R-BUS-007` slots non-colliding · `R-BUS-008` format durations within capacity · `R-BUS-009` aspect ratio matches format type · `R-BUS-010` derivation cycle matches input · `R-BUS-011` revision supersedes a version · `R-BUS-012` adopted proposals exist in the request · `R-BUS-013` change evidence resolves · `R-BUS-014` prohibited topics preserved · `R-BUS-015` non-negotiables honoured by a conformance rule · `R-BUS-016` audience language matches locale binding · `R-BUS-017` tone within brand · `R-BUS-018` vocabulary prohibitions preserved · `R-BUS-019` title length within locale · `R-BUS-020` every business goal has a success metric · `R-BUS-021` declared-unknown paths are absent fields · `R-BUS-022` seasonal periods ordered and non-overlapping · `R-BUS-023` seasonal pillar keys resolve · `R-BUS-024` conformance rule keys unique · `R-BUS-025` no placeholder residue.

## 9. Failure Conditions

Three distinct outcomes (`GDE-002` §11.2). Codes are registered (`STD-000` §8.4).

| Condition | Outcome | Code | Category | Severity | Retryable |
|---|---|---|---|---|---|
| A required input field is missing | Typed failure | `VALIDATION.INPUT.REQUIRED_FIELD_MISSING` | `VALIDATION` | `ERROR` | No |
| An enumerated input value is not permitted | Typed failure | `VALIDATION.INPUT.ENUM_VALUE_NOT_PERMITTED` | `VALIDATION` | `ERROR` | No |
| Audience definition is empty, malformed, or self-contradictory | Typed failure | `VALIDATION.INPUT.AUDIENCE_UNRESOLVABLE` | `VALIDATION` | `ERROR` | No |
| Business goals contradict each other or exceed capacity | Typed failure | `VALIDATION.INPUT.OBJECTIVES_CONTRADICTORY` | `VALIDATION` | `ERROR` | No |
| Locale, audience languages, and brand disagree | Typed failure | `VALIDATION.INPUT.LOCALE_MISMATCH` | `VALIDATION` | `ERROR` | No |
| Inputs are individually valid but jointly unsatisfiable | Typed failure | `VALIDATION.INPUT.CONSTRAINT_UNSATISFIABLE` | `VALIDATION` | `ERROR` | No |
| Insight proposals supplied without a prior strategy | Typed failure | `VALIDATION.INPUT.DERIVATION_INCOMPLETE` | `VALIDATION` | `ERROR` | No |
| Model emitted non-JSON or unparseable output | Typed failure | `AI_OUTPUT.JSON.PARSE_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output violated the output schema | Typed failure | `AI_OUTPUT.SCHEMA.VALIDATION_FAILED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output asserted a fact absent from the supplied inputs | Typed failure | `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Output was truncated by a length limit | Typed failure | `AI_OUTPUT.CONTENT.TRUNCATED` | `AI_OUTPUT` | `ERROR` | No — repairable |
| Request asks for work outside D0's mandate | **Refusal** | `VALIDATION.SCOPE.OUT_OF_DECLARED_RESPONSIBILITY` | `VALIDATION` | `ERROR` | **No** |
| Instruction-shaped content detected inside a data block | **Refusal** | `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` | `SECURITY` | `FATAL` | **No — escalate** |
| A single value cannot be determined from the inputs | **Declared unknown** — `status: SUCCESS` | — | — | — | — |

A declared unknown is **not** a failure: the field is omitted and its path is recorded in `data.declaredUnknowns` (`GDE-003` §9.4). The agent never invents, estimates, or defaults a value (`STD-000` Rule 18).

---

**Package contents:** [system-prompt.md](system-prompt.md) · [input.schema.json](input.schema.json) · [output.schema.json](output.schema.json) · [interfaces.ts](interfaces.ts) · [validator.ts](validator.ts) · [examples/request.json](examples/request.json) · [examples/response.json](examples/response.json) · [examples/failure.json](examples/failure.json) · [test-cases.md](test-cases.md) · [implementation-checklist.md](implementation-checklist.md)

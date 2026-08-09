# Prompt Engineering Guide
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `GDE-004` |
| Title | Prompt Engineering Guide |
| Version | 1.0 |
| Status | Active |
| Governed by | [`000-project-engineering-standards.md`](000-project-engineering-standards.md) (`STD-000 v1.0`) |
| Situated by | [`001-system-architecture.md`](001-system-architecture.md) (`ARC-001 v1.0`) |
| Companion to | [`002-ai-agent-development-guide.md`](002-ai-agent-development-guide.md) · [`003-json-contract-guide.md`](003-json-contract-guide.md) |
| Owner | Platform Architecture |
| Audience | Anyone authoring, reviewing, operating, or publishing a prompt — including third-party publishers |
| Review cadence | Quarterly, or whenever a prompt incident surfaces a gap this guide does not close |

**Requirement language.** RFC 2119 keywords carry the meanings defined in `STD-000` §Document Control.

**Precedence.** `STD-000` governs. Where this guide appears to conflict with it, `STD-000` wins and this guide is the defect (`STD-000` Rule 57).

---

### Structural reconciliation

The commissioning brief lists ten prompt sections. `STD-000` §4.1 already fixes the prompt's structure at **eight blocks in a mandatory order**. Under the precedence rule the canonical structure is retained, and the brief's sections map onto it as follows:

| Brief section | Canonical treatment |
|---|---|
| Role | Block 1 — Role |
| Objective | Block 2 — Objective |
| Context | Block 3 — Input contract (describes what arrives), and Block 8 — Input data (the runtime payload) |
| Constraints | Block 4 — Rules and constraints (sub-divided in §5.5) |
| Rules | Block 4 — Rules and constraints |
| Required Output | Block 5 — Output contract |
| Failure Behavior | Block 6 — Refusal and unknown policy |
| Examples | Block 7 — Examples |
| Variables | **Not a prompt block.** Variables are *declared* in the agent specification (`STD-000` §4.2) and *appear* inside blocks. Covered in §6 |
| Notes | **Not a prompt block.** Authoring notes belong in the specification and the change log; they MUST NOT ship inside a prompt (§5.11) |

Section 5 of this guide is therefore the authoring manual for the eight canonical blocks, with the brief's finer divisions treated inside them.

---

# 1. Introduction

## 1.1 Position in the document set

| Document | Question it answers |
|---|---|
| `STD-000` Engineering Standards | *What are the rules?* |
| `ARC-001` System Architecture | *Where do components sit, and why?* |
| `GDE-002` Agent Development Guide | *How do I design an agent?* |
| `GDE-003` JSON Contract Guide | *What moves between components, and what shape is it?* |
| `GDE-004` **this guide** | *How do I write, govern, and operate the prompt itself?* |

`STD-000` §4 fixes the **binding rules** for prompts — structure, variables, constraints, layer placement, temperature policy, chain-of-thought policy, hallucination prevention, few-shot policy, versioning, localisation. Those rules are cited here, never restated.

`GDE-002` §12 covers **prompt ownership from the agent author's perspective** — who owns a prompt, when to change it, the four-lever diagnostic order. Also cited, not restated.

This guide supplies the remaining layer: the **craft of writing the prompt text**, and the **governance apparatus** that treats a prompt as a managed production artifact — its full lifecycle, its testing methodology, its release and rollback mechanics, its incident path, and its portability across providers.

## 1.2 The reframe this guide depends on

> **A prompt is not a message to a model. It is a specification that happens to be executed by a model.**

Nearly every prompt-engineering failure in production systems traces to treating prompts as messages — informal, edited in place, tweaked until output looks acceptable, owned by whoever last touched them.

Specifications are different things. They are designed against requirements, reviewed by a second person, versioned immutably, tested against a fixed suite, released deliberately, monitored in production, rolled back when they regress, and retired on a schedule. They have owners and change logs.

Every section of this guide follows from taking the second framing literally.

## 1.3 Why prompts need more governance than ordinary source, not less

Prompts have three properties that ordinary source code does not, and each argues for stricter handling:

1. **Failure is silent.** Broken code throws. A degraded prompt returns fluent, well-formed, plausible output that is subtly worse — and it can do so for weeks before anyone notices.
2. **The execution environment changes without notice.** Models are revised, repriced, and behaviourally adjusted on the provider's schedule. A prompt unchanged for six months may not behave as it did when it was written.
3. **Small edits have non-local effects.** Adding one clarifying sentence can measurably change behaviour on inputs unrelated to the clarification. There is no compiler to tell you what you touched.

The practical consequence: **there is no such thing as a trivial prompt change.** "It's only a wording tweak" is precisely the change most likely to have an unexpected effect, because nobody examines it closely.

## 1.4 Scope

**In scope.** Prompt philosophy; lifecycle and governance; prompt categories; block-by-block authoring craft; variable standards; context management; output specification craft; testing methodology; versioning and rollback mechanics; provider portability; performance; security at the prompt layer; measurable quality; review; anti-patterns; evolution.

**Out of scope.** Workflows (`ARC-001` §7), architecture, contracts (`GDE-003`), agent design (`GDE-002`), implementation of any kind, and the specific prompt text of individual agents (each `AGT-nn` specification).

---

# 2. Prompt Philosophy

Nine principles. Each states the rule, the reasoning, the failure it prevents, and its limit where one exists.

## 2.1 Prompt as Source Code

**Principle.** Prompts are production source artifacts under full change control.

**What the analogy actually requires:**

| Software practice | Prompt equivalent |
|---|---|
| Source control | Immutable content-addressed versions (`STD-000` §4.9) |
| Code review | Mandatory second-person review before promotion |
| Unit tests | Evaluation set, written before the prompt (`GDE-002` §2.5) |
| Regression suite | Every production defect adds a case (`STD-000` Rule 56) |
| Build artifact | The fully-resolved, expanded prompt version |
| Release | Promotion through candidate to champion |
| Rollback | Version repin, requiring no deployment |
| Ownership | Exactly one agent owns each prompt (`STD-000` §3.9) |
| Change log | Rationale recorded per version |

**Where the analogy breaks, and it matters.** Code has a compiler and deterministic execution. Prompts have neither. The substitutes are **evaluation sets** (standing in for the compiler) and **production quality monitoring** (standing in for deterministic execution). A prompt without both is running unverified — which is why neither is optional.

**Prevents.** The default failure mode: prompts edited in place by whoever is nearest the problem, with no record of what changed, no way to attribute a regression, and no way back.

## 2.2 Deterministic Prompt Design

**Principle.** The prompt is written so that the *space* of acceptable outputs is fully determined, even though the specific output is not.

**Why.** Determinism at the system level is a property of the contract, not of the model (`GDE-002` §3.3). The prompt's job is to eliminate every degree of freedom that is not deliberately intended — leaving variation only where variation is the point.

**In practice.** For each instruction, ask: *how many reasonable readings does this have?* Anything above one is a defect. "Keep it concise" has as many readings as it has readers. "Between 40 and 60 characters" has one.

**Prevents.** Output that varies for reasons nobody chose, and evaluation results that cannot be reproduced because the prompt permitted a range nobody knew about.

**Limit.** Do not eliminate degrees of freedom that carry the value. A Generator prompt dictating sentence structure is enforcing a preference, not a contract, and will produce mechanical output while adding no reliability.

## 2.3 Explicit Instructions

**Principle.** Everything the model must do is stated. Nothing is implied, assumed, or left to good judgment.

**Why.** A model has no access to your intent, your organisation's conventions, or the conversation you had about this agent last week. It has the prompt. Anything not in the prompt is a coin flip that lands differently across models, across providers, and across runs.

**The stranger test.** *Could a competent professional with no context produce correct output from this prompt alone?* If they would need to ask a question, that question is a missing instruction.

**Prevents.** The single largest category of prompt defect — behaviour that was expected but never specified, and therefore appears intermittently.

**Limit.** Explicit is not the same as verbose. Restating a rule for emphasis costs tokens on every call and measurably dilutes the instruction set (§12.2). State it once, precisely.

## 2.4 Separation of System and User Layers

**Principle.** Behavioural instruction lives in the system layer. Runtime data lives in the user layer. The boundary is never crossed.

**Why.** Beyond the stability and caching benefits (`STD-000` §4.4), the separation is a **security control**. Untrusted content arrives in the user layer; keeping all authority in the system layer means injected instructions arrive in a structurally subordinate position (§13.2).

**Prevents.** Prompts whose behaviour depends on runtime content, and injection attempts that arrive at the same level as genuine instruction.

**Limit.** Providers handle system instruction differently. Normalisation is the adapter's job (§11.3); prompts are authored to one convention regardless.

## 2.5 Context Minimisation

**Principle.** Supply the least context that permits correct output.

**Why.** Four independent benefits from one rule (`GDE-002` §5.1): lower cost, better instruction-following, smaller injection surface, and clearer contracts. Few rules pay four ways.

**The counter-intuitive part.** More context frequently makes output *worse*, not merely more expensive. Irrelevant material competes with instructions for the model's attention and gives it more surface from which to draw plausible-but-wrong inferences.

**Prevents.** The default habit of passing everything available "so the model has full picture," which inflates cost permanently and degrades quality invisibly.

**Limit.** Under-supplying context is also a defect, and a harder one to diagnose — it appears as poor model performance rather than as a missing input. The test is empirical: remove a candidate input and measure (§7.2).

## 2.6 Provider Independence

**Principle.** Prompts are authored provider-neutrally and evaluated on every approved provider.

**Why.** A prompt tuned until it works on exactly one model is a migration cost disguised as a solution (`GDE-002` §3.8). Providers deprecate and revise on their own schedule.

**The diagnostic.** If a prompt passes on one provider and fails on another, the usual cause is not model quality — it is that the prompt relies on one model's tolerance for ambiguity. **Tighten the specification rather than tuning to the model.** A prompt that survives three providers is a better prompt, not merely a more portable one.

**Limit.** Genuine capability differences are real and are declared in the capability profile (§11.2). That is the mechanism working, not a violation.

## 2.7 Predictable Outputs

**Principle.** The prompt states exactly what to emit and, equally, exactly what not to emit.

**Why.** Models default to helpfulness. Absent explicit prohibition they will add preamble, explain their reasoning, offer alternatives, and volunteer adjacent fields — all of it unowned, unvalidated, unversioned output (`GDE-002` §15.11).

**Prevents.** Parsing risk, wasted tokens, and downstream consumers accidentally depending on volunteered fields.

**Limit.** Prohibition without an alternative leaves the model to invent one. Pair every "do not" with the positive form: not merely "do not explain," but "emit the declared structure and nothing else."

## 2.8 Reusability

**Principle.** Reuse is achieved through **versioned fragments composed at build time**, never through live shared prompts (`STD-000` §3.9).

**Why.** A live shared prompt creates invisible coupling: a wording change intended for one agent silently alters five others, and the evaluation runs on none of them.

**The cost that must be weighed.** Changing a shared fragment produces a new prompt version for **every** composing agent and re-runs **every** affected evaluation set. That is correct behaviour, and it is expensive. Use fragments for genuinely universal guidance; for short text used by two or three agents, duplication is often the cheaper choice.

**Preferred alternative where applicable.** Where the shared content is per-channel, per-brand, or per-locale, it is **configuration passed as a variable**, not prompt text at all (§6.5). This is the reuse mechanism to reach for first.

## 2.9 Maintainability

**Principle.** Prompts are written for the engineer who inherits them with no context.

**Why.** Prompts accumulate patches. Each addition made under pressure to fix one case, none removed, until the prompt contradicts itself in ways nobody can see because nobody reads it end to end.

**Requirements.** Canonical block order, always (§5). Atomic, individually verifiable rules. No accumulated contradictions. A change log stating *why*, not merely *what*. Periodic end-to-end re-reading as a maintenance activity in its own right.

**The signal for rewrite.** When a prompt's rules can no longer be held in mind at once, or when a new rule cannot be placed without ambiguity about which existing rule it overrides, the prompt needs replacement rather than another patch (§10.6).

---

# 3. Prompt Lifecycle

## 3.1 Stages

Eight stages, each with an entry condition, work, an exit gate, and an accountable role.

```
  CREATION → REVIEW → APPROVAL → VERSIONING → DEPLOYMENT
                                                   │
                              ┌────────────────────┤
                              ▼                    ▼
                        MONITORING ──────► DEPRECATION → RETIREMENT
                              │
                              └──► (regression) ──► ROLLBACK ──► CREATION
```

## 3.2 Creation

**Entry.** A fixed contract exists, and an evaluation set exists. Both precede the prompt (`GDE-002` §2.5, §3.4).

**Work.** Author the eight canonical blocks (§5). Declare every variable. Set parameters from the agent's functional class (`STD-000` §4.5). Compose fragments if any, and resolve them to an expanded prompt.

**Exit gate.** Prompt renders with every variable strictly resolved; all blocks present in order; no contradictions detectable on a read-through.

**Accountable.** Prompt author.

**The ordering rule that is most often violated:** the evaluation set is written **before** the prompt. Written afterwards, it encodes whatever the prompt already does and can never fail it — which makes it useless as a regression gate.

## 3.3 Review

**Entry.** A rendered prompt and its evaluation results exist.

**Work.** Static review against the checklist (§15) by someone who did not author it. The reviewer's primary job is the **ambiguity audit** (§9.2) — a second reader is the only reliable detector of instructions with more than one reading, because an author cannot see their own intended meaning as optional.

**Exit gate.** Checklist passed; every finding resolved or waived with a recorded reason.

**Accountable.** Reviewer, named on the version.

**Rule.** Review is mandatory for every version, including small changes (`STD-000` §4.9). Especially small changes (§1.3).

## 3.4 Approval

**Entry.** Review passed; evaluation results available for every approved provider and locale.

**Work.** Confirm no regression against the incumbent on quality, cost, and latency (§9.5). Confirm budgets hold. Decide promotion.

**Exit gate.** No regression on any measured axis, or an explicitly recorded waiver naming the accepted trade.

**Accountable.** Agent owner.

**Rule.** A change that reduces the evaluation pass rate MUST NOT ship without a recorded waiver (`STD-000` §3.13). "Better in ways the evaluation set does not capture" is an argument for extending the evaluation set, not for waiving it.

## 3.5 Versioning

**Entry.** Approved.

**Work.** Register as an immutable, content-addressed version with semantic version, author, reviewer, date, rationale, parameters, target schema version, evaluation results, and approved provider/model combinations (§10).

**Exit gate.** Version registered and resolvable; prior version retained.

**Rule.** An existing version is **never edited in place**. Editing a released prompt destroys the ability to attribute any historical result (`STD-000` §4.9).

## 3.6 Deployment

**Entry.** Versioned.

**Work.** Promote to candidate — a measured share of production traffic, with the incumbent serving the remainder (`STD-000` §4.9). Monitor quality, cost, latency, and validation failure rates against the incumbent on live traffic.

**Exit gate.** Production metrics match evaluation predictions. Promote to champion, or roll back.

**Why candidate exposure is required.** Evaluation sets are finite and curated; production is neither. The candidate stage catches the input distribution the evaluation set does not represent, which is where most surprises live.

**Rule.** Promotion and rollback are **registry operations requiring no deployment** (`STD-000` §4.9). This is what makes rollback fast enough to be the default incident response (§3.9).

## 3.7 Monitoring

**Entry.** Champion.

**Work.** Continuous observation of the signals in §14.5 — schema validity, repair rate, escalation rate, cost, latency, human rejection rate and reasons, and quality trend.

**The critical property.** Prompt quality **degrades without any change to the prompt** (`GDE-002` §13.6). Models are silently revised; providers adjust behaviour; input distributions shift. Therefore:

- Evaluation sets run **on a schedule**, not only on change.
- A quality regression with **no corresponding version change** indicates external drift and MUST be investigated, never absorbed.

**Accountable.** Agent owner.

## 3.8 Deprecation

**Entry.** A successor is champion, or the agent is being retired.

**Work.** Mark deprecated with a stated replacement and end-of-support date. Track remaining pinned usage. Communicate to any tenant holding a pin.

**Rule.** A deprecated prompt MUST continue behaving exactly as before throughout its window. A prompt that has become unreliable is retired, not deprecated.

## 3.9 Rollback and incident response

Not a lifecycle stage but a path out of Monitoring, and it needs stating explicitly because the instinct under pressure is wrong.

**When a prompt is causing production harm, roll back. Do not edit.**

An emergency edit is an unreviewed, unevaluated prompt version reaching production during an incident — the worst possible conditions for introducing a change. Rollback is a version repin: it is immediate, it is known-good, and it needs no deployment.

**Mandatory rollback triggers** (`GDE-002` §12.6): schema validity falling below threshold; repair rate rising; cost per invocation rising without a justified quality gain; human rejection rate rising; any evaluation regression discovered after promotion.

**After rollback:** the failure becomes an evaluation case (`STD-000` Rule 56), the root cause is diagnosed using the four-lever order (`GDE-002` §12.5), and the fix re-enters at Creation. There is no fast path back to production that skips review and evaluation.

## 3.10 Retirement

**Entry.** End-of-support date reached and pinned usage is zero.

**Work.** Stop resolving the version for new work.

**Rule.** The version remains **resolvable forever** for replay and audit (`ARC-001` §6.2). A run from eighteen months ago must still be explainable, and that requires its prompt. History is never deleted.

---

# 4. Prompt Categories

## 4.1 Two axes, not one taxonomy

The platform already has two classification systems: **functional class** (`STD-000` §3.11) and **domain category** (`GDE-002` §7). A third would be one too many.

Prompt categories are therefore organised as two axes that compose with the existing systems rather than competing with them:

| Axis | Values | Determined by |
|---|---|---|
| **Layer** — where it sits in the invocation | System · User · Repair | The prompt's role in the invocation |
| **Purpose** — what work it performs | Generation · Extraction · Transformation · Classification · Review · Validation | The agent's functional class |

Every prompt declares both. An agent's prompt set is typically one system prompt, one user prompt template, and — where its output is worth repairing — one repair prompt. The *purpose* axis is inherited from the agent's functional class and is not chosen independently.

## 4.2 Layer: System Prompt

**Holds.** Role, objective, input contract, rules and constraints, output contract, refusal and unknown policy, examples (`STD-000` §4.4).

**Properties.** Stable across every invocation of its version. Contains no runtime data. Carries all behavioural authority. Never contains untrusted content.

**Responsibility.** This is the prompt. Everything that determines behaviour lives here, which is what makes behaviour attributable to a version.

**Design emphasis.** Stability. The system layer should be byte-identical across invocations of a version — required both for provider-side caching (§12.4) and for attributing behaviour to a version rather than to a rendering accident.

---

## 4.3 Layer: User Prompt

**Holds.** The runtime payload only — task inputs, retrieved context, the artifact under consideration.

**Properties.** Varies per invocation. Contains no behavioural instruction. Contains all untrusted content, delimited and labelled.

**Responsibility.** Deliver data. Nothing else.

**Design emphasis.** Clear delimitation and labelling. Every distinct input is separately delimited and named, so that the model can tell one from another and so that untrusted blocks are unmistakably marked as data (§13.3).

**The rule that gets broken.** Behavioural instruction placed in the user layer "because it varies per run" is a design error. Instruction that varies is either a **variable inside a system-layer rule** (§6.5) or evidence that two agents have been merged into one.

---

## 4.4 Layer: Repair Prompt

**Holds.** The original input, the previous invalid output, and the structured validation findings.

**Properties.** Used only after a validation failure. Bounded by the repair budget (`STD-000` §7.2). Same or lower temperature than the original attempt.

**Responsibility.** Correct the identified faults **while preserving everything valid**.

**Design emphasis.** Three specific requirements, each of which is commonly missed:

1. **Findings only, not history.** The repair prompt receives the specific structured findings — path, rule, expected, actual — and **not** the accumulated history of prior attempts. Accumulated failure context degrades output, inflates cost, and biases the model toward repeating earlier mistakes (`STD-000` §7.4).
2. **Targeted, not regenerative.** The instruction is to fix the named faults and leave everything else untouched. Unconstrained repair regenerates the whole document, discarding valid work and re-incurring full cost.
3. **Never a coercion tool.** A repair prompt MUST NOT be used to push a model past a legitimate refusal or a policy stop. That is evasion and is prohibited (`STD-000` §7.4).

**When to have one.** Only where output is large enough or expensive enough that targeted correction beats regeneration. For a small, cheap output, regeneration is simpler and often better.

---

## 4.5 Purpose: Generation

**Agent class.** Generator. **Domain categories.** Creative, Planning.

**Emphasis.** Bounded creativity — the schema holds the structure while content varies within it (`STD-000` §4.5). Constraints stated as explicit numeric bounds, never as adjectives. Brand, strategy, and locale conformance supplied as variables and enforced by validation, never assumed.

**Distinctive risk.** Regression to generic output. Models converge on the safest, most conventional response, which for content intended to earn attention is precisely the failure mode. Counter it with specificity in the input and distinctiveness criteria in the rules — never by raising temperature (§16.9).

**Testing.** Rubric scoring plus human sampling. Measure **variance**, not just mean (§14.3).

---

## 4.6 Purpose: Extraction

**Agent class.** Extractor. **Domain category.** Research.

**Emphasis.** Grounding and abstention above all. Every extracted claim carries a reference resolvable against the supplied input. Insufficient sources produce an explicit non-answer, never an approximation. Fully deterministic parameters.

**Distinctive risk.** Plausible completion. Where the source is nearly sufficient, models fill the gap fluently and confidently. The prompt MUST make abstention the explicitly correct behaviour, not merely a permitted one — models treat "you may say unknown" and "you must say unknown" very differently.

**Testing.** Exact or near-exact match against a golden set, plus verification that references resolve.

---

## 4.7 Purpose: Transformation

**Agent class.** Transformer. **Domain categories.** Publishing, Research.

**Emphasis.** Preservation. The rules state explicitly what must be preserved and what may change. Fully deterministic.

**Distinctive risk.** Silent improvement. Asked to restructure, models will also correct, embellish, and summarise unless told not to. For a transformation stage this is data corruption, because the change is invisible — the output is well-formed and the alteration is only detectable by comparison.

**Testing.** Structural comparison plus information-preservation checks: nothing lost, nothing added.

---

## 4.8 Purpose: Classification

**Agent class.** Router; Extractor. **Domain categories.** All.

**Emphasis.** Exhaustive, mutually exclusive categories with an explicit fallback for genuine ambiguity. Boundaries defined by criteria, not by example alone. Temperature zero.

**Distinctive risk.** Forced choice. Given no ambiguity option, a model will always pick something, and the confident wrong classification propagates silently. Every classification prompt MUST provide an explicit `UNKNOWN` or `AMBIGUOUS` outcome and MUST state when to use it.

**Testing.** Accuracy against labelled decisions, with particular attention to boundary cases between adjacent categories.

---

## 4.9 Purpose: Review

**Agent class.** Critic. **Domain category.** Review.

**Emphasis.** Actionable structured findings — location, severity, rule violated, concrete suggested correction. Prose review is unusable by an automated repair loop (`STD-000` §6.4). Deterministic parameters.

**Distinctive risk.** Both over- and under-flagging. A critic that flags everything is as useless as one that flags nothing, and the prompt must define severity thresholds explicitly rather than leaving them to judgment.

**Hard constraint.** MUST NOT review output produced by the same prompt version, and SHOULD NOT use the same model (`GDE-002` §15.10).

**Testing.** Precision and recall against expert-labelled findings — both directions measured.

---

## 4.10 Purpose: Validation

**Agent class.** Judge. **Domain category.** Validation.

**Emphasis.** A versioned rubric with defined criteria and defined levels. Per-criterion scores with justification references, never an overall number alone. Temperature zero.

**Distinctive risk.** Uncalibrated scoring. "Rate this out of ten" is an unauditable opinion that drifts with every model revision. Calibration against human-labelled samples MUST be measured continuously; an uncalibrated judge is a random gate, which is worse than no gate because it manufactures false assurance.

**Hard constraint.** Informs; never authorizes. Nothing irreversible depends on it alone (`STD-000` §6.4).

**Testing.** Correlation with human scores, tracked over time.

---

# 5. Prompt Structure

The eight canonical blocks in mandatory order (`STD-000` §4.1). This section is the authoring manual: what each block is for, how to write it, and how it typically fails.

Order is part of the standard. Consistent placement reduces instruction-following variance across models and makes prompts diffable and reviewable at a glance.

## 5.1 Why order matters

Two reasons, one certain and one probabilistic.

**Certain:** instructions must precede data (`STD-000` §4.1). A model reading data before it knows the task processes it without purpose, and — critically for security — instruction-shaped content arriving before the real instructions is in a stronger position to influence behaviour (§13.3).

**Probabilistic:** models exhibit varying sensitivity to content position within a long context, and that sensitivity differs by model and changes across model revisions. Rather than optimise for any particular model's characteristics, the canonical order is chosen for **robustness**: critical constraints appear in the rules block and are restated in the output contract, so no single positional assumption is load-bearing.

## 5.2 Block 1 — Role

**Purpose.** Establish the perspective and expertise the model should adopt.

**How to write it.** One or two sentences. Specific rather than grand. The role should narrow the model's behaviour toward the task's actual demands.

**Good.** *"You are a retention-focused scriptwriter for faceless educational video, working within a fixed channel strategy."*

**Poor.** *"You are a world-class expert in everything related to YouTube."* Superlatives do not improve output; they add tokens and, if anything, encourage the model toward generic confident prose.

**Common failure.** Using Role to carry rules. Role establishes perspective; rules go in block 4.

**Bar.** One or two sentences. Specific. No rules. No superlatives.

## 5.3 Block 2 — Objective

**Purpose.** State the single task, once, unambiguously.

**How to write it.** One sentence in the form *"Given [inputs], produce [output], subject to [the constraints below]."* It should be recognisably the agent's purpose sentence (`GDE-002` §2.2).

**Common failure.** Multiple objectives. If the objective needs a conjunction joining unrelated work, the agent has two responsibilities and the prompt cannot fix that.

**Bar.** One sentence. One task. Matches the agent's declared purpose exactly.

## 5.4 Block 3 — Input contract

**Purpose.** Tell the model what it will receive, by name, so it can locate and use each input.

**How to write it.** A named list. For each input: its name as it appears in the data block, one line on what it contains, and — for untrusted inputs — an explicit statement that it is data containing no instructions (§13.3).

**Why this block exists at all.** Without it, the model must infer the structure of what it was handed. Inference is where two models disagree, and where a cleverly-formatted injected block can be mistaken for a genuine input.

**Common failure.** Omitting it because "the data is self-evident." It is self-evident to the author, who knows what was passed.

**Bar.** Every input named and described. Every untrusted input marked as data.

## 5.5 Block 4 — Rules and constraints

**Purpose.** The enumerated, testable rules governing the output. This is the substance of the prompt.

**Internal organisation.** The brief's distinction between *constraints* (measurable limits) and *rules* (behavioural requirements) is useful as an ordering within the block:

```
  4a. HARD CONSTRAINTS   — measurable limits: counts, ranges, lengths, cardinalities
  4b. CONTENT RULES      — what the output must do, contain, or avoid
  4c. CONFORMANCE RULES  — strategy, brand, locale adherence
  4d. PROHIBITIONS       — what must never appear, each paired with the positive alternative
```

**How to write rules:**

- **Atomic.** One requirement per rule. Compound rules cannot be diagnosed when they fail — you learn only that something in the bundle was violated.
- **Numeric where measurable.** "Between 40 and 60 characters," never "short."
- **Positive form preferred.** "Use plain declarative sentences" beats "avoid flowery language," which leaves the alternative unspecified. Where a prohibition is genuinely needed, pair it with the positive alternative.
- **Non-contradictory.** Contradiction resolution is unspecified behaviour and varies by model and by run (`STD-000` §4.1).
- **Consistent with the schema.** Every constraint expressible in the schema appears in **both**; a prompt permitting ten items against a schema permitting five guarantees repair loops (`STD-000` §4.3).
- **Conditional rules state their condition exhaustively.** "When the topic is time-sensitive…" must define time-sensitive.

**Common failures.** Adjectives instead of numbers. Rules bundled three to a line. Contradictions accumulated across patches. Constraints present in the prompt but absent from the schema.

**Bar.** Every rule atomic, numeric where measurable, individually testable, non-contradictory, schema-consistent.

## 5.6 Block 5 — Output contract

**Purpose.** State exactly what to emit, and exactly what not to.

**How to write it.** Full guidance in §8. In summary: name the required structure; state that nothing else is emitted; prohibit preamble, explanation, commentary, and markup explicitly.

**Where constrained decoding is available**, the schema is enforced mechanically and the prompt MUST NOT also restate it in prose — that is duplicated tokens on every call for no benefit (`STD-000` §11.1). The block still states the *behavioural* requirements: emit only the structure, nothing around it.

**Bar.** Structure named. "Nothing else" stated explicitly. No prose restatement of a mechanically-enforced schema.

## 5.7 Block 6 — Refusal and unknown policy

**Purpose.** Define behaviour when the task cannot be completed as specified. Mandatory in every prompt without exception.

**Three distinct behaviours** (`GDE-002` §11.2), which the prompt MUST distinguish:

| Situation | Required behaviour |
|---|---|
| A specific value cannot be determined | Use the declared unknown representation. Return valid output. |
| Valid output cannot be produced at all | Return the declared failure form. |
| The request is out of scope or unsupportable | Refuse, in the declared structured form. |

**The mandatory sentence.** Every prompt MUST contain an explicit instruction never to infer, estimate, approximate, or fabricate a missing value (`STD-000` §4.7, Rule 18). No exceptions, no agent classes exempted.

**Common failure.** Omitting this block because "it shouldn't happen." It happens. Absent this block, the model's default is to produce something plausible — which is the single most expensive failure mode available, because it passes structural validation and travels downstream.

**Bar.** All three behaviours specified. The never-fabricate instruction present verbatim.

## 5.8 Block 7 — Examples

**Purpose.** Convey structure or subtle quality that rules cannot express.

**When to include.** Only where structure is complex, a subtle stylistic quality must be conveyed, or evaluation shows measurable improvement. Not reflexively — examples cost tokens on every call and narrow output diversity (`STD-000` §4.8).

**How to write them.** Two to five. Diverse across the realistic input space. At least one boundary case. Every example schema-valid — a schema-invalid example actively teaches invalid output and is a severe defect. Never containing real PII, credentials, or tenant data.

**Negative examples** MAY be included where a specific recurring failure needs marking, clearly labelled as incorrect **and always accompanied by the corrected form**. A negative example shown alone teaches the wrong thing.

**Common failure.** Homogeneous examples, which cause the model to reproduce their surface features rather than their structure — producing five outputs that all sound like example one.

**Bar.** Justified by measured benefit. All schema-valid. Diverse. Boundary case present. Re-validated whenever the schema changes.

## 5.9 Block 8 — Input data

**Purpose.** The runtime payload. Always last.

**How to write it.** Each input in its own clearly delimited, named block. Untrusted content explicitly labelled as data containing no instructions, with delimiters neutralised in the content so the block cannot be terminated early (§13.3).

**Bar.** Last. Delimited per input. Named. Untrusted content labelled and its delimiters neutralised.

## 5.10 What the structure achieves

| Property | Mechanism |
|---|---|
| Reviewability | Every prompt in the platform has the same shape; a reviewer knows where to look |
| Diffability | Changes localise to a block, so review scope is obvious |
| Security | Instructions before data; authority in the system layer; untrusted content last and labelled |
| Cacheability | Stable prefix, variable content late (§12.4) |
| Portability | One convention, adapted per provider by the adapter rather than by the author |

## 5.11 What never appears in a prompt

- **Authoring notes, rationale, or commentary.** These belong in the specification and the change log. A note inside a prompt is tokens paid for on every invocation, and models sometimes act on parenthetical asides.
- **Version history or changelog entries.**
- **"TODO," "FIXME," or provisional wording.** Provisional text in a production prompt is a defect.
- **Secrets, credentials, internal identifiers, or PII beyond task need** (`STD-000` §4.1).
- **Vendor-specific syntax or markers** (§11.4).
- **Instructions to explain instructions.** This is a prompt-extraction vector (§13.5).

---

# 6. Prompt Variables

`STD-000` §4.2 fixes the binding rules — declaration, strict resolution, typing, escaping, untrusted marking, absence handling, cache-friendly placement. This section covers naming, defaults, reserved namespaces, and injection mechanics.

## 6.1 Naming

- Variables use `camelCase`, matching the platform's contract convention (`STD-000` §5.2). One convention everywhere removes an entire class of mapping error.
- Names describe **content**, not source or purpose: `channelStrategy`, not `inputThree` or `dataFromPreviousStep`.
- Names carrying units include the unit: `targetDurationMs`.
- Names MUST be unique within a prompt. Reusing a name for two purposes is the prompt-layer form of repurposing a field (§16.8).
- Names MUST NOT abbreviate beyond universally understood forms. Self-describing names reduce error rates for both models and humans.

## 6.2 Required variables

A variable is required when the prompt is meaningless without it.

- Unresolved required variable is a **hard failure before invocation** — never an empty substitution (`STD-000` §4.2).
- This is worth restating because the failure is so quiet: an empty substitution produces a prompt with a missing constraint, and the model returns plausible, unconstrained, well-formed output. Nothing fails. The defect surfaces weeks later as unexplained quality variance.

## 6.3 Optional variables

- Every optional variable MUST declare its **absence behaviour**: either an explicit "not provided" marker, or **full omission of the enclosing block**.
- Full block omission is usually correct. A dangling label with nothing after it is worse than absence — it signals that something should be there and invites the model to invent it.
- An optional variable without declared absence behaviour is a required variable with the requirement undocumented.

## 6.4 Defaults

**Prompts have no defaults.** A variable is resolved before rendering or its absence is handled explicitly (§6.3).

Default *values* belong to configuration and are resolved before the prompt is rendered (`GDE-003` §6.8). A prompt containing a fallback value inline is configuration hidden in prompt text — invisible to configuration management, unversioned as configuration, and impossible to vary by tenant, channel, or locale.

## 6.5 Context injection

Variables are the mechanism by which per-channel, per-brand, and per-locale variation enters a prompt **without forking it**.

| Varies by | Injected as | Never |
|---|---|---|
| Channel | Strategy constraints as a variable | A per-channel prompt variant |
| Brand | Tone descriptors, vocabulary preferences and prohibitions as variables | Brand rules written into prompt text |
| Locale | Locale-specific constraints as variables, within a locale prompt variant (`STD-000` §4.10) | Runtime string interpolation into an English template |
| Run | Task inputs as variables | Behavioural instruction in the user layer |

**This is the platform's primary reuse mechanism** and should be reached for before fragments (§2.8). One prompt serving a thousand channels through variables is maintainable; a thousand prompt variants is not.

**The limit.** Variables carry *values*, not *behaviour*. A variable whose content is an instruction ("also do X") is behavioural instruction smuggled into the data layer, and it is indistinguishable from a successful injection (§13.3).

## 6.6 Validation

Variables are validated **before rendering**, using the same standards as any contract (`STD-000` §4.2, `GDE-003` §12):

- Type conformance.
- Constraint conformance — length, range, cardinality.
- Size bounds. Untrusted variables MUST be bounded before invocation; unbounded untrusted input is a denial-of-wallet vector (§13.6).
- Trust annotation present where applicable.

An invalid variable is a pre-invocation failure. Rendering a prompt with known-invalid content and hoping the model copes wastes an invocation and produces an unattributable result.

## 6.7 Escaping and delimiting

Every variable's content MUST be rendered such that it cannot terminate its enclosing block or be read as instruction (`STD-000` §4.2).

Requirements:

- Delimiters chosen so they are unlikely to occur naturally in content.
- **Delimiter sequences neutralised within the content**, so a block cannot be closed early. This is the specific mechanism that defeats the most common structural injection attempt, and it is the one most often omitted.
- Each variable in its own named block, so the model can distinguish inputs from one another.
- Untrusted blocks explicitly labelled as data containing no instructions.

## 6.8 Reserved variables

A small reserved namespace exists for platform-supplied context. Reserved names MUST NOT be redefined by any prompt.

| Reserved name | Supplied by | Carries |
|---|---|---|
| `locale` | Platform | The target locale (`STD-000` §4.10) |
| `strategyConstraints` | Governance | Strategy elements this agent must conform to |
| `brandVoice` | Governance | Brand tone, vocabulary preferences and prohibitions |
| `channelContext` | Workflow | Channel history relevant to this task |
| `outputSchema` | Runtime | Schema reference, where prose restatement is required |
| `repairFindings` | Runtime | Structured validation findings — repair prompts only |

Rules: reserved variables are supplied by the platform, never by an agent author. They carry consistent meaning across every prompt, which is what allows platform-wide changes (a new locale, a strategy revision) to propagate without touching prompt text. Redefining one is a review failure.

---

# 7. Context Management

## 7.1 Context is a budget

Every token of context is paid on every invocation, competes with instructions for attention, and — if untrusted — enlarges the attack surface. Context is a budget to be spent deliberately, not a resource to be filled.

The agent's declared token budget (`STD-000` §11.8) is the ceiling. Prompts are authored to fit it, not measured against it afterwards.

## 7.2 The minimum context principle

Supply the least context that permits correct output (`GDE-002` §5.1).

**The empirical test.** For each candidate input: *remove it and measure against the evaluation set.* If quality does not measurably drop, it does not belong. This test must be run, not reasoned about — intuitions about what a model "needs" are unreliable in both directions.

**What to pass instead of everything** (`GDE-002` §5.2): the relevant facts rather than the full dossier; the segment plus structural context rather than the full script; a style profile rather than the full history; the applicable strategy elements rather than the whole contract.

**Summarisation is a legitimate stage.** Where several agents need the gist of a large artifact, produce a summary once through a dedicated agent and pass it to all consumers. This converts an O(n) per-consumer cost into a single one, and the summary becomes a versioned, inspectable artifact in its own right.

## 7.3 Context isolation

Each distinct input occupies its own named, delimited block. Concatenating several inputs into one undifferentiated blob:

- prevents the model from distinguishing sources, which breaks grounding;
- prevents per-input trust annotation, which breaks the injection defence;
- prevents per-input size bounding;
- makes findings unlocatable, since there is no path to reference.

**Trusted and untrusted content MUST NOT share a block.** Trust is a property of a delimited region, and a region containing both has the trust level of its least-trusted content.

## 7.4 References versus inlining

The prompt receives what the **model must read**. Nothing else (`GDE-002` §5.5).

| Inline in the prompt | Pass as a reference, not in the prompt |
|---|---|
| Text the model must reason over | Media assets |
| Small structured context | Large documents used only for lookup by another component |
| Identifiers the model must echo | Anything the model does not read |

An identifier the model must carry through to its output is inlined as a short opaque string; the artifact it names is not.

## 7.5 External knowledge

**Model-internal knowledge is not a source.** For any agent making factual claims, the prompt MUST require that claims derive from supplied material and MUST require abstention where material is insufficient (`STD-000` §4.7).

This applies even where the model is likely correct. Model knowledge has no citation, no recency guarantee, and no verification path — a claim the validator cannot check against supplied input is ungrounded regardless of its truth, and it will eventually be wrong in a way nothing catches.

Where general capability is genuinely required — language fluency, structural convention, common-sense coherence — that is capability, not knowledge, and it is not a factual claim.

## 7.6 Conversation memory

**There is none, and this is deliberate.**

Every invocation is a single-shot transaction with no history (`STD-000` §3.7, `GDE-002` §2.1). Prompts MUST NOT reference prior turns, prior outputs, or "what we discussed."

Where history is genuinely needed — channel voice, prior video topics, established patterns — it arrives as an **explicit declared variable** assembled by the workflow (`GDE-002` §3.2). This is not a workaround; it is strictly better:

- **Auditable** — you can see exactly what influenced a decision.
- **Bounded** — history that grows without limit is a cost and latency problem that compounds silently.
- **Curated** — the workflow passes the *relevant* history, not everything that happened.
- **Reproducible** — the same history produces the same context on replay.

## 7.7 Context size optimisation

- **Order for caching.** Stable content first, variable content late (§12.4).
- **Structure over prose.** Structured context is more compact and less ambiguous than narrative description of the same facts.
- **No restated schema** where constrained decoding enforces it (`STD-000` §11.1).
- **No restated inputs.** The model has them; describing them again in the rules is duplication.
- **Bound every untrusted input** before invocation (§13.6).
- **Monitor size distribution.** Context growth is gradual, passes every individual review, and is only visible in aggregate.

---

# 8. Output Requirements

How a prompt specifies its output. The contract itself is `GDE-003`; the schema is the agent's. This section is the craft of stating the requirement.

## 8.1 Structured output only

Every prompt requires structured output conforming to the agent's declared schema. No prompt in the platform requests prose as its primary contract (`STD-000` §3.5).

**Where the provider supports constrained generation, it MUST be used** (`STD-000` §6.2). The prompt then does **not** restate the schema in prose — that is duplicated tokens on every call for no benefit.

**Validation remains mandatory afterward.** Constrained decoding guarantees shape, not semantic validity, and provider implementations are imperfect.

## 8.2 What the output contract block must state

Regardless of enforcement mechanism, the block states the *behavioural* requirements:

1. **Emit the declared structure.** Named, not described in full.
2. **Emit nothing else.** Explicitly — this is the load-bearing sentence.
3. **No preamble, commentary, explanation, apology, or restatement.**
4. **No markdown, code fences, or framing** around the payload.
5. **No reasoning in the payload** (§8.5).

**Why "nothing else" must be explicit.** Models default to helpfulness. Absent explicit prohibition they will add a sentence of context, wrap output in a fence, or explain a choice — each of which is a parsing risk and a token cost (§2.7).

## 8.3 Schema adherence

- Every constraint expressible in the schema appears in **both** schema and prompt (`STD-000` §4.3). The schema enforces; the prompt improves first-pass compliance. Neither is sufficient alone.
- Prompt and schema MUST agree exactly. Disagreement guarantees repair loops and wasted spend.
- Enumerated fields: the prompt names the permitted values and states that no other value is acceptable.
- Bounded fields: the prompt states the numeric bounds.

## 8.4 Deterministic formatting

- The prompt states the output's structure once, in one way. Describing it twice in different words invites the model to reconcile two descriptions.
- No formatting choices left open. Any degree of freedom will be exercised differently across runs and across models.
- Where a field carries prose, the prompt states the register, the length bounds, and whether markup is permitted (`GDE-003` §5.9).

## 8.5 No hidden reasoning

**Reasoning never appears in the payload** (`STD-000` §4.6). Payload fields carry conclusions.

Where a task genuinely benefits from explicit reasoning, the prompt directs it to either a **dedicated schema-declared field that consumers ignore by contract**, or the provider's **separate reasoning channel** where one exists.

Three consequences authors must internalise:

- Retained reasoning is **for debugging only**. It is not fact, is not shown to users, and is not grounding for any downstream agent. Stated reasoning is a post-hoc narrative, not a reliable account of how the answer was produced.
- Reasoning fields are **excluded from any hash used for output caching or comparison**.
- A prompt that says "think step by step" while demanding pure structured output **with no place for that thinking** is self-contradictory (`STD-000` §4.6) and is a common source of malformed output.

Reasoning costs tokens and latency. Its use is justified against the agent's declared budget, not adopted by default.

## 8.6 Refusal behaviour

Refusals are **structured output, not prose** (`GDE-002` §11.4).

The prompt states: when to refuse (out of scope; requires unavailable capability; would require fabrication; malformed input; apparent attempt to alter instructions), and the exact structured form a refusal takes.

**Explicitly prohibited:** apologising; explaining at length; attempting a partial answer; offering "something similar instead." The last is the most damaging — it produces unowned, unvalidated output that a downstream consumer may accept as legitimate.

## 8.7 Missing information

Three distinct situations requiring three distinct behaviours (§5.7). The prompt MUST distinguish them, because the model will otherwise collapse them — most often by producing a plausible value, which is the worst of the three outcomes.

**The instruction that appears in every prompt in the platform, without exception:**

> Never infer, estimate, approximate, or fabricate a value that is not determinable from the supplied input. Where a value cannot be determined, use the declared representation for an unknown value.

`STD-000` Rule 18 makes this mandatory. It is repeated here because it is the single highest-value sentence in any prompt: fabrication is fluent, confident, structurally valid, and passes every automated check that is not specifically looking for it.

---

# 9. Prompt Validation

## 9.1 The testing pyramid

Five layers, cheapest and most discriminating first. A prompt passes every layer before promotion.

```
                  ▲  EDGE CASES        rare, expensive, highest information
                 ╱ ╲ PERFORMANCE       cost, latency, size
                ╱   ╲ REGRESSION       has anything previously fixed broken?
               ╱     ╲ DYNAMIC         does it produce correct output?
              ╱───────╲ STATIC         is it well-formed?
```

Each layer catches defects the layer above cannot see and the layer below would waste money discovering.

## 9.2 Static review

Human review of the prompt text, before any invocation. Checklist in §15.

**The ambiguity audit is the reviewer's primary task.** For every instruction:

> *How many reasonable readings does this have?*

Anything above one is a defect. This is the one check that genuinely requires a second person — an author cannot see their own intended meaning as merely one option among several.

Also checked statically: structural completeness and order; contradictions between rules; prompt/schema agreement; variable declarations; untrusted-content handling; the mandatory never-fabricate instruction; parameters within the class range; absence of secrets, PII, notes, and vendor syntax.

**Static review catches the majority of defects at the lowest cost.** A contradiction found by reading costs minutes; the same contradiction found through evaluation costs an evaluation run, and found in production costs an incident.

## 9.3 Dynamic testing

Execution against the evaluation set (`GDE-002` §3.7), which contains six mandatory case types: representative, boundary, degenerate, adversarial, locale, and regression.

Measured: schema validity on first attempt; class-appropriate correctness (exact match, structural equivalence, rubric score, or agreement, per §14.2); constraint conformance; refusal and unknown behaviour actually triggering when it should.

**Negative testing is not optional.** A prompt that produces good output on good input is half-tested. The cases that matter are the ones where it should *decline* — insufficient sources, out-of-scope requests, contradictory input. Every one of those paths must be shown to work, because in production they are the paths that prevent expensive failures.

## 9.4 Output verification

Beyond correctness, structural verification of every output:

- Schema conformance, including closed-schema violations.
- Bound conformance on every constrained field.
- **Grounding verification** — every claimed reference resolves against supplied input. This converts hallucination from a subjective question into a mechanical check and is the highest-value verification available for factual agents.
- **Completeness** — no placeholders, no template residue, no filler, no truncation. Truncation is checked against the provider's stop reason, never inferred from content (`STD-000` §6.7).
- **Absence checks** — no preamble, no markup, no reasoning in the payload, no volunteered fields.

## 9.5 Regression testing

Every prompt version runs the full evaluation set and is compared against the incumbent on three axes:

| Axis | Question |
|---|---|
| **Quality** | Does it score at least as well on every case? |
| **Cost** | Has cost per invocation risen? |
| **Latency** | Has latency risen? |

**Zero regression is the promotion bar** (`STD-000` §13.3). A quality gain bought with a large cost increase is a trade to be decided deliberately and recorded — never assumed to be a win.

The evaluation set **grows and never shrinks**: every production defect adds a case (`STD-000` Rule 56). A case may be revised deliberately when the desired behaviour genuinely changes; it is never removed because it became inconvenient.

## 9.6 Performance testing

Measured, not estimated: input and output token counts across the case distribution; cost per invocation at expected and worst case; latency at p50 and p95; cache hit rate where prompt caching applies.

Results populate the agent's declared budgets (`STD-000` §11.8). **A budget derived from a guess is documentation, not a control.**

## 9.7 Edge cases

The cases most likely to be skipped and most likely to matter:

| Case | What it catches |
|---|---|
| Minimum viable input | Whether the prompt degrades or fabricates when starved |
| Maximum size input | Truncation, degradation, budget breach |
| Empty optional variables | Whether absence handling actually works |
| Contradictory input | Whether it fails cleanly or invents a reconciliation |
| Out-of-scope request | Whether refusal triggers |
| Insufficient sources | Whether abstention triggers rather than plausible completion |
| Injection-bearing content | Whether instruction hierarchy holds (§13.2) |
| Non-Latin script, RTL, mixed script | Whether length and formatting rules survive |
| Content near a policy boundary | Whether behaviour is appropriate and consistent |

**Adversarial cases run on every version, without exception.** Injection resistance regresses silently — a wording change made for an unrelated reason can weaken it, and nothing else will reveal that.

## 9.8 Cross-provider and cross-locale validation

- **Every approved provider.** A prompt passing on one provider is *unevaluated* on another (`STD-000` §14.4). Behavioural differences between models are routine, not exceptional.
- **Every approved locale.** A prompt passing in one language is *unevaluated* in another (`STD-000` §15.5). A locale without a passing evaluation set is not supported, whatever the configuration claims.

---

# 10. Prompt Versioning

`STD-000` §4.9 fixes the binding rules. This section covers the mechanics.

## 10.1 Dual identity

Every prompt version carries two identifiers serving different purposes:

| Identifier | Form | Purpose |
|---|---|---|
| **Content hash** | Cryptographic hash of the fully-resolved prompt | Absolute identity. Two prompts with the same hash are the same prompt. Recorded on every invocation |
| **Semantic version** | `MAJOR.MINOR.PATCH` | Human-meaningful change communication |

The content hash is authoritative for attribution — it is what makes a historical result explainable. The semantic version is for humans deciding whether to adopt a change.

**The hash is of the fully-resolved, expanded prompt**, with all fragments composed. A hash of an unresolved template would not identify what actually ran.

## 10.2 Prompt identity

A prompt is identified by its owning agent, its layer, and its locale — for example, an agent's system prompt for a given locale. Every version of that prompt shares the identity and differs by version.

Rules: identity never changes; renaming creates a new prompt with no history. Identity includes locale, because locale variants are separate prompts with separate versions and separate evaluation sets (`STD-000` §4.10) — not one prompt with a language switch.

## 10.3 Version numbering

| Increment | When |
|---|---|
| **MAJOR** | Behaviour changes materially; the contract changes; output could differ in ways downstream consumers would notice |
| **MINOR** | Behaviour improves within the same contract — clearer rules, better examples, tightened constraints |
| **PATCH** | No behavioural change — typography, ordering within a block, comment removal |

**PATCH is rare and must be justified.** There is very little that changes a prompt's text without any possibility of changing behaviour. When in doubt, it is MINOR — and it is evaluated like any other change.

## 10.4 Compatibility

A prompt version is compatible with a specific schema version and a specific set of approved provider/model combinations. All are recorded on the version.

- A schema change **requires** a prompt review, because prompt/schema agreement must be re-verified (§8.3).
- A prompt version is **only approved for combinations it was evaluated on**. Running it on an unevaluated model is running unvalidated (§9.8).
- Multiple prompt versions coexist. Tenants may pin (`STD-000` §4.9).

## 10.5 Change history

Every version records: content hash; semantic version; author; reviewer; date; **rationale**; changed blocks; model parameters; target schema version; evaluation results per provider and locale; production metrics once available; status.

**The rationale field carries disproportionate value.** "What changed" is visible from the diff. "Why" is not, and it is what the next engineer needs in order to avoid re-introducing the problem this version solved. A rationale of "improved prompt" is a defect.

## 10.6 Rollback

**Rollback is a registry repin. It requires no deployment and is the correct first response to any production prompt problem** (§3.9).

Preconditions that make this work — all already required elsewhere — are worth naming together, because rollback silently depends on all four:

1. Prior versions are immutable and retained.
2. Version resolution is registry data, not deployed configuration.
3. Runs pin at start, so rollback affects only new runs (`ARC-001` §6.7).
4. Schema compatibility is recorded, so the prior version is known to be safe with the current schema.

**Rollback is never blocked by "we'd lose the improvements."** The improvements are in a retained version and can be re-promoted once diagnosed.

## 10.7 Deprecation and retirement

Deprecation: mark, state the replacement and end-of-support date, track pinned usage, communicate to holders. Behaviour MUST NOT degrade during the window.

Retirement: stop resolving for new work after the end date and after usage reaches zero. **The version remains resolvable forever** for replay and audit (§3.10).

---

# 11. Provider Independence

## 11.1 The objective

A prompt authored once runs on any approved provider, with quality differences measured rather than discovered, and provider changes absorbed without touching business logic (`STD-000` §14, `ARC-001` §4.9).

**The acceptance test:** adding a provider requires an adapter, configuration, and evaluation runs — and **zero** changes to any prompt (`STD-000` §14.6). If a prompt must change, either the abstraction leaked or the prompt was under-specified.

## 11.2 Capabilities, not vendors

Prompts and agents declare **capabilities**: structured output enforcement, tool invocation, context class, vision, reasoning depth, deterministic seeding, prompt caching, latency class.

The router resolves a capability profile to a concrete model at runtime under policy, budget, availability, tenant restriction, and measured quality (`ARC-001` §4.9). No prompt names a model or a vendor.

## 11.3 What differs between providers — and who absorbs it

Providers differ in ways that are real, persistent, and subject to change. The adapter absorbs them; the author does not adapt to them.

| Dimension of difference | Absorbed by |
|---|---|
| How system instruction is delivered and weighted | Adapter (`STD-000` §14.3) |
| Whether output structure can be enforced mechanically | Adapter + runtime — validated structured output is guaranteed above the line regardless of mechanism |
| Tool invocation representation | Adapter |
| Sampling parameter names, ranges, and semantics | Adapter |
| Whether reasoning has a separate channel | Adapter |
| Token accounting and cost units | Adapter |
| Stop and finish reason vocabulary | Adapter — truncation always distinguishable |
| Safety refusal representation | Adapter — surfaced as an explicitly typed outcome, never as an ordinary result |
| Sensitivity to instruction order, few-shot count, and delimiter style | **Nobody — this is why prompts are written for robustness (§11.5)** |

The last row is the important one. The first eight are mechanical and can be normalised. The ninth is behavioural and cannot be — which is why portability is achieved through robust authoring plus per-provider evaluation, not through normalisation alone.

**Specific provider behaviours must be verified against current provider documentation before being relied upon.** They change, and any specifics recorded in a long-lived document will be stale before the document is next reviewed.

## 11.4 Neutral authoring

Prompts MUST NOT contain:

- Vendor or model names, in any block.
- Vendor-specific formatting conventions, markers, or tags.
- Instructions referencing a provider's particular features or quirks.
- Assumptions about tokenisation, context window size, or internal behaviour.
- Workarounds for one model's known weaknesses.

That final prohibition is the one authors resist. A workaround for a specific model's weakness is a bet that the model will keep that weakness and that no other model will be used — both of which fail on the provider's schedule, not yours.

## 11.5 Robustness over tuning

**Write prompts to be robust, not optimised for one model.** Concretely:

- State constraints numerically. Numbers travel; adjectives do not.
- Make rules atomic and independently verifiable, so a model that misses one still satisfies the rest.
- Restate the most critical constraints in both the rules block and the output contract, so no single positional assumption is load-bearing (§5.1).
- Prefer schema enforcement to instruction wherever a constraint can be structural. Structure is provider-independent; instruction-following is not.
- Avoid depending on subtle instruction-following that only one model reliably exhibits.

**The diagnostic worth repeating:** a prompt failing on a second provider is usually under-specified rather than mismatched. Tighten the specification. The prompt that survives three providers is a better prompt (§2.6).

## 11.6 Provider overlays

Where a provider genuinely requires an adaptation, it is expressed as a **versioned overlay applied by the adapter** — never by forking the prompt (`STD-000` §14.4).

Rules: overlays are minimal, versioned with the prompt, and separately evaluated. An overlay that grows into a substantial rewrite is evidence that the base prompt is under-specified, and the correct fix is to strengthen the base rather than to enlarge the overlay.

## 11.7 Cross-provider evaluation

Every prompt version is evaluated on **every** approved provider, and approved combinations are recorded (§10.4).

Quality differences across providers are **expected and normal**. They are measured and recorded, then fed into routing policy — where a model is chosen for a task class based on measured quality rather than reputation (`ARC-001` §4.9). A prompt that fails on one provider is either not approved for it, or is under-specified.

---

# 12. Prompt Performance

## 12.1 What is being optimised

Three things, and they trade against one another: **cost** per invocation, **latency**, and **quality**. Optimising one in isolation reliably damages another. Every performance change is measured on all three (§9.5).

## 12.2 Token discipline

- **State each requirement once, precisely.** Restating for emphasis costs tokens on every call and measurably dilutes the instruction set by making every individual rule a smaller share of the whole (`STD-000` §11.1).
- **No schema restatement** where constrained decoding enforces it.
- **No echoing of inputs** in the rules.
- **No authoring notes** in the prompt (§5.11).
- **Examples justified by measured benefit**, not included by habit (§5.8).
- **Structured context over narrative** — more compact and less ambiguous.

**What not to do.** Do not compress by removing clarity. An ambiguous prompt that saves fifty tokens and adds a two percent repair rate is a net loss — a repair costs a full additional invocation. Optimise redundancy, never precision.

## 12.3 Prompt size

- The agent's declared token budget is the ceiling (`STD-000` §11.8).
- The system layer is fixed overhead on every invocation; it deserves the tightest scrutiny.
- Untrusted inputs are bounded before invocation (§13.6).
- **Size distributions are monitored.** Growth is gradual, passes every individual review, and is only visible in aggregate.

## 12.4 Caching structure

Providers commonly offer reduced cost for repeated stable prompt prefixes. Prompt structure determines whether that benefit is available at all.

**Requirements:**

- **Stable content first.** Role, objective, rules, output contract, refusal policy, and examples are identical across invocations of a version and belong at the front.
- **Variable content last.** Runtime data is placed late, so the cacheable prefix is as long as possible (`STD-000` §4.2).
- **Byte-stable prefix.** Any variation in the stable region — including whitespace or ordering — defeats prefix caching entirely.

**A single variable placed early can eliminate the caching benefit for the whole prompt.** This is the most common and most costly structural performance mistake, and it is invisible without measuring cache hit rate.

## 12.5 Cost

- Cost per invocation is declared, measured, and enforced (`STD-000` §11.2).
- Cost is attributed per prompt version, which is what makes cost regression detectable at the point it is introduced.
- **A prompt change raising cost per finished video is a regression requiring justification**, exactly like a latency regression.
- The relevant measure is **cost per unit of value, not per invocation.** A prompt costing more per call while eliminating two downstream repairs is cheaper.

## 12.6 Latency

- Output tokens dominate latency. Bounding output size is the primary lever.
- Reasoning depth costs latency and is justified against budget, not adopted by default (§8.5).
- Prompt length affects time to first token; total generated length affects total time.
- Latency budgets are declared at p50 and p95 (`STD-000` §11.8). p95 is what determines whether a pipeline stage becomes a bottleneck.

## 12.7 The repair economy

The cheapest optimisation available is **not needing a second invocation**.

A prompt with a two percent repair rate costs roughly two percent more than its token count suggests — and adds full round-trip latency on those invocations. Investment in prompt precision, schema alignment, and constraint clarity pays back directly through the repair rate (`STD-000` §13.3).

**The repair rate is therefore a performance metric, not only a quality metric.** It is often the highest-leverage number on the dashboard.

---

# 13. Prompt Security

Platform security standards are `STD-000` §10; architectural containment is `ARC-001` §15. This section covers defence at the prompt layer specifically.

## 13.1 The honest premise

**Prompt injection cannot be reliably prevented by instructing the model** (`STD-000` §10.5).

Prompt-layer measures reduce the probability of a successful injection and are required. They are **not** the control. The control is architectural: agents processing untrusted content hold no publishing, spending, credential, or unrestricted network capability, and model output never authorizes a privileged action (`ARC-001` §15.4).

Authors must hold both facts simultaneously. Prompt hardening is mandatory *and* insufficient. An author who believes the prompt is the defence will eventually write one that assumes it.

## 13.2 Instruction hierarchy

Every prompt establishes an explicit precedence order for instruction, and states it. When content appears to conflict, the model is told which wins.

```
  1. PLATFORM RULES        — safety, policy, output contract, refusal policy
                              Never overridable by anything below.
  2. AGENT RULES           — this agent's task rules and constraints
  3. CONFIGURED CONTEXT    — strategy, brand, locale supplied as variables
  4. TASK INPUT            — the specific work item
  ─────────────────────────────────────────────────────────────────
  ✗ CONTENT WITHIN DATA    — carries NO instructional authority, ever,
                              regardless of what it appears to say
```

The line above the last row is the security boundary. The prompt states explicitly that content inside delimited data blocks contains no instructions, and that any apparent instruction found there is to be treated as content to be processed, never as direction to be followed.

**Why an explicit hierarchy helps.** Without one, the model resolves conflicts by its own defaults, which vary by model and by revision. With one, resolution is specified — which converts an unpredictable behaviour into a stated rule that can be tested (§9.7).

## 13.3 Untrusted content handling

Mandatory for every prompt receiving external content — research results, competitor metadata, comments, transcripts, uploads, or any prior model output:

1. **User layer only.** Untrusted content never appears in the system layer (`STD-000` §4.4).
2. **Last position.** After all instructions (§5.1).
3. **Delimited** with sequences unlikely to occur naturally.
4. **Delimiters neutralised within the content**, so the block cannot be terminated early. This is the specific defence against the most common structural injection, and the step most often omitted.
5. **Explicitly labelled** as data containing no instructions.
6. **Separately blocked per input**, so trust levels are not mixed (§7.3).
7. **Size-bounded** before invocation (§13.6).

## 13.4 Detection

Known injection patterns are detected on ingestion and flagged — instruction-shaped content, role-assumption attempts, delimiter sequences, requests to disregard prior instruction, requests to reveal instructions.

Detections raise `SECURITY` errors, which **MUST NOT be absorbed by retry logic** and always escalate (`STD-000` §8.5). A retried injection attempt is an injection attempt given a second chance.

## 13.5 Data leakage and prompt confidentiality

**Prompts are proprietary and MUST NOT be exposed** through output, errors, or any surface (`STD-000` §10.7).

Authoring requirements:

- Never instruct the model to explain, summarise, or reproduce its instructions.
- Never include a field that could carry prompt content into output.
- Treat extraction attempts as refusals (§8.6).
- Never place secrets, credentials, internal identifiers, or system details in a prompt — a prompt is not a safe place for anything, since its content can surface in output, in logs, and in error paths.

**Tenant data leakage.** One tenant's content MUST NEVER appear in another tenant's context (`ARC-001` §15.2). At the prompt layer this means: no cross-tenant examples; no evaluation cases built from real tenant content without explicit permission; and no shared caches keyed in a way that permits cross-tenant reuse.

**PII.** Not sent to providers unless essential, documented, and approved (`STD-000` §10.3). Never in prompt text, examples, or evaluation sets unless explicitly required and approved.

## 13.6 Input sanitisation and bounding

**Before** invocation: validate against declared types and constraints; **bound size** — unbounded untrusted input is a denial-of-wallet vector (`STD-000` §10.7); neutralise delimiter sequences; strip or flag known injection patterns; verify trust annotation.

Sanitisation happens before rendering, never inside the prompt. A prompt asking the model to sanitise its own input is asking the untrusted content to be evaluated by the thing it is attacking.

## 13.7 Output as untrusted input

**Model output is untrusted input to every downstream consumer**, including other agents (`STD-000` §10.6).

At the prompt layer: an agent receiving another agent's output treats it as untrusted, delimits it, and labels it as data. "It came from inside the platform" is not a trust argument — the previous agent may itself have processed untrusted content.

## 13.8 The prompt security checklist

- [ ] Instruction hierarchy stated explicitly (§13.2)
- [ ] All untrusted content in the user layer, last, delimited, labelled
- [ ] Delimiters neutralised within untrusted content
- [ ] Each input separately blocked; trust levels not mixed
- [ ] Untrusted input size-bounded before invocation
- [ ] No secrets, credentials, internal identifiers, or PII in prompt text
- [ ] No instruction that could induce disclosure of instructions
- [ ] Extraction attempts handled as refusals
- [ ] Adversarial evaluation cases present and passing
- [ ] No cross-tenant content in examples or evaluation sets

---

# 14. Prompt Quality Standards

## 14.1 Universal thresholds

Every prompt, regardless of purpose, meets these (`STD-000` §13.3):

| Metric | Threshold | Meaning |
|---|---|---|
| First-attempt schema validity | ≥ 99.5% | The prompt reliably produces the declared structure |
| Repair rate | ≤ 2% | Corrections are rare, not routine |
| Escalation rate | ≤ 0.5% | Failures beyond repair are rare |
| Evaluation regression on promotion | 0 | No version ships worse than its predecessor |
| Cost per invocation | Within declared budget | `STD-000` §11.8 |
| Latency p50 / p95 | Within declared budget | `STD-000` §11.8 |
| Provider coverage | Passing on all approved providers | §11.7 |
| Locale coverage | Passing in all approved locales | §9.8 |

## 14.2 Accuracy by purpose

Accuracy means different things by purpose, and a single measure across all of them would be meaningless (`GDE-002` §13.1):

| Purpose | Measure | Method |
|---|---|---|
| Extraction | Correctness of extracted values | Exact or near-exact match; reference resolution |
| Transformation | Information preservation | Structural comparison; nothing lost or added |
| Classification | Decision accuracy | Accuracy against labelled decisions; boundary cases weighted |
| Generation | Rubric score; conformance; originality | Judge scoring plus human sampling |
| Review | Finding agreement | Precision and recall against expert labels |
| Validation | Score correlation | Correlation with human scores; calibration tracked |

## 14.3 Consistency and determinism

Distinct from accuracy, and frequently overlooked.

- **Deterministic purposes** (extraction, transformation, classification, review, validation): output should be identical or near-identical across repeated invocation with the same input. Any variance is a defect, and it is measured.
- **Generation:** output should and will differ; its **quality** should not. High quality variance is a defect even when the mean is acceptable, because production experiences the whole distribution — and the bad tail is what reaches an audience.

**Measure variance, not only mean.** A prompt producing excellent output four times in five and unusable output once in five is not eighty percent good. It is a prompt that will publish something embarrassing this month.

## 14.4 Maintainability and readability

Assessed at review, and genuinely predictive of future defect rates:

- All eight blocks present, in canonical order.
- Rules atomic; no rule bundling three requirements into one line.
- No contradictions detectable on an end-to-end read.
- No accumulated patches whose interaction is unclear.
- Every variable declared and typed.
- Rationale recorded on every version.
- **Readable end to end in a single sitting.** A prompt whose rules cannot be held in mind at once cannot be reasoned about, and its next change will introduce a contradiction (§2.9).

## 14.5 Testability and monitoring

**Testability:** evaluation set exists with all six case types; every rule has at least one case that would fail if the rule were removed — a rule with no failing case is untested and may be doing nothing.

**Continuous monitoring** per prompt version: schema validity, repair rate, escalation rate, cost, latency, cache hit rate, human rejection rate with categorised reasons, and quality trend.

**Human rejection rate with categorised reasons is the highest-signal quality dataset the platform produces** (`STD-000` §13.6). It captures exactly what automated validation cannot yet detect, and it is the input that tells you what to improve next.

## 14.6 Quality decay

Prompt quality degrades with **no change to the prompt** (§3.7). Therefore:

- Evaluation sets run on a schedule, not only on change.
- Production metrics are monitored continuously per version.
- A regression with no corresponding version change indicates external drift — a model revision, a provider change, or an input distribution shift — and MUST be investigated rather than absorbed.

---

# 15. Prompt Review Checklist

Applied before promoting any prompt version, including minor changes. Every item passes or carries a recorded, time-limited waiver.

## Gate 1 — Structure

- [ ] All eight canonical blocks present, in mandatory order (§5)
- [ ] Role: one or two sentences, specific, no rules, no superlatives (§5.2)
- [ ] Objective: one sentence, one task, matches the agent's declared purpose (§5.3)
- [ ] Input contract: every input named and described (§5.4)
- [ ] Rules organised as constraints → content → conformance → prohibitions (§5.5)
- [ ] Output contract present and states "nothing else" explicitly (§5.6, §8.2)
- [ ] Refusal and unknown policy present, covering all three behaviours (§5.7)
- [ ] Input data last, delimited, labelled (§5.9)
- [ ] No notes, TODOs, changelog, or commentary in the prompt (§5.11)

## Gate 2 — Instructions

- [ ] **Ambiguity audit performed by a second person**; no instruction has more than one reasonable reading (§9.2)
- [ ] Every rule atomic and individually verifiable (§5.5)
- [ ] Every measurable constraint stated numerically, never as an adjective
- [ ] Positive form used where possible; every prohibition paired with its alternative
- [ ] No contradictions anywhere in the prompt
- [ ] Conditional rules state their conditions exhaustively
- [ ] Prompt constraints and schema constraints agree **exactly** (§8.3)
- [ ] Prompt readable end to end in a single sitting (§14.4)

## Gate 3 — Variables

- [ ] Every variable declared, typed, and constrained (§6)
- [ ] Naming follows convention; names describe content, not source (§6.1)
- [ ] Required variables strictly resolved; unresolved is a hard failure (§6.2)
- [ ] Optional variables have declared absence behaviour (§6.3)
- [ ] No inline default values (§6.4)
- [ ] Reserved variables used correctly and not redefined (§6.8)
- [ ] Untrusted variables marked, delimited, neutralised, bounded (§6.7)

## Gate 4 — Context

- [ ] Every input demonstrably affects output quality; nothing "just in case" (§7.2)
- [ ] Each input separately delimited and named (§7.3)
- [ ] Trusted and untrusted content in separate blocks
- [ ] Nothing inlined that the model does not read (§7.4)
- [ ] No reliance on model-internal knowledge for factual claims (§7.5)
- [ ] No reference to prior turns, prior outputs, or conversation history (§7.6)
- [ ] Stable content first, variable content last, for caching (§12.4)
- [ ] Total size within the agent's declared budget

## Gate 5 — Output

- [ ] Required structure named; nothing else permitted (§8.2)
- [ ] No prose restatement of a mechanically-enforced schema (§8.1)
- [ ] No preamble, commentary, explanation, markup, or code fences permitted
- [ ] No reasoning directed into the payload; if reasoning is used, it has a declared destination (§8.5)
- [ ] Refusal form is structured, not prose (§8.6)
- [ ] **The never-fabricate instruction is present** (§8.7)
- [ ] Unknown-value representation stated explicitly

## Gate 6 — Parameters

- [ ] Temperature within the class-mandated range (`STD-000` §4.5)
- [ ] Deterministic purposes at temperature zero
- [ ] Seed set and recorded where the provider supports it
- [ ] Repair prompt at the same or lower temperature than the original (§4.4)
- [ ] Output size limit reflects genuine need
- [ ] No parameter changed without an evaluation result

## Gate 7 — Security

- [ ] Instruction hierarchy stated explicitly (§13.2)
- [ ] All seven untrusted-content requirements met (§13.3)
- [ ] Delimiters neutralised within untrusted content
- [ ] Untrusted input size-bounded before invocation
- [ ] No secrets, credentials, internal identifiers, or PII
- [ ] No instruction that could induce disclosure of instructions (§13.5)
- [ ] Prior model output treated as untrusted (§13.7)
- [ ] No cross-tenant content in examples or evaluation cases

## Gate 8 — Provider independence

- [ ] No vendor or model name anywhere (§11.4)
- [ ] No vendor-specific syntax, markers, or formatting conventions
- [ ] No workaround for a specific model's known weakness
- [ ] No assumption about tokenisation, context size, or internal behaviour
- [ ] Overlays, if any, are minimal and separately versioned (§11.6)
- [ ] Evaluated and passing on **every** approved provider (§11.7)

## Gate 9 — Examples

- [ ] Included only where justified by measured benefit (§5.8)
- [ ] Two to five; more requires justification
- [ ] Every example schema-valid, verified automatically
- [ ] Diverse across the input space; at least one boundary case
- [ ] No real PII, credentials, or tenant data
- [ ] Negative examples, if present, labelled and paired with corrections
- [ ] Re-validated against the current schema

## Gate 10 — Evaluation

- [ ] Evaluation set written **before** the prompt (§3.2)
- [ ] All six case types present (§9.3)
- [ ] **Adversarial cases present and passing** (§9.7)
- [ ] Negative paths tested — refusal, abstention, insufficient input (§9.3)
- [ ] Grounding verification passing for factual purposes (§9.4)
- [ ] Completeness and truncation checks passing
- [ ] Zero regression against the incumbent on quality, cost, and latency (§9.5)
- [ ] Passing in every approved locale (§9.8)
- [ ] Every rule has at least one case that would fail without it (§14.5)
- [ ] Quality variance measured, not only mean (§14.3)

## Gate 11 — Performance

- [ ] Token counts measured across the case distribution (§9.6)
- [ ] Cost measured at expected and worst case; within budget
- [ ] Latency measured at p50 and p95; within budget
- [ ] Cache hit rate measured where prompt caching applies (§12.4)
- [ ] No stable-prefix variation that would defeat caching
- [ ] Repair rate within threshold (§12.7)

## Gate 12 — Governance

- [ ] Owning agent identified; exactly one owner (§2.8)
- [ ] Layer and purpose declared (§4.1)
- [ ] Fragments, if any, resolved into an expanded prompt before hashing (§10.1)
- [ ] Version registered immutably with content hash and semantic version (§10.1)
- [ ] **Rationale recorded, stating why and not merely what** (§10.5)
- [ ] Reviewer named and review recorded
- [ ] Approved provider/model and schema combinations recorded (§10.4)
- [ ] Rollback target identified and known compatible (§10.6)

---

# 16. Prompt Anti-Patterns

Each stated as it appears, why it is harmful, how to detect it, and the fix.

### 16.1 Ambiguous instructions

**Appears as.** "Keep it concise." "Make it engaging." "Use an appropriate tone." "Don't be too long."

**Harmful because.** Every adjective is resolved differently by every model, every provider, and every revision. Ambiguity is the mechanism by which prompt behaviour becomes unreproducible — and because output remains well-formed, nothing indicates that anything is wrong.

**Detect.** The ambiguity audit (§9.2). Any instruction with more than one reasonable reading.

**Fix.** Numbers for anything measurable. Explicit criteria for anything not.

---

### 16.2 Mixed responsibilities

**Appears as.** One prompt producing a script and its metadata; one prompt classifying and then acting on the classification.

**Harmful because.** Quality becomes unattributable — you cannot tell which half regressed. Improving one aspect degrades another silently, because the model trades objectives against each other invisibly. The prompt cannot be evaluated with any single method.

**Detect.** The objective needs a conjunction joining unrelated work (§5.3).

**Fix.** Split the agent (`GDE-002` §2.2). This is not fixable at the prompt layer — a prompt cannot repair a boundary defect.

---

### 16.3 Contradictory constraints

**Appears as.** "Be comprehensive" alongside "be brief." A prompt permitting ten items against a schema permitting five. "Think step by step" alongside "output JSON only" with no place for the thinking.

**Harmful because.** Contradiction resolution is unspecified behaviour. Different models resolve differently; the same model resolves differently across runs. Prompt/schema contradictions guarantee repair loops, converting a design error into a permanent cost.

**Detect.** Read the prompt end to end against the schema. Contradictions accumulate through patches and are invisible when reading only the changed lines.

**Fix.** Resolve the contradiction. Where the prompt and schema disagree, the schema is authoritative and the prompt is amended.

---

### 16.4 Excessive context

**Appears as.** Passing the full upstream artifact "so the model has the full picture."

**Harmful because.** Permanent cost inflation, **worse** instruction-following because irrelevant material competes for attention, a wider injection surface, and a contract that hides what the agent actually depends on.

**Detect.** Any input whose removal does not measurably reduce quality (§7.2).

**Fix.** Minimum context. Summarise once through a dedicated agent rather than passing everything to everyone.

---

### 16.5 Hidden assumptions

**Appears as.** "Keep it short" with no number. Assumed English. Assumed video length. Assumed destination platform. A house style present in no brand kit.

**Harmful because.** Behaviour cannot be explained; localisation and multi-brand support are blocked; and a replacement prompt cannot honour rules nobody wrote down. This is the anti-pattern that quietly makes internationalisation a rewrite (`GDE-002` §15.4).

**Detect.** Read the prompt as a stranger (§2.3). Every applied constraint must be stated.

**Fix.** Promote every assumption to an explicit rule or a declared variable.

---

### 16.6 Output ambiguity

**Appears as.** Requesting structured output without prohibiting everything else. Describing the structure twice in different words. Leaving formatting choices open.

**Harmful because.** Models add preamble, wrap output in fences, and volunteer fields absent explicit prohibition. Each is a parsing risk and a token cost, and volunteered fields eventually acquire dependents.

**Detect.** Missing "and nothing else." Two descriptions of the same structure.

**Fix.** State the structure once. Prohibit everything else explicitly (§8.2).

---

### 16.7 Provider-specific wording

**Appears as.** Vendor-specific markers or tags; instructions referencing a provider's particular features; workarounds for one model's known weakness.

**Harmful because.** It converts a prompt into a bet that a specific model will remain available and unchanged. Both fail on the provider's schedule.

**Detect.** Any vendor name, vendor syntax, or comment explaining why a phrasing is needed "for" a particular model.

**Fix.** Neutral authoring plus a versioned overlay if genuinely required (§11.6). A large overlay indicates an under-specified base prompt.

---

### 16.8 Prompt duplication

**Appears as.** The same tone guidance or formatting rules pasted into six prompts.

**Harmful because.** Divergence is inevitable and invisible — five copies get updated, one does not, and that agent behaves differently for months before anyone notices.

**Detect.** Identical or near-identical blocks across prompts.

**Fix.** For per-channel, per-brand, or per-locale content: a **variable** (§6.5) — this is the first choice. For genuinely universal guidance: a versioned fragment, accepting that changing it re-versions and re-evaluates every consumer (§2.8). For short text used twice: duplication is often cheapest.

---

### 16.9 Temperature as a remedy

**Appears as.** Raising temperature because output feels repetitive; raising it during repair because attempts keep failing.

**Harmful because.** Temperature increases variance, not capability. On structured tasks it raises failure rate; on repair it makes success **less** likely (`STD-000` §4.5).

**Detect.** Any temperature outside the class-mandated range, or any parameter change without an evaluation result.

**Fix.** Work the four-lever diagnostic order (`GDE-002` §12.5). Repetitiveness is nearly always an input-diversity or boundary problem, not a sampling problem.

---

### 16.10 The accumulating patch

**Appears as.** A prompt with fourteen rules, each added to fix one observed case, none ever removed. Rules that overlap and partially conflict. No one has read it end to end in a year.

**Harmful because.** Nobody can predict the effect of the next change, because nobody knows what the current rules do collectively. Contradictions accumulate below the threshold of notice, and each new patch has a growing chance of colliding with an existing rule.

**Detect.** Rules that cannot be held in mind at once. A new rule that cannot be placed without ambiguity about which existing rule it overrides.

**Fix.** Rewrite rather than patch (§2.9). A rewrite evaluated against the same set is safer than a fifteenth patch.

---

### 16.11 Politeness and persona padding

**Appears as.** "Please carefully consider…" "You are a world-class expert…" "It is very important that you…" "I really need you to…"

**Harmful because.** Tokens on every invocation for no measured benefit. Emphasis markers applied to some rules and not others create an implicit priority order nobody designed, and models may treat unmarked rules as less binding.

**Detect.** Any instruction whose removal would not change the specification's meaning.

**Fix.** State requirements plainly. If a rule needs emphasis, it is either a hard constraint (belonging in block 4a) or it should be enforced by the schema.

---

### 16.12 Testing only the happy path

**Appears as.** An evaluation set of well-formed representative inputs, all passing.

**Harmful because.** The paths that matter most in production are the ones where the prompt should decline — insufficient sources, out-of-scope requests, contradictory input, injection attempts. Untested, those paths fail silently by producing plausible output, which is the most expensive failure available.

**Detect.** Evaluation set lacking degenerate, adversarial, or refusal cases.

**Fix.** All six case types, every version (§9.3, §9.7).

---

### 16.13 The emergency edit

**Appears as.** A prompt edited directly in production during an incident, because rollback "would lose the fix."

**Harmful because.** It introduces an unreviewed, unevaluated version under the worst possible conditions, and it destroys the ability to attribute what happened.

**Detect.** Any version promoted without a recorded reviewer or evaluation result.

**Fix.** Roll back first, always (§3.9). Diagnose, fix, review, evaluate, re-promote. There is no fast path that skips review.

---

# 17. Future Expansion

## 17.1 Why prompts evolve safely

Three properties, each established elsewhere, combine to make prompt evolution non-disruptive:

1. **Prompt versions are immutable and content-addressed.** A new version never alters an old one (`STD-000` §4.9).
2. **Runs pin at start.** A prompt promoted mid-run cannot change that run, including one suspended at an approval gate for days (`ARC-001` §6.7).
3. **The prompt is not the agent.** It is one implementation of a stable contract, replaceable beneath it (`GDE-002` §12.2).

Together these mean a prompt can be changed at any time without coordinating with any consumer — provided the contract does not change.

## 17.2 The boundary that must not be crossed

**A prompt change that alters the contract is not a prompt change.** It is a contract change requiring version treatment, consumer notification, and migration (`GDE-003` §7).

The test: *could a consumer written against the current schema process this prompt's output unchanged?* If no, the schema is changing and the prompt is following — not leading.

## 17.3 Adding prompts

**New agent.** Its prompts are new, unreferenced until the agent is registered, and disturb nothing (`GDE-002` §16.1).

**New locale.** A **new prompt variant with its own version and its own evaluation set** (§10.2) — never a language switch inside an existing prompt. A locale without a passing evaluation set is unsupported, whatever the configuration claims (`STD-000` §15.5).

**New provider.** No prompt changes. Evaluation runs on the new provider; approved combinations are recorded (§11.7). If a prompt must change, the abstraction leaked or the prompt was under-specified.

**New brand or channel.** No prompt changes. Variation arrives through variables (§6.5). This is the property that lets one prompt serve thousands of channels.

## 17.4 Changing prompts

| Change | Version | Requires |
|---|---|---|
| Clarify an ambiguous rule | MINOR | Full evaluation, zero regression |
| Tighten a constraint within schema bounds | MINOR | Full evaluation |
| Add or revise examples | MINOR | Schema validation of examples; full evaluation |
| Restructure blocks | MINOR | Full evaluation; caching impact measured |
| Change behaviour materially | MAJOR | Full evaluation; downstream review |
| Change a parameter | MINOR or MAJOR by effect | Evaluation; never without one |
| Follow a schema change | MAJOR | Contract migration; prompt/schema agreement re-verified |
| Adopt a fragment change | New version for **every** composing agent | Every affected evaluation set re-run (§2.8) |

## 17.5 Retiring prompts

Deprecate with a replacement and an end-of-support date; track pinned usage; retire when usage reaches zero; **retain resolvable forever** for replay and audit (§10.7).

Retirement is never deletion. A run from eighteen months ago must still be explainable, and that requires its prompt text.

## 17.6 Scaling the prompt estate

At twenty agents across several locales and providers, the estate is large enough that discipline stops being optional. Three practices carry the load:

- **Variables over variants** (§6.5). Every dimension handled by a variable is a dimension that does not multiply the number of prompts. Every dimension handled by a variant multiplies it.
- **Fragments used sparingly** (§2.8). Their coupling cost — re-versioning and re-evaluating every consumer — grows with the estate, so their break-even point moves against them over time.
- **Scheduled evaluation** (§14.6). Quality decays without change; at scale, unscheduled evaluation means most prompts are unverified most of the time.

## 17.7 What would require changing this guide

Stated honestly, so a future engineer can recognise having left the design rather than extended it:

- **Multi-turn prompting.** The single-shot model (§7.6) is foundational to statelessness, reproducibility, and cost bounding. Conversational agents would be a different architecture, not a prompt-layer feature.
- **Model-authored prompts.** A prompt generated at runtime cannot be reviewed, versioned, evaluated, or attributed. It would break the entire governance model in §3.
- **Runtime prompt assembly from untrusted content.** This would place untrusted material in an instruction position, contradicting §13.2 and removing the platform's primary injection defence.
- **Provider-specific prompt forks.** This would end AI independence at the prompt layer (§11.4).

Each is possible. None is an extension. All would require an ADR and amendments to `STD-000` and this guide.

---

# Appendix A — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial prompt engineering guide: prompt-as-specification reframe, nine principles, eight-stage lifecycle with rollback and incident path, two-axis prompt categorisation (layer × purpose), block-by-block authoring manual, variable standards with reserved namespace, context management, output specification craft, five-layer testing pyramid, dual-identity versioning with rollback mechanics, provider independence through robustness, performance including caching structure and the repair economy, prompt-layer security with explicit instruction hierarchy, quality thresholds by purpose, twelve-gate review checklist, thirteen anti-patterns, and evolution paths. |

---

*End of document — GDE-004 v1.0. Governed by STD-000 v1.0. Situated by ARC-001 v1.0. Companion to GDE-002 v1.0 and GDE-003 v1.0.*

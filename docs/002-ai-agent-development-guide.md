# AI Agent Development Guide
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `GDE-002` |
| Title | AI Agent Development Guide |
| Version | 1.0 |
| Status | Active |
| Governed by | [`000-project-engineering-standards.md`](000-project-engineering-standards.md) (`STD-000 v1.0`) |
| Situated by | [`001-system-architecture.md`](001-system-architecture.md) (`ARC-001 v1.0`) |
| Owner | Platform Architecture |
| Audience | Anyone designing, reviewing, or publishing an agent — including third-party publishers |
| Review cadence | Quarterly, or whenever an agent review surfaces a recurring defect this guide does not prevent |

**Requirement language.** RFC 2119 keywords carry the meanings defined in `STD-000` §Document Control.

**Precedence.** `STD-000` governs. Where this guide appears to conflict with it, `STD-000` wins and this guide is the defect (`STD-000` Rule 57).

---

# 1. Introduction

## 1.1 What this guide is for

Three documents now govern agent work, and they answer three different questions:

| Document | Question it answers | Nature |
|---|---|---|
| `STD-000` Engineering Standards | *What are the rules?* | Law — binding, testable, enforced |
| `ARC-001` System Architecture | *Where do agents sit, and why?* | Map — structure, boundaries, rationale |
| `GDE-002` **this guide** | *How do I actually design one?* | Craft — method, judgment, procedure |

The rules and the map exist. What has been missing is the **method**: how an engineer sitting down to build agent number fourteen decides what it should do, how big it should be, what it should receive, what it should return, how to know when it is finished, and how to tell that it has gone wrong.

That is what this guide supplies. It is deliberately procedural. Where `STD-000` says *"an agent MUST have one responsibility,"* this guide tells you how to determine whether you have one, how to split when you do not, and — equally important, and much less obvious — how to recognise when you have split too far.

## 1.2 What this guide does not cover

- **Rules already stated in `STD-000`.** They are cited, never restated. If a rule seems missing here, it is in `STD-000`.
- **Workflows and orchestration.** How agents are composed is `ARC-001` §7. This guide covers only the unit.
- **Architecture.** Planes, layers, components, and boundaries are `ARC-001`. This guide assumes them.
- **Implementation.** No language, framework, storage, vendor, or interface appears here.
- **Individual agents.** Each agent has its own specification (`AGT-nn`). This guide defines how those are written, not what any of them contains.

## 1.3 How to use it

**Designing a new agent** — work §2 → §7 in order. They are sequenced as the design actually proceeds: decide what the agent is, apply the principles, fill the anatomy, design inputs, design outputs, place it in a category.

**Reviewing an agent** — §14 is the checklist. §15 is the list of things to look for that the checklist cannot phrase as a question.

**Diagnosing a misbehaving agent** — §12.5 gives the diagnostic order. Reach for it before reaching for the prompt.

**Publishing a third-party agent** — the entire guide applies without exception. There is no lighter standard for external agents (`ARC-001` §17.5).

## 1.4 The one-line summary

**An agent is a job description narrow enough that a competent stranger could execute it correctly from the specification alone, with no context you forgot to write down.**

Almost every design failure in this domain is a failure of that sentence: the agent needed context that was never declared, or the job was too broad for anyone — human or model — to do well.

---

# 2. What is an AI Agent?

`STD-000` §3.1 gives the normative definition. `ARC-001` §6.1 gives the architectural consequences. This section gives the **designer's mental model** — how to think about an agent while you are building one.

## 2.1 Purpose: the job description model

Think of an agent as a role you are hiring for, where the candidate:

- arrives with **no memory** of any previous task,
- receives **only** the brief you hand them,
- **cannot ask questions**,
- **cannot talk to colleagues**,
- **cannot do anything** except hand back a completed form,
- and will be replaced by a different candidate at any time, who must produce equivalent work from the same brief.

Every design constraint follows from that picture, and it is worth keeping literally in mind while writing a specification. If the role is impossible for that candidate, it is impossible for the agent.

This model makes the common failures obvious before they are built:

| Design question | The model's answer |
|---|---|
| *Can I assume it knows the channel's tone?* | No. It has no memory. Pass it. |
| *Can it check with the research agent?* | No. It cannot talk to colleagues. |
| *Can it decide whether to also generate a thumbnail?* | No. It fills the form it was given. |
| *Can it publish if the content looks good?* | No. It cannot act. It can only propose. |
| *Can it say "I'd normally do X, but…"?* | No. It fills fields. It does not converse. |

## 2.2 Responsibility: the one-sentence test

Every agent MUST be describable in a single sentence, in the form:

> *"Given [declared inputs], produce [declared output], subject to [declared constraints]."*

with **no conjunction that joins two different kinds of work** (`STD-000` §3.2).

"And" is not automatically disqualifying. *"Produce a title and a thumbnail concept"* may be one responsibility, because the two are a single packaging decision made together — the title and the image must make the same promise, and separating them produces mismatched pairs. *"Produce a script and the SEO metadata"* is two responsibilities, because neither informs the other and each is separately measurable.

**The distinguishing test is not grammatical, it is causal:** *would doing one of these well change how you do the other?* If yes, it is one responsibility. If no, it is two.

## 2.3 Scope: sizing an agent

Agents can be too big *or* too small, and the second failure is more common in teams that have absorbed the single-responsibility rule enthusiastically.

**Signs an agent is too big:**

- The purpose sentence needs a conjunction joining unrelated work.
- The output schema has clusters of fields no single consumer uses together.
- Two different quality problems can occur, and a failure of one tells you nothing about the other.
- Two people would naturally own different parts of its prompt.
- Improving one aspect of its output reliably degrades another.

**Signs an agent is too small:**

- Its output is consumed by exactly one agent, which uses all of it, and nothing else will ever consume it.
- It cannot be evaluated meaningfully in isolation — "was this outline fragment good?" has no answer without the rest.
- The context needed to do its job well is nearly the context the next agent also needs, so you pass the same payload twice.
- Splitting it produced two prompts that must be edited together to stay coherent.
- The coordination and token cost of the extra hop exceeds any quality benefit.

**The sizing heuristic:**

> An agent should be the **smallest unit that produces an independently evaluable deliverable.**

"Independently evaluable" is the operative phrase. If you cannot state what "good" means for the agent's output without referring to work that happens later, the boundary is in the wrong place. Over-decomposition is not more rigorous — it multiplies invocations, fragments context, inflates cost, and makes quality *harder* to attribute rather than easier, because the deliverables no longer correspond to anything a reviewer can judge.

## 2.4 Boundaries: the adjacent-capability test

For every agent, list the capabilities immediately adjacent to it — what happens just before, just after, and just alongside. For each, decide explicitly: **in scope or out.** Then write the out-of-scope ones into the specification's Non-Responsibilities section.

This is not paperwork. Explicit exclusions do two things nothing else does:

1. **They stop scope creep at review time.** A reviewer can point at a line and say "this agent does not do that."
2. **They stop the model over-reaching at run time.** Models are relentlessly helpful. An agent asked for a script will volunteer tags, a title, and a thumbnail suggestion unless told not to — and every volunteered field is unowned, unevaluated, unversioned output that some downstream consumer will eventually start depending on.

`STD-000` §3.2 requires the Non-Responsibilities section. In practice it is the section that most reliably prevents defects, and the one most often written last and thinnest. Write it second, immediately after the purpose sentence, while the boundary is still a live question.

## 2.5 The authoring lifecycle

`ARC-001` §6.2 defines the agent's **runtime** states in the registry. This is different: the **engineering** lifecycle an agent passes through while being built. The two run in parallel, and confusing them is a common source of process error — an agent can be Registered in the registry while still being Designed by the team.

| Phase | Work performed | Exit condition |
|---|---|---|
| **1. Discovery** | Establish that a genuine capability gap exists. Confirm no existing agent covers it and no boundary adjustment would. | A written purpose sentence and a Non-Responsibilities list |
| **2. Contract design** | Design the output schema first, then the input schema (§3.4). Identify consumers and what they actually need. | Schemas registered; every consumer's needs met; nothing emitted that nobody consumes |
| **3. Evaluation design** | Write the evaluation set **before** the prompt: representative, boundary, adversarial, and degenerate cases with expected results | Evaluation set registered and reviewed |
| **4. Prompt design** | Author the prompt against the fixed contract (`STD-000` §4) | Prompt renders; every variable declared and typed |
| **5. Calibration** | Run against the evaluation set; iterate on prompt, schema, and parameters | Declared thresholds met on every approved provider and locale |
| **6. Budgeting** | Measure actual cost and latency; declare expected and maximum | Budgets declared and empirically justified, not guessed |
| **7. Documentation** | Complete the specification (§4) | All 17 sections present and passing §14 |
| **8. Review** | Architecture review against §14 | Checklist passed; reviewer named |
| **9. Pilot** | Limited production traffic under observation | Production metrics match evaluation predictions |
| **10. Promotion** | Becomes the resolvable default | — |
| **11. Operation** | Monitor quality, cost, drift; add evaluation cases from every production defect | — |
| **12. Improvement or retirement** | Version forward, or deprecate with a migration path | — |

**Phase 3 sits before phase 4 deliberately.** Writing the evaluation set before the prompt forces you to state what "correct" means while you are still able to be honest about it. Written afterwards, evaluation sets reliably encode whatever the prompt already happens to do — which makes them useless as a regression gate, because they can never fail the thing they were derived from.

## 2.6 What an agent is not

| Not a… | Because |
|---|---|
| Service | It has no availability, no endpoint, no clients. It is invoked, not called upon. |
| Conversation | Every invocation is a single-shot transaction with no history (`STD-000` §3.7) |
| Workflow | It has no knowledge of what precedes or follows it (`ARC-001` §7.3) |
| Actor | It cannot cause effects. It returns data describing effects it proposes (§8.4) |
| Prompt | The prompt is an implementation detail of the contract, replaceable beneath it |
| Place for leftover logic | Deterministic work belongs in deterministic components (§15.5) |

---

# 3. Agent Design Principles

`STD-000` §2 states the platform's engineering principles and `STD-000` §3 states the binding agent standards. This section does not restate either. For each principle it supplies the three things a designer actually needs: **the procedure** for applying it, **the specific agent-design failure** it prevents, and **the trade-off or limit** — because a principle applied without a limit becomes its own anti-pattern.

## 3.1 Single Responsibility

**Rule.** `STD-000` §3.2, Rule 1.

**Procedure.** Write the purpose sentence (§2.2). Apply the causal test — does doing one part well change how you do the other? If no, split. Then apply the sizing heuristic (§2.3) in the other direction and ask whether the resulting pieces are each independently evaluable. Stop splitting when they are.

**Prevents.** Output whose quality cannot be attributed. An agent producing both a script and SEO metadata that underperforms tells you nothing: you cannot tell which half failed, cannot improve one without risking the other, and cannot replace either independently.

**Limit.** Over-decomposition (§2.3). The rule is *one responsibility*, not *one field*. Splitting past the independently-evaluable unit multiplies cost and coordination while making quality harder to measure, not easier.

## 3.2 Stateless Execution

**Rule.** `STD-000` §3.3, Rule 3.

**Procedure.** List everything the agent needs to know. For each item ask: *"Where does this arrive from?"* Every answer must be a declared input. Any answer of the form "it will have seen it," "it can remember from," or "the previous step already handled that" is a design defect requiring a new declared input.

**Prevents.** Unexplainable behaviour. When an agent depends on state that was never declared, output changes for reasons nobody can reconstruct, and identical inputs stop producing comparable results.

**Note on memory.** Channel history, prior videos, and established style are legitimate and often essential — but they are **inputs**, assembled by the workflow and declared in the schema (`STD-000` §3.3). Memory as an explicit input is auditable: you can see exactly what influenced a decision. Memory held inside an agent is not, and it silently breaks reproducibility, caching, and evaluation simultaneously.

**Limit.** None. This principle has no legitimate exception.

## 3.3 Deterministic Contracts

**Rule.** `STD-000` §2.7, §3.4.

**Procedure.** Design the schema so that **invalid output cannot be expressed**. Every decision becomes a closed enumeration. Every list gets bounds. Every string gets a length range. Every unknown gets a declared representation. The test: enumerate the ways the output could be wrong, and for each, ask whether the schema already makes it unrepresentable. Move as many as possible into that category.

**Prevents.** Defensive downstream code, and the whole class of defects where a consumer guesses at structure.

**Insight.** *Determinism is a property of the contract, not of the model.* You are not making the model predictable — you are making its unpredictability irrelevant to everything downstream by confining variation to declared fields within declared bounds. A well-designed schema does more for reliability than any amount of prompt refinement, because it converts a persuasion problem into a structural one.

**Limit.** Do not over-constrain creative fields. A schema that dictates a script's sentence count is enforcing a preference, not a contract, and it will produce mechanical output while adding no reliability.

## 3.4 Contract-First Design

**Rule.** New in this guide; derived from `STD-000` §2.16 and §5.5.

**Procedure — the mandatory order:**

```
   1. Identify every consumer of this agent's output
   2. Determine what each consumer actually needs      ← from the consumer, not the producer
   3. Design the OUTPUT schema
   4. Determine the minimum input required to produce it
   5. Design the INPUT schema
   6. Write the evaluation set
   7. Only now, write the prompt
```

**Prevents.** The default failure mode, which is: write a prompt, see what the model produces, and retrofit a schema around it. That produces contracts shaped by model behaviour rather than by consumer need — and when the model or prompt changes, the contract turns out to have been describing an accident.

**Why output before input.** Inputs exist to serve outputs. Designing inputs first produces agents that receive whatever was conveniently available upstream, which is how agents accumulate context they do not use — inflating cost, widening the injection surface, and diluting instruction-following.

**Limit.** Contracts may be revised during calibration (phase 5). What must not happen is *discovering* the contract from model output. Revising a designed contract is engineering; deriving one from behaviour is not.

## 3.5 No Hidden Dependencies

**Rule.** `STD-000` §3.6.

**Procedure.** Read the specification as a stranger. For every constraint the agent applies, locate where the specification states it. Anything applied but not stated — a length limit, a tone rule, a formatting convention, an assumption about what upstream produced — is a hidden dependency and must become an explicit input, a configured value, or a documented constraint.

**Prevents.** Three failures at once: unexplainable behaviour; blocked localisation and multi-brand support, since tacit assumptions are almost always English-language and single-brand; and the collapse of replaceability, because a replacement agent cannot honour a rule nobody wrote down.

**Common hidden dependencies in this domain**, all of which have caused defects in systems of this kind: assuming English; assuming a specific video length; assuming the destination platform; assuming the upstream agent produced a particular optional field; assuming a house style not present in the brand kit; assuming that "short" means the same thing in every language.

**Limit.** None.

## 3.6 Replaceability

**Rule.** `STD-000` §2.2, `ARC-001` §6.6.

**Procedure.** The test: *could a different team, given only this specification, build a replacement that every consumer would accept without modification?* If not, something essential is undocumented — and it is usually the acceptance criteria, not the contract.

**Prevents.** Agents that are unowned in practice because only their author understands them, and a marketplace that cannot exist because external implementations cannot satisfy contracts they cannot fully read.

**Design implication.** The specification, not the prompt, is the agent. The prompt is one implementation of it. Write specifications that would survive their prompt being deleted.

**Limit.** None, but note that replaceability is limited in practice by evaluation-set quality. An agent whose evaluation set is weak is not genuinely replaceable, because there is no way to demonstrate that a replacement is equivalent.

## 3.7 Testability

**Rule.** `STD-000` §3.13.

**Procedure.** Design for evaluation from the start, not after. Concretely: make the output structured enough that correctness is checkable field by field; make every decision an enumeration so it can be compared exactly; make the deliverable independently evaluable (§2.3); and set the determinism posture by functional class (`STD-000` §4.5) so that deterministic classes can be checked by exact comparison rather than by judgment.

**Prevents.** Agents that can only be assessed by reading their output and forming an impression — which does not scale, does not survive staff changes, and cannot gate a promotion.

**Evaluation set composition.** Every agent's set MUST include, at minimum:

| Case type | Purpose |
|---|---|
| **Representative** | The ordinary path, in realistic volume |
| **Boundary** | Minimum and maximum sizes, empty collections, longest permitted strings |
| **Degenerate** | Contradictory, sparse, or nearly-empty input |
| **Adversarial** | Input containing instruction-like content (`STD-000` §10.5) |
| **Locale** | At least one case per approved locale — a prompt passing in one language is unevaluated in another |
| **Regression** | One case per production defect ever found (`STD-000` Rule 56) |

**Limit.** Evaluation sets have maintenance cost and can ossify. They must grow with defects, but stale cases encoding behaviour you no longer want should be revised deliberately rather than worked around.

## 3.8 AI Independence

**Rule.** `STD-000` §14, Rule 5.

**Procedure.** The agent author declares **capabilities**, never models: structured output enforcement, tool use, context class, vision, reasoning depth, latency class. Model selection is an operational decision resolved at runtime (`ARC-001` §4.9). Prompts contain no vendor-specific syntax, markers, or formatting idioms.

**Prevents.** Agents that silently stop working when a model is deprecated or repriced — which happens on the provider's schedule, not yours.

**Design implication that is easy to miss.** Do not tune a prompt until it works on exactly one model. That is a local optimum that becomes a migration cost. If a prompt only passes on one provider, the usual cause is that it is relying on that model's tolerance for ambiguity rather than being adequately specified. Tighten the specification instead.

**Limit.** Genuine capability differences are real. Where an agent truly requires a capability only some models have, declare it in the capability profile — that is the mechanism working correctly, not a violation.

## 3.9 Inertness

**Rule.** `STD-000` Rule 4, `ARC-001` §6.1.

**Procedure.** Where an agent's job implies an effect on the world — publish this, spend that, notify someone — model the effect as **declared output data** (§8.4). The agent proposes; the workflow disposes.

**Prevents.** Model output authorizing action, which is the failure the entire security model exists to prevent (`ARC-001` §15.4). It also makes every agent trivially retryable, since re-invoking a pure function is always safe.

**Limit.** None. This is the principle that makes running untrusted third-party agents possible at all.

---

# 4. Standard Agent Anatomy

## 4.1 The template is fixed

`STD-000` §12.7 fixes the agent specification template at **exactly seventeen sections, in a fixed order, with no additions, removals, or reordering.** That is binding. This section is the authoring guide for those seventeen: what belongs in each, what "good" looks like, the common failure, and the acceptance bar.

Uniformity is the point. Having read one specification, an engineer must be able to navigate any other without re-learning the format (`STD-000` §2.10). A specification that is better but different is worse.

**Mapping note.** The fifteen elements named in the request for this guide all map onto the canonical seventeen; the canonical set additionally separates *JSON Schema* from *Inputs*/*Outputs*, and separates *Example Request* from *Example Response*. Where this guide names a section, it uses the canonical name.

## 4.2 Section-by-section authoring guide

### 1. Agent Overview

**Contains.** Identity, number, department, functional class (`STD-000` §3.11), domain category (§7), the one-sentence purpose, and a short statement of where it sits in the production flow.

**Good.** A reader knows within thirty seconds whether this is the agent they are looking for.

**Common failure.** A paragraph of context that never states plainly what the agent produces.

**Bar.** Purpose sentence present, single sentence, no conjunction joining unrelated work.

---

### 2. Responsibilities

**Contains.** An enumerated list of what the agent produces and decides. Each item observable in the output.

**Good.** Every responsibility maps to at least one output field. Every output field maps to at least one responsibility.

**Common failure.** Responsibilities describing *process* ("analyses the audience") rather than *deliverables*. Process is not verifiable; deliverables are.

**Bar.** Bidirectional mapping between responsibilities and output fields, with no orphans on either side.

---

### 3. Non-Responsibilities

**Contains.** Explicitly excluded adjacent capabilities (§2.4), each naming the agent or component that owns it instead.

**Good.** A reviewer can settle any scope question by pointing at this list.

**Common failure.** Written last, thin, and generic. This is the highest-value section in the template and routinely the weakest.

**Bar.** Every adjacent capability addressed. Every exclusion names its actual owner — "not this agent" is not an answer.

---

### 4. Inputs

**Contains.** Every input with name, description, type, required flag, constraints, default behaviour when absent, trust level, and example (`STD-000` §12.7). Design guidance in §5.

**Good.** A stranger could assemble a valid invocation from this section alone.

**Common failure.** Omitting the context bindings — strategy, brand, locale — because "those are always passed." Always-passed inputs are still declared inputs.

**Bar.** Every input declared. Every untrusted input marked. No input the agent does not use.

---

### 5. Outputs

**Contains.** Every output field with the same attributes, plus which consumer needs it. Design guidance in §6.

**Good.** Every field has a named consumer.

**Common failure.** Fields nobody consumes, retained because they seemed useful. They cost tokens on every invocation, must be validated, must be versioned, and eventually acquire a dependent.

**Bar.** Every field justified by a consumer. Every decision field an enumeration.

---

### 6. JSON Schema

**Contains.** Formal input and output schemas per `STD-000` §5, versioned and registered.

**Good.** Constraints in the schema match constraints in the prompt exactly.

**Common failure.** Schema and prompt disagreeing — the prompt permits ten items, the schema five. This guarantees repair loops and wasted spend (`STD-000` §4.3).

**Bar.** Closed schemas. All bounds declared. Zero prompt/schema contradictions. Examples validate.

---

### 7. Example Request

**Contains.** A complete, realistic, valid invocation. Realistic — not a toy with placeholder strings.

**Good.** Someone could execute the agent from this example unmodified.

**Common failure.** Truncated examples with ellipses, which hide exactly the parts that are hard to get right.

**Bar.** Complete, valid against the current schema, verified automatically (`STD-000` §13.2).

---

### 8. Example Response

**Contains.** The corresponding valid output, plus **at least one invalid example with an explanation of why it is invalid** (`STD-000` §12.6).

**Good.** The invalid example illustrates a real, tempting mistake — not an obvious one.

**Common failure.** Omitting the invalid example. It prevents more defects than the valid one, because it marks the boundary rather than the centre.

**Bar.** One valid and one invalid example, both verified, the invalid one explained.

---

### 9. Validation Rules

**Contains.** Structural constraints, business rules with stable identifiers, consistency and grounding requirements, and quality criteria with thresholds. Responsibility split in §9.

**Good.** Every rule is named, individually testable, and traceable to a failure it prevents.

**Common failure.** Rules stated as prose aspirations ("the script should be engaging") rather than as checks.

**Bar.** Every rule named and testable. Every rule has a passing and a failing test case (`STD-000` §6.9).

---

### 10. Retry Strategy

**Contains.** The agent's declared retry posture: attempt budgets, repair expectations, escalation eligibility. Guidance in §10.

**Good.** States what makes this agent's output *repairable* — which fields can be corrected in isolation.

**Common failure.** Restating the platform default. If it is the default, say so and move on; if it differs, justify it.

**Bar.** Budgets declared. Repairability characteristics stated. Deviations from default justified.

---

### 11. Failure Responses

**Contains.** Every way this agent can fail, with error codes from the registered catalogue, categories, and whether recoverable. Guidance in §11.

**Good.** Distinguishes the three distinct outcomes — declared unknown, typed failure, refusal (§11.2).

**Common failure.** Treating "cannot determine a value" and "cannot perform the task" as the same thing. They require different handling and different downstream responses.

**Bar.** All failure modes enumerated with registered codes. The three outcomes clearly distinguished.

---

### 12. Dependencies

**Contains.** Upstream artifacts consumed, context bindings required, capability requirements, permissions required, and downstream consumers.

**Good.** Makes the agent's position in the flow explicit without describing orchestration.

**Common failure.** Listing other agents as dependencies. Agents depend on **artifacts and contracts**, never on agents (`STD-000` Rule 2). This distinction is not pedantic — writing "depends on the Research Agent" is how coupling starts.

**Bar.** Dependencies expressed as contracts. Permissions minimal and declared.

---

### 13. System Prompt

**Contains.** The production-ready prompt, structured per `STD-000` §4.1.

**Good.** All seven structural blocks present in order; every rule atomic; unknown-value and refusal policies explicit.

**Common failure.** Constraints in the prompt that are absent from the schema, or vice versa.

**Bar.** Passes the §13.3 prompt quality checklist in `STD-000` in full.

---

### 14. Prompt Variables

**Contains.** Every variable with name, type, required flag, source, constraints, trust level, and absence behaviour.

**Good.** Untrusted variables explicitly marked, with their delimiting stated.

**Common failure.** Undeclared variables, which render as empty strings and silently remove a constraint — producing plausible, unconstrained output that looks fine (`STD-000` §4.2).

**Bar.** Every variable declared and typed. Strict resolution. Untrusted variables marked.

---

### 15. Quality Checklist

**Contains.** Agent-specific quality criteria beyond the platform baseline — what "good output" means for *this* agent, measurably.

**Good.** Criteria a reviewer could apply to two candidate outputs and reach the same verdict as a colleague.

**Common failure.** Restating platform-wide quality standards instead of what is specific here.

**Bar.** Agent-specific, measurable, tied to the evaluation set.

---

### 16. Performance Considerations

**Contains.** Declared cost and latency budgets (expected and maximum), token characteristics, caching posture, parallelisation notes, and known cost drivers.

**Good.** Budgets derived from measurement, with the measurement conditions stated.

**Common failure.** Guessed budgets. A budget nobody measured is not a control (`STD-000` §11.8).

**Bar.** Budgets declared and empirically justified.

---

### 17. Future Improvements

**Contains.** Known limitations, deferred capabilities, and identified improvement paths — with reasons for deferral.

**Good.** Honest about weaknesses. This section is where the next engineer starts.

**Common failure.** Left empty, or used for aspirational feature lists rather than known limitations.

**Bar.** Known limitations stated. Deferrals justified.

## 4.3 Completeness rule

A specification with a missing or placeholder section is **not complete**, and an incomplete specification MUST NOT pass review (`STD-000` §13.2). "To be determined" in a shipped specification is a defect, not a note — it means some decision was left to whoever implements or operates the agent, which is exactly the hidden dependency §3.5 forbids.

---

# 5. Input Design Standards

Format, naming, types, and identifiers are governed by `STD-000` §5 and are not restated. This section covers **what to pass, and how to decide.**

## 5.1 The minimum-context principle

> **Pass the least an agent needs to do its job correctly — no more.**

Four independent benefits, which is unusual for a single rule:

| Benefit | Mechanism |
|---|---|
| **Lower cost** | Fewer tokens on every invocation, forever |
| **Better quality** | Focused context improves instruction-following; irrelevant context dilutes it |
| **Smaller attack surface** | Less untrusted content in context (`STD-000` §10.5) |
| **Clearer contracts** | Inputs that exist only "just in case" hide what the agent actually depends on |

**The test for each candidate input:** *"If I removed this, would the output be measurably worse?"* If you cannot answer from evidence, the honest answer is no. Remove it and measure.

## 5.2 What to pass instead of everything

The default failure is passing the whole upstream artifact because it is available.

| Instead of | Pass |
|---|---|
| The full research dossier | The facts relevant to this agent's task |
| The full script | The segment being worked on, plus the structural context needed to keep it coherent |
| The entire channel history | A summarised style profile, or the specific prior items being compared against |
| The full strategy contract | The strategy elements this agent must conform to |
| Every generated asset | References to the specific assets in scope |

**Summarisation is a legitimate pipeline stage.** Where a downstream agent needs the *gist* of a large artifact, produce a summary once via a dedicated agent and pass it to all consumers, rather than passing the full artifact repeatedly. That converts an O(n) per-consumer cost into a single one — and the summary becomes an artifact in its own right, versioned and inspectable.

## 5.3 Required versus optional

**Required** means: the agent cannot function without it, and its absence is an error (`STD-000` §3.6). Never a value the agent could reasonably default.

**Optional** means: the agent has genuinely different, correct, documented behaviour with and without it.

**The discipline:** for every optional input, the specification MUST state what the agent does when it is absent. An optional input without declared absence behaviour is not optional — it is required, with the requirement undocumented, and it will produce inconsistent output the first time it is genuinely omitted.

**Anti-pattern.** Making inputs optional to avoid the work of guaranteeing them upstream. That pushes uncertainty into the agent and makes its behaviour depend on the caller's diligence.

## 5.4 Context bindings

Four bindings recur across nearly every production agent, and each has a specific reason:

| Binding | Why the agent needs it | Consequence of omission |
|---|---|---|
| **Strategy** | Output must conform to the channel's approved constraints (`ARC-001` §5.2) | Output conforms to nothing; strategy becomes decorative |
| **Brand** | Voice, vocabulary, and visual identity are data (`ARC-001` §4.4) | The model invents a house style, differently each time |
| **Locale** | Language, conventions, length rules, and rhythm differ materially | English assumptions applied to non-English output |
| **Channel context** | History and established patterns, for consistency and originality | Repetition, and drift from established voice |

These are **declared inputs like any other** (§4.2, section 4). They are not ambient, and "always passed" is not a reason to leave them undeclared — an undeclared binding is exactly the hidden dependency that blocks localisation and multi-brand support later.

Pass the **relevant subset**, not the whole binding. An agent producing thumbnail text needs the brand's typography and colour rules, not the full brand kit.

## 5.5 References versus inline content

| Pass inline | Pass by reference |
|---|---|
| Text the model must reason over | Media assets |
| Small structured context | Large documents used only for lookup |
| Anything that must be in the model's context | Anything the model does not read |

Media is **always** by reference (`ARC-001` §8.2). An agent needing to reason about an image receives it through the declared vision capability, never as inlined data.

**Rule:** if the model does not need to read it, it does not belong in the prompt.

## 5.6 Untrusted inputs

Any input that originated outside the platform — research results, competitor metadata, comments, transcripts, uploads, or another model's output — MUST be:

1. **Marked untrusted** in the input declaration.
2. **Delimited and labelled** as data in the prompt (`STD-000` §10.5).
3. **Bounded in size**, before invocation. Unbounded untrusted input is a denial-of-wallet vector (`STD-000` §10.7).
4. **Placed in the user layer**, never the system layer.

The agent author's responsibility is the declaration and the prompt handling; the platform enforces containment (`ARC-001` §15.4). Both are required — neither is sufficient alone.

## 5.7 Input versioning

Inputs are contracts and follow `STD-000` §5.5. Two consequences specific to agent authors:

- **Adding a required input is breaking.** It requires a major version and a migration path for every caller. Adding it as optional with declared absence behaviour is usually the correct move, followed by a later major version that requires it.
- **Never repurpose an input.** Changing what a field means while keeping its name is the most damaging change available, because nothing fails — callers keep passing the old meaning and the agent silently misinterprets it.

## 5.8 Input design checklist

- [ ] Every input has a demonstrated effect on output quality
- [ ] Nothing passed "just in case"
- [ ] Context bindings declared explicitly, subset-scoped
- [ ] Optional inputs have declared absence behaviour
- [ ] Untrusted inputs marked, delimited, and bounded
- [ ] Large content passed by reference
- [ ] Input size bounded and within budget
- [ ] A stranger could assemble a valid invocation from the specification

---

# 6. Output Design Standards

The output schema is the agent's most consequential artifact. It outlives prompts, models, and providers, and it is the thing every consumer depends on.

## 6.1 Design from the consumer backward

Start with: *"Who consumes this, and what decision do they make with it?"*

Every field must trace to a consumer need. Fields that exist because they seemed informative are pure cost — tokens on every invocation, validation surface, versioning burden — and they eventually acquire a dependent, at which point removing them becomes a breaking change.

**The test:** for each field, name the consumer and the decision. If you cannot, delete the field.

## 6.2 Predictability through structure

`STD-000` §3.4 requires predictable output. The mechanism is schema design, and the procedure is mechanical:

1. **Enumerate every decision the agent makes.** Each becomes a closed enumeration, never free text. A decision expressed as prose cannot be branched on, compared, aggregated, or validated.
2. **Bound every collection.** Minimum and maximum. Unbounded lists are cost risk, fan-out risk, and truncation risk simultaneously (`STD-000` §11.6).
3. **Bound every string**, in a declared counting unit — character limits are a different constraint in different scripts (`STD-000` §5.9).
4. **Declare the unknown representation** for every field that may be undeterminable (`STD-000` §3.4).
5. **Prefer structure to prose.** A structured hook with its type, its promise, and its opening line is analysable; a paragraph containing all three is not.

**The governing question:** *"What is the smallest set of possible outputs that includes everything valid and excludes everything invalid?"* Every constraint you can move into the schema is a constraint the model cannot violate — a structural guarantee rather than an instruction the model may or may not follow.

## 6.3 Completeness

Output must be complete and non-degenerate (`STD-000` §6.7). The agent author's contribution is design that makes incompleteness detectable:

- **Declared cardinality.** "Between three and five concepts" is checkable; "some concepts" is not.
- **No optional fields that should be required.** Optionality is a real design decision, not a hedge against the model omitting something.
- **Structured rather than concatenated.** Five distinct fields make a missing one obvious; one field containing five things does not.

## 6.4 Confidence

Include a confidence field only when a consumer will **act differently** based on it. Confidence that nothing routes on is decoration, and worse, it manufactures a sense of rigour that nothing supports.

When included (`STD-000` §6.5):

- Document **what the confidence is about** — the whole output, a specific field, or a specific judgment. Undefined scope makes it uninterpretable.
- Document **what produces high and low values**.
- State **what the consumer does** at each threshold band.
- Remember that self-reported model confidence is poorly calibrated and must not be a sole gate. Prefer agreement across independent samples, deterministic verification, or grounding coverage.

## 6.5 References and grounding

Any agent making factual claims MUST return, per claim, a reference to the supplied source that supports it (`STD-000` §4.7).

Design requirements:

- References point at **supplied input**, never at the model's knowledge. A reference the validator cannot resolve against the input is worse than none, because it looks like grounding.
- References are **verifiable structurally** — a validator can confirm the referenced source exists in the input.
- Claims without support MUST use the declared unknown mechanism, never a plausible approximation.

**This is the single highest-value design decision for factual agents.** It converts hallucination from a subjective quality question into a mechanical check.

## 6.6 Declared effects

Agents cannot act (§3.9). Where an agent's job implies an effect, model it as **structured proposal data**: what is proposed, its parameters, the rationale, and any preconditions. The workflow evaluates the proposal against policy and executes it, or does not.

Design it so the proposal is **complete enough to execute and structured enough to validate** — a proposal requiring interpretation defeats the purpose, since interpretation would reintroduce judgment at the point of action.

## 6.7 Metadata

Provenance and envelope metadata are supplied by the runtime, not authored by the agent (`STD-000` §5.6, `ARC-001` §4.8). Agent authors design the `data` payload only.

Do not duplicate metadata into the payload. Business data that a consumer branches on belongs in `data`; everything about *how the output was produced* belongs in metadata and is added for you.

## 6.8 Output size discipline

Output tokens are typically the most expensive and slowest part of an invocation. Therefore:

- Set maximum sizes from genuine need, not generously. Generous bounds invite verbose output at direct cost.
- Do not emit reasoning, explanation, or restated input (`STD-000` §3.7, §4.6).
- Do not return input unchanged. The consumer already has it.
- Prefer references to inlined content for anything large.

## 6.9 Output versioning

- **Additive optional fields** are minor. **Anything else** is major (`STD-000` §5.5).
- **Adding an enumeration value is breaking** for consumers that match exhaustively. Every enumeration must declare whether it is closed (default) or open (`STD-000` §5.5).
- **Never repurpose a field.** Retire and replace.
- Multiple major versions coexist; consumers migrate on their own schedule within the support window.

## 6.10 Output design checklist

- [ ] Every field traces to a named consumer and a decision
- [ ] Every decision is a closed enumeration
- [ ] Every collection and string is bounded
- [ ] Unknown representation declared for every undeterminable field
- [ ] Factual claims carry structurally verifiable references
- [ ] Confidence included only if something routes on it, with documented meaning
- [ ] Effects modelled as proposals, never actions
- [ ] No reasoning, explanation, or echoed input
- [ ] Size bounds reflect genuine need
- [ ] Enumerations declared closed or open

---

# 7. Agent Categories

## 7.1 Two taxonomies, both required

Every agent declares **two** classifications, and they answer different questions. Conflating them is a common error.

| | **Functional Class** | **Domain Category** |
|---|---|---|
| **Defined in** | `STD-000` §3.11 | This guide |
| **Answers** | *How does it operate?* | *What is it for?* |
| **Determines** | Temperature policy, determinism posture, evaluation method, validation approach | Department, review posture, typical consumers, risk profile |
| **Values** | Extractor, Transformer, Generator, Critic, Judge, Planner, Router | Planning, Research, Creative, Review, Validation, Publishing, Analytics |
| **Example** | A script agent is a **Generator** | …in the **Creative** category |
| **Example** | A compliance agent is a **Critic** | …in the **Validation** category |

The functional class governs *engineering* treatment. The domain category governs *organisational* treatment. An agent's specification MUST declare both.

## 7.2 The categories

### Planning

**Purpose.** Produce structured plans, strategies, and schedules that constrain later work.

**Typical department.** D0 Strategy; also scene planning in D3.

**Typical functional classes.** Planner; occasionally Generator.

**Characteristics.** Output is consumed as *constraints* by many downstream agents, so errors propagate widely and expensively. Long-lived output. Almost always human-approved.

**Design emphasis.** Constraint satisfaction and internal consistency. A plan that contradicts itself is worse than no plan, because everything downstream will faithfully implement the contradiction.

**Review posture.** Highest scrutiny. Planning output governs work that has not happened yet, so defects are discovered late and are expensive to unwind.

---

### Research

**Purpose.** Gather, extract, and establish facts from source material.

**Typical department.** D1 Content Intelligence.

**Typical functional classes.** Extractor; occasionally Transformer.

**Characteristics.** **The only category that ingests untrusted external content** (`ARC-001` §5.3), and therefore the category with the narrowest capabilities in the platform.

**Design emphasis.** Grounding and abstention. Every claim carries a resolvable reference (§6.5); insufficient sources produce an explicit non-answer, never a plausible-sounding gap-fill. Fully deterministic parameters.

**Review posture.** Security-critical. Untrusted input handling, capability restrictions, and grounding verification are all mandatory review items.

---

### Creative

**Purpose.** Produce original content — scripts, hooks, narrative structure, packaging concepts, visual and narration direction.

**Typical department.** D2 Content Production; D3 Media Production.

**Typical functional classes.** Generator.

**Characteristics.** The only category where output variability is desirable. Highest quality variance. Highest business value.

**Design emphasis.** Bounded creativity — the schema holds the structure while the content varies within it (`STD-000` §4.5). Strategy and brand conformance enforced by validation, not hoped for. Originality checked against channel history.

**Review posture.** Rubric-based quality evaluation plus human sampling. Exact-match evaluation is inapplicable; without a rubric, "good" is unmeasurable.

---

### Review

**Purpose.** Assess an artifact and return actionable structured findings.

**Typical department.** All departments.

**Typical functional classes.** Critic.

**Characteristics.** Consumes another agent's output. Its findings drive revision decisions made by the workflow.

**Design emphasis.** Findings must be **actionable**: location, severity, the rule violated, and a concrete suggested correction. Prose review is unusable by an automated repair loop (`STD-000` §6.4). Deterministic parameters.

**Critical constraint.** A Review agent MUST NOT review output produced by the same prompt version, and SHOULD NOT use the same model. Self-assessment is systematically biased toward approval.

**Review posture.** Evaluated on agreement with expert-labelled findings — both missed findings and false positives, since a critic that flags everything is as useless as one that flags nothing.

---

### Validation

**Purpose.** Score artifacts against fixed rubrics, and evaluate policy and compliance risk.

**Typical department.** All departments; concentrated at handoffs and pre-publish.

**Typical functional classes.** Judge; occasionally Router.

**Characteristics.** Gates progression. Output determines whether work proceeds.

**Design emphasis.** Versioned rubrics with defined criteria and levels — never "rate this out of ten," which is an unauditable opinion that drifts with every model change. Fully deterministic. Calibration against human labels measured continuously.

**Critical constraint.** Validation-category agents **inform**; they never authorize. Nothing irreversible depends on them alone (`STD-000` §6.4). They are one input to a gate, not the gate.

**Review posture.** Calibration evidence is a required review artifact. An uncalibrated judge is a random gate, which is worse than no gate because it produces false assurance.

---

### Publishing

**Purpose.** Prepare and propose publication — scheduling proposals, destination metadata finalisation, format adaptation decisions.

**Typical department.** D4 Publishing & Growth.

**Typical functional classes.** Planner; Transformer.

**Characteristics.** **Publishing-category agents do not publish.** No agent does (`STD-000` Rule 4). They produce proposals and prepared metadata; the publishing layer executes, subject to compliance clearance, quota, and approval (`ARC-001` §12).

This distinction is worth stating explicitly because the category name invites the error, and the error is the exact one the security model exists to prevent.

**Design emphasis.** Proposals complete enough to execute and structured enough to validate (§6.6). Platform capability constraints treated as declared inputs, never assumed.

**Review posture.** Verify no capability beyond proposal generation. Verify destination assumptions are inputs, not constants.

---

### Analytics

**Purpose.** Interpret performance data and synthesise evidenced insight.

**Typical department.** D4 Publishing & Growth.

**Typical functional classes.** Extractor; Judge; occasionally Planner for proposals.

**Characteristics.** Consumes aggregated data rather than content. Output feeds the strategy loop through human decision (`ARC-001` §13.4).

**Design emphasis.** Statistical discipline. Findings must declare their evidential basis, and insufficient data must produce an explicit "insufficient evidence" outcome rather than a confident-sounding pattern. This is the category where models most readily manufacture narrative from noise, because a plausible story is always available.

**Critical constraint.** Analytics agents **propose**; they never mutate strategy, prompts, or configuration.

**Review posture.** Verify sufficiency thresholds exist and that insufficient-evidence outcomes are reachable and tested.

## 7.3 Category and class combinations

Common combinations, as a sanity check when classifying a new agent:

| Domain Category | Typical Functional Classes | Unusual — justify if claimed |
|---|---|---|
| Planning | Planner | Extractor, Judge |
| Research | Extractor, Transformer | Generator |
| Creative | Generator | Judge, Router |
| Review | Critic | Generator |
| Validation | Judge, Router | Generator |
| Publishing | Planner, Transformer | Generator, Critic |
| Analytics | Extractor, Judge, Planner | Generator |

An unusual combination is not forbidden — but it usually indicates the agent's purpose is unclear, or that it holds two responsibilities. Interrogate it before accepting it.

---

# 8. Communication Rules

Message format, envelope, naming, identifiers, and types are governed by `STD-000` §5. Communication modes and boundaries are `ARC-001` §8. This section covers only what the **agent author** must know.

## 8.1 What an agent may assume about its caller

**May assume:**
- Input has been validated against the declared input schema before arrival.
- All declared required inputs are present.
- Context bindings, where declared, are resolved and current.
- Untrusted inputs are marked as such.

**May NOT assume:**
- Anything about which workflow invoked it, or what preceded or follows it.
- That optional inputs will be present.
- That it will be invoked once — retries and repairs are normal (§10).
- That its output will be used. It may be rejected, superseded, or discarded.
- That any particular agent produced its input. It receives **artifacts**, not agent output (§4.2, section 12).

That last point is the one that erodes quietly. An agent designed around "what the Research Agent gives me" is coupled to that agent, and the coupling survives every attempt to replace it.

## 8.2 What an agent communicates

**Exactly one thing: its declared output, or a typed failure.** Nothing else — no partial results, no progress, no side channels, no logs as output, no commentary (`STD-000` §3.7).

## 8.3 Untrusted content

Any untrusted input is data, never instruction (`STD-000` §10.5). The agent author is responsible for:

- Declaring the trust level in the input specification.
- Delimiting the content unambiguously in the prompt.
- Labelling the block explicitly as data containing no directives.
- Ensuring delimiters are neutralised in the content so the block cannot be terminated early.

The platform enforces containment structurally (`ARC-001` §15.4). Prompt handling is the first layer, not the only one — and it is the layer the agent author owns.

## 8.4 The proposal pattern

Where an agent's job implies an effect, the agent returns a **proposal** and the workflow decides.

| Instead of | The agent returns |
|---|---|
| Publishing at a chosen time | A scheduling proposal with time, rationale, and constraints considered |
| Spending on a higher-tier model | An escalation recommendation with justification |
| Discarding a rejected asset | A disposition recommendation with reasons |
| Notifying a reviewer | A notification recommendation with urgency and audience |

The pattern is what makes model output structurally incapable of authorizing anything (`STD-000` Rule 38). It also makes every such decision reviewable, because a proposal is data that can be inspected, logged, validated, and overridden — whereas an action is only visible after it has happened.

## 8.5 What an agent must never do

- Invoke, reference, or await another agent (`STD-000` Rule 2).
- Read or write storage directly (`ARC-001` §15.3).
- Hold or request credentials.
- Initiate any network communication.
- Emit anything outside its declared output contract.
- Assume its position in any workflow.

---

# 9. Validation Responsibilities

## 9.1 The three-way split

Validation is distributed across three parties, and each owns a distinct kind of check. Confusing them produces either duplicated effort or unowned gaps.

| Party | Owns | Nature |
|---|---|---|
| **The agent author** (at design time) | Schema design that makes invalid output *unrepresentable* | Preventive |
| **The agent runtime** (at invocation) | Structural validation of input and output; bounded repair | Mechanical |
| **The validation plane** (between stages) | Business, consistency, grounding, quality, and policy validation | Independent |

## 9.2 What the agent author validates — by design

**The agent's most powerful validation is its schema.** Every constraint expressed structurally is a constraint the model cannot violate, checked for free, forever, with no invocation cost (§3.3).

At design time, the author is responsible for:

- Closed enumerations for every decision.
- Bounds on every collection and string.
- Declared unknown representations.
- Required fields genuinely required.
- Schema constraints matching prompt constraints **exactly** — a mismatch guarantees repair loops and wasted spend (`STD-000` §4.3).
- Structural verifiability of grounding references (§6.5).

**The design question:** *"What could the model return that would be structurally valid but wrong?"* Everything on that list is either moved into the schema, or handed to the validation plane as a named business rule. Nothing on that list is left to hope.

## 9.3 What the runtime validates

Automatic, uniform, and identical for every agent (`ARC-001` §6.5): input schema validation before invocation; output schema validation after; bounded repair with structured error feedback; budget enforcement; telemetry.

The agent author does not implement any of this. The author's obligation is to make it **effective** — a permissive schema makes the runtime's validation nearly worthless, since almost anything passes.

## 9.4 What the validation plane validates

Business rules, cross-artifact consistency, grounding verification, quality against rubrics, originality, and policy compliance (`ARC-001` §9). Independent by design (`ARC-001` §9.3).

The agent author's obligation here is **declarative**: state the business rules, consistency requirements, and quality criteria in the specification's Validation Rules section (§4.2, section 9), each named and testable. The author defines *what must be true*; the plane enforces it.

## 9.5 What an agent MUST NOT validate

- **Its own quality.** Self-assessment is biased toward approval. An agent returning "quality: high" is returning noise (`STD-000` §6.4).
- **Policy compliance of its own output.** That is an independent gate that fails closed (`ARC-001` §15.7).
- **Whether its output should proceed.** That is the workflow's decision.
- **Anything requiring information it was not given.** It cannot verify what it cannot see.

## 9.6 The design-time validation question

Before finalising any agent, answer in writing:

> *"List every way this agent's output could be wrong. For each: is it structurally impossible, mechanically detectable, independently checkable, or only detectable by a human?"*

Every item must land in one of those four buckets. An item in none of them is an **unowned failure mode** — it will occur in production, and nothing will catch it.

Push items leftward wherever possible: structural beats mechanical, mechanical beats independent, independent beats human. Each step left is cheaper, faster, and more reliable.

---

# 10. Retry Responsibilities

## 10.1 An agent retries nothing

This is absolute, and it is the section engineers most often try to work around.

`STD-000` §7 assigns all retry authority to the runtime and the workflow. An agent has no retry logic, no attempt counting, no backoff, and no internal loop. It is invoked; it succeeds or it fails.

**Why:** retry inside an agent would be unbounded from the platform's perspective, invisible to cost enforcement, uncounted by attempt budgets, unrecorded in telemetry, and impossible to circuit-break. Three levels of hidden internal retry beneath a policy that reads "3 attempts" is how a bounded system becomes an unbounded bill (`STD-000` §7.2).

## 10.2 The division of authority

| Level | Owns | Bounded by |
|---|---|---|
| **Agent** | Nothing | — |
| **Agent runtime** | Bounded repair — re-invocation with structured validation errors | Repair attempt budget |
| **Workflow engine** | Transport retry, regeneration, model escalation, provider failover, human escalation, termination | Attempt budgets, wall-clock deadline, cost ceiling |

## 10.3 The agent author's actual responsibility: repairability

The author cannot retry, but **can determine how repairable the agent's output is** — and this is a real design lever that is routinely ignored.

Repair works by feeding specific validation errors back so the model corrects those faults while preserving everything valid (`STD-000` §7.4). Design that supports this:

- **Granular structure.** Errors localise to specific fields, so repair is targeted. A single monolithic text field means any error requires regenerating everything, discarding good work and re-incurring full cost.
- **Stable field paths.** Errors reference stable locations, so the correction target is unambiguous.
- **Independent fields.** Correcting one field should not require recomputing others. Highly interdependent fields make targeted repair impossible in practice.
- **Clear constraints.** Violations that are precisely expressible produce precise repair instructions.

**The heuristic:** *"If one field of this output were wrong, could it be fixed without regenerating the rest?"* If not, every minor defect costs a full regeneration.

## 10.4 Declaring retry posture

The specification's Retry Strategy section (§4.2, section 10) declares: attempt budgets if they differ from the platform default and why; which fields are independently repairable; failure modes that are known to be non-repairable and should escalate immediately; and any determinism considerations affecting regeneration.

If the agent uses platform defaults, say so in one line. Do not restate the default policy.

## 10.5 When an agent should fail rather than produce something

Fail — with a typed failure — rather than return output when:

- A required input is missing or invalid (`STD-000` §3.6).
- The request falls outside the declared scope (§11.4).
- Producing valid output would require inventing a value (`STD-000` Rule 18).
- Supplied sources are insufficient to ground required claims.
- The input is internally contradictory and no correct output exists.

**Never fabricate to avoid failing.** A confident, plausible, wrong output is far more expensive than a clean failure: it consumes downstream generation, render time, publishing quota, reviewer attention, and possibly channel standing before anyone notices (`STD-000` §2.13). A failure costs one invocation.

---

# 11. Error Handling

Error object structure, categories, severity, and code naming are governed by `STD-000` §8. This section covers how an **agent author** designs failure behaviour.

## 11.1 Failure is a designed output

An agent's failure modes are part of its contract and are specified with the same care as its success path (§4.2, section 11). Error responses are the primary interface during every incident, and an agent whose failures are vague is an agent that cannot be operated.

## 11.2 Three distinct outcomes, frequently conflated

This distinction is the most common source of error-handling defects in agent design, because all three feel like "it didn't work."

| Outcome | Meaning | Expression | Downstream response |
|---|---|---|---|
| **Declared unknown** | The agent succeeded; a specific value could not be determined | Valid output using the declared unknown mechanism | Proceed; consumers handle the unknown per contract |
| **Typed failure** | The agent could not produce valid output | A structured error (`STD-000` §8.1) | Retry, repair, escalate, or fail per policy |
| **Refusal** | The request is outside declared scope or is not supportable | A structured error, category-specific, **non-retryable** | Fail fast; do not retry, do not rephrase |

**Worked distinction.** An agent asked to produce five thumbnail concepts:

- Produces five concepts, but cannot determine a recommended one → **declared unknown** on that field, success.
- Cannot produce five valid concepts from the supplied input → **typed failure**.
- Is asked to produce concepts for a topic outside its declared scope → **refusal**.

Collapsing these produces two specific bad outcomes: retrying refusals (futile, costly, and — where the refusal is policy-driven — a policy-evasion pattern that MUST NOT be attempted, `STD-000` §7.4), and treating an unknown value as a failure, halting a run that should have proceeded.

## 11.3 Recoverable versus non-recoverable

The agent author declares which of its failure modes are which; the workflow acts on the declaration.

**Recoverable** — a different attempt could succeed:
- Output failed structural validation → repairable
- Output failed a business rule → repairable with specific feedback
- Output quality below threshold → regenerable
- Transient provider failure → retryable (runtime concern)

**Non-recoverable** — no attempt will succeed with this input:
- Required input missing or invalid
- Request outside declared scope
- Sources insufficient for required grounding
- Input internally contradictory
- Declared budget exhausted

Misclassification is expensive in both directions. Marking a non-recoverable failure as recoverable burns the full retry budget on something that cannot succeed. Marking a recoverable failure as non-recoverable fails runs that a single repair would have rescued.

## 11.4 Refusal design

Every agent MUST have an explicit refusal policy in its prompt (`STD-000` §4.1). It refuses when:

- The request is outside its declared responsibilities.
- Fulfilment would require capabilities it does not have.
- Fulfilment would require inventing values (`STD-000` Rule 18).
- The input is malformed in a way validation did not catch.
- The request appears to be an attempt to alter the agent's instructions (`STD-000` §10.5).

**Refusals are structured output, not prose.** A refusal returns a typed error with a reason code — never an apology, never an explanation, never a partial attempt. "I can't do that, but here's something similar" is the worst possible response: it produces unowned, unvalidated output that a consumer may accept as legitimate.

## 11.5 What must never happen on failure

- **Never fabricate.** Not a value, not an estimate, not a placeholder (`STD-000` Rule 18).
- **Never partially succeed silently.** Incomplete output is a failure, not a partial success (`STD-000` §2.13).
- **Never substitute a default** for a failed generation.
- **Never emit prose explanation** in place of structured output.
- **Never truncate to fit.** Truncation is a failure and must be detected as one (`STD-000` §6.7).

---

# 12. Prompt Ownership

Prompt structure, variables, constraints, temperature policy, chain-of-thought, hallucination prevention, few-shot policy, and versioning are governed by `STD-000` §4 and are not restated. This section covers **ownership and lifecycle** from the agent author's perspective.

## 12.1 Ownership

Every prompt is owned by exactly one agent. There are no shared or global prompts (`STD-000` §3.9).

Shared guidance may exist as a versioned fragment composed at build time into an immutable, fully-expanded prompt version. **Changing a fragment produces a new prompt version for every agent that composes it, and re-runs every affected evaluation set.** The practical consequence for authors: shared fragments are not free. Use them for genuinely universal guidance; duplicate short text rather than creating a coupling that forces coordinated re-evaluation across a dozen agents.

## 12.2 The prompt is not the agent

The agent is its **specification and contracts**. The prompt is one implementation of them, replaceable beneath a stable contract (§3.6).

This has a practical consequence authors regularly forget: **a prompt change that alters the contract is not a prompt change.** It is a contract change requiring version treatment, consumer notification, and migration. Prompt versions move freely beneath a contract; they do not move the contract.

## 12.3 Prompt lifecycle

| Stage | Work | Gate |
|---|---|---|
| **Authored** | Written against the fixed contract, per `STD-000` §4.1 | All structural blocks present; variables declared |
| **Reviewed** | Second-person review against `STD-000` §13.3 | Checklist passed |
| **Evaluated** | Run against the evaluation set, on every approved provider and locale | Thresholds met; no regression against incumbent |
| **Candidate** | Measured share of production traffic | Production quality, cost, and latency within budget |
| **Champion** | The default resolved version | — |
| **Deprecated** | Superseded, retained for replay | — |

**Nothing skips evaluation.** "It's a small wording change" is precisely the change most likely to have an unexpected effect, because nobody looks closely at it.

## 12.4 Prompt testing method

- **Evaluate before, not after.** The evaluation set is written in authoring phase 3, before the prompt exists (§2.5). Sets written afterwards encode existing behaviour and cannot fail it.
- **Compare against the incumbent**, not against an absolute bar alone. The question at promotion is "is this better?" not "is this acceptable?"
- **Measure three axes**: quality, cost, latency. A quality gain bought with a large cost increase is a trade to be decided deliberately, not a win to be assumed.
- **Evaluate per provider and per locale.** A prompt passing on one is unevaluated on the others (`STD-000` §14.4, §15.5).
- **Include adversarial cases every time.** Injection resistance regresses silently.

## 12.5 The four levers — diagnostic order

When output is unsatisfactory, engineers reflexively edit the prompt. It is the fastest lever and frequently the wrong one. **Diagnose in this order:**

```
  1. INPUT      — Is the agent receiving what it needs?
                  Missing context, wrong granularity, too much irrelevant material.
                  → Most common root cause. Check first, always.

  2. SCHEMA     — Can the schema even express a correct answer?
                  Is it permitting output that should be structurally impossible?
                  → Second most common. Schema fixes are permanent; prompt fixes are persuasion.

  3. BOUNDARY   — Is the agent doing too much, or too little?
                  Two quality problems that do not co-vary means two agents.
                  → Rarer, but a boundary defect is unfixable by prompting.

  4. PROMPT     — Are the instructions ambiguous, contradictory, or incomplete?
                  → Only after 1–3 are excluded.

  5. MODEL      — Does the task genuinely exceed the routed model's capability?
                  → Last. Escalating model to compensate for a weak specification
                    is expensive, and it hides the real defect rather than fixing it.
```

**Never raise temperature to fix quality.** It increases variance, not capability, and on structured tasks it increases failure rate (`STD-000` §4.5). Reaching for temperature is nearly always a signal that levers 1–3 were skipped.

## 12.6 Prompt replacement

**Revise the prompt** when: instructions are ambiguous or contradictory; a constraint is missing; examples are unhelpful or now schema-invalid; a locale variant needs its own treatment.

**Replace the prompt entirely** when: the contract changed materially; accumulated patches have made it internally inconsistent; a structurally different approach evaluates better.

**Do not touch the prompt** when: the real defect is input, schema, boundary, or model (§12.5).

**Rollback triggers.** Any of the following requires immediate rollback to the prior version, which needs no deployment (`STD-000` §4.9): schema validity rate falling below threshold; repair rate rising; cost per invocation rising without a justified quality gain; human rejection rate rising; or evaluation regression discovered post-promotion.

## 12.7 Prompt confidentiality

Prompts are proprietary and MUST NOT be exposed through output, errors, or any surface (`STD-000` §10.7). Design implications for authors: never instruct the model to explain its instructions; never include a field that could carry prompt content; treat extraction attempts as refusals (§11.4).

---

# 13. Agent Quality Requirements

## 13.1 Quality is per-class

Platform-wide quality standards are in `STD-000` §13. This section adds what that section deliberately leaves open: **quality targets differ by functional class**, because an Extractor and a Generator cannot share a bar. Holding a creative agent to exact-match accuracy is meaningless; holding an extractor to a rubric score is negligent.

| Functional class | Primary quality measure | Method | Target posture |
|---|---|---|---|
| **Extractor** | Accuracy against expected output | Exact or near-exact match on golden set | Very high — there is a correct answer |
| **Transformer** | Information preservation and structural correctness | Structural comparison; content equivalence | Very high — nothing should be lost or added |
| **Generator** | Rubric score; brand and strategy conformance; originality | Judge scoring plus human sampling | Threshold-based; distribution matters more than any single output |
| **Critic** | Agreement with expert-labelled findings | Precision and recall against labelled set | Both directions — misses and false positives are equally disqualifying |
| **Judge** | Correlation with human scores; calibration | Correlation against human-labelled samples | High correlation; calibration tracked continuously |
| **Planner** | Constraint satisfaction; internal consistency; feasibility | Deterministic constraint checking | Very high — a self-contradicting plan is worse than none |
| **Router** | Decision accuracy | Accuracy against labelled decisions | Very high — routing errors propagate silently |

Every agent declares its own numeric targets in its specification. This table sets the *kind* of bar; the agent sets the height, and justifies it.

## 13.2 Universal measures

Regardless of class, every agent MUST declare and meet:

| Measure | Requirement | Source |
|---|---|---|
| First-attempt schema validity | ≥ 99.5% | `STD-000` §13.3 |
| Repair rate | ≤ 2% | `STD-000` §13.3 |
| Escalation rate | ≤ 0.5% | `STD-000` §13.3 |
| Evaluation regression on promotion | 0 | `STD-000` §13.3 |
| Cost per invocation | Within declared budget | `STD-000` §11.8 |
| Latency (p50, p95) | Within declared budget | `STD-000` §11.8 |
| Locale coverage | Passing evaluation in every approved locale | `STD-000` §15.5 |
| Provider coverage | Passing evaluation on every approved provider | `STD-000` §14.4 |

## 13.3 Consistency

Distinct from accuracy, and frequently overlooked: **the same input should produce equivalent-quality output on repeated invocation.**

- Deterministic classes (Extractor, Transformer, Judge, Router): output should be identical or near-identical across runs.
- Generator class: output will and should differ, but its *quality* should not. High variance in quality is a defect even when the mean is acceptable, because production sees the whole distribution — and the bad tail is what reaches an audience.

Measure variance, not just mean. An agent producing excellent output four times in five and unusable output once in five is not an eighty-percent-good agent; it is an agent that will publish something embarrassing this month.

## 13.4 Cost and speed

Both are declared budgets, empirically justified, and enforced (`STD-000` §11.8). Two authoring notes:

- **Declare from measurement, not estimate.** A guessed budget is documentation, not a control.
- **Track cost per unit of value, not per invocation.** An agent that costs more per call but eliminates two downstream repairs is cheaper. Cost per finished video is the measure that matters (`STD-000` §11.2).

## 13.5 Maintainability

Assessed at review (§14):

- Specification complete, all seventeen sections, no placeholders.
- Purpose sentence passes the one-sentence test.
- No hidden dependencies.
- Prompt free of duplicated shared text.
- No hardcoded values that vary by tenant, channel, locale, or brand.
- No provider or model identifiers anywhere.
- Evaluation set covering all six required case types (§3.7).

## 13.6 Quality decay

Agent quality degrades over time even with no change, because models are silently revised, providers change behaviour, content patterns shift, and audience expectations move. Therefore:

- Evaluation sets run on a schedule, not only on change.
- Production quality metrics are monitored continuously per agent and prompt version.
- Human rejection rate with categorised reasons is tracked — the highest-signal quality dataset available (`STD-000` §13.6).
- A quality regression with no corresponding version change indicates external drift, and MUST be investigated rather than absorbed.

---

# 14. Agent Review Checklist

This checklist gates promotion of any new agent, and any major version of an existing one. It is also the standing agenda for architecture review. **Every item must pass or carry a recorded, time-limited waiver** (`STD-000` §17).

## Gate 1 — Purpose and scope

- [ ] Purpose stated in one sentence, no conjunction joining unrelated work (§2.2)
- [ ] The causal test applied — parts that do not inform each other have been split (§2.2)
- [ ] Sizing checked in both directions; not too large, not over-decomposed (§2.3)
- [ ] Deliverable is independently evaluable
- [ ] No existing agent covers this capability, and no boundary adjustment would
- [ ] Non-Responsibilities complete; every adjacent capability addressed and its real owner named (§2.4)
- [ ] Functional class declared (`STD-000` §3.11)
- [ ] Domain category declared (§7)
- [ ] Class and category combination is conventional, or its unusualness is justified (§7.3)

## Gate 2 — Contracts

- [ ] Contract-first order followed; contract not retrofitted from model output (§3.4)
- [ ] Every output field traces to a named consumer and a decision (§6.1)
- [ ] Every decision field is a closed enumeration (§6.2)
- [ ] Every collection and string bounded, with counting unit declared (§6.2)
- [ ] Unknown representation declared for every undeterminable field (§6.2)
- [ ] Enumerations declared closed or open (§6.9)
- [ ] Schemas closed to unknown properties (`STD-000` §5.1)
- [ ] Schema constraints and prompt constraints agree exactly (§9.2)
- [ ] Schemas versioned and registered
- [ ] Factual claims carry structurally verifiable references (§6.5)
- [ ] Confidence included only where something routes on it, with documented meaning (§6.4)
- [ ] Effects modelled as proposals, never actions (§6.6, §8.4)
- [ ] No reasoning, explanation, or echoed input in output (§6.8)

## Gate 3 — Inputs

- [ ] Every input demonstrably affects output quality (§5.1)
- [ ] Nothing passed "just in case"
- [ ] Context bindings declared explicitly and subset-scoped (§5.4)
- [ ] Optional inputs have declared absence behaviour (§5.3)
- [ ] Untrusted inputs marked, delimited, labelled, and bounded (§5.6)
- [ ] Large content passed by reference (§5.5)
- [ ] Input size bounded and within budget
- [ ] A stranger could assemble a valid invocation from the specification alone

## Gate 4 — Principles

- [ ] Stateless; no dependence on undeclared state (§3.2)
- [ ] Memory, where used, is an explicit declared input (§3.2)
- [ ] No hidden dependencies; every applied constraint is stated (§3.5)
- [ ] No English, format, platform, brand, or length assumptions embedded (§3.5)
- [ ] Inert; declares effects, never performs them (§3.9)
- [ ] Declares capabilities, never models or vendors (§3.8)
- [ ] Prompt free of vendor-specific syntax (§3.8)
- [ ] Replaceable — a different team could build an equivalent from the specification (§3.6)

## Gate 5 — Validation

- [ ] Design-time validation question answered in writing; every failure mode assigned to a bucket (§9.6)
- [ ] No unowned failure modes remain
- [ ] Business rules named, individually testable, with stable identifiers (§4.2, section 9)
- [ ] Every rule has a passing and a failing test case (`STD-000` §6.9)
- [ ] Agent does not validate its own quality, policy compliance, or right to proceed (§9.5)
- [ ] Schema makes as many invalid outputs unrepresentable as practical (§9.2)

## Gate 6 — Failure behaviour

- [ ] All failure modes enumerated with registered error codes (`STD-000` §8.4)
- [ ] Declared unknown, typed failure, and refusal clearly distinguished (§11.2)
- [ ] Recoverable and non-recoverable classified correctly (§11.3)
- [ ] Explicit refusal policy present in the prompt (§11.4)
- [ ] Refusals return structured errors, never prose or partial attempts (§11.4)
- [ ] No path fabricates a value to avoid failing (§11.5)
- [ ] Truncation is detected and treated as failure (§11.5)

## Gate 7 — Retry and repairability

- [ ] Agent contains no retry logic of any kind (§10.1)
- [ ] Output structure supports targeted repair; a single wrong field does not force full regeneration (§10.3)
- [ ] Field paths stable; fields sufficiently independent
- [ ] Retry posture declared; deviations from platform default justified (§10.4)
- [ ] Non-repairable failure modes identified for immediate escalation

## Gate 8 — Prompt

- [ ] All seven structural blocks present, in order (`STD-000` §4.1)
- [ ] Every rule atomic and individually verifiable
- [ ] No contradictory instructions
- [ ] Unknown-value policy explicit and unconditional (`STD-000` §4.7)
- [ ] Refusal policy explicit
- [ ] Every variable declared, typed, strictly resolved (`STD-000` §4.2)
- [ ] Untrusted variables delimited and labelled as data
- [ ] Temperature within the class-mandated range (`STD-000` §4.5)
- [ ] No reasoning directed into the payload (`STD-000` §4.6)
- [ ] Examples validate against the current schema (`STD-000` §4.8)
- [ ] No secrets, PII, tenant identifiers, or vendor syntax
- [ ] Second-person review completed and recorded (`STD-000` §4.9)

## Gate 9 — Evaluation

- [ ] Evaluation set written before the prompt (§2.5)
- [ ] All six case types present: representative, boundary, degenerate, adversarial, locale, regression (§3.7)
- [ ] Adversarial cases include instruction-bearing content
- [ ] Thresholds declared and met
- [ ] Passing on every approved provider (§12.4)
- [ ] Passing in every approved locale (§12.4)
- [ ] No regression against the incumbent version
- [ ] Class-appropriate quality method used (§13.1)
- [ ] Quality variance measured, not only mean (§13.3)

## Gate 10 — Performance and cost

- [ ] Cost budget declared, expected and maximum, from measurement (§13.4)
- [ ] Latency budget declared, p50 and p95, from measurement
- [ ] Token characteristics documented; input size bounded
- [ ] Caching posture stated
- [ ] Known cost drivers identified
- [ ] Cost impact of any version change measured (§12.4)

## Gate 11 — Security

- [ ] Untrusted input handling complete (§5.6, §8.3)
- [ ] Declared permissions minimal; nothing beyond genuine need (`ARC-001` §15.6)
- [ ] No credentials required or requested (§8.5)
- [ ] No network access required
- [ ] No storage access required
- [ ] Agent cannot act; only proposes (§3.9)
- [ ] Prompt-extraction attempts handled as refusals (§12.7)
- [ ] Output sanitisation requirements stated where output reaches rendering or publication

## Gate 12 — Documentation and operability

- [ ] All seventeen specification sections present, in canonical order (§4.1)
- [ ] No placeholders, no "to be determined" (§4.3)
- [ ] Responsibilities and output fields map bidirectionally (§4.2, section 2)
- [ ] Example request and response complete and automatically verified (§4.2, sections 7–8)
- [ ] Invalid example present and explained (§4.2, section 8)
- [ ] Dependencies expressed as contracts, never as agents (§4.2, section 12)
- [ ] Known limitations stated honestly (§4.2, section 17)
- [ ] Manifest complete (`STD-000` §3.12)
- [ ] Owner named
- [ ] Reviewer named and review recorded

---

# 15. Anti-Patterns

Each anti-pattern below is stated as it actually appears, why it is harmful, how to detect it in review, and the fix. These are the failures that recur; the checklist in §14 catches most of them, but several require judgment to spot.

---

### 15.1 The Swiss Army Agent

**Appears as.** An agent that "handles content" — writes the script, picks the title, drafts the description, and suggests tags. Justified as efficiency: "it already has the context."

**Harmful because.** Quality becomes unattributable; you cannot tell which part regressed. Improving one aspect degrades another silently, because the model trades objectives against each other invisibly. None of it can be individually replaced, measured, or improved.

**Detect.** Purpose sentence needs a conjunction. Output has clusters of fields no single consumer uses together.

**Fix.** Split along causal lines (§2.2). Accept re-passing some context — that cost is far smaller than the cost of unmeasurable quality.

---

### 15.2 The Chatty Pipeline

**Appears as.** Fifteen agents where four would do, each producing a fragment that only the next agent consumes.

**Harmful because.** Every hop costs an invocation, a validation pass, latency, and context re-passing. Deliverables stop corresponding to anything reviewable. Quality becomes *harder* to attribute, not easier — the opposite of the intent.

**Detect.** An agent's output has exactly one consumer that uses all of it. Its quality cannot be judged without downstream work. Splitting produced prompts that must be edited together.

**Fix.** Merge to the smallest independently evaluable deliverable (§2.3). Over-decomposition is not rigour.

---

### 15.3 Agent Calling Agent

**Appears as.** A prompt instructing the model to "consult the research agent," or an output field naming an agent that should run next, or a specification listing other agents as dependencies.

**Harmful because.** It reintroduces every failure the architecture exists to prevent — invisible graphs, unbounded cost, unattributable failure, orchestration in prose (`ARC-001` §7.2).

**Detect.** Any agent name in a prompt, an output field, or a dependency list.

**Fix.** Dependencies are **artifacts and contracts**, never agents (§4.2, section 12). Sequencing belongs to the workflow. If an agent genuinely needs another's output, the workflow passes it as an input.

---

### 15.4 Hidden Assumptions

**Appears as.** A prompt that says "keep it concise" with no number. An agent that assumes English. Logic that assumes a specific video length or destination platform. A house style present in no brand kit.

**Harmful because.** Behaviour cannot be explained, localisation is blocked, multi-brand support is blocked, and a replacement agent cannot honour rules nobody wrote down. This is the anti-pattern that quietly makes internationalisation a rewrite.

**Detect.** Read the specification as a stranger. Every constraint applied must be stated somewhere (§3.5).

**Fix.** Promote every assumption to an explicit input, a configured value, or a documented constraint.

---

### 15.5 Side Effects and Business Logic Leakage

**Appears as.** An agent that "just" records something, "just" fetches a page, or "just" decides whether the run should continue. Or deterministic business rules — quota arithmetic, scheduling calculation, format selection — implemented inside a prompt.

**Harmful because.** Side effects break retryability and the security model (`STD-000` Rule 4). Deterministic logic in a prompt is the worst possible location for it: non-deterministic, expensive, unversioned as logic, untestable, and silently variable between models.

**Detect.** The agent does anything other than return data. The prompt contains arithmetic, threshold comparison, or conditional business rules.

**Fix.** Effects become proposals (§8.4). Deterministic logic moves to deterministic components. **If it can be computed, it must not be prompted.**

---

### 15.6 Prompt Duplication

**Appears as.** The same tone guidance, formatting rules, or brand instructions pasted into six prompts.

**Harmful because.** Divergence is inevitable, and it is invisible — five copies get updated, one does not, and that agent quietly behaves differently for months.

**Detect.** Identical or near-identical blocks across prompts.

**Fix.** Either a versioned fragment composed at build time — accepting that changing it re-versions and re-evaluates every consumer (§12.1) — or a declared input carrying the guidance as data. Prefer the input where the content is genuinely per-channel or per-brand, since that is configuration, not prompt.

---

### 15.7 Unbounded Output

**Appears as.** A schema with an unbounded array, or a long-form text field with no maximum.

**Harmful because.** Cost risk, truncation risk, and fan-out risk simultaneously. A model returning five hundred scenes becomes five hundred billed generations if nothing catches it (`STD-000` §11.6).

**Detect.** Any array or string without declared bounds.

**Fix.** Bound everything, from genuine need. Bounds are structural cost control, not tidiness.

---

### 15.8 Unvalidated Consumption

**Appears as.** Treating another agent's output as trustworthy because "it's internal."

**Harmful because.** Model output is untrusted input to every downstream consumer, including other agents (`STD-000` §10.6). Every unvalidated boundary is a place where malformed data propagates until it fails somewhere unrelated and undiagnosable.

**Detect.** Any consumption path without schema validation.

**Fix.** Validate at every boundary. There are no trusted producers.

---

### 15.9 Confidence Theatre

**Appears as.** A confidence field on every output because it seemed rigorous, with no consumer routing on it and no documented meaning.

**Harmful because.** It manufactures assurance that nothing supports. Worse, someone eventually *starts* trusting it, and self-reported model confidence is poorly calibrated (`STD-000` §6.5).

**Detect.** A confidence field whose consumer and threshold behaviour cannot be named.

**Fix.** Remove it, or define what it measures, what produces high and low values, what routes on it, and how calibration is verified.

---

### 15.10 Marking Its Own Homework

**Appears as.** An agent returning a quality score for its own output, or a Critic reviewing output from the same prompt version.

**Harmful because.** Self-assessment is systematically biased toward approval — the context that produced the flaw produces the assessment of it. The score is not merely useless; it is misleading (`STD-000` §6.4).

**Detect.** Quality fields in a Generator's output. A validator sharing a prompt version with what it validates.

**Fix.** Quality assessment belongs to the independent validation plane. Critics and Judges must be separate agents, with a different prompt version and preferably a different model.

---

### 15.11 The Helpful Agent

**Appears as.** An agent that volunteers extra fields, adds a suggestion, or explains its reasoning "in case it's useful."

**Harmful because.** Volunteered output is unowned, unevaluated, and unversioned — and some consumer will eventually depend on it, at which point it becomes a contract nobody designed. Reasoning in the payload violates `STD-000` §4.6 and costs tokens on every call.

**Detect.** Output fields not in the schema. Prose in structured fields. Explanation anywhere.

**Fix.** Closed schemas make it structurally impossible. Explicit Non-Responsibilities reduce the model's tendency toward it.

---

### 15.12 Temperature as a Remedy

**Appears as.** Raising temperature because output feels repetitive or flat; raising it during repair because attempts keep failing.

**Harmful because.** Temperature increases variance, not capability. On structured tasks it raises failure rate, and on repair it makes success *less* likely (`STD-000` §4.5). It is almost always a substitute for diagnosis.

**Detect.** Any temperature outside the class-mandated range, or any parameter change made without an evaluation result.

**Fix.** Work the diagnostic order (§12.5). Repetitiveness is usually an input-diversity or boundary problem, not a sampling problem.

---

### 15.13 Retrofitted Contracts

**Appears as.** A schema derived from what the model happened to produce during experimentation.

**Harmful because.** The contract describes an accident of model behaviour rather than consumer need. When the model or prompt changes, the contract turns out to have been documenting nothing durable.

**Detect.** Fields with no identifiable consumer. A schema that mirrors one model's output habits.

**Fix.** Contract-first, from consumer need backward (§3.4).

---

### 15.14 The Untested Locale

**Appears as.** An agent marked as supporting several languages because the prompt has a locale variable.

**Harmful because.** A variable is not support. Length constraints, rhythm, conventions, and cultural rules differ materially; an unevaluated locale is a claim, not a capability (`STD-000` §15.5).

**Detect.** Approved locales exceeding locales with evaluation sets.

**Fix.** A locale is unsupported until its evaluation set passes. Say so plainly in the specification.

---

# 16. Future Expansion

## 16.1 Why adding an agent is safe

Agents are leaves with no outgoing edges (`ARC-001` §6.1). Adding a leaf to a set cannot disturb the other leaves. This is the direct structural payoff of `STD-000` Rule 2, and it is what keeps the twenty-first agent as cheap to add as the third.

A new agent is unreferenced until a workflow chooses to use it, so it cannot affect any existing run even after registration.

## 16.2 Before adding: three questions

**1. Does an existing agent already cover this?**
Check the registry by capability, not by name. Near-duplicate agents are worse than a slightly broad one, because work silently splits between them and neither accumulates quality evidence.

**2. Would a boundary adjustment be better?**
Sometimes the right answer is extending an existing agent's responsibility rather than creating a neighbour. Apply the causal test (§2.2): if the new work would inform the existing work, it belongs there.

**3. Is this genuinely model work?**
If it can be computed deterministically, it must not be an agent (§15.5). This question eliminates more proposed agents than the other two combined.

## 16.3 Adding a new agent

Follow the authoring lifecycle (§2.5). Required artifacts: manifest, schemas, prompts, validators, evaluation set, specification, registry entry (`ARC-001` §14.1).

**What must not change:** any existing agent, any existing contract, any core component. If adding an agent requires modifying an existing one, the boundary is wrong — resolve it before proceeding.

## 16.4 Extending an existing agent

| Change | Version impact | Requirement |
|---|---|---|
| New optional output field | Minor | Consumers unaffected |
| New optional input with declared absence behaviour | Minor | Callers unaffected |
| New enumeration value | **Major** unless the enum is declared open | Consumer migration |
| New required input | **Major** | Migration path for every caller |
| Changed field meaning | **Prohibited** | Retire and replace (§5.7) |
| Prompt revision within the contract | Prompt version only | Evaluation with no regression |

**Additive-only within a major version** (`STD-000` §2.16). In-flight runs keep their pins, so existing work is never disturbed.

## 16.5 Replacing an agent

Because agents are contract-bound and inert, replacement is substitution (§3.6):

1. Build the replacement against the same contracts.
2. Evaluate against the incumbent's evaluation set — the same bar, not a new one.
3. Run as candidate on measured traffic.
4. Compare quality, cost, and latency.
5. Promote, or roll back. Rollback needs no deployment.

Workflows do not know which implementation they received, and could not behave differently if they did. This is the mechanism that makes a third-party marketplace possible (`ARC-001` §17.5).

## 16.6 Retiring an agent

- Declare a replacement, or state explicitly that there is none.
- Publish a migration path and an end-of-support date.
- Workflows referencing it warn at validation, then fail after the end-of-support date.
- **The version remains resolvable forever** for replay and audit (`ARC-001` §6.2). History is never deleted.

## 16.7 Growth in other directions

| Growth | What is added | What changes |
|---|---|---|
| New locale | Locale definition plus a locale-specific evaluation set per agent | Nothing structural; each agent gains coverage |
| New brand | A versioned brand kit | Nothing; brand is a declared input |
| New provider | Adapter and configuration; evaluation re-run per agent | Nothing in any agent (`STD-000` §14.6) |
| New department | Registry entries and department documentation | Nothing; departments are organisational (`ARC-001` §5.1) |
| Third-party agent | The same artifacts as any agent | Nothing — no privileged path exists |

## 16.8 The standard that keeps this true

Every property in this section depends on agents remaining leaves, inert, stateless, and contract-bound. Each is guaranteed by a rule in `STD-000`, and each erodes the first time an exception is granted.

The reason `STD-000` Rule 2 is stated so absolutely is that the moment one agent calls another, the entire additive property in §16.1 is gone — and it does not come back incrementally. Extensibility here is not a feature that was built; it is a consequence of constraints that must be continuously held.

---

# Appendix A — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial agent development guide: job-description model, authoring lifecycle, nine design principles with procedures and limits, section-by-section anatomy authoring guide, input and output design method, dual taxonomy of functional class and domain category, validation and retry responsibility splits, three-outcome failure model, prompt lifecycle and the four-lever diagnostic order, per-class quality targets, twelve-gate review checklist, fourteen anti-patterns, and expansion procedure. |

---

*End of document — GDE-002 v1.0. Governed by STD-000 v1.0. Situated by ARC-001 v1.0.*

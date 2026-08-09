# AI YouTube Automation Platform
## Project Engineering Standards
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `STD-000` |
| Title | Project Engineering Standards |
| Version | 1.0 |
| Status | Active |
| Supersedes | — |
| Owner | Platform Architecture |
| Audience | All engineers, all AI agents, all contributors, all marketplace publishers |
| Review cadence | Quarterly, or on any breaking platform change |
| Change process | See *Appendix A — Amendment Process* |

**Precedence.** This document is the highest-authority engineering artifact in the project. Where any other document, specification, prompt, workflow, or convention conflicts with it, this document wins. A conflict is a defect and MUST be resolved by amending the conflicting artifact — or, if this document is wrong, by amending this document through the process in Appendix A. Silent divergence is never acceptable.

**Requirement language.** This document uses RFC 2119 keywords with the following meanings:

- **MUST / MUST NOT** — an absolute requirement. Violations block merge and block release. No exceptions without a recorded, approved waiver.
- **SHOULD / SHOULD NOT** — a strong recommendation. Deviation is permitted only with a written justification recorded in the relevant Architecture Decision Record (ADR).
- **MAY** — genuinely optional. No justification needed either way.

Anything not marked with a keyword is context, rationale, or explanation, and is not itself a requirement.

**Scope.** This document defines *standards* — the rules that constrain how things are built. It deliberately does not define *implementation* — no languages, frameworks, interfaces, storage designs, or algorithms appear here. Those belong in the architecture specification and in per-component designs, all of which must conform to this document.

---

# 1. Project Vision

## 1.1 What we are building

The platform is an **autonomous content production company expressed as software**.

A conventional content operation employs a strategist, a researcher, a writer, an editor, a fact-checker, a voice director, an art director, an SEO specialist, a compliance reviewer, a publisher, and an analyst. Each is a specialist. Each hands structured work to the next. Each is accountable for one thing and is replaceable without dismantling the studio.

This platform reproduces that structure with AI agents. Every agent is a narrow specialist with one job, a defined contract, its own version history, and its own quality bar. The platform is the studio: it hires (registers) agents, routes work between them, enforces standards, reviews output, escalates to humans when the stakes require it, publishes the result, measures what happened, and feeds the measurement back into the next cycle.

The unit of value is not "a generated script." It is **a channel that reliably produces videos an audience genuinely wants to watch, indefinitely, without a human touching each one.**

## 1.2 Long-term goals

**Horizon 1 — The Agent Factory.**
A dependable, observable pipeline that turns a channel strategy into a finished, published video. Success means: any competent engineer can add a new agent in a day by following this document, and the pipeline's behavior is fully reconstructible after the fact — every decision, every prompt, every cost.

**Horizon 2 — Autonomous Channel Operations.**
The platform runs many channels concurrently across niches, languages, and brands, and closes the loop: published performance data becomes strategy input, which becomes better content. The system improves measurably over time without prompt-tinkering by hand. Human effort shifts from *producing* to *approving and steering*.

**Horizon 3 — A Platform Others Build On.**
Third parties publish agents, workflows, niche blueprints, brand kits, and rendering backends into a governed marketplace. The core platform's value is the contracts, the orchestration, the safety rails, and the measurement — not any individual agent. Agents become commodities; the standards that make them interoperable are the moat.

## 1.3 Design values

| Value | Meaning in practice |
|---|---|
| **Contracts over conversation** | Components interoperate through versioned, validated data contracts. Never through free text, never through implicit expectations. |
| **Boring where it counts** | Creativity belongs inside the agents. The infrastructure around them must be predictable, observable, and dull. |
| **Reproducible by default** | Any output must be explainable and re-derivable: which agent, which version, which prompt, which model, which inputs, what it cost. |
| **Cheap to replace, expensive to corrupt** | Any single agent, prompt, model, provider, or renderer must be swappable in isolation. Cross-cutting standards must be hard to violate. |
| **Quality is a gate, not a hope** | Nothing reaches an audience without passing explicit, measurable checks. |
| **Humans own consequences** | Irreversible and reputational actions require human authority, always. |

## 1.4 Non-goals

Stating these prevents years of scope drift:

- **Not a general-purpose agent framework.** The domain is faceless video production. Generality is added only when a concrete second use case demands it.
- **Not a chatbot.** No component holds a conversation. Every agent invocation is a structured, single-shot transaction.
- **Not a volume-maximization engine.** The platform MUST NOT be optimized for raw output count. See §1.5.
- **Not a human-replacement for judgment.** Strategy approval, policy decisions, and publishing authority remain human by design.
- **Not a media editing suite.** Rendering is a deterministic execution of a declared plan, not an interactive tool.

## 1.5 Non-negotiable external constraints

These are properties of the outside world. They constrain the architecture permanently and MUST be treated as first-class engineering requirements, not as content-team concerns.

**1. Distribution platforms penalize mass-produced, low-differentiation content.**
YouTube's monetization policies explicitly target repetitive, templated, mass-produced material with no meaningful added value. A system that maximizes throughput without maximizing differentiation is a system that efficiently builds demonetized channels. Therefore: originality, factual grounding, and per-channel voice distinctiveness are **engineering quality gates** (§6, §13), not editorial preferences. Throughput is capped by quality, never the reverse.

**2. Synthetic media carries disclosure obligations.**
Platforms and regulators increasingly require disclosure of realistic synthetic content, synthetic voices, and AI-generated likenesses. Disclosure state MUST be tracked as structured data on every asset and every publish action, and MUST be enforced at the publish gate — not applied by hand.

**3. Publishing APIs are quota-constrained, and the quota is per-application, not per-channel.**
Upload operations are typically the most expensive calls in a publishing platform's quota model by a wide margin, and the daily allowance is shared across every tenant served by one application credential. *(Current unit costs and default allowances MUST be verified against live provider documentation before capacity planning — they change.)* The practical consequence is permanent and architectural: **publishing capacity is a scarce, shared, centrally-accounted resource.** The platform MUST model publish quota explicitly, schedule against it, degrade gracefully when exhausted, and support horizontal expansion of publishing credentials. A design that assumes "upload whenever ready" will fail at the second tenant.

**4. Third-party rights are enforced automatically and retroactively.**
Music, footage, likeness, and voice rights are matched algorithmically after upload. Provenance and licensing MUST be recorded per asset at creation time, because reconstructing it after a claim is impossible.

**5. Model providers change underneath us.**
Models are deprecated, repriced, rate-limited, and behaviorally revised without our consent. Every provider dependency MUST be treated as a volatile external service behind an adapter (§14).

## 1.6 What success looks like

- A new agent can be specified, built, evaluated, and shipped without modifying any core component.
- A new AI provider can be adopted with zero changes to business logic.
- Any published video can be traced end-to-end to its inputs, decisions, costs, and approvals.
- A channel's measured performance demonstrably improves the next cycle's strategy.
- The marginal cost and marginal human effort of an additional channel both approach zero, while quality per video does not decline.

---

# 2. Engineering Principles

Each principle below is stated, justified, and made enforceable. A principle that cannot be checked is a slogan; every principle here has an explicit failure test.

## 2.1 Single Responsibility

**Statement.** Every component — agent, validator, workflow node, module, prompt — has exactly one reason to change.

**Why.** In AI systems, responsibility creep is uniquely destructive. An agent asked to both write a script and optimize SEO produces output where neither concern can be evaluated, improved, or replaced independently. Quality becomes unattributable: when results degrade, you cannot tell which half regressed. Narrow agents also produce measurably better output, because a focused instruction set leaves less room for the model to trade one objective against another silently.

**Forbidden.** Agents with "and" in their purpose statement. Validators that also transform. Prompts that serve two agents.

**Test.** State the component's purpose in one sentence with no conjunctions. If you cannot, split it.

## 2.2 Separation of Concerns

**Statement.** Distinct categories of logic live in distinct layers: domain rules, orchestration, AI invocation, provider integration, storage, transport, and presentation.

**Why.** The layer boundaries are the seams along which the system can be changed safely. Business rules mixed into provider calls means changing providers changes business rules. Orchestration mixed into agents means the execution graph becomes invisible and untestable.

**Forbidden.** Domain logic that references a model name, a provider, a queue, or a storage location. Provider adapters that make product decisions.

**Test.** Search the domain layer for any provider, model, or vendor identifier. Zero hits is the only acceptable result.

## 2.3 Modular Design

**Statement.** The system is composed of independently specified, independently versioned, independently testable modules with declared contracts.

**Why.** Modularity is what makes a 20+ agent system tractable and what makes a marketplace possible. It converts system complexity from multiplicative into additive: adding the twenty-first agent must cost roughly what adding the third one did.

**Forbidden.** Reaching into another module's internals. Shared mutable state. "Temporary" cross-module shortcuts.

**Test.** Each module can be described, versioned, and evaluated without reference to the internals of any other module.

## 2.4 Loose Coupling

**Statement.** Components depend on contracts and abstractions, never on each other's implementations. Agents MUST NOT invoke other agents.

**Why.** Agent-to-agent invocation is the single most damaging pattern available in this architecture. It creates hidden call graphs, unbounded and unpredictable cost, untraceable failures, recursive loops, and orchestration logic scattered across prompts where it cannot be versioned, tested, or reasoned about. Composition is the workflow engine's job — and only the workflow engine's job. Held to strictly, this one rule keeps the entire execution graph declarative, inspectable, replayable, and costable in advance.

**Forbidden.** Agent A calling agent B. Agents deciding what runs next. Agents writing to storage that another agent reads outside a declared contract.

**Test.** Every execution edge in the system appears in a declarative workflow definition. There are no edges anywhere else.

## 2.5 High Cohesion

**Statement.** Everything belonging to one capability lives together: an agent's specification, schemas, prompts, validators, evaluation set, and documentation are one unit.

**Why.** Cohesion is what makes a component genuinely replaceable and genuinely publishable. If an agent's prompts live in one place, its schemas in another, and its tests in a third, the agent is not a unit — it is a diffuse set of coupled edits, and no one can safely delete or replace it.

**Forbidden.** Shared prompt fragments across agents. Schemas owned by no one. Agents without their own evaluation set.

**Test.** Removing an agent removes exactly one cohesive set of artifacts and breaks nothing except workflows that explicitly declared a dependency on it.

## 2.6 Configuration over Hardcoding

**Statement.** Any value that varies by environment, tenant, channel, locale, brand, niche, provider, or time MUST be configuration or data. Only genuinely universal invariants may be fixed in code.

**Why.** This is the difference between a platform and a script. Every hardcoded value is a future fork of the codebase. The platform must serve thousands of channels with divergent strategies, languages, and brands — that is impossible if any of those dimensions is baked in.

**Layering.** Configuration resolves in a strict, documented precedence order (broadly: platform defaults → environment → tenant → channel → workflow → run override), and the effective resolved value MUST be recorded with each run so behavior is explainable after the fact.

**Forbidden.** Model names, thresholds, tone descriptions, durations, language assumptions, brand attributes, or prompt text embedded in logic.

**Test.** Onboarding a new channel in a new language for a new brand requires zero code changes.

## 2.7 Deterministic AI Outputs

**Statement.** Language models are stochastic; the *system* MUST NOT be. Every AI invocation produces output that is schema-constrained, validated, bounded, and reproducible in its record.

**Why.** Determinism here does not mean identical tokens on every run — that is not achievable and not required. It means: **the shape, the bounds, the validity, and the traceability of every output are guaranteed regardless of what the model does.** Downstream components must never need defensive parsing, never guess at structure, and never handle a surprise. Non-determinism is confined to the *content* of declared fields, never to their existence, type, or range.

**Mechanisms.** Closed schemas; structured/constrained output where the provider supports it; validate-then-repair with a bounded budget; temperature policy by task class (§4.5); full recording of prompt version, model, parameters, and seed for replay.

**Forbidden.** Consuming model output without validation. Free-text fields where a closed enumeration is possible. "Usually it returns the right shape."

**Test.** Every downstream consumer can be written as if the input were a hand-written, schema-guaranteed document — because it is.

## 2.8 Human Review Support

**Statement.** Human review is a designed, first-class capability at every stage, not an escape hatch bolted on for emergencies.

**Why.** Some decisions are genuinely not delegable: channel strategy, policy risk, brand voice, factual claims about real people, and the act of publishing. A system that can only be fully automatic is unusable for exactly the accounts that matter most. Equally, review must be *cheap* — a reviewer who must reconstruct context to make a decision will rubber-stamp, which is worse than no review.

**Requirements.** Any workflow step MUST be markable as requiring approval, by policy or by configuration. A paused run MUST be able to wait indefinitely without consuming resources or degrading. Every approval request MUST carry sufficient context to decide without investigation. Every decision MUST record actor, timestamp, rationale, and the exact artifact version approved. Rejection MUST be able to route back into the pipeline as structured, actionable feedback.

**Forbidden.** Approval as a boolean with no context. Approvals that expire silently. Human decisions that are not auditable.

**Test.** A reviewer can approve or reject correctly in under a minute, from the request alone.

## 2.9 Scalability

**Statement.** The system scales horizontally on every axis that grows: tenants, channels, concurrent runs, media processing, and publishing.

**Why.** The workload is inherently bursty, long-running, heterogeneous in resource profile (a token-bound AI call and a CPU-bound render have nothing in common), and bounded by external rate limits rather than by our own compute. Designs that ignore this saturate on the wrong resource and fail unpredictably.

**Requirements.** Stateless execution units. Work distributed via durable queues, segregated by resource class. Concurrency governed by external provider limits, not by local optimism. No global singletons. No unbounded fan-out. Every tenant's load isolated from every other tenant's.

**Forbidden.** In-process state that survives a request. Local filesystem as a system of record. Unbounded parallelism derived from model output.

**Test.** Doubling worker count roughly doubles throughput until an external limit binds — and that limit is explicitly modeled and observable.

## 2.10 Maintainability

**Statement.** The system is optimized for the engineer who arrives in year three with no context.

**Why.** This platform will outlive its original authors, its original models, and probably its original providers. Cleverness that saves an hour today and costs a week of comprehension later is a net loss, and the loss compounds across 20+ agents.

**Requirements.** Uniform structure across all agents — same specification template, same contract shape, same error model, same logging fields, same evaluation approach. Explicit over implicit. Documented decisions (ADRs) for anything non-obvious. Deprecation with migration paths, never silent removal.

**Forbidden.** One-off patterns. Undocumented decisions. Agents that are structurally unlike every other agent.

**Test.** Having read one agent's specification, an engineer can navigate any other agent's specification without assistance.

## 2.11 Idempotency and Replayability

**Statement.** Every operation is safe to execute more than once. Every execution is reconstructible from its record.

**Why.** In a distributed, retrying, long-running system, duplicate execution is not an edge case — it is a certainty. Without idempotency, retries produce double charges, duplicate uploads, and corrupted state. Without replayability, no failure can be diagnosed and no regression can be attributed to a change, because the exact conditions no longer exist.

**Requirements.** Side-effecting operations carry idempotency keys. Repeating an operation with the same key returns the original result rather than performing it again. Every AI invocation is recorded in sufficient detail to be reconstructed exactly.

**Forbidden.** Publish, upload, spend, or notify operations without idempotency protection.

**Test.** Replay any completed run's records and reproduce its full decision trail.

## 2.12 Observability by Default

**Statement.** Instrumentation is part of a component's definition, not an addition to it.

**Why.** In a pipeline where the expensive, variable, failure-prone steps are opaque model calls, un-instrumented execution is unmanageable — cost, latency, and quality are all invisible until they are catastrophic. Observability added retroactively is always incomplete, because it is added where someone already suspects a problem.

**Requirements.** Every execution emits structured, correlated telemetry (§9). Every AI call records tokens, cost, latency, versions, and outcome. Domain-level metrics — cost per finished video, validation failure rate per prompt version, approval turnaround, publish success rate — are as important as system metrics.

**Forbidden.** Components that can fail silently. AI calls without cost accounting.

**Test.** Any production question about a run can be answered from telemetry without adding instrumentation.

## 2.13 Fail Loud, Fail Safe

**Statement.** Errors surface immediately and explicitly. Failures leave the system in a safe, recoverable state and never produce a silently-degraded result.

**Why.** A partially-hallucinated script that flows through the pipeline is far more expensive than a hard failure at the point of detection — it consumes render time, publishing quota, audience trust, and possibly channel standing. The cost of a false negative in content quality is asymmetrically higher than the cost of a stopped run.

**Requirements.** Never substitute a default for a failed generation. Never proceed past a failed validation. Never truncate to fit. Unknown states are errors, not warnings. Policy, compliance, and publish gates fail **closed**.

**Forbidden.** Swallowed exceptions. Silent fallbacks. "Best effort" behavior on content correctness.

**Test.** Every failure path terminates in either a recorded error, a human escalation, or a compensating action — never in a quietly degraded artifact.

## 2.14 Cost as a First-Class Requirement

**Statement.** Cost is a functional requirement with declared budgets and hard enforcement, equal in standing to latency and correctness.

**Why.** Unlike traditional software, per-execution marginal cost here is significant, variable, and can be driven to unbounded levels by a single misbehaving loop or an oversized input. Cost overruns in AI systems are not gradual; they are sudden. A budget that is monitored but not enforced is not a budget.

**Requirements.** Every agent declares expected and maximum cost per invocation. Every workflow declares a ceiling. Every tenant has enforced limits. Exceeding a ceiling halts the run and escalates; it never silently continues.

**Forbidden.** Unbounded loops with AI calls inside. Unmetered invocation. Cost discovered only on the monthly invoice.

**Test.** The cost of a finished video is predictable within a declared band before the run starts, and enforced during it.

## 2.15 Security and Least Privilege

**Statement.** Every component receives the minimum capability required, for the minimum time. All external content is untrusted.

**Why.** This system ingests untrusted text from the open internet (research, competitor metadata, comments, transcripts) and feeds it into models that also hold the ability to spend money and publish to the public internet. That combination is the defining security risk of the architecture (§10.5), and it can only be contained structurally — not by prompt wording.

**Requirements.** Capability-scoped execution. Components that read untrusted content MUST NOT hold publishing or spending authority. Secrets never reach a model. Tenant isolation is a security boundary.

**Forbidden.** Broadly-privileged components. Model output driving privileged action without a deterministic policy check.

**Test.** Trace any untrusted input to the set of capabilities reachable from it. That set must be minimal and must exclude publish and spend.

## 2.16 Backward Compatibility

**Statement.** Contracts are promises. Breaking changes are versioned, announced, migrated, and never silent.

**Why.** With 20+ agents, in-flight long-running workflows, and eventually third-party publishers, an unannounced contract change does not break one caller — it breaks an unknown set of callers at an unknown time, including runs that started days ago under the old contract.

**Requirements.** Semantic versioning on every contract. Additive changes only within a major version. In-flight runs pinned to the versions they started with. Deprecation windows with migration guidance. Prior major version supported until the announced end date.

**Forbidden.** Changing a field's meaning. Removing or narrowing a field within a major version. Retroactively tightening validation on stored artifacts.

**Test.** A consumer written against version *N* keeps working, unmodified, for the entire published support window.

---

# 3. AI Agent Design Standards

## 3.1 Definition

An **agent** is a versioned, single-purpose, stateless unit of work that transforms a validated structured input into a validated structured output, using one or more model invocations, under a declared contract.

An agent is *not*: a conversation, a service, an orchestrator, a workflow, a prompt, or a place to put logic that has nowhere else to go.

Everything an agent is composed of — manifest, input schema, output schema, prompts, validators, evaluation set, documentation — MUST be versioned and shipped together as one cohesive unit (§2.5).

## 3.2 One responsibility only

- An agent MUST have exactly one purpose, expressible in a single sentence with no conjunction.
- An agent MUST NOT perform work outside its declared responsibility even when it trivially could. A scriptwriting agent that "helpfully" also emits SEO tags is a defect, not a bonus: the output cannot be evaluated, the responsibility becomes ambiguous, and the SEO agent's contribution becomes unmeasurable.
- Every agent specification MUST include an explicit **Non-Responsibilities** section naming the adjacent things it does not do. Explicit exclusions are more valuable than inclusions — they are what stops scope creep at review time and what stops the model from over-reaching at run time.
- Where responsibility is ambiguous between two agents, the specification MUST state the boundary rule and both specifications MUST reference it.

**Rationale.** Narrow agents produce better output, are individually improvable, are individually measurable, and are individually replaceable — including by a third-party implementation. Broad agents are none of these.

## 3.3 Stateless execution

- An agent MUST NOT retain any state between invocations. Two invocations with identical inputs MUST be indistinguishable in behavior regardless of invocation order or history.
- All context an agent needs MUST arrive through its declared inputs. There is no ambient context.
- "Memory" — prior videos, channel history, past performance, established style — is legitimate and often essential, but it MUST be passed as an explicit, schema-declared input assembled by the workflow, never held inside the agent.
- An agent MUST NOT read or write shared storage outside its declared contract.

**Rationale.** Statelessness is what makes agents horizontally scalable, individually testable, safely retryable, and reproducible. It also makes memory *auditable*: when memory is an explicit input, you can see exactly what influenced a decision. Hidden memory makes every output unexplainable.

## 3.4 Predictable outputs

- Output MUST conform to a closed, versioned schema. Unknown properties MUST be rejected, not ignored.
- Output MUST be complete: every required field present, every enumeration drawn from the declared set, every bound respected.
- Where a value is genuinely unknown, the agent MUST use the schema's declared mechanism for absence — an explicit `UNKNOWN` enumeration member, an explicit null on an optional field, or an empty array. It MUST NOT invent, approximate, or omit.
- Output length, list cardinality, and string lengths MUST be bounded by the schema.
- Agents whose task is classification, extraction, or judgment MUST be deterministic in parameters (§4.5) and SHOULD be reproducible run-to-run.

## 3.5 JSON communication

- All agent inputs and outputs MUST be JSON conforming to §5.
- Agents MUST NOT accept or emit free-form prose as a primary contract. Prose is permitted only inside a field explicitly declared to contain prose (for example, a script body), and the containing document is still structured.
- Agents MUST NOT emit markdown, code fences, preamble, commentary, apology, or any framing text around their payload.

## 3.6 No hidden assumptions

- An agent MUST NOT infer, substitute, or fabricate a missing input. Missing required input is an error, returned as an error (§8) — never quietly defaulted.
- An agent MUST NOT apply undocumented domain assumptions. If a rule matters ("titles under 60 characters," "hooks in the first 8 seconds"), it MUST be an explicit input, a configured value, or a documented constraint in the agent's specification — never tacit knowledge embedded in a prompt.
- An agent MUST NOT depend on the behavior of the agent that ran before it beyond that agent's declared output contract.
- Every assumption an agent makes MUST be discoverable by reading its specification alone.

**Rationale.** Hidden assumptions are the primary cause of unexplainable behavior in multi-agent systems: output changes and nobody can say why, because the reason was never written down. They also block localization and multi-brand support, since tacit assumptions are almost always English-language and single-brand.

## 3.7 No conversational output

- No greetings, sign-offs, self-reference, hedging, meta-commentary, or explanation of what the agent is about to do.
- No "As an AI…", "Here's the JSON you requested", "I hope this helps", or restatement of the request.
- No visible chain-of-thought in the payload (§4.6).
- The output is a document, not a reply. The consumer is a machine, and every token of conversational framing is a parsing risk and a wasted cost.

## 3.8 Versioning

Every agent carries three independent version numbers, and all three MUST be recorded on every invocation:

| Version | Governs | Changes when |
|---|---|---|
| **Agent version** (semver) | The agent as a whole | Any change to behavior, prompts, validators, or contracts |
| **Contract version** (semver, per schema) | Input and output schemas | The data contract changes |
| **Prompt version** (immutable, content-addressed) | Exact prompt content | Any character of any prompt changes |

Rules:

- Agent MAJOR MUST increment on any breaking contract change or material behavioral change that could invalidate downstream expectations.
- Agent MINOR increments for additive capability; PATCH for non-behavioral fixes.
- Prompt versions MUST be immutable and content-addressed. An existing prompt version MUST NEVER be edited in place — editing a released prompt destroys the ability to attribute any historical result.
- Running workflows MUST be pinned to the agent versions active at run start. A deploy mid-run MUST NOT change a run's behavior.
- Multiple agent major versions MUST be able to coexist in production simultaneously.
- Tenants MUST be able to pin an agent version for stability, and the platform MUST support staged rollout across tenants.

## 3.9 Prompt ownership

- Every prompt MUST be owned by exactly one agent. There are no shared, global, or library prompts.
- Common guidance MAY be expressed as a reusable, versioned *fragment* that is composed into an agent's prompt at build time and resolved into an immutable, fully-expanded prompt version. The resolved prompt is what is recorded and what is versioned — never an unresolved template with runtime-variable includes.
- Changing a shared fragment MUST produce a new prompt version for every agent that composes it, and MUST re-run each affected agent's evaluation set before release.

**Rationale.** Shared, live-resolved prompts create invisible coupling: a wording change intended for one agent silently alters five others, and the evaluation runs on none of them.

## 3.10 Retry compatibility

Every agent MUST be safe to retry. Specifically:

- Invocation MUST be free of side effects. Agents that must cause external effects MUST express them as *declared output* for the workflow to execute — never perform them directly.
- An agent MUST tolerate being invoked repeatedly with identical input.
- An agent MUST support a **repair invocation**: the same input plus a structured description of what was wrong with the previous attempt, producing a corrected output. Repair prompts MUST receive the specific validation errors, not the entire prior conversation (§7.4).
- Failures MUST be classified (§8) so the runtime can distinguish "retry as-is," "repair," "escalate," and "abort."

## 3.11 Agent classification

Every agent MUST declare exactly one class. Class determines default parameters, validation strategy, and evaluation method.

| Class | Purpose | Parameter posture | Primary evaluation |
|---|---|---|---|
| **Extractor** | Pull structured facts from provided source material | Fully deterministic | Exact match against a golden set |
| **Transformer** | Restructure or reformat existing content without adding meaning | Fully deterministic | Structural equivalence, information preservation |
| **Generator** | Produce new creative content | Bounded variability | Rubric scoring + human sampling |
| **Critic** | Assess an artifact and return actionable, structured findings | Deterministic | Agreement with expert-labeled findings |
| **Judge** | Score an artifact against a fixed rubric | Fully deterministic | Correlation with human scores; calibration |
| **Planner** | Produce a structured plan from goals and constraints | Low variability | Constraint satisfaction, feasibility |
| **Router** | Select among declared options | Fully deterministic | Accuracy against labeled decisions |

Notes: Judges MUST NOT judge their own output or the output of the same prompt version that produced it. Critics MUST return structured findings with severity and location, never prose review.

## 3.12 Agent manifest

Every agent MUST publish a manifest declaring at minimum: identity and version; class; one-sentence purpose; non-responsibilities; input and output schema references with versions; prompt version references; required capabilities (structured output, tool use, long context, vision, reasoning depth); required permissions (network egress allowlist, storage scope, tool access) — deny by default; declared cost and latency budgets (expected and maximum); determinism posture; evaluation set reference and current pass rate; owner; stability level (experimental / stable / deprecated); and deprecation date where applicable.

**Rationale.** The manifest is what makes an agent installable, governable, budgetable, and eventually publishable to a marketplace. An agent without a complete manifest cannot be safely operated by anyone who did not write it.

## 3.13 Evaluation requirement

- No agent MAY reach production without an evaluation set: representative inputs with expected outputs or rubric-scored references, including adversarial and degenerate cases (empty, maximal, contradictory, non-English, prompt-injection-bearing inputs).
- Every prompt or model change MUST be evaluated against that set before release, and results MUST be recorded with the version.
- A change that reduces the pass rate MUST NOT ship without an explicit, recorded waiver.
- Evaluation sets are versioned artifacts owned by the agent, and MUST grow: every production defect MUST add a case.

## 3.14 Deprecation

- Agents MUST be deprecable without deleting history: the version remains resolvable for replay and audit indefinitely.
- Deprecation MUST declare a replacement (or explicitly state there is none), a migration path, and an end-of-support date.
- Workflows referencing a deprecated agent MUST surface a warning at validation time and MUST fail validation after the end-of-support date.

---

# 4. Prompt Engineering Standards

Prompts are **production source artifacts under change control** — as consequential as any other component and considerably more fragile. They are reviewed, versioned, evaluated, released, and rolled back with the same rigor as anything else in the system.

## 4.1 Required structure

Every prompt MUST be composed of these blocks, in this order. Ordering is part of the standard: consistent placement reduces instruction-following variance across models and makes prompts diffable and reviewable at a glance.

1. **Role** — who the model is acting as, stated concisely and specifically. One or two sentences.
2. **Objective** — the single task, stated once, unambiguously.
3. **Input contract** — what the model will receive, with each field named and described.
4. **Rules and constraints** — the enumerated, testable rules governing the output.
5. **Output contract** — the exact required output structure and the instruction to emit that and nothing else.
6. **Refusal and unknown policy** — what to do when the request is unsupported, inputs are insufficient, or a value cannot be determined.
7. **Examples** — where the few-shot policy (§4.8) calls for them.
8. **Input data** — the runtime payload, last, clearly delimited and explicitly labeled as data.

Additional rules:

- Instructions MUST precede data. Data MUST be last and MUST be delimited.
- Each rule MUST be atomic and individually verifiable. Compound rules cannot be evaluated or diagnosed.
- Rules MUST be stated positively where possible ("Use plain declarative sentences") rather than only negatively ("Don't be flowery"), because prohibitions without a stated alternative leave the model to invent one.
- A prompt MUST NOT contain contradictory instructions. Contradiction resolution is unspecified behavior and varies by model and by run.
- Prompts MUST NOT contain secrets, credentials, internal hostnames, tenant identifiers beyond what the task requires, or PII beyond what the task requires (§10.3).

## 4.2 Variables

- Every variable MUST be declared with a name, type, whether it is required, its constraints, and an example.
- Variable substitution MUST be strict: an undeclared or unresolved variable is a hard failure before invocation, never an empty string. Silent empty substitution is a leading cause of quietly-degraded output — the model receives a prompt with a missing constraint and produces plausible-looking, unconstrained work.
- Variables MUST be typed and validated before rendering, using the same validation standard as any other contract (§6).
- Variable content MUST be escaped or delimited such that it cannot terminate its block or be read as instruction (§10.5).
- Variables carrying untrusted content MUST be explicitly marked as untrusted in their declaration, and the prompt MUST state that the delimited block is data only and contains no instructions.
- Optional variables MUST render as a well-defined absence (an explicit "not provided" marker or full omission of the enclosing block) — never as a dangling label with nothing after it.
- Prompts SHOULD keep the variable-free prefix stable and place variable content late, so that provider-side prompt caching can apply (§11.3).

## 4.3 Constraints

- Constraints MUST be enumerated as a list, not buried in narrative.
- Every constraint expressible in the output schema MUST be in the schema *as well as* the prompt. The schema is the enforcement mechanism; the prompt improves first-pass compliance. Neither is sufficient alone.
- Numeric constraints MUST be explicit and absolute ("between 40 and 60 characters"), never relative or vague ("short", "concise").
- Constraints MUST be consistent with the schema. A prompt asking for up to 10 items against a schema permitting 5 guarantees repair loops and wasted cost.
- Where a constraint is conditional, the condition MUST be stated explicitly and exhaustively.

## 4.4 System versus user prompts

| Block | Belongs in |
|---|---|
| Role, objective, rules, output contract, refusal policy, examples | **System** |
| Runtime input data, task-specific parameters, retrieved context | **User** |

Rules:

- Behavioral rules MUST be in the system layer. Rules that arrive in the user layer are, structurally, harder to defend against injected content in that same layer.
- The system layer MUST be stable across invocations of the same prompt version. Stability is required for cache efficiency (§11.3) and for attributing behavior to a version.
- Untrusted external content MUST NEVER be placed in the system layer.
- Where a provider handles system instructions differently, normalization is the provider adapter's responsibility (§14) — prompts MUST NOT be authored per-provider.

## 4.5 Temperature and parameter policy

Parameters are set by agent class (§3.11), declared in the prompt version, and recorded on every call. They MUST NOT be tuned ad hoc at call sites.

| Agent class | Temperature | Rationale |
|---|---|---|
| Extractor, Router, Judge | 0 | Any variance is error. These tasks have correct answers. |
| Transformer, Critic | 0 – 0.2 | Structure and findings must be stable; near-zero variance only. |
| Planner | 0.2 – 0.4 | Mild variation aids plan quality; the plan must remain constraint-satisfying. |
| Generator | 0.6 – 0.9 | Creative diversity is the point; the schema holds the bounds. |

Additional rules:

- The declared range MUST appear in the agent specification and MUST NOT be exceeded at runtime.
- Sampling parameters MUST be normalized across providers by the adapter layer and recorded in provider-neutral terms (§14).
- Where a provider supports seeding, a seed MUST be set and recorded for all deterministic classes.
- Repair invocations (§7.4) MUST use the same or lower temperature than the original attempt — raising temperature on a failed structured output increases failure probability.
- Increasing temperature MUST NOT be used as a remedy for weak prompts or as a substitute for diversity achieved through varied inputs.

## 4.6 Chain-of-thought policy

- Reasoning MUST NEVER appear in the output payload. Payload fields carry conclusions.
- Where a task genuinely benefits from explicit reasoning, the prompt MUST direct that reasoning into either (a) a dedicated, schema-declared field that downstream consumers ignore by contract, or (b) the provider's separate reasoning channel where one exists.
- Reasoning content MUST NOT be treated as fact, MUST NOT be shown to end users, and MUST NOT be used as grounding by any downstream agent. Stated reasoning is a post-hoc narrative, not a reliable account of how the answer was produced.
- Reasoning fields, where retained, MUST be recorded for debugging and MUST be excluded from any hash used for output caching or comparison.
- Prompts MUST NOT instruct the model to "think step by step" and then also demand pure JSON output without a designated place for that thinking — that is a contradiction (§4.1) and a common source of malformed output.
- Reasoning depth costs tokens and latency. Its use MUST be justified against the agent's declared budget (§11.2).

## 4.7 Hallucination prevention

Hallucination is not eliminable by prompt wording alone. It is contained by *contract design* and *verification*. Prompt-level measures are the first layer, not the only one.

Required measures:

- **Ground or abstain.** Where an agent makes factual claims, the prompt MUST require that claims derive from supplied source material, and MUST require an explicit non-answer where sources are insufficient.
- **Absence over invention.** Prompts MUST explicitly instruct: never infer, estimate, approximate, or fill a missing value. Use the declared unknown mechanism (§3.4). This instruction MUST appear in every prompt without exception.
- **No fabricated specifics.** Statistics, dates, monetary figures, quotations, named individuals, study citations, and product claims MUST NOT be produced unless present in the supplied input. Prompts MUST state this explicitly, because these are exactly the categories models fabricate most fluently and most convincingly.
- **Attribution.** Factual agents MUST return a source reference per claim, and validation MUST verify that each reference exists in the supplied input.
- **Closed vocabularies.** Any decision with a known option set MUST be an enumeration. A free-text field where an enum would serve is an invitation to invent.
- **Confidence.** Where a judgment is uncertain, the agent MUST return a calibrated confidence value with a documented meaning (§6.5), and downstream routing MUST act on it.
- **Verification.** Claims that matter MUST be independently checked by a separate validation stage (§6.3) — never by the same prompt that produced them, and never by the same model instance.

## 4.8 Few-shot policy

- Examples MUST be used where output structure is complex, where a subtle stylistic quality must be conveyed, or where evaluation shows a measurable improvement. They MUST NOT be added reflexively — they consume tokens on every call and narrow output diversity.
- 2–5 examples SHOULD be sufficient. More than 5 requires justification against measured benefit.
- Every example MUST validate against the current output schema. A schema-invalid example teaches the model to produce invalid output and is a severe defect.
- Examples MUST be diverse across the realistic input space and MUST include at least one boundary case. Homogeneous examples cause the model to reproduce their surface features rather than their structure.
- Examples MUST NOT contain real PII, real credentials, real tenant data, or content that could be echoed verbatim into production output.
- Where the risk is a specific recurring failure, a **negative example** MAY be included, clearly labeled as incorrect, together with the corrected form. Negative examples MUST NOT be shown without the correction.
- Examples are part of the prompt and are covered by prompt versioning. Changing an example changes the prompt version.
- Examples MUST be re-validated whenever the output schema changes.

## 4.9 Prompt versioning and release

- Prompt versions MUST be immutable and content-addressed. Any change produces a new version.
- Every prompt version MUST record: content hash, semantic version, author, date, change rationale, model parameters, target schema version, evaluation results, and status (draft / candidate / champion / deprecated).
- Every AI invocation MUST record the exact prompt version used. Without this, no regression can ever be attributed and no A/B result is meaningful.
- Prompt changes MUST pass the agent's evaluation set before promotion (§3.13).
- Promotion SHOULD use champion/challenger: the incumbent serves the majority of traffic while the candidate serves a measured share, with promotion decided on evaluation results and production quality metrics.
- Rollback to any prior version MUST be possible without a code deployment.
- Tenants MUST be able to pin a prompt version.
- Prompts MUST be reviewed by a second person before promotion, against the checklist in §13.3.

## 4.10 Localization

- Prompts MUST NOT assume English input or English output. Target locale MUST be an explicit variable.
- Locale-specific instruction and examples MUST be maintained as locale variants of a prompt version, not as runtime string interpolation into an English template.
- Locale-dependent constraints (character limits differ substantially between scripts; a 60-character limit is a different constraint in Japanese than in German) MUST be declared per locale, never globally.
- Every locale variant MUST have its own evaluation set. A prompt that passes in English is unevaluated in every other language.

---

# 5. JSON Communication Standards

JSON is the sole interchange format between all components: agents, workflow nodes, validators, and stored artifacts. These rules are non-negotiable and apply everywhere.

## 5.1 Required formatting

- All payloads MUST be valid JSON, UTF-8 encoded, without a byte-order mark.
- Payloads MUST NOT be wrapped in markdown fences, prose, or any framing.
- Objects MUST declare closed schemas: unknown properties are rejected, never ignored. Silently ignoring unknown properties hides contract drift until it causes a production defect.
- Payloads MUST NOT rely on key ordering for meaning.
- Arrays MUST have a documented ordering semantic — either meaningful (and stated) or explicitly unordered.
- Payloads MUST have declared maximum sizes. Unbounded payloads are a cost, memory, and availability risk.

## 5.2 Naming conventions

| Element | Convention | Example |
|---|---|---|
| Object keys | `camelCase` | `channelId`, `targetDurationMs` |
| Enumeration values | `SCREAMING_SNAKE_CASE` | `LONG_FORM`, `PENDING_APPROVAL`, `UNKNOWN` |
| Error and event codes | `SCREAMING_SNAKE_CASE`, dot-namespaced | `VALIDATION.SCHEMA.REQUIRED_FIELD_MISSING` |
| Type-prefixed identifiers | lowercase prefix, underscore, ULID | `chn_01J8Z3K…` |
| Schema identifiers | `kebab-case` with major version | `strategy-agent-output/v1` |

Rules:

- One convention platform-wide. Mixed conventions require mapping layers, and mapping layers are where fields get lost.
- Keys MUST be descriptive and MUST NOT be abbreviated beyond universally understood forms (`id`, `url`, `ms`). Models produce more accurate output against self-describing key names, and so do humans.
- Keys carrying units MUST name the unit as a suffix: `durationMs`, `costMicroUsd`, `widthPx`. Unit ambiguity is a recurring source of severe defects in media pipelines.
- Boolean keys MUST read as assertions: `isPublished`, `requiresApproval`. Negated booleans (`isNotReady`) are forbidden — double negation in conditions is a defect generator.
- Enumeration values MUST be stable identifiers, never display text. Display text is a presentation concern and is locale-dependent.

## 5.3 Envelope structure

Every message exchanged between components MUST use a standard envelope separating metadata from payload.

```
{
  "schemaVersion": "1.2.0",
  "meta": {
    "messageId":     "msg_01J8Z…",
    "correlationId": "run_01J8Z…",
    "tenantId":      "ten_01J8Z…",
    "channelId":     "chn_01J8Z…",
    "producer":      { "name": "strategy-agent", "version": "2.1.0" },
    "createdAt":     "2026-08-09T14:32:11.482Z",
    "locale":        "en-US"
  },
  "status": "SUCCESS",
  "data":   { },
  "issues": [ ]
}
```

*(Contract illustration only — not an implementation.)*

**Required in every envelope:** `schemaVersion`, `meta.messageId`, `meta.correlationId`, `meta.createdAt`, `meta.producer`, `status`, and exactly one of `data` (on success) or `issues` (on failure).

**`status`** MUST be one of `SUCCESS`, `PARTIAL`, `FAILURE`. `PARTIAL` MUST NOT be used for content-producing agents — partial content is a failure (§2.13). It exists for batch operations where per-item outcomes differ.

**`issues`** carries zero or more error objects (§8.1) on failure, and MAY carry non-blocking warnings alongside `data` on success.

**Rationale.** A uniform envelope means every consumer, logger, validator, retry handler, and audit trail is written once rather than per message type. It also guarantees that correlation and provenance are never optional.

## 5.4 Required versus optional fields

- Required fields MUST always be present. "Present but empty" is not presence.
- Optional fields MUST be omitted entirely when absent. They MUST NOT be present as `null` to signal absence.
- `null` MUST only appear where the schema declares null as a meaningful value distinct from absence, and the schema MUST document what it means.
- Empty string MUST NEVER signal absence. `""` means "a string that is empty," which is almost always a defect.
- Arrays MUST NEVER be `null`. An empty array is the empty case.
- Optionality MUST be declared in the schema, not inferred from observed data.

**Rationale.** Absent / null / empty ambiguity is one of the most persistent defect sources in data pipelines, and models produce all three interchangeably unless the schema forbids it. One unambiguous rule eliminates the entire class.

## 5.5 Schema versioning

- Every schema MUST carry a semantic version, and every payload MUST declare the version it conforms to.
- **MAJOR** — a breaking change: removing a field, making an optional field required, narrowing a type or range, removing or repurposing an enumeration value, changing a field's meaning.
- **MINOR** — additive and backward compatible: adding an optional field, adding an enumeration value *where consumers are documented to tolerate unknown members*.
- **PATCH** — documentation and description only; no structural change.
- Adding an enumeration value is breaking for any consumer that exhaustively matches. Every enumeration MUST document whether it is **closed** (additions are MAJOR) or **open** (consumers MUST handle unknown members via a declared fallback). Default is closed.
- Multiple major versions MUST be able to coexist. In-flight runs MUST be pinned to the versions they started with (§2.16).
- Stored artifacts MUST retain the schema version they were written under. Validation of historical data MUST use that version, never the current one.
- Schemas are registry artifacts with an owner, a changelog, and a deprecation policy.

## 5.6 Metadata requirements

The `meta` block is mandatory on every message and MUST carry, at minimum: `messageId` (unique per message), `correlationId` (constant for the whole run), `createdAt`, and `producer` (name and version). Where applicable it MUST also carry `tenantId`, `channelId`, `runId`, `nodeId`, `attempt`, and `locale`.

For AI-produced messages, `meta` MUST additionally carry the provenance required for replay: agent name and version, prompt version, resolved model identifier, provider, normalized parameters, token counts, cost, and latency. Provenance is not optional and MUST NOT be stripped from stored artifacts.

`meta` MUST NOT carry business data. If a consumer needs it to make a decision, it belongs in `data`.

## 5.7 Dates and times

- All timestamps MUST be RFC 3339 / ISO 8601 with explicit UTC offset `Z` and millisecond precision: `2026-08-09T14:32:11.482Z`.
- Local time MUST NEVER be transmitted. Where a user-facing local time matters — publish scheduling in an audience's timezone is the canonical case — the payload MUST carry both the UTC instant and a separate IANA timezone identifier (`America/New_York`), never a naive local timestamp. Storing local time without a zone is unrecoverable ambiguity, and DST transitions turn it into a scheduling defect twice a year.
- Calendar dates without a time MUST use `YYYY-MM-DD` and MUST be documented as date-only.
- Durations and media offsets MUST be integer milliseconds in a unit-suffixed field (`durationMs`, `startOffsetMs`). Floating-point seconds MUST NOT be used for media timing — accumulated float error across a scene list produces audio/video drift that is difficult to diagnose and trivial to avoid.
- Human-facing duration strings MUST NOT appear in contracts. Formatting is a presentation concern.

## 5.8 Identifiers and UUID policy

- Every entity MUST have a single, immutable, globally unique primary identifier assigned at creation.
- Identifiers MUST be opaque to consumers. No component may parse meaning out of an identifier.
- **Default: ULID** (or an equivalent lexicographically-sortable, time-ordered 128-bit identifier) for entity identifiers. Time-ordering gives natural creation ordering, better storage locality, and debuggable sortability that random UUIDs do not.
- **UUIDv4** MUST be used wherever unpredictability is a security property — anything externally exposed where enumeration or timing inference would be a risk (share tokens, webhook secrets, public asset references).
- Identifiers SHOULD carry a short type prefix (`chn_`, `run_`, `vid_`, `agt_`) for human debuggability and to make type confusion impossible to miss in logs.
- Identifiers MUST NOT encode tenant, sequence, or business meaning.
- **Correlation identifiers**: `correlationId` is constant for an entire run and propagates to every message, log, trace, and external call. `causationId` (where used) names the message that directly caused this one. Together they reconstruct the full causal graph.
- **Idempotency keys** MUST be deterministic functions of the operation's semantic identity, so that a retry naturally reproduces the same key.
- Content-addressed identifiers (a cryptographic hash of bytes) MUST be used for assets and immutable artifacts, enabling deduplication and integrity verification.
- Identifiers MUST NEVER be reused, even after deletion.

## 5.9 Additional type conventions

| Concept | Standard | Rationale |
|---|---|---|
| Language / locale | BCP 47 (`en-US`, `pt-BR`, `hi-IN`) | Standard, unambiguous, distinguishes regional variants that matter for voice and idiom |
| Country | ISO 3166-1 alpha-2 | Standard, stable |
| Currency | ISO 4217 code, alongside amount | Amounts without currency are meaningless |
| Money | Integer minor units + currency code | Floating-point money is a defect class, not a style choice |
| AI cost | Integer micro-units (`costMicroUsd`) | Per-call costs are small fractions of a cent; integers avoid both float error and premature rounding |
| Percentages / ratios | Decimal `0.0`–`1.0`, key suffixed `Rate` or `Ratio` | One representation; `Percent` keys reintroduce 0–100 confusion |
| Confidence | Decimal `0.0`–`1.0` with documented meaning (§6.5) | Comparable across agents only if the scale and semantics are fixed |
| Media dimensions | Integer pixels, unit-suffixed | Unambiguous |
| Aspect ratio | Explicit enumeration (`RATIO_16_9`, `RATIO_9_16`) | Prevents free-text drift and enables platform capability matching |
| URLs | Absolute, scheme-qualified, `https` only | Relative URLs are context-dependent and break when moved |
| Text fields | Plain text unless the field is explicitly declared as markdown or SSML | Prevents markup leaking into rendered captions and titles |
| Emoji / extended Unicode | Permitted only in fields explicitly declared to allow it (titles, thumbnail text), with a declared normalization form | Emoji matter for click-through but break naive length limits and some renderers |
| String length | Declared minimum and maximum on every string field, counted in a declared unit (Unicode code points unless stated otherwise) | Character counting differs by script; unstated units produce locale-dependent bugs |

---

# 6. Validation Standards

Validation is the mechanism by which a stochastic system produces deterministic guarantees (§2.7). It is layered: each stage catches a distinct class of defect and none is sufficient alone.

## 6.1 Validation stages

Every AI output passes through these stages in order. A failure at any stage stops progression to the next.

| # | Stage | Detects | Nature | On failure |
|---|---|---|---|---|
| 1 | **Structural** | Malformed JSON, missing fields, wrong types, out-of-range values, unknown properties, enum violations | Deterministic | Repair (§7.4) |
| 2 | **Business** | Domain rule violations, cross-field inconsistency, constraint conflicts | Deterministic | Repair, then escalate |
| 3 | **Consistency / grounding** | Contradiction with upstream artifacts; claims not supported by supplied sources | Deterministic where possible | Repair or reject |
| 4 | **Quality (AI)** | Subjective quality below the rubric threshold | Model-based, scored | Regenerate, then escalate |
| 5 | **Policy / compliance** | Platform policy risk, rights issues, disclosure requirements, prohibited claims | Rules + model, **fails closed** | Block, escalate to human |
| 6 | **Human** | Judgment, brand fit, strategic alignment, reputational risk | Human | Approve / reject with structured feedback |

Rules:

- Deterministic stages MUST run before model-based stages. They are faster, cheaper, and free of judgment error; running an expensive judge on structurally invalid output is pure waste.
- Every stage MUST record its result — pass, fail, findings, and duration — as structured data. Validation outcomes are a primary quality dataset: failure rate per agent per prompt version is how prompt regressions are detected.
- Validation MUST NOT silently modify output. Any correction is a recorded repair with before and after retained (§6.8).
- Stages 5 and 6 MUST fail closed: absent a positive result, the artifact does not proceed.

## 6.2 Schema validation

- Every message crossing a component boundary MUST be schema-validated. Trusted-caller exemptions MUST NOT exist; the caller in this system is frequently a language model.
- Validation MUST use the exact schema version the payload declares.
- Closed-schema enforcement is mandatory: unknown properties are errors.
- Validation failures MUST report every violation found, with a machine-readable path to each offending field, its expected constraint, and its actual value. Reporting only the first violation causes serial repair loops, each fixing one problem — a direct multiplier on cost and latency.
- Where the provider supports schema-constrained generation, it MUST be used. Validation is still mandatory afterward: constrained decoding guarantees shape, not semantic validity, and provider implementations are imperfect.

## 6.3 Business validation

Deterministic domain rules that a schema cannot express. Examples of the *category* (specific thresholds are configuration, never code):

- Cross-field coherence — declared segment durations summing to the declared total; scene count matching script section count; every referenced asset existing.
- Strategy conformance — output consistent with the channel's approved strategy (pillars, tone, format, audience).
- Referential integrity — every identifier referenced actually exists and belongs to the same tenant.
- Bounds — values within configured operating ranges for the channel, locale, and target platform.
- Temporal sanity — schedules in the future, sequences monotonic, no overlapping publishes.

Rules:

- Business rules MUST be declarative, individually named, individually testable, and independently versioned.
- Every rule MUST have a stable identifier used in error reporting, so failure rates per rule are measurable.
- Rules MUST be configurable per tenant, channel, and locale where they legitimately vary — and MUST NOT be configurable where they encode platform safety.
- Rules MUST NOT be embedded in prompts as the sole enforcement (§4.3).

## 6.4 AI validation

Model-based validation assesses what deterministic rules cannot: quality, coherence, tone fit, factual grounding, and originality.

- AI validators MUST be separate agents of class Critic or Judge (§3.11), with their own contracts, prompts, versions, and evaluation sets.
- A validator MUST NOT be the same prompt version — and SHOULD NOT be the same model — that produced the artifact. Self-assessment is systematically biased toward approval.
- Judges MUST score against an explicit, versioned rubric with defined criteria and defined levels. "Rate this 1–10" is not a rubric; it is an unauditable opinion that drifts with every model change.
- Judges MUST return structured, per-criterion scores with justification references — never an overall number alone.
- Critics MUST return structured findings: location, severity, rule violated, and a concrete suggested correction. Prose review is unusable by an automated repair loop.
- Judge calibration MUST be measured against human-labeled samples, and correlation MUST be tracked over time. An uncalibrated judge is a random gate.
- AI validators MUST be re-evaluated whenever their model or prompt changes, exactly like any other agent.
- AI validation MUST NOT be the sole gate for anything irreversible. It informs; it does not authorize.

## 6.5 Confidence scoring

- Confidence MUST be a decimal in `[0.0, 1.0]` with a documented meaning per agent — what the number is a confidence *about*, and what evidence produces a high or low value.
- Self-reported model confidence is poorly calibrated and MUST NOT be used as a sole gate. It MAY be used as one signal among several.
- Preferred confidence signals, in order: agreement across independent samples or independent validators; deterministic verification of claims against sources; retrieval-grounding coverage; then self-report.
- Confidence thresholds MUST be configurable per channel and per risk level, and MUST route explicitly: proceed / re-generate / escalate to human / reject.
- Calibration MUST be measured: for outputs reported at a given confidence, what proportion were actually correct? Uncalibrated confidence is worse than none, because it produces false assurance.
- Confidence MUST NEVER be used to justify skipping policy or compliance validation.

## 6.6 Duplicate detection

Content repetition is both a quality failure and a monetization risk (§1.5). Duplicate detection is therefore a required validation stage for content-producing agents, not an optional nicety.

- **Exact** — content hash comparison. Cheap; catches re-runs and caching errors.
- **Normalized** — comparison after case, whitespace, and punctuation normalization. Catches trivial variation.
- **Semantic** — embedding similarity against prior content. Catches the real failure mode: the same video made twenty times with different words.
- Detection MUST run within the channel over a configured historical window, and SHOULD run across the tenant's channels. Cross-tenant comparison MUST NOT expose any tenant's content to another.
- Similarity thresholds MUST be configurable per channel and per content element — near-identical titles are a more serious defect than near-identical intro phrasing.
- Detection MUST cover titles, hooks, topics, thumbnail concepts, and script structure independently. A pipeline can produce novel wording over an identical structure, and structural repetition is what audiences and platform classifiers notice.
- A duplicate finding MUST record what it matched and how strongly, so a human can adjudicate.

## 6.7 Completeness checks

- Every required output element MUST be present and non-degenerate. Present-but-empty, present-but-placeholder, and present-but-truncated MUST be detected and rejected.
- Placeholder detection MUST catch residual template markers, ellipsis continuations, "TODO", "lorem ipsum", "[insert …]", and repeated filler — these appear in model output under token pressure and are the classic silent-corruption failure.
- Truncation MUST be detected explicitly: a response ending for length reasons MUST be treated as a failure, never as a result. This MUST be checked against the provider's stop reason, not inferred from content.
- Collection completeness MUST be verified against declared cardinality — "generate 5 concepts" returning 4 is a failure, not a partial success.
- Cross-artifact completeness MUST be verified at pipeline joins: every script segment has audio; every scene has a visual; every visual has provenance and rights.

## 6.8 Repairs and overrides

- Any automated correction MUST be recorded as a repair event with the original value, the corrected value, the rule that triggered it, and the mechanism used.
- Repairs MUST be bounded (§7.3). Unbounded repair is an unbounded cost loop.
- Deterministic, lossless normalization (whitespace trimming, Unicode normalization) MAY be applied silently but MUST still be recorded.
- Semantic content MUST NEVER be silently modified.
- Human overrides of a failed validation MUST be permitted only where policy allows, MUST require an explicit recorded reason, and MUST NEVER be permitted for policy or compliance failures.

## 6.9 Coverage requirements

- Every agent output schema MUST have structural validation. No exceptions.
- Every agent MUST have at least one business validation rule, or a recorded justification for having none.
- Every content-producing agent MUST have quality validation and duplicate detection.
- Every irreversible action MUST have policy validation and a human gate.
- Every validation rule MUST have at least one passing and one failing test case in the agent's evaluation set.

---

# 7. Retry Standards

Retries exist to convert transient failure into eventual success. Misapplied, they convert a small failure into a large bill, an outage into a longer outage, and one duplicate upload into many.

## 7.1 Retry classification

Retry behavior is determined solely by error category (§8.2). Retry decisions MUST NEVER be made on error message text.

| Category | Behavior | Rationale |
|---|---|---|
| Network, timeout, provider 5xx, connection reset | **Retry** with backoff | Genuinely transient |
| Rate limit / throttle | **Retry** honoring the provider's stated wait | The provider has told us when to return |
| Structural or business validation failure | **Repair** (§7.4) — not plain retry | Identical input yields a similar failure; the model needs the error |
| Quality validation failure | **Regenerate** with adjusted strategy, bounded | Re-rolling identical parameters is unlikely to change the outcome |
| Content policy refusal from provider | **Do not retry** | Deterministic for that input; retrying is both futile and a policy-evasion pattern |
| Authentication, authorization, permission | **Do not retry** | Requires human or configuration intervention |
| Quota exhausted (ours or the platform's) | **Do not retry** — reschedule | The resource is gone until a reset boundary; retrying wastes and worsens |
| Configuration, schema mismatch, contract violation | **Do not retry** | A defect. Retrying delays discovery |
| Budget ceiling exceeded | **Do not retry** — halt and escalate | Retrying is the exact behavior the ceiling exists to prevent |
| Unknown | **Do not retry** — escalate and triage | Unknown means unclassified, which is a gap to be closed, not a condition to loop on |

## 7.2 Attempt budgets

Three independent counters MUST be tracked separately. Conflating them is a common and expensive error — it allows 3 transport retries × 3 repairs × 2 escalations to become 18 billed invocations under a policy that reads as "3 retries."

| Counter | Default maximum | Governs |
|---|---|---|
| **Transport attempts** | 3 | Retries of the same call after infrastructure-level failure |
| **Repair attempts** | 2 | Re-invocations that feed validation errors back to the model |
| **Escalations** | 1 | Promotion to a more capable model or an alternate provider |

Rules:

- The **total** invocation count per node MUST be capped independently of the individual counters, and enforced.
- A **wall-clock deadline** per node and per run MUST be enforced in addition to attempt counts. Attempt limits do not bound time.
- A **cost ceiling** per node and per run MUST be enforced and MUST be able to halt retries even when attempts remain (§2.14).
- Maxima MUST be configurable per agent class, and MUST have platform-enforced absolute upper bounds that tenant configuration cannot exceed.

## 7.3 Backoff

- Retries MUST use exponential backoff with **full jitter**. Fixed-interval or unjittered exponential retries synchronize clients across a fleet and produce coordinated thundering-herd load precisely when a provider is degraded.
- A maximum backoff cap MUST be set. Unbounded exponential growth turns a transient failure into an effectively hung run.
- Provider-supplied retry-after guidance MUST be honored and MUST override computed backoff.
- A **circuit breaker** MUST guard every external dependency: after a threshold of consecutive failures, fail fast without calling, probe periodically, and recover gradually. Retrying into a down provider consumes capacity and delays recovery for everyone.
- Backoff MUST NOT hold a worker idle. Delayed work returns to the queue; workers do not sleep.
- Long-running work MUST NOT be retried by an infrastructure timeout that is shorter than the operation's realistic duration — this produces duplicate concurrent execution, which is the worst possible outcome. Timeouts MUST be set from measured p99 latency plus margin.

## 7.4 AI feedback loops

Repair is the mechanism that converts an invalid model response into a valid one without regenerating from scratch.

- A repair invocation MUST include: the original input, the previous invalid output, and the **structured, specific** validation errors — field paths, expected constraints, actual values.
- Repair MUST NOT include the full history of prior attempts. Accumulated failure context degrades output quality, inflates cost, and biases the model toward repeating earlier mistakes.
- Repair prompts MUST instruct correction of the identified problems **only**, preserving everything valid. Unconstrained repair regenerates the whole document and discards good work.
- Repair MUST use the same or lower temperature than the original attempt (§4.5).
- Repair attempts MUST be strictly bounded (§7.2). If two targeted repairs fail, the problem is the prompt, the schema, or the model — not the attempt count — and it MUST escalate.
- Repeated failure on the same rule MUST be tracked as a quality signal per agent and prompt version. A rule that fails frequently indicates a prompt/schema contradiction (§4.3) and MUST be treated as a defect, not absorbed by retries.
- Repair MUST NOT be used to coerce a model past a legitimate refusal or policy stop. That is evasion, and it is forbidden.

## 7.5 Escalation

The escalation ladder MUST be applied in order, and each rung MUST be recorded:

1. Transport retry with backoff.
2. Targeted repair with structured error feedback.
3. Regeneration with adjusted parameters, within the declared range.
4. Escalation to a more capable model, if the agent's manifest permits it and budget allows.
5. Failover to an alternate provider, if capability requirements are met.
6. Human escalation with full context.
7. Terminal failure — run halted, state preserved, error recorded.

Rules:

- Escalation MUST be automatic up to the declared ceilings and MUST stop there. It MUST NEVER be unbounded.
- Model escalation MUST respect the per-run cost ceiling; a more capable model is usually a more expensive one.
- Provider failover MUST NOT change the output contract or business behavior (§14).
- Human escalation MUST include: what was attempted, every error, the last output, the cost consumed, and the specific decision required.
- Terminal failure MUST preserve all partial artifacts for diagnosis and MUST leave no partial side effects (§7.6).

## 7.6 Idempotency and side effects

- Every side-effecting operation MUST carry an idempotency key derived deterministically from its semantic identity (§5.8).
- Repeating an operation with a known key MUST return the original result without re-executing.
- Irreversible operations — publishing, uploading, spending, notifying — MUST be protected by both an idempotency key and a durable record written before the attempt, so that a crash mid-operation is detectable on recovery.
- Where an operation cannot be made idempotent, a compensating action MUST be defined and MUST be executed on failure.
- Retry MUST NEVER be enabled on an operation lacking idempotency protection.

## 7.7 Retry logging

Every attempt MUST emit a structured record containing: correlation and node identifiers, attempt number and counter type, the triggering error code and category, the retry decision and its reason, computed and actual delay, cumulative attempts and cumulative cost, elapsed time against the deadline, escalation rung, and final outcome.

Aggregate retry metrics MUST be monitored: retry rate by agent and prompt version, repair success rate by validation rule, escalation frequency, and cost attributable to retries. A rising retry rate is the earliest available signal of a prompt regression, a schema/prompt contradiction, or a provider behavior change.

## 7.8 Prohibited patterns

- Infinite or unbounded retry, in any form.
- Retrying non-idempotent side effects.
- Retrying authentication, authorization, permission, configuration, or contract errors.
- Retrying by matching error message text.
- Fixed-interval retry without jitter.
- Retry loops without a wall-clock deadline or a cost ceiling.
- Retrying a provider content-policy refusal.
- Treating a retry-exhausted failure as a success with degraded output.

---

# 8. Error Handling Standards

Errors are structured data, not strings. They are produced, transported, logged, aggregated, and acted upon programmatically.

## 8.1 The standard error object

Every error anywhere in the system MUST conform to one shape.

```
{
  "code":       "AI_OUTPUT.SCHEMA.VALIDATION_FAILED",
  "category":   "AI_OUTPUT",
  "severity":   "ERROR",
  "retryable":  false,
  "message":    "Output failed schema validation on 2 fields.",
  "userMessage":"We couldn't complete this step. Our team has been notified.",
  "source":     { "component": "strategy-agent", "version": "2.1.0", "stage": "OUTPUT_VALIDATION" },
  "context":    { "correlationId": "run_01J8Z…", "nodeId": "nod_01J8Z…", "attempt": 2 },
  "details":    [ { "path": "$.contentPillars[2].name", "expected": "string, 3–60 chars", "actual": "null" } ],
  "remediation":"Review prompt version p-4f2a against schema strategy-agent-output/v1.",
  "occurredAt": "2026-08-09T14:32:11.482Z",
  "causeChain": [ ]
}
```

*(Contract illustration only — not an implementation.)*

**Mandatory fields:** `code`, `category`, `severity`, `retryable`, `message`, `source`, `context.correlationId`, `occurredAt`.

Rules:

- `retryable` MUST be set by the producer, derived from category — never inferred by the consumer.
- `message` is for engineers and MUST be specific. `userMessage` is for end users and MUST NOT leak internal structure, provider names, prompt content, or identifiers.
- `details` MUST be machine-readable and MUST use field paths, not prose descriptions of location.
- `causeChain` MUST preserve underlying errors when wrapping. Wrapping MUST NOT erase the original — the root cause is what diagnosis needs.
- Raw provider responses MUST NEVER be surfaced to end users and MUST be redacted before logging (§10.6).

## 8.2 Error categories

Category is the primary routing dimension: it determines retry behavior, alerting, and ownership. Every error MUST have exactly one.

| Category | Meaning | Retryable | Typical owner |
|---|---|---|---|
| `VALIDATION` | Input or output violated a declared contract or rule | No (repairable) | Producing component |
| `AI_PROVIDER` | The model provider failed — unavailable, overloaded, internal error | Yes | External |
| `AI_OUTPUT` | The model responded, but the response was unusable | No (repairable) | Prompt / schema owner |
| `NETWORK` | Connectivity failure | Yes | Infrastructure |
| `EXTERNAL_API` | A non-AI third party failed | Depends | External |
| `TIMEOUT` | An operation exceeded its deadline | Yes, with care (§7.3) | Infrastructure |
| `RATE_LIMIT` | Throttled by a provider or platform | Yes, after the stated wait | Capacity |
| `QUOTA` | An allowance is exhausted until a reset boundary | No — reschedule | Capacity |
| `AUTH` | Authentication failed or credentials expired | No | Configuration |
| `PERMISSION` | Authenticated but not authorized | No | Access control |
| `SECURITY` | A security control triggered — injection detected, sanitization failure, isolation violation | No — escalate | Security |
| `POLICY_COMPLIANCE` | Content or action violates platform policy, rights, or disclosure rules | No — escalate | Content governance |
| `CONFIGURATION` | Missing, invalid, or contradictory configuration | No | Operations |
| `RESOURCE` | Storage, memory, or compute exhausted | Sometimes | Infrastructure |
| `DATA_INTEGRITY` | Corrupted, missing, or inconsistent data | No — escalate | Data owner |
| `WORKFLOW` | Orchestration fault — invalid transition, unresolvable dependency, deadlock | No | Workflow owner |
| `BUDGET` | A cost ceiling was reached | No — halt | Cost governance |
| `UNKNOWN` | Unclassified | No — escalate | Triage |

`UNKNOWN` MUST be treated as a defect in the error taxonomy. Every occurrence MUST be triaged and either reclassified or given a new code. A system with a steady `UNKNOWN` rate has an unmaintained taxonomy.

## 8.3 Severity

| Severity | Meaning | Response |
|---|---|---|
| `FATAL` | The run cannot continue and cannot be recovered automatically | Halt, preserve state, alert |
| `ERROR` | An operation failed; recovery may be possible | Apply retry policy (§7) |
| `WARNING` | Degraded but proceeding; recorded for analysis | Record, aggregate, review |
| `INFO` | Notable non-failure condition | Record only |

Severity is orthogonal to category. Severity MUST NOT be used to encode retryability.

## 8.4 Code naming convention

Format: `CATEGORY.SUBJECT.CONDITION`, `SCREAMING_SNAKE_CASE`, dot-separated, maximum four segments.

Examples: `VALIDATION.INPUT.REQUIRED_FIELD_MISSING`, `AI_OUTPUT.JSON.PARSE_FAILED`, `AI_PROVIDER.RATE_LIMIT.TOKENS_EXCEEDED`, `POLICY_COMPLIANCE.DISCLOSURE.SYNTHETIC_MEDIA_NOT_DECLARED`, `QUOTA.PUBLISH.DAILY_ALLOWANCE_EXHAUSTED`.

Rules:

- Codes MUST be registered in a central catalogue with a description, cause, remediation, and owner. An unregistered code MUST NOT ship.
- Codes MUST be stable forever. They appear in dashboards, alerts, runbooks, tenant support tickets, and third-party integrations.
- A code MUST NEVER be repurposed. Retire and replace instead — silently changing a code's meaning corrupts every historical metric derived from it.
- Codes MUST be specific enough to act on. A single generic code per category is equivalent to no taxonomy.
- Codes MUST NOT embed dynamic values. Dynamic content belongs in `details`.

## 8.5 Handling rules

- Errors MUST NOT be swallowed. Every caught error is handled, transformed and re-raised, or explicitly and visibly recorded as ignored with a reason.
- Errors MUST NOT be converted to a fallback value on any content path (§2.13).
- Errors crossing a component boundary MUST be wrapped with local context and MUST preserve the cause chain.
- Every error MUST carry the correlation identifier from its originating run.
- Partial failure in a fan-out MUST be represented explicitly, naming exactly which items failed and why. An aggregate "some failed" is not actionable.
- Security, policy, and data-integrity errors MUST alert immediately and MUST NOT be absorbed by retry logic.
- Error responses MUST be as carefully designed as success responses. They are the primary interface during every incident.

---

# 9. Logging Standards

Logging is not diagnostic decoration. In this system it is the substrate for cost accounting, quality measurement, regression attribution, audit, and reproducibility. It is a designed data product.

## 9.1 Format and discipline

- All logs MUST be structured (one JSON object per event). Human-readable formatting is a rendering concern applied at read time.
- Every event MUST have a stable `event` name, `SCREAMING_SNAKE_CASE`, from a registered catalogue.
- Log messages MUST NOT be constructed by string concatenation of variable data. Variables are fields.
- Timestamps MUST follow §5.7.
- Multi-line output, stack traces as free text, and unstructured output MUST NOT be emitted to the log stream. Stack traces are a structured field.

## 9.2 Universal required fields

Every log event MUST carry: `timestamp`, `level`, `event`, `service`, `serviceVersion`, `environment`, `correlationId`, and — where applicable — `tenantId`, `channelId`, `runId`, `nodeId`, `attempt`.

## 9.3 Required fields for AI invocations

Every model call MUST emit a record containing all of the following. This record is the system's cost ledger, quality dataset, and replay log simultaneously; a missing field breaks all three.

| Field | Why it is mandatory |
|---|---|
| `agentName`, `agentVersion` | Attribute behavior to a specific agent release |
| `promptVersion` (content hash + semver) | Attribute quality changes to a specific prompt (§4.9) |
| `schemaVersion` | Detect contract-related failures |
| `provider`, `modelId`, `modelVersion` | Attribute behavior to a model; detect silent provider-side changes |
| `parameters` (normalized: temperature, top-p, max output, seed) | Reproducibility |
| `inputTokens`, `outputTokens`, `cachedInputTokens`, `reasoningTokens` | Cost accounting and prompt-efficiency measurement |
| `costMicroUsd` | Cost attribution at run, channel, and tenant level |
| `latencyMs`, `timeToFirstTokenMs` | Performance monitoring and timeout calibration |
| `finishReason` | Detect truncation, which otherwise silently corrupts output (§6.7) |
| `attempt`, `attemptType` (initial / transport-retry / repair / escalation) | Distinguish retry classes (§7.2) |
| `validationResult` (stage, pass/fail, rule identifiers) | Quality measurement per prompt version |
| `promptRef`, `responseRef` | Content-addressed references to the full payloads, stored separately |
| `outcome` | Terminal result of the invocation |

Full prompt and response payloads MUST be retained (subject to §10.3) and referenced by identifier rather than inlined in the log stream — they are large, and inlining them destroys log usability and cost.

## 9.4 Correlation hierarchy

Identifiers MUST propagate down the full chain and MUST appear on every event, span, external call, and stored artifact:

`tenantId → channelId → runId (correlationId) → nodeId → attemptId → callId`

An event that cannot be traced to a run is nearly worthless during an incident. Propagation MUST be automatic, not the responsibility of individual call sites.

## 9.5 Levels

| Level | Use |
|---|---|
| `ERROR` | An operation failed and requires attention or automated recovery |
| `WARN` | Degraded or unexpected condition; execution continues |
| `INFO` | Significant lifecycle events — run started, node completed, artifact produced, approval granted, video published |
| `DEBUG` | Detailed diagnostics; disabled by default in production, enablable per tenant or per run |
| `TRACE` | Exhaustive; development and targeted investigation only |

`INFO` MUST be sufficient to reconstruct the narrative of a run without `DEBUG`. `DEBUG` MUST NOT be required to answer routine production questions.

## 9.6 Metrics and tracing

Beyond event logs, the platform MUST emit:

- **Distributed traces** spanning the full run: run → node → agent invocation → provider call → validation, including queue wait time. Queue latency invisible in traces is the most commonly missed source of end-to-end slowness.
- **System metrics** — throughput, error rate, latency distributions, queue depth and age, worker utilization, external dependency health, circuit breaker state.
- **Domain metrics** — cost per finished video; cost per run stage; validation failure rate by agent and prompt version; repair and retry rates; duplicate-detection hit rate; approval turnaround and rejection rate with reasons; publish success rate; publish quota consumed against allowance; time from idea to publish; and post-publish performance joined back to the producing agent and prompt versions.

The domain metrics are what make the platform improvable. Without the join from published performance back to prompt version, the feedback loop in §1.2 cannot exist.

## 9.7 Retention, sampling, and privacy

- Retention MUST be tiered: high-volume debug telemetry short-lived; AI invocation records and cost ledger long-lived; audit records retained per compliance obligation.
- Sampling MAY be applied to high-volume, low-value events. It MUST NOT be applied to errors, AI invocation records, cost records, approvals, publishes, or audit events.
- Logs MUST NEVER contain secrets, credentials, tokens, or full API keys. Redaction MUST be enforced structurally at the logging boundary, not left to the discretion of each call site.
- PII MUST be minimized, classified, and redacted per §10.3.
- Redaction MUST be verified by automated testing. Unverified redaction reliably fails.

## 9.8 Audit logging

Audit logs are a separate, append-only, tamper-evident stream — never mixed with application logs, and never sampled.

Every audit entry MUST record: actor (human or system identity), action, target resource and version, timestamp, source, outcome, and — for approvals and overrides — the reason given.

Auditable events MUST include at minimum: authentication and authorization decisions; credential and configuration changes; strategy approval; content approval and rejection; publishing; deletion; validation overrides; budget changes; prompt and agent version promotion; and any access to tenant data by platform staff.

---

# 10. Security Standards

## 10.1 Secret management

- Secrets MUST NEVER appear in source, configuration files, container images, environment dumps, logs, error messages, prompts, or model context.
- Secrets MUST be held in a dedicated secret management system with access control, versioning, and audit.
- Secrets MUST be injected at runtime and held in memory only for the duration of use.
- Secrets MUST be rotatable without downtime, and rotation MUST be periodic and enforced.
- Every secret MUST have a declared owner, purpose, scope, and rotation period.
- Compromise MUST have a documented, rehearsed revocation procedure.
- Encryption keys MUST be managed by a key management service using envelope encryption, MUST be rotatable, and MUST be separated per tenant where the threat model requires isolation.

## 10.2 API key and credential handling

- Every external credential MUST be scoped to the minimum capability required.
- Tenant credentials MUST be isolated per tenant, encrypted at rest with tenant-specific keys, and MUST NEVER be usable across tenant boundaries. Cross-tenant credential use is a critical security incident by definition.
- Delegated authorization tokens (publishing platform access) MUST use short-lived access tokens with refresh, MUST support rotation, and MUST be revocable by the tenant at any time.
- Credentials MUST NEVER be transmitted to clients, embedded in artifacts, or included in model context.
- Platform credentials MUST be distinct per environment. A production credential MUST NEVER be usable from a non-production environment.
- Credential use MUST be logged (identity and purpose, never the value).

## 10.3 Personally identifiable information

- PII MUST be minimized: collected only where necessary, retained only as long as necessary.
- PII MUST be classified, and its permitted flows documented. Classification determines handling; unclassified data MUST be treated as sensitive.
- **PII MUST NOT be sent to model providers unless it is essential to the task and the flow is documented and approved.** Where it is essential, providers MUST be used under terms that prohibit training on the data and provide zero or limited retention.
- PII MUST NOT appear in prompts, examples, evaluation sets, or logs unless explicitly required and approved.
- Deletion requests MUST propagate to all derived artifacts, caches, logs, evaluation sets, and backups within the declared window. Derived artifacts are the commonly-missed case.
- Content about identifiable real people — likeness, voice, quotations, claims — carries additional legal and platform obligations and MUST pass policy validation before publication.
- Voice cloning and likeness synthesis MUST require documented consent and MUST be blocked by default.

## 10.4 Encryption

- All data in transit MUST use current TLS. Plaintext transport MUST NOT exist, including between internal services.
- All data at rest MUST be encrypted — databases, object storage, queues, backups, and caches.
- Credentials and tenant secrets MUST receive application-level encryption in addition to storage-level encryption, so that storage compromise alone is insufficient.
- Encryption MUST use current standard algorithms via vetted implementations. Custom cryptography is forbidden.
- Backups MUST be encrypted and their restoration MUST be tested.

## 10.5 Prompt injection protection

This is the platform's defining security risk. The system ingests untrusted text from the open internet and supplies it to models that also hold authority to spend money and publish publicly. **Prompt injection cannot be reliably prevented by instructing the model. It MUST be contained architecturally.**

**All of the following MUST hold:**

1. **Everything external is untrusted.** Web research results, competitor metadata, transcripts, comments, user uploads, retrieved documents, filenames, and any prior model output are data — never instruction.
2. **Untrusted content is structurally isolated.** It MUST appear only in the user layer, never the system layer (§4.4); MUST be delimited unambiguously; MUST be explicitly labeled as untrusted data; and MUST be accompanied by an instruction that the block contains no directives. Delimiters MUST be neutralized in the content so they cannot be terminated early.
3. **Capability isolation is the primary control.** Any agent that processes untrusted content MUST NOT hold the ability to publish, spend, access credentials, call arbitrary tools, or reach arbitrary network destinations. This structural separation — not prompt wording — is what makes injection non-catastrophic. Prompt instructions are a mitigation; capability isolation is the control.
4. **Model output never authorizes a privileged action.** Every privileged action MUST be gated by deterministic policy evaluation and, where irreversible, human approval. A model may *propose*; it may never *authorize*.
5. **Deny by default on egress.** Network access from agent execution MUST be allowlisted. Model-produced URLs MUST NOT be fetched automatically, and MUST NOT be embedded in output without validation against the allowlist — model-generated URLs are a standard data-exfiltration channel.
6. **Detection and monitoring.** Known injection patterns MUST be detected on ingestion and flagged. Anomalies — sudden instruction-like content, unexpected tool requests, unusual output structure — MUST raise `SECURITY` errors (§8.2), which MUST NOT be absorbed by retry logic.
7. **Least context.** Agents MUST receive only the data their task requires. Broad context is a broad attack surface.

## 10.6 Output sanitization

- Model output is untrusted input to every downstream consumer, including other agents, renderers, publishers, and user interfaces.
- Output MUST be schema-validated before any use (§6.2).
- Output MUST NEVER be executed, evaluated, interpreted as a command, or used to construct a query or command.
- Output destined for rendering or display MUST be escaped for its destination context. Text destined for captions or on-screen rendering MUST be stripped of markup unless the field explicitly permits it.
- Output MUST be scanned for leaked secrets, internal identifiers, prompt fragments, and PII before storage or publication.
- URLs, mentions, and references in output MUST be validated against allowlists before publication.
- Generated media MUST be scanned and MUST have declared provenance before use.
- Output length and structure MUST be bounded before it reaches any consumer.

## 10.7 AI-specific security

- **Prompt confidentiality** — prompts are proprietary and MUST NOT be exposed through output, error messages, or APIs. Extraction attempts MUST be detected and blocked.
- **Tenant isolation in AI context** — one tenant's data MUST NEVER appear in another tenant's model context. Shared caches MUST be keyed to make cross-tenant reuse impossible.
- **No training on tenant data** without explicit, informed, revocable consent.
- **Denial-of-wallet** — untrusted input can inflate token consumption. Input size MUST be bounded before invocation, and per-tenant spend limits enforced independently of correctness.
- **Model supply chain** — model identity and version MUST be pinned and recorded. Silent provider-side model updates MUST be detectable through evaluation monitoring.
- **Third-party agents** (§15) MUST execute under enforced capability restrictions and MUST NOT receive credentials, raw tenant data beyond their declared need, or unrestricted egress.
- **Adversarial content** — content designed to elicit policy-violating output MUST be detected at ingestion and blocked, not merely refused by the model.

## 10.8 Access control and tenancy

- Tenant isolation is a security boundary enforced at every layer — storage, queues, caches, model context, and telemetry.
- Every data access MUST be tenant-scoped, and scoping MUST be enforced by the platform rather than by each call site. Isolation that depends on every developer remembering to filter will eventually fail.
- Authorization MUST be role-based with least privilege, and MUST be evaluated on every access.
- Irreversible and high-risk actions — publishing, credential changes, budget changes, data deletion — MUST require elevated authorization and MUST be audited.
- Platform staff access to tenant data MUST be exceptional, justified, time-limited, and audited.

---

# 11. Performance Standards

Performance here is three-dimensional: latency, cost, and throughput. Cost is the dimension most easily neglected and the one that most reliably becomes existential.

## 11.1 Token optimization

- Prompts MUST convey requirements once, precisely. Restating rules for emphasis increases cost on every call and measurably degrades instruction-following by diluting the instruction set.
- Full upstream artifacts MUST NOT be passed downstream by default. Each agent receives the minimum context its contract requires — this reduces cost, improves quality, and shrinks the injection surface simultaneously.
- Large source material MUST be summarized, chunked, or retrieved selectively rather than dumped whole.
- Where a provider supports schema-constrained generation, the schema MUST NOT also be restated in prose within the prompt.
- Output size MUST be bounded by schema, and the bound MUST reflect genuine need. Oversized output limits invite verbose output at direct cost.
- Examples MUST be justified by measured benefit (§4.8).
- Input MUST be validated and bounded *before* invocation. Sending known-invalid input is pure waste.

## 11.2 Cost optimization

- Every agent MUST declare an expected and a maximum cost per invocation; every workflow a ceiling; every tenant an enforced limit (§2.14).
- **Model tiering is mandatory.** Task class determines capability requirement (§14.2). Classification, extraction, and routing MUST NOT use the most capable available model. Reserving expensive models for tasks that genuinely need them is the single largest available cost lever.
- Draft-then-refine SHOULD be used where a cheaper model can produce a structure that a more capable model polishes.
- Non-urgent work SHOULD use batch or asynchronous discounted pathways where providers offer them.
- Caching MUST be used aggressively (§11.3).
- Runs MUST be haltable mid-execution on budget breach, and the halt MUST be enforced by the runtime rather than trusted to individual components.
- Cost MUST be attributable at the level of tenant, channel, run, node, agent, and prompt version. Unattributable cost cannot be optimized.
- Cost regressions MUST be detected automatically: a prompt change that raises cost per video is a regression requiring justification, exactly like a latency regression.

## 11.3 Caching

| Layer | What it caches | Invalidated by |
|---|---|---|
| **Step result cache** | A node's output, keyed by a hash of inputs + agent version + prompt version + schema version + normalized parameters | Any component of the key changing |
| **Provider prompt cache** | Stable prompt prefixes at the provider | Prefix content changing |
| **Asset cache** | Content-addressed media | Never — content-addressed artifacts are immutable |
| **Reference data cache** | Slow-changing external data | Time-to-live |

Rules:

- Cache keys MUST include every input that can affect output — most critically the prompt version and the model identity. A cache key omitting prompt version will serve stale results after every prompt change and silently invalidate every A/B test.
- Caching MUST be disableable per run for evaluation and debugging.
- Caches MUST be tenant-scoped where they contain tenant data (§10.7).
- Deterministic agents SHOULD be cached aggressively; Generator-class agents SHOULD NOT be cached across intentionally-varied runs, since re-running to obtain a different creative option is a legitimate operation.
- Cache hit rate and cache-attributable savings MUST be measured.
- Prompts SHOULD be structured with a stable prefix and late-placed variables to maximize provider cache effectiveness (§4.2).

## 11.4 Streaming

- Streaming MUST be used where a human is watching output arrive, for perceived latency.
- Streaming MUST NOT be used to begin downstream processing before the response is complete. Partial structured output is not validated output, and acting on it violates §2.7.
- Streamed responses MUST be assembled fully, then validated as a complete document.
- Streaming MUST NOT prevent full recording of the final response for replay (§9.3).
- Interrupted streams MUST be treated as failures, never as partial successes.

## 11.5 Queue and concurrency efficiency

- Work MUST be segregated into queues by resource class — fast model calls, long model calls, speech synthesis, image generation, video generation, rendering, publishing, analytics. Mixing classes means the slowest work starves the fastest and one saturated dependency degrades everything.
- Concurrency MUST be governed by external provider limits, applied as a shared, distributed constraint per provider credential — not by per-worker optimism. Local rate limiting across many workers does not produce a global limit.
- Priority MUST be supported so that interactive and approval-blocked work preempts bulk background work.
- Backpressure MUST be explicit: when a queue exceeds a depth or age threshold, admission is throttled rather than allowed to degrade indefinitely.
- Visibility timeouts MUST exceed realistic p99 processing time (§7.3).
- Dead-letter handling MUST exist per queue, with alerting and a triage path.
- Queue depth *and age* MUST both be monitored. Depth alone hides slow-moving starvation.

## 11.6 Parallel execution

- Independent work MUST be parallelized. In a video pipeline, per-scene visual generation and per-segment speech synthesis are the dominant latency contributors and are trivially parallel; serializing them is the most common avoidable performance defect.
- Parallelism MUST be bounded, and the bound MUST respect provider limits and tenant fairness.
- Fan-out size MUST NEVER be derived unbounded from model output. A model returning 500 scenes MUST be caught by schema bounds (§5.1) before it becomes 500 billed generations.
- Join semantics MUST be declared: all-must-succeed, best-effort-with-minimum, or first-acceptable. Undeclared join behavior produces inconsistent partial results.
- Partial failure policy MUST be explicit — which failures are recoverable per item, and what happens to the aggregate.
- Ordering requirements MUST be declared. Parallel completion is unordered; anything requiring order must state it.

## 11.7 Memory and resource usage

- Media MUST be streamed, never fully buffered in memory. A single buffered video render can exhaust a worker and take unrelated work down with it.
- Payload sizes MUST be bounded at every boundary.
- Large artifacts MUST be passed by content-addressed reference, never inlined in messages.
- Temporary working storage MUST be ephemeral, explicitly cleaned up, and MUST NOT be treated as a system of record.
- Workers MUST be sized to their workload class; model-call workers and media workers have fundamentally different resource profiles and MUST NOT share a pool.
- Resource limits MUST be enforced per execution so that one run cannot starve another.

## 11.8 Declared budgets

Every agent MUST declare, and the platform MUST enforce: expected and maximum latency (p50 / p95), expected and maximum cost per invocation, maximum input and output token counts, and maximum total invocations including retries.

Budgets MUST be validated in production against actual measurements. A budget that is never checked is documentation, not a control.

---

# 12. Documentation Standards

Documentation is a deliverable with the same status as any other artifact. Undocumented work is incomplete work.

## 12.1 Document types

| Type | Purpose | Identifier |
|---|---|---|
| **Standards** | Rules everything must follow (this document) | `STD-nnn` |
| **Architecture** | System structure and component relationships | `ARC-nnn` |
| **Architecture Decision Record** | One decision, its context, and its consequences | `ADR-nnn` |
| **Agent Specification** | One agent's complete contract | `AGT-nn` |
| **Workflow Specification** | One workflow's structure and behavior | `WFL-nnn` |
| **Runbook** | Operating and incident procedures | `RUN-nnn` |
| **Postmortem** | Incident analysis and follow-up | `PMT-nnn` |

## 12.2 Naming

- Files MUST use `kebab-case` with a descriptive name: `agent-00-strategy.md`, `adr-012-provider-abstraction.md`.
- Agent specifications MUST be numbered with a stable, zero-padded agent number that never changes and is never reused.
- Names MUST be stable. Renaming breaks references; supersede instead.
- Directory structure MUST be predictable and consistent across the project.

## 12.3 Required front matter

Every document MUST begin with a control block stating: identifier, title, version, status (`Draft` / `In Review` / `Active` / `Deprecated` / `Superseded`), owner, creation date, last-reviewed date, and — where relevant — what it supersedes or is superseded by.

A document without an owner and a last-reviewed date is unmaintainable: nobody knows whether to trust it.

## 12.4 Versioning

- Documents MUST use semantic versioning. **MAJOR** for changes that invalidate prior conformance; **MINOR** for substantive additions; **PATCH** for clarification and correction.
- Document versions MUST align with the artifact versions they describe. An agent specification MUST state which agent versions it covers.
- Superseded documents MUST be retained and marked, with a link to the replacement. Deleting superseded documents destroys the ability to interpret historical decisions.

## 12.5 Markdown conventions

- Exactly one H1 per document, matching the title. Heading depth MUST NOT exceed four levels — deeper nesting indicates the document should be split.
- Headings MUST be numbered where a document defines rules that will be cited elsewhere. Citations require stable anchors.
- Contracts, field definitions, and enumerations MUST be presented as tables. Prose descriptions of contracts are unreviewable and go stale invisibly.
- Fenced blocks MUST declare their content type and MUST be labeled when they are illustrative contracts rather than implementation.
- Sentences SHOULD begin on new lines in source, so that diffs isolate real changes rather than reflowed paragraphs.
- Links between project documents MUST be relative.
- Screenshots MUST NOT be the sole representation of anything — they cannot be searched, diffed, or maintained.
- Requirement language (§Document Control) MUST be used consistently in any document that defines rules.

## 12.6 Required content

- Every document MUST state its purpose and audience in its opening.
- Every contract MUST have at least one valid example and at least one invalid example with an explanation of why it is invalid. Invalid examples prevent more defects than valid ones.
- Every non-obvious decision MUST link to the ADR that records it.
- Every rule MUST be testable or MUST state how conformance is assessed.
- Terminology MUST match the glossary (§16). Synonyms MUST NOT be introduced casually — in a document set this size, drifting terminology is a leading cause of misimplementation.

## 12.7 Agent specification template

Every agent specification MUST contain exactly these sections, in this order, with no additions, removals, or reordering. Uniformity is what allows an engineer to navigate any of 20+ agent specifications without re-learning the format (§2.10).

1. Agent Overview
2. Responsibilities
3. Non-Responsibilities
4. Inputs
5. Outputs
6. JSON Schema
7. Example Request
8. Example Response
9. Validation Rules
10. Retry Strategy
11. Failure Responses
12. Dependencies
13. System Prompt
14. Prompt Variables
15. Quality Checklist
16. Performance Considerations
17. Future Improvements

Inputs and outputs MUST each be documented with name, description, type, required flag, constraints, and example.

## 12.8 Architecture Decision Records

- An ADR MUST be written for any decision that is expensive to reverse, constrains future options, or would otherwise prompt "why was this done this way?"
- An ADR MUST state: context, the decision, alternatives considered and why they were rejected, and consequences including the negative ones. An ADR listing only benefits is marketing and is not a record.
- ADRs are **immutable** once accepted. A changed decision produces a new ADR that supersedes the old one. Editing history destroys the reasoning trail that makes the record valuable.

## 12.9 Change logs

- Every versioned artifact MUST maintain a changelog: version, date, author, change type (Added / Changed / Deprecated / Removed / Fixed / Security), description, and — for breaking changes — migration guidance.
- Changelog entries MUST be written for the reader who must act on the change, not as a restatement of the diff.
- Breaking changes MUST be unmistakably marked and MUST include a migration path.

## 12.10 Maintenance

- Documentation MUST be updated in the same change as the work it describes. Documentation debt is never repaid later.
- Stale documentation is a defect and MUST be reported and fixed as one. It is more harmful than missing documentation, because it is trusted.
- Documents MUST be reviewed on their declared cadence, and the review date updated even when no change is needed — so readers can distinguish "still correct" from "unmaintained."

---

# 13. Quality Standards

Quality requirements are measurable, monitored, and enforced. An unmeasured standard is an aspiration. The thresholds below are the initial bar; they are reviewed quarterly and MUST NOT be lowered without a recorded decision.

## 13.1 Definitions of done

**An agent is done when:** it has a complete specification (§12.7); versioned input and output schemas; versioned prompts with recorded parameters; structural and business validation; an evaluation set including adversarial cases, passing at the declared threshold; declared cost and latency budgets, verified against measurement; complete telemetry (§9.3); a documented failure and retry strategy; and a manifest (§3.12).

**A prompt change is done when:** the new version is recorded immutably with a rationale; the evaluation set passes with no regression; cost and latency impact are measured; a second reviewer has approved against §13.3; and a rollback path exists.

**A workflow is done when:** it is declarative and versioned; every node's failure behavior is defined; approval gates are placed; the cost ceiling is declared; partial-failure and join semantics are declared; and it has been exercised end-to-end including failure paths.

## 13.2 Documentation quality

| Requirement | Threshold |
|---|---|
| Required sections present in agent specifications | 100% |
| Contracts documented as tables with types, constraints, examples | 100% |
| Valid and invalid examples present per contract | 100% |
| Examples validate against the current schema (automatically verified) | 100% |
| Documents with an owner and a review date within cadence | 100% |
| Non-obvious decisions with a linked ADR | 100% |

Example validity MUST be checked automatically. Hand-maintained examples silently drift out of conformance, and a schema-invalid example in a prompt actively teaches the model to produce invalid output (§4.8).

## 13.3 Prompt quality

A prompt MUST NOT be promoted unless all hold:

- Contains every required structural block in order (§4.1).
- Every variable declared, typed, and strictly resolved (§4.2).
- Constraints consistent with the schema, with zero contradictions (§4.3).
- Explicit unknown-value policy and refusal policy present (§4.7).
- Output instruction demands the declared structure and nothing else (§3.7).
- Untrusted content delimited and labeled (§10.5).
- Contains no secrets, PII, tenant identifiers, or provider-specific syntax (§4.1, §14.5).
- Evaluation set passes at or above the declared threshold, with no regression against the incumbent.
- Cost and latency impact measured and within budget.

| Metric | Target |
|---|---|
| First-attempt schema validity | ≥ 99.5% |
| Repair invocation rate | ≤ 2% |
| Escalation rate | ≤ 0.5% |
| Evaluation regression on promotion | 0 |

## 13.4 Contract quality

| Requirement | Threshold |
|---|---|
| Messages schema-validated at component boundaries | 100% |
| Schemas closed to unknown properties | 100% |
| Fields with declared type, constraints, and optionality | 100% |
| Decision fields represented as enumerations rather than free text | 100% |
| Unit-bearing fields with unit-suffixed names | 100% |
| Schemas with a registered owner and changelog | 100% |

## 13.5 Validation coverage

| Requirement | Threshold |
|---|---|
| Agents with structural validation | 100% |
| Agents with at least one business rule, or a recorded justification | 100% |
| Content-producing agents with quality validation and duplicate detection | 100% |
| Irreversible actions behind policy validation and a human gate | 100% |
| Validation rules with both a passing and a failing test case | 100% |
| Production defects that added an evaluation case | 100% |

## 13.6 Content quality

Domain quality measures — the ones that determine whether the platform actually works. Thresholds are configured per channel; measurement is mandatory for all.

- **Grounding rate** — proportion of factual claims traceable to a supplied source.
- **Originality** — inverse of maximum semantic similarity against the channel's prior content (§6.6).
- **Brand conformance** — measured adherence to the channel's approved strategy, tone, and format.
- **Policy pass rate** — proportion clearing compliance validation on first attempt.
- **Human rejection rate, with categorized reasons** — the highest-signal quality metric available, because it reflects judgment no automated gate captures. Rejection reasons MUST be structured and MUST feed prompt and rubric improvement.
- **Post-publish performance, joined to producing versions** — the only measure that reflects the actual objective, and the input to the improvement loop in §1.2.

## 13.7 Maintainability

| Requirement | Standard |
|---|---|
| Agent purpose statements | One sentence, no conjunctions (§3.2) |
| Agents invoking other agents | Zero (§2.4) |
| Prompt text duplicated across agents | Zero (§3.9) |
| Hardcoded values that vary by tenant, channel, locale, or brand | Zero (§2.6) |
| Provider or model identifiers in domain logic | Zero (§2.2) |
| Structural conformance to the agent specification template | 100% |
| Errors using the standard object and registered codes | 100% |

## 13.8 Scalability and reliability

- Every execution unit demonstrably stateless (§3.3).
- Every side-effecting operation demonstrably idempotent (§7.6).
- No unbounded fan-out anywhere (§11.6).
- Every external dependency behind a circuit breaker (§7.3).
- Every queue with dead-letter handling and alerting (§11.5).
- Declared load targets verified under test before release.
- Failure paths exercised, not merely designed. An untested failure path should be assumed broken.

## 13.9 Enforcement

Standards MUST be enforced automatically wherever automation is possible: schema validity, example validity, closed schemas, error code registration, telemetry field presence, prompt structure, evaluation thresholds, budget declarations, and manifest completeness.

Anything not automatically enforceable MUST appear on a review checklist. Anything on neither will not be followed consistently — this is an observation about organizations, not about discipline.

---

# 14. AI Model Independence

The platform MUST be able to change model providers without any change to business logic. Providers deprecate models, change pricing, alter behavior, impose new limits, and suffer outages — none of which are events the domain should ever notice.

## 14.1 Layering

Six layers, with dependencies pointing strictly downward and no layer reaching past its neighbor:

1. **Business logic** — the domain. Knows agents and contracts. Knows nothing about models, providers, or vendors.
2. **Agent contract** — declared inputs, outputs, and behavior. Provider-neutral.
3. **Agent runtime** — renders prompts, invokes models, validates, repairs, retries, records telemetry. Uniform across all agents.
4. **Capability profile** — a declaration of *what the model must be able to do*. No vendor names.
5. **Model router** — resolves a capability profile plus policy into a concrete model, at runtime.
6. **Provider adapter** — one per provider. Translates the platform's uniform interface to that provider's specifics, and normalizes everything on the way back.

**The hard rule:** no provider name, model identifier, or vendor-specific concept may appear above layer 5. This is automatically enforceable and MUST be enforced (§13.9).

## 14.2 Capability abstraction

Agents declare required capabilities, never models. Capabilities include: structured output enforcement, tool invocation, context window class, vision input, audio input, reasoning depth, prompt caching, deterministic seeding, and latency class.

The router selects a model satisfying the declared capabilities, subject to: cost policy and remaining budget; tenant-level provider restrictions (data residency, contractual, or preference-based); current availability and circuit-breaker state; measured quality for the agent's task class; and any explicit tenant or run pin.

This means capability requirements are engineering decisions, while model selection is an operational one — and the two change on entirely different schedules.

## 14.3 What adapters must normalize

Provider differences are real and unavoidable. The adapter's job is to make them invisible above it:

| Dimension | Normalized form |
|---|---|
| Message roles and system instruction handling | One uniform structure |
| Structured output enforcement | A single guarantee of validated structured output, however achieved |
| Tool and function invocation | One uniform request and result shape |
| Sampling parameters | Uniform names, ranges, and semantics |
| Token accounting | Uniform counters, including cached and reasoning tokens |
| Cost | Uniform integer micro-units (§5.9) |
| Stop and finish reasons | One uniform enumeration, with truncation always distinguishable |
| Errors | Platform error categories and codes (§8) |
| Rate limit signals | Uniform throttle information with wait guidance |
| Streaming events | One uniform event sequence |
| Safety refusals | A uniform, explicitly-typed refusal outcome — never an ordinary result |
| Model identity and version | Uniform, recorded, pinned |

**Uniform behavior, not uniform mechanism.** Providers that enforce schemas natively and providers that do not must both yield validated structured output above the adapter. The adapter and runtime absorb the difference — through constrained decoding where available and validate-then-repair where not — and the difference MUST NOT surface upward as a behavioral change.

## 14.4 Prompt portability

- Prompts MUST be authored provider-neutrally, using no vendor-specific syntax, markers, or formatting conventions.
- Where a provider requires an adaptation, it MUST be expressed as a versioned overlay applied by the adapter — never by forking the prompt.
- Every prompt version MUST be evaluated on every provider it is approved for. A prompt that passes on one provider is *unevaluated* on another; behavior differences between models are routine, not exceptional.
- Approved provider/model combinations MUST be recorded per prompt version.

## 14.5 Isolation rules

- Provider-specific fields MUST NOT appear in domain objects or stored artifacts, other than in the recorded provenance metadata (§5.6) where they exist purely as an audit record.
- Provider errors MUST be translated into platform error categories at the adapter boundary. Provider error semantics MUST NOT leak upward.
- Provider outages MUST be handled by the router through failover, never by business logic.
- Provider capability gaps MUST be closed by the runtime, never worked around in the domain.

## 14.6 Acceptance criteria for a new provider

Adding a provider MUST require only: a new adapter, a capability declaration, cost and limit configuration, and evaluation runs. It MUST require **zero** changes to business logic, agents, prompts, workflows, schemas, or validators.

The acceptance test is precise: the full evaluation suite passes on the new provider with zero diffs outside the adapter and configuration. If any other change is required, the abstraction is defective and MUST be fixed rather than worked around.

## 14.7 The same principle applies beyond language models

Every external capability MUST sit behind an equivalent abstraction, for the same reasons: speech synthesis, speech recognition, image generation, video generation, music, translation, rendering backends, storage, and publishing platforms. Voice synthesis vendors change and are repriced exactly as language model vendors are, and a channel's voice identity MUST survive that change.

Voices, styles, and rendering capabilities MUST be referenced by platform-level abstract identifiers mapped to provider-specific ones in configuration — never by vendor identifiers embedded in channel configuration or content.

---

# 15. Future Expansion Standards

The platform will grow along known axes. Growth along a known axis MUST NOT require modifying the core. Where the core must change to add a channel, a language, a brand, an agent, a renderer, or a platform, the design has already failed.

## 15.1 The extension principle

**Open for extension, closed for modification.** New capability arrives as a new registered artifact, never as an edit to shared logic.

Every extension point MUST be an explicit, documented registry with a declared contract, a versioning policy, and a validation process. Registries MUST exist for at minimum: agents, prompts, schemas, workflows, validators, model providers, media providers, rendering backends, publishing platforms, locales, brand kits, and niche blueprints.

Anything extended outside a registry is a fork, and forks are how platforms die.

## 15.2 New agents

Adding an agent MUST require only: a manifest, schemas, prompts, validators, an evaluation set, documentation, and registry entry. It MUST require no core changes and no changes to any other agent.

Workflows reference agents by identifier and version constraint, so an agent can be introduced, versioned, and rolled out per tenant independently. Agents MUST be individually enableable and disableable per tenant. Third-party agents (§15.9) use the identical contract as first-party ones — no privileged interface exists.

## 15.3 New workflows

- Workflows MUST be declarative data, not logic. A new workflow is a new definition, not a new component.
- Workflows MUST be versioned, and running instances MUST be pinned to the version they started under.
- Workflows MUST support reusable sub-workflows so that common sequences are composed rather than duplicated.
- Node types MUST be extensible through the registry — including agent invocation, deterministic transformation, branching, parallel fan-out, join, human approval, wait, sub-workflow, rendering, and publishing.
- Workflows MUST be validatable before execution: every referenced agent, schema, and contract resolvable, every path terminating, cost ceiling declared.
- Tenants MUST be able to hold custom workflows without forking the platform.

## 15.4 New channels and tenants

- Every entity, artifact, configuration value, credential, cache entry, and telemetry record MUST be tenant-scoped from inception. Retrofitting multi-tenancy is one of the most expensive migrations in software, and it is never done cleanly.
- There MUST be no global singletons and no global mutable state.
- Nothing MUST be keyed by human-readable name. Names change; identifiers do not.
- Onboarding a channel MUST be a data operation requiring no deployment.
- Per-tenant limits, budgets, quotas, and isolation MUST be enforced by the platform.
- Tenant data MUST be fully exportable and fully deletable.

## 15.5 Multiple languages

- **Locale is a first-class dimension**, not a translation step applied at the end. Retrofitting locale into a system built English-first is a rewrite (§2.6, §4.10).
- No user-visible text MUST be embedded in logic.
- Prompts, examples, evaluation sets, rubrics, validators, and constraints MUST all be locale-aware. Character limits, sentence rhythm, speaking rate, and title conventions differ materially by language; applying English constraints elsewhere silently produces poor output.
- Voices, pronunciation handling, and speaking-rate defaults MUST be per-locale registry entries.
- Text direction, script-specific rendering, font coverage, and line-breaking MUST be handled by the rendering layer as declared capabilities.
- Locale-specific policy and cultural sensitivity rules MUST be supported — platform policy and audience expectations are not uniform across regions.
- A locale is not supported until it has passed its own evaluation sets. Untested locale support is a claim, not a capability.

## 15.6 Multiple brands

- Brand identity MUST be data: palette, typography, logo, motion style, intro and outro, lower thirds, voice selection, tone descriptors, vocabulary preferences and prohibitions, thumbnail conventions, and disclosure text.
- Brand MUST be an explicit input to every agent whose output is brand-visible, and MUST be enforceable by validation.
- Multiple brands MUST coexist within a tenant, and a channel MUST bind to exactly one.
- Brand kits MUST be versioned, so that a rebrand is a version transition rather than an untracked mutation, and historical content remains explicable.
- No brand attribute MUST ever appear in logic or in prompt text — only as resolved variable values.

## 15.7 New rendering engines

- The boundary between planning and rendering MUST be a **declarative, engine-neutral render manifest**: a complete, deterministic description of the finished video — timeline, media references, timing, text, effects, and audio mix — containing no engine-specific instructions.
- Rendering engines MUST be adapters that execute a manifest. Adding an engine MUST require no changes to any agent.
- Manifests MUST be versioned, stored, and replayable, so any video can be re-rendered — at a different resolution, with a corrected asset, in a different aspect ratio, or on a different engine — without re-running the AI pipeline. This is what makes the expensive part of the pipeline reusable, and it is one of the highest-value structural decisions in the platform.
- Engines MUST declare their capabilities; manifests MUST declare their requirements; incompatibility MUST be detected before rendering rather than discovered during it.
- Rendering MUST be deterministic: the same manifest and the same assets produce equivalent output.

## 15.8 New publishing platforms

- Every destination platform MUST be described by a **capability descriptor**: supported aspect ratios, duration bounds, metadata fields and their limits, thumbnail requirements, caption formats, scheduling behavior, disclosure requirements, and quota model.
- Publishing MUST be an adapter operating from that descriptor. Adding a platform MUST NOT fork the pipeline.
- Adapting content for a destination (aspect ratio, duration, metadata length, caption format) MUST be a declared transformation stage driven by the descriptor — never a parallel copy of the production pipeline.
- Quota MUST be modeled per platform per credential, accounted centrally, and scheduled against (§1.5). This is a shared scarce resource and MUST be treated as one.
- Publishing MUST be idempotent, auditable, and human-gated by default (§7.6, §2.8).
- Platform policy differences MUST be expressed as descriptor-driven validation rules, not as assumptions.

## 15.9 Third-party extensions

Anticipating a marketplace, extension contracts MUST be designed as if external from the start:

- Extensions MUST declare a manifest with identity, version, contracts, required capabilities, and required permissions.
- Extensions MUST execute under enforced capability restrictions, deny-by-default (§10.7).
- Extensions MUST pass evaluation before listing, and MUST be re-evaluated on every version.
- Extensions MUST be versioned semantically, pinnable by tenants, and rollable back.
- Extension usage MUST be metered and attributable.
- The platform MUST be able to disable an extension immediately across all tenants.
- No privileged internal interface MUST exist that first-party components use and third-party ones cannot. Where such an interface exists, the external contract will be under-designed, because nobody depends on it.

## 15.10 Compatibility and deprecation

- Breaking changes MUST follow a published deprecation process: announcement, a declared support window, migration guidance, monitoring of remaining usage, and only then removal.
- The prior major version MUST remain supported for the full announced window.
- In-flight work MUST complete under the version it started with.
- Deprecation warnings MUST be visible to affected tenants and detectable in telemetry.
- Silent breaking changes are prohibited without exception (§2.16).

---

# 16. Glossary

Terms are defined once here and used consistently everywhere. Synonyms MUST NOT be introduced (§12.6).

**ADR (Architecture Decision Record)** — An immutable record of one architectural decision, its context, alternatives, and consequences.

**Agent** — A versioned, single-purpose, stateless unit that transforms validated structured input into validated structured output using model invocation.

**Agent Class** — The functional category of an agent (Extractor, Transformer, Generator, Critic, Judge, Planner, Router), determining default parameters and evaluation method.

**Agent Manifest** — The machine-readable declaration of an agent's identity, contracts, capabilities, permissions, and budgets.

**Agent Runtime** — The uniform layer that renders prompts, invokes models, validates output, applies repair and retry, and records telemetry. Shared by all agents.

**Approval Gate** — A workflow node that suspends execution pending a recorded human decision.

**Artifact** — Any durable output: a document, an asset, a manifest, a rendered video.

**Asset** — A media file (image, audio, video, font) with recorded provenance and rights.

**Backpressure** — Deliberate admission throttling when downstream capacity is exceeded.

**Brand Kit** — The versioned data defining a brand's visual, verbal, and audio identity.

**Capability Profile** — A provider-neutral declaration of what a model must be able to do, used for routing.

**Champion / Challenger** — A release pattern in which an incumbent version serves most traffic while a candidate serves a measured share.

**Channel** — A single publishing destination account with its own strategy, brand, locale, and content history.

**Circuit Breaker** — A control that stops calling a failing dependency, probes periodically, and recovers gradually.

**Closed Schema** — A schema rejecting any property it does not declare.

**Confidence** — A calibrated value in `[0.0, 1.0]` expressing an agent's certainty, with agent-specific documented meaning.

**Content-Addressed** — Identified by a cryptographic hash of content, making the identifier immutable and deduplicating.

**Content Pillar** — A recurring thematic area defining what a channel covers.

**Correlation ID** — The identifier constant across an entire run, propagated to every message, log, span, and artifact.

**Critic** — An agent class producing structured, actionable findings about an artifact.

**DAG** — Directed acyclic graph; the structural form of a workflow.

**Dead Letter** — The destination for work that failed beyond its retry budget, pending triage.

**Deterministic** — Producing consistent, bounded, reproducible behavior. At the system level this refers to guaranteed shape, bounds, validity, and traceability — not to identical tokens.

**Disclosure** — A required declaration that content is synthetic or AI-generated, tracked as structured state and enforced at publish.

**Envelope** — The standard message wrapper separating metadata from payload (§5.3).

**Escalation** — Promotion of a failing invocation to a more capable model, an alternate provider, or a human.

**Evaluation Set (Golden Set)** — Versioned representative inputs with expected outputs or rubric references, used to gate every agent and prompt change.

**Faceless Channel** — A channel whose content presents no on-camera human, produced from synthesized narration and generated or licensed visuals.

**Fan-out / Fan-in** — Distribution of work into parallel branches and their subsequent join.

**Grounding** — The requirement that factual claims derive from supplied source material, with verifiable references.

**Hallucination** — Model output that is fluent, plausible, and unsupported by the input or by fact.

**Hook** — The opening seconds of a video, the primary determinant of retention.

**Human-in-the-Loop** — A designed point of human authority within an automated process.

**Idempotency Key** — A deterministic identifier for an operation's semantic identity, ensuring repeated execution has the effect of one execution.

**Judge** — An agent class scoring an artifact against a fixed, versioned rubric.

**Locale** — A language and region identifier (BCP 47) that is a first-class dimension across prompts, assets, voices, and validation.

**Node** — One step in a workflow.

**Prompt Version** — An immutable, content-addressed version of a prompt's exact text and parameters.

**Provider Adapter** — The component translating the platform's uniform model interface to one vendor's specifics, and normalizing everything returned.

**Quota** — A finite external allowance, most significantly the shared per-application publishing allowance (§1.5).

**Render Manifest** — The declarative, engine-neutral, deterministic description of a finished video (§15.7).

**Repair** — A bounded re-invocation supplying structured validation errors so the model can correct specific faults.

**Router (Model Router)** — The component resolving a capability profile plus policy into a concrete model at runtime.

**Rubric** — A versioned, explicit set of scoring criteria and levels used by Judge agents.

**Run** — One end-to-end execution of a workflow, the unit of correlation, cost accounting, and audit.

**Schema Registry** — The versioned catalogue of all data contracts.

**Semantic Similarity** — Embedding-based comparison used for duplicate detection beyond textual matching.

**Step Result Cache** — A cache keyed on inputs plus all version identifiers, returning a previously computed node output.

**Strategy** — The channel-level definition (mission, audience, pillars, tone, cadence, metrics) that all production agents must conform to.

**Tenant** — An isolated customer account owning channels, credentials, configuration, budgets, and data. The primary security and isolation boundary.

**Tool** — A capability a model may invoke during execution, subject to explicit permission.

**Untrusted Content** — Any content originating outside the platform's control. Always data, never instruction (§10.5).

**Workflow** — A declarative, versioned graph composing agents and other nodes into an end-to-end process.

**Workflow Engine** — The component that executes workflows, persists state, applies retry policy, and is the sole owner of composition.

---

# 17. Project Rules

Immutable rules. Every engineer, every AI agent, every contributor, and every marketplace publisher MUST follow them. Violations block merge and block release. Exceptions require a recorded, approved, time-limited waiver naming an owner and a remediation date.

**Architecture**

1. Every component MUST have exactly one responsibility, stated in one sentence with no conjunction.
2. Agents MUST NEVER invoke other agents. Composition belongs solely to the workflow engine.
3. Agents MUST be stateless. All context arrives through declared inputs.
4. Agents MUST NEVER perform external side effects. They declare intended effects as output; the workflow executes them.
5. Business logic MUST NEVER reference a provider, model, vendor, or queue.
6. Any value varying by environment, tenant, channel, locale, or brand MUST be configuration or data — never code.
7. There MUST be no global mutable state and no global singletons.
8. Nothing MUST be keyed by human-readable name; identifiers only.

**Contracts**

9. All inter-component communication MUST be JSON conforming to §5.
10. Every schema MUST be closed. Unknown properties are errors.
11. Every schema MUST be semantically versioned, and every payload MUST declare its version.
12. Contracts MUST NEVER break within a major version. Field meanings MUST NEVER change.
13. Every message MUST carry the standard envelope with correlation and provenance.
14. Timestamps MUST be RFC 3339 UTC with millisecond precision; durations MUST be integer milliseconds in unit-suffixed fields.
15. Money MUST be integer minor units with a currency code; AI cost MUST be integer micro-units. Floating-point money is prohibited.
16. Absence MUST be expressed by omission. Empty string MUST NEVER signal absence, and arrays MUST NEVER be null.

**AI and prompts**

17. Every AI output MUST be schema-validated before any use. Unvalidated model output MUST NEVER be consumed.
18. Agents MUST NEVER invent, infer, estimate, or default a missing value. Unknown MUST be declared explicitly.
19. Agents MUST NEVER emit conversational text, markdown, preamble, or explanation.
20. Reasoning MUST NEVER appear in the output payload.
21. Prompt versions MUST be immutable and content-addressed. A released prompt MUST NEVER be edited in place.
22. Every AI invocation MUST record agent version, prompt version, schema version, model identity, parameters, tokens, cost, latency, and finish reason.
23. No prompt or model change MUST ship without passing the agent's evaluation set with no regression.
24. Model parameters MUST follow the class-based policy and MUST NEVER be tuned ad hoc at call sites.
25. Every agent MUST have an evaluation set including adversarial and degenerate cases.

**Reliability**

26. Every side-effecting operation MUST be idempotent and MUST carry an idempotency key.
27. Retries MUST be bounded by attempt count, wall-clock deadline, and cost ceiling — all three.
28. Retries MUST use exponential backoff with full jitter, and MUST honor provider wait guidance.
29. Retry decisions MUST derive from error category, never from message text.
30. Validation failures MUST be repaired with structured error feedback, never retried unchanged.
31. Errors MUST NEVER be swallowed, and failures MUST NEVER be substituted with defaults on any content path.
32. Every error MUST use the standard error object with a registered code. Error codes MUST NEVER be repurposed.
33. Every external dependency MUST sit behind a circuit breaker.
34. Unbounded loops, unbounded fan-out, and unbounded retry are prohibited in all forms.

**Quality and safety**

35. Nothing reaches an audience without passing structural, business, quality, and policy validation.
36. Policy, compliance, and publish gates MUST fail closed.
37. Irreversible actions MUST require human approval, and every decision MUST record actor, timestamp, rationale, and the exact artifact version.
38. Model output MUST NEVER authorize a privileged action. It may propose; deterministic policy decides.
39. All external content MUST be treated as untrusted data, never as instruction.
40. Components processing untrusted content MUST NOT hold publishing, spending, credential, or unrestricted network capability.
41. Secrets MUST NEVER appear in code, logs, prompts, errors, or model context.
42. Tenant isolation MUST be enforced at every layer, including caches and model context. Cross-tenant data exposure is a critical incident.
43. Every content-producing agent MUST run duplicate detection against the channel's history.
44. Synthetic-media disclosure state MUST be tracked structurally and enforced at the publish gate.

**Operations**

45. Every agent MUST declare cost and latency budgets, and the platform MUST enforce them.
46. Every run MUST have an enforced cost ceiling that halts execution when breached.
47. Every execution MUST be traceable end-to-end by correlation identifier.
48. Every published output MUST be traceable to its inputs, agent versions, prompt versions, model, cost, and approvals.
49. Publishing quota MUST be modeled, accounted, and scheduled against as a shared scarce resource.
50. Running workflows MUST be pinned to the versions active at run start; deployment MUST NEVER alter in-flight behavior.

**Documentation and process**

51. Every agent MUST have a specification using the mandatory template, with no sections added, removed, or reordered.
52. Every contract MUST have at least one valid and one invalid example, automatically verified against the current schema.
53. Every non-obvious decision MUST have an ADR. Accepted ADRs are immutable; decisions are superseded, never edited.
54. Documentation MUST be updated in the same change as the work it describes. Stale documentation is a defect.
55. Every breaking change MUST follow the deprecation process with an announced window and migration guidance. Silent breaking changes are prohibited.
56. Every production defect MUST add a case to the relevant evaluation set.
57. Where this document conflicts with any other artifact, this document wins; the conflict MUST be resolved, never tolerated.

---

# Appendix A — Amendment Process

This document will be maintained for years and MUST evolve. Uncontrolled evolution, however, is indistinguishable from having no standard.

1. **Proposal** — Any contributor may propose an amendment, stating the problem, the proposed change, affected sections, and the migration impact on existing components.
2. **ADR** — Any material amendment MUST be accompanied by an ADR recording context, alternatives, and consequences.
3. **Review** — Amendments MUST be reviewed by Platform Architecture plus at least one engineer from an affected area.
4. **Impact assessment** — The proposal MUST enumerate every existing component that would become non-conformant, and state whether they are grandfathered, migrated, or waived.
5. **Versioning** — Amendments follow §12.4. Changes that invalidate existing conformance are MAJOR.
6. **Communication** — MAJOR amendments MUST be announced with a conformance deadline.
7. **Waivers** — Temporary non-conformance requires a recorded waiver naming the rule, the reason, the owner, and a remediation date. Waivers MUST expire; a permanent waiver means either the rule or the component is wrong, and one of them MUST change.

---

# Appendix B — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial standards: vision, engineering principles, agent design, prompt engineering, JSON contracts, validation, retry, error handling, logging, security, performance, documentation, quality, model independence, expansion standards, glossary, and project rules. |

---

*End of document — STD-000 v1.0*

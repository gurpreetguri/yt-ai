# Workflow Orchestration Guide
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `GDE-005` |
| Title | Workflow Orchestration Guide |
| Version | 1.0 |
| Status | Active |
| Governed by | [`000-project-engineering-standards.md`](000-project-engineering-standards.md) (`STD-000 v1.0`) |
| Situated by | [`001-system-architecture.md`](001-system-architecture.md) (`ARC-001 v1.0`) |
| Companion to | [`002-ai-agent-development-guide.md`](002-ai-agent-development-guide.md) · [`003-json-contract-guide.md`](003-json-contract-guide.md) · [`004-prompt-engineering-guide.md`](004-prompt-engineering-guide.md) |
| Owner | Platform Architecture |
| Audience | Anyone authoring, reviewing, operating, or recovering a workflow |
| Review cadence | Quarterly, or on any change to the run state machine or recovery model |

**Requirement language.** RFC 2119 keywords carry the meanings defined in `STD-000` §Document Control.

**Precedence.** `STD-000` governs. Where this guide appears to conflict with it, `STD-000` wins and this guide is the defect (`STD-000` Rule 57).

---

### State model reconciliation

The commissioning brief lists twelve states in one flat set. Those states belong to **three different state machines** operating at different scopes, and flattening them would make the model unimplementable — a run cannot be in `Retry`, because retry is a property of a node, and a run cannot be `Approved`, because approval is the outcome of a gate.

| Brief state | Correct scope | Section |
|---|---|---|
| Created, Running, Waiting, Completed, Failed, Cancelled | **Run** (canonical, `ARC-001` §7.4) | §5.3 |
| Ready | **Run** — named `Resolved` in `ARC-001` §7.4; canonical name retained | §5.3 |
| Archived | **Run** — terminal post-state, extending the canonical set | §5.3 |
| Validation, Retry | **Node** — phases within a node's execution | §5.4 |
| Approved, Rejected | **Approval gate** — outcomes, not states | §5.5 |

All twelve are covered. §5 defines each in its correct scope, with transition tables and invariants.

---

# 1. Introduction

## 1.1 Position in the document set

| Document | Question it answers |
|---|---|
| `STD-000` Engineering Standards | *What are the rules?* |
| `ARC-001` System Architecture | *Where do components sit, and why?* |
| `GDE-002` Agent Development Guide | *How do I design an agent?* |
| `GDE-003` JSON Contract Guide | *What moves between components?* |
| `GDE-004` Prompt Engineering Guide | *How do I write and govern a prompt?* |
| `GDE-005` **this guide** | *How is all of it coordinated, and what happens when it goes wrong?* |

`ARC-001` §7 establishes **why** the workflow engine owns orchestration and what it must never contain. That argument is complete and is not restated.

This guide supplies the operational layer: the three state machines, the event catalogue, the recovery taxonomy, scheduling policy, isolation guarantees, and the authoring and review discipline that makes a workflow definition a reviewable artifact rather than an accumulation of steps.

## 1.2 The two things a workflow is

**To the system, a workflow is the only place behaviour is visible as a whole.** Every other artifact is a fragment: an agent knows its own contract, a prompt knows its own rules, a contract knows its own shape. Only the workflow definition shows what actually happens, in what order, under what conditions, with what gates. It is the system's single readable description of itself.

**To the operator, a workflow is a durable state record.** The finished video is the deliverable, but the engine's real product is the state: what ran, what it produced, what it cost, what failed, what was approved, where it is now. Runs are long, suspensions are longer, and workers are ephemeral — so the state record is what persists, and everything about the engine is designed to keep it correct.

## 1.3 The consequence that shapes everything

Because orchestration is declarative and centralised, **a workflow's correctness is checkable before it ever runs** (§3.3). Every referenced agent resolvable, every path terminating, every fan-out bounded, every join declared, every gate placed, every cost ceiling set — all verifiable against a definition, without spending a token.

This is the practical payoff of `ARC-001` §7.2 and the reason authoring discipline matters. A defect caught in definition validation costs minutes. The same defect caught at runtime costs a partially-executed run, and in this domain a partially-executed run has already paid for inference, media generation, and possibly rendering.

## 1.4 Scope

**In scope.** Workflow philosophy and authoring principles; definition and run lifecycles; the engine's internal responsibilities; three state machines; how the engine invokes agents; validation sequencing; retry and escalation as engine operations; approval mechanics; the event catalogue; failure recovery; monitoring; scheduling; multi-workflow isolation; versioning; quality standards; review; anti-patterns; evolution.

**Out of scope.** Implementation, technology, interfaces, storage, agent internals (`GDE-002`), contract shapes (`GDE-003`), prompt content (`GDE-004`), and the definitions of individual workflows (each `WFL-nnn` specification).

---

# 2. Workflow Philosophy

Eight principles. Each states the rule, the reasoning specific to authoring, the failure it prevents, and its limit.

## 2.1 The Workflow Owns Orchestration

**Principle.** Every decision about what runs next, under what condition, with what bound, belongs to the workflow definition and nowhere else.

**Why, from the author's side.** `ARC-001` §7.2 argues this architecturally. The authoring consequence is a discipline: **if you find yourself wanting a component to decide what happens next, you have found a missing branch in your workflow.** The urge to let an agent "just decide" is always a signal that a condition exists which has not been expressed declaratively.

**Prevents.** Orchestration logic leaking into prompts, where it is unversioned as logic, untestable, and silently variable between models.

**Test.** Every execution edge appears in a definition. Zero edges exist anywhere else.

**Limit.** Genuine dynamism is available through a Planner-class agent producing a **plan artifact** that the engine validates against declared bounds and then executes (`ARC-001` §7.2). Planning becomes data — reviewable, boundable, replayable — rather than uncontrolled execution.

## 2.2 Agents Remain Independent

**Principle.** The workflow knows agents only as registry entries with contracts. Agents know nothing of the workflow.

**Why.** The independence runs both ways, and both directions matter. An agent that knows its position becomes coupled to one workflow and cannot be reused. An engine that knows what a script *is* becomes coupled to content and must be modified whenever content changes.

**Prevents.** The slow collapse where a general engine accumulates content-specific branches until it can no longer run any workflow but the one it grew around.

**Test.** Search the engine for domain vocabulary — script, thumbnail, hook, tag. Zero hits is the only acceptable result (`ARC-001` §7.7).

## 2.3 Stateless Execution, Durable State

**Principle.** Execution units hold no state. All state is persisted by the engine after every transition.

**Why.** Runs span hours; suspensions span days; workers are ephemeral and may be replaced mid-run. Nothing held in a process can be load-bearing, because the process will not be there.

**The authoring consequence — checkpoint discipline.** Every node boundary is a checkpoint. A run that fails at node twelve resumes at node twelve, not at node one. This is what makes failure affordable in a pipeline where the first eleven nodes have already paid for inference and media generation.

**Prevents.** Runs that cannot survive a deployment, a worker restart, or an approval that takes a weekend.

**Test.** Kill any worker at any moment. Every affected run resumes from its last checkpoint with no duplicated side effects.

## 2.4 Deterministic Workflow Execution

**Principle.** The same definition, the same pinned versions, and the same inputs produce the same execution path.

**Why.** Agents are stochastic; the orchestration around them must not be. Determinism here means: the graph is fixed, the conditions are evaluated on validated data, the bounds are declared, and the path taken is fully recorded and reproducible.

**Concretely, this forbids:** branching on unvalidated output; fan-out width derived from a model's response without a declared bound; conditions evaluated on values the schema does not constrain; and any ordering that depends on completion timing rather than declared sequence.

**Prevents.** Runs that cannot be explained because nobody can reconstruct why a particular path was taken.

## 2.5 Contract-First Communication

**Principle.** Everything crossing a node boundary is a validated contract (`GDE-003`).

**Why.** The engine is the one component that touches every artifact in the system. If it accepts anything unvalidated, malformed data propagates until it fails somewhere unrelated and undiagnosable.

**Authoring consequence.** A workflow is composed by **matching contracts**, not by matching intent. Node B consumes what node A produces because their contracts fit — not because the author knows they belong together.

**Prevents.** Workflows that work by shared understanding and break when either side is replaced.

## 2.6 Explicit State Transitions

**Principle.** Every state change is declared, recorded, and caused by a named event. There are no implicit transitions.

**Why.** During an incident, the question is always *"where is it and how did it get there?"* An implicit transition is one nobody recorded, and it is invariably the one that matters.

**Requirements.** Every transition names its trigger, its precondition, and its effect. Transitions not in the state machine are impossible, not merely discouraged. Every transition is persisted before it is acted upon.

**Prevents.** Runs in states nobody expected, and state that disagrees with reality after a crash.

## 2.7 Human Approval Support

**Principle.** Approval is a first-class node type, placeable anywhere, and suspension costs nothing.

**Why.** Because durable suspension consumes no resources (`ARC-001` §7.6), the usual trade-off between review and throughput does not exist here. This has a direct authoring consequence that authors consistently underuse:

> **Gates are cheap. Place them wherever a human decision has value, not only where it is unavoidable.**

The real cost of a gate is not resource consumption; it is **reviewer attention**, which is genuinely scarce. So gates are placed where a decision is meaningful and are given enough context to be decided in under a minute (§9.3).

**Prevents.** Both extremes: automation with no human authority over consequential acts, and gate proliferation that trains reviewers to approve without reading.

## 2.8 Replaceable Agents

**Principle.** A workflow references agents by identifier and version constraint, never by implementation.

**Why.** The workflow does not know which implementation it received and could not behave differently if it did (`ARC-001` §6.6). This is what makes agent replacement — including by a third-party implementation — a substitution rather than a migration.

**Authoring consequence.** Never write a workflow around a specific agent's quirks. A branch that exists because "this agent sometimes returns X" is a workaround that will silently become wrong when the agent is improved.

**Prevents.** Workflows that pin the platform to today's agent implementations.

---

# 3. Workflow Lifecycle

## 3.1 Two lifecycles, not one

A **definition** is authored once and lives for years. A **run** is created constantly and lives for hours or days. The brief's stages span both, and separating them is necessary because their stages, gates, and owners differ entirely.

```
  DEFINITION LIFECYCLE  (slow · authored · reviewed · versioned)
     Creation → Validation → Publication → Deprecation → Retirement
                                 │
                                 │ instantiates
                                 ▼
  RUN LIFECYCLE  (fast · created · executed · archived)
     Creation → Execution → Monitoring → Completion │ Failure → Recovery → Archival
```

## 3.2 Definition — Creation

**Work.** Identify the deliverable. Compose from existing agents and sub-workflows. Declare every node, edge, condition, bound, join, gate, budget, and deadline. Determine where validation applies. Place approval gates.

**Owner.** Workflow author.

**Exit gate.** The definition is complete and internally coherent.

**Authoring order that matters:** determine the **deliverable and its handoff boundaries first**, then the nodes. Workflows authored node-first accumulate steps and end up with no clear deliverable — which makes them impossible to review, because there is no statement of what "correct" means.

## 3.3 Definition — Validation

The stage that makes declarative orchestration worth its cost. A definition is validated **before publication**, without executing anything.

**Checks:**

| Check | Fails when |
|---|---|
| Reference resolution | Any referenced agent, sub-workflow, schema, validator, or rubric does not resolve |
| Contract compatibility | A node's output contract cannot satisfy its consumer's input contract |
| Graph acyclicity | Any cycle exists |
| Termination | Any path does not reach a terminal state |
| Reachability | Any node is unreachable, or any branch condition can never be true |
| Fan-out bounds | Any parallel node lacks a declared maximum width |
| Join semantics | Any join lacks declared semantics (§4.4) |
| Budget declaration | Cost ceiling or deadline missing |
| Gate placement | Any irreversible node lacks a preceding approval gate |
| Deprecation | Any referenced artifact is past end-of-support |

**Owner.** The platform, mechanically. Definition validation is automatic and non-negotiable.

**Exit gate.** All checks pass. A definition failing any check MUST NOT be publishable.

**Why this is the highest-value stage in the guide.** Every one of these defects would otherwise surface at runtime, after money has been spent. Contract incompatibility in particular is invisible to human review at any realistic workflow size and is trivially detectable mechanically.

## 3.4 Definition — Publication

**Work.** Register as an immutable version; record rationale; determine tenant availability and rollout.

**Rule.** Definitions are immutable per version. A change produces a new version; an existing version is never edited (`GDE-003` §2.7).

## 3.5 Definition — Deprecation and Retirement

**Deprecation.** Marked with a replacement and an end-of-support date. New runs warn; existing runs are unaffected. Usage is tracked.

**Retirement.** No new runs after the end-of-support date and after usage reaches zero. **The version remains resolvable forever** for replay and audit (`ARC-001` §6.2).

## 3.6 Run — Creation

**Work.** A run is requested by a trigger (§13.2). The engine creates the run record, then **resolves and pins every version**: workflow definition, agents, prompts, schemas, validators, rubrics, strategy, brand, locale, configuration (`ARC-001` §6.7).

**Exit gate.** All versions resolved; budget allocated; the run context is sealed (§4.2).

**The pin is the run's most important property.** After this moment, no deployment, promotion, or configuration change can alter this run's behaviour — including a run that suspends for a week at an approval gate.

## 3.7 Run — Execution

**Work.** Nodes dispatched per the definition; state persisted after every transition; validation invoked between stages; retry and escalation applied; budget and deadline enforced; declared side effects executed; suspension at gates.

**Owner.** The engine, exclusively.

## 3.8 Run — Monitoring

**Work.** Continuous observation of progress, cost against ceiling, elapsed time against deadline, node latency, retry and repair rates, and suspension age (§12).

**The signal most often missed:** a run suspended at an approval gate that nobody knows about. It consumes nothing, alerts nothing, and simply never finishes. Suspension age monitoring is mandatory (§12.5).

## 3.9 Run — Completion

**Work.** Final validation that the declared deliverable exists and is complete (§7.6); artifacts finalised; terminal state recorded; completion events emitted; final cost recorded.

**Rule.** A run is complete only when its **declared deliverable** exists. "Every node succeeded" is not completion — a workflow whose last node failed to produce its output has run to the end without finishing.

## 3.10 Run — Failure

**Work.** Terminal failure recorded with full context; **all partial artifacts preserved**; declared compensations executed (§11.5); escalation raised.

**Rules.** Failure leaves no partial side effects (`STD-000` §2.13). Partial artifacts are never discarded — they are the diagnostic material, and in many cases the basis for a cheap resume.

## 3.11 Run — Recovery

Not automatic. A failed run enters recovery through an operator or a policy decision, choosing among the strategies in §11.

**Rule.** Recovery decisions are recorded with actor and rationale. An unattributed recovery is indistinguishable from a defect.

## 3.12 Run — Archival

**Work.** After a retention interval, terminal runs archive: state and artifacts move to long-term retention; the run leaves active operational views.

**Rules.** Archival is not deletion. Archived runs remain resolvable for replay, audit, and attribution. Their lineage, cost records, and approval records are retained per their own retention policies (`GDE-003` §3.3), which are frequently longer than the run's.

---

# 4. Workflow Components

These are **responsibilities within the workflow engine** (`ARC-001` §4.7), not separate architectural components. Naming them separately makes the engine's internal boundaries reviewable and keeps concerns from bleeding into one another.

---

## 4.1 Workflow Definition

**Purpose.** The declarative, versioned specification of a process.

**Contains.** Nodes with types and contracts; edges with conditions; fan-out bounds; join semantics; validation placement; approval gates; retry posture where it differs from platform default; cost ceiling and deadline; the declared deliverable.

**Inputs.** Authored specification.
**Outputs.** A validated, immutable, publishable version.

**Boundaries.** Contains **no logic** — only declaration. Contains no domain knowledge about content. Contains no provider, model, or vendor reference (`STD-000` Rule 5).

---

## 4.2 Workflow Context

The concept most often implemented wrongly, and the one that most determines whether a workflow system stays comprehensible.

**Purpose.** The immutable, run-scoped bundle of everything resolved at run start.

**Contains.** All pinned versions; the tenant, channel, brand, locale, and strategy bindings; the run's correlation identifiers; the allocated budget and deadline; the trigger and its parameters.

**Inputs.** Resolution at run creation.
**Outputs.** A sealed context, referenced by every node and stamped into every artifact and telemetry record.

**Boundaries — the critical ones:**

- **The context is immutable.** It is sealed at run start and never modified. A node cannot write to it.
- **The context is not a data bus.** Artifacts produced by nodes are **not** placed into it. They are stored as artifacts and passed by reference to the nodes that declare a need for them.
- **Nodes do not read the context freely.** Each node receives the specific bindings its contract declares.

**Why this matters so much.** A mutable, freely-readable context is **shared mutable state** (§18.8) — the single most damaging pattern available in a workflow system. It destroys node independence, makes execution order load-bearing in undeclared ways, makes replay impossible, and turns every node into a potential cause of every downstream defect. The immutable-context discipline is what prevents a workflow engine from degenerating into a global variable with a scheduler attached.

---

## 4.3 Execution Engine

**Purpose.** Advance runs through their definitions.

**Responsibilities.** Determine the next executable nodes; dispatch to the appropriate resource class; await completion; invoke validation; apply retry policy; evaluate branch conditions on validated data; execute declared side effects; enforce budget and deadline; suspend and resume; drive terminal transitions.

**Inputs.** Definition; context; node results; validation results; approval decisions; scheduling triggers.
**Outputs.** Node dispatches; state transitions; events; terminal outcomes.

**Boundaries.** No domain knowledge. No prompts, no model invocation. Invokes validation but does not implement it. No tenant-specific branches — variation is definitions and configuration, never engine special cases.

---

## 4.4 State Manager

**Purpose.** Own the durable truth about every run.

**Responsibilities.** Persist state after **every** transition, before the transition is acted upon; enforce the state machine so invalid transitions are impossible; maintain node-level state and attempt history; hold suspension state durably; record idempotency keys; provide the authoritative answer to "where is this run?"

**Inputs.** Transition requests.
**Outputs.** Persisted state; transition rejections; the run's current position.

**Boundaries.** State is authoritative; **events are derived** (§10.6). A consumer that reconstructs state from events will eventually be wrong, because events can be delayed, duplicated, or missed while state cannot.

**The ordering rule.** State is persisted **before** the corresponding action is taken. Acting first and recording after produces, on crash, an action that happened with no record — which is exactly the case idempotency cannot repair, because nothing knows to look.

---

## 4.5 Validation Stage

**Purpose.** Invoke the validation plane at declared boundaries and act on the outcome.

**Responsibilities.** Determine which stages apply at this boundary; invoke them in cost order; interpret structured findings; map outcomes to engine actions — proceed, repair, regenerate, escalate, suspend, fail.

**Inputs.** Artifact; context bindings; declared validation placement.
**Outputs.** Outcome; findings; next-action determination.

**Boundaries.** Invokes; does not implement (`ARC-001` §9.3). Never overrides a fail-closed outcome. Never validates the same property twice at the same boundary (§18.6).

---

## 4.6 Retry Manager

**Purpose.** Own all retry, repair, and escalation decisions.

**Responsibilities.** Classify failures by category; maintain the three independent counters (`STD-000` §7.2); compute backoff with jitter; honour provider wait guidance; drive the escalation ladder; enforce deadline and cost ceiling as retry stoppers; route to dead-letter.

**Inputs.** Typed failures; validation findings; attempt history; budget and deadline state.
**Outputs.** Retry, repair, regenerate, escalate, suspend, or fail decisions; delayed re-dispatches.

**Boundaries.** **Agents contain no retry logic whatsoever** (`GDE-002` §10.1). The three counters are never conflated. No retry proceeds without a live deadline and a live budget.

---

## 4.7 Human Approval Stage

**Purpose.** Convert a workflow position into a human decision.

**Responsibilities.** Assemble the approval request with complete decision context; suspend the run durably; route to authorized reviewers; capture the decision with actor, timestamp, rationale, and exact artifact version; convert rejection into structured feedback; apply timeout, delegation, and escalation policy.

**Inputs.** Artifact and its version; validation findings; cost to date; the specific decision required.
**Outputs.** Recorded decision; resumption or redirection; audit entries.

**Boundaries.** Never proceeds without a decision. Never allows override of a policy or compliance failure (`STD-000` §6.8).

---

## 4.8 Analytics Stage

**Purpose.** Emit run-level measurement for the insight plane.

**Responsibilities.** Record per-node and per-run cost, tokens, latency, retry and repair counts, validation outcomes, approval turnaround, and final disposition — all attributed to the run's pinned versions.

**Inputs.** Node results; telemetry; cost records.
**Outputs.** Attributed measurement records.

**Boundaries.** Emits; does not aggregate, interpret, or act. The insight plane consumes (`ARC-001` §4.20). The attribution join is the entire value here — measurement that cannot be traced to pinned versions supports reporting but not learning.

---

## 4.9 Completion Stage

**Purpose.** Determine that a run is genuinely finished.

**Responsibilities.** Verify the declared deliverable exists and is complete; finalise artifacts; record the terminal state; emit completion events; record final cost against budget; release reservations.

**Inputs.** Run state; the declared deliverable specification.
**Outputs.** Terminal state; completion events; final records.

**Boundaries.** Completion is a **verified assertion, not the absence of remaining nodes** (§3.9).

---

# 5. Workflow State Machine

## 5.1 Three scopes

| Scope | Governs | Terminal? |
|---|---|---|
| **Definition** | A workflow version's availability | Retired |
| **Run** | One end-to-end execution | Completed / Failed / Cancelled → Archived |
| **Node** | One step within a run | Succeeded / Failed / Skipped |

Approval outcomes (`Approved` / `Rejected`) are **gate results**, not states in any of the three (§5.5).

## 5.2 Definition states

```
  DRAFT ──► VALIDATED ──► PUBLISHED ──► DEPRECATED ──► RETIRED
                                                         │
                                          (resolvable forever for replay)
```

| State | Meaning | Exit condition |
|---|---|---|
| `DRAFT` | Authored, not yet checked | Passes definition validation (§3.3) |
| `VALIDATED` | Mechanically checked; not yet available | Published |
| `PUBLISHED` | Available for new runs | Deprecated |
| `DEPRECATED` | Warns on new runs; existing runs unaffected | End-of-support reached and usage zero |
| `RETIRED` | No new runs; permanently resolvable | Never |

## 5.3 Run states

Canonical set per `ARC-001` §7.4, extended with `ARCHIVED`.

```
   CREATED
      │ resolve & pin all versions
      ▼
   RESOLVED ──────► CANCELLED
      │                 ▲
      │ begin           │
      ▼                 │
   RUNNING ─────────────┤
      │  ▲              │
      │  │ resume       │
      ▼  │              │
   SUSPENDED ───────────┤
      │                 │
      ├──► COMPLETED    │
      └──► FAILED ──────┘
             │
             │ recovery (§11) → RUNNING
             ▼
   [ COMPLETED | FAILED | CANCELLED ] ──► ARCHIVED
```

| State | Meaning | Resources held |
|---|---|---|
| `CREATED` | Requested; nothing resolved | None |
| `RESOLVED` | All versions pinned; budget allocated; context sealed | Budget reservation |
| `RUNNING` | Nodes dispatching and completing | Execution capacity |
| `SUSPENDED` | Durably paused — approval, timer, or quota deferral | **None** |
| `COMPLETED` | Deliverable verified | None |
| `FAILED` | Terminal failure; partial artifacts preserved | None |
| `CANCELLED` | Terminated by authority before completion | None |
| `ARCHIVED` | Terminal, moved to long-term retention | None |

**Invariants:**

1. `SUSPENDED` holds **no** execution resources. This is what makes indefinite waiting viable (`ARC-001` §7.6).
2. A run may enter `SUSPENDED` from `RUNNING` any number of times.
3. `COMPLETED` requires deliverable verification, not node exhaustion (§3.9).
4. `FAILED` and `CANCELLED` preserve all partial artifacts and leave no partial side effects.
5. Only `FAILED` may re-enter `RUNNING`, and only through an explicit, recorded recovery decision (§11).
6. Every transition is persisted before the corresponding action is taken (§4.4).
7. A run's pinned versions never change after `RESOLVED`.

## 5.4 Node states

```
   PENDING ──► READY ──► DISPATCHED ──► EXECUTING ──► VALIDATING
                                             ▲             │
                                             │             ├──► SUCCEEDED
                                    RETRYING ◄─────────────┤
                                             │             └──► FAILED
                                             └── repair / regenerate

   PENDING ──► SKIPPED        (branch condition not met)
   Any state ──► ABANDONED    (run cancelled or failed elsewhere)
```

| State | Meaning |
|---|---|
| `PENDING` | Dependencies not yet satisfied |
| `READY` | Dependencies satisfied; awaiting dispatch |
| `DISPATCHED` | Handed to execution capacity |
| `EXECUTING` | Work in progress |
| `VALIDATING` | Complete; validation running (§7) |
| `RETRYING` | Failed; retry, repair, or regeneration in progress (§8) |
| `SUCCEEDED` | Validated output produced |
| `FAILED` | Exhausted its budget of attempts |
| `SKIPPED` | Branch condition not met — a normal, recorded outcome |
| `ABANDONED` | Run terminated elsewhere |

**Invariants:**

1. `VALIDATING` is a distinct state, not part of `EXECUTING`. Node execution and its verification are separately timed, separately failed, and separately recorded (`ARC-001` §9.3).
2. `RETRYING` carries all three counters (`STD-000` §7.2), never a single merged count.
3. `SKIPPED` is recorded explicitly. A branch not taken is information; silently omitting the node makes the execution path unreconstructible.
4. Node failure does not automatically fail the run — the run's response depends on the node's declared failure policy and its join semantics (§11.6).

## 5.5 Approval gate outcomes

An approval gate is a node type. While awaiting a decision the **run** is `SUSPENDED` and the **node** is `EXECUTING`. The decision produces an outcome:

| Outcome | Effect |
|---|---|
| `APPROVED` | Node `SUCCEEDED`; run resumes on the declared path |
| `REJECTED` | Node outcome recorded; run routes to the declared rejection path with structured feedback (§9.4) |
| `ESCALATED` | Request re-routed to higher authority; run remains `SUSPENDED` |
| `EXPIRED` | Timeout policy applied — escalate or fail; **never** an implicit approval |

**`EXPIRED` MUST NOT default to approval under any circumstance.** A gate that approves by inaction is not a gate, and its presence is worse than its absence because it creates a false record of review.

---

# 6. Agent Execution Model

The engine's side of invoking an agent. The runtime's internal sequence is `ARC-001` §6.5; the agent's obligations are `GDE-002`. This section covers what the engine does around them.

## 6.1 Agent selection

The definition names an agent by **identifier and version constraint**. The engine resolves at run start (§3.6) and pins.

Resolution considers: the declared constraint; tenant pins; rollout policy; enablement; deprecation status. Resolution failure is a definition-validation failure, not a runtime error — which is why §3.3 checks it before publication.

**The engine never selects among agents by capability at runtime.** That would be orchestration decided at execution time, which is the thing centralisation exists to prevent (§2.1).

## 6.2 Context preparation

**The engine decides what each agent sees.** This is a genuine authoring responsibility and the most commonly underestimated one.

For each node, the engine assembles exactly the input the agent's contract declares: specific artifacts by reference or value; the subset of strategy, brand, and locale bindings the contract requires; task parameters; and, for repair invocations, the structured findings from the prior attempt.

**Rules:**

- Pass the **minimum** the contract declares (`GDE-002` §5.1). The engine has everything; that is precisely why restraint must be deliberate.
- Pass the **subset**, not the whole binding. A node needing typography rules receives typography rules, not the full brand kit.
- Never pass the run context wholesale (§4.2). "The agent might need it" is how context bloat begins, and it inflates cost on every invocation forever.
- Mark untrusted inputs as untrusted (`GDE-004` §13.3). The engine knows the provenance; the agent cannot infer it.

**Why the engine and not the agent decides.** Only the engine has the whole picture, so only the engine can enforce minimum context. An agent asked to select its own inputs would need access to everything — which is the capability grant the security model forbids (`ARC-001` §15.4).

## 6.3 Contract validation before dispatch

Input is validated against the pinned input schema **before** dispatch (`GDE-003` §12).

**Why before, emphatically.** Dispatching known-invalid input spends an invocation to discover something a mechanical check would have found for free. In a system where the invocation is the expensive part, pre-dispatch validation is among the highest-return checks available.

## 6.4 Execution

The engine dispatches to the resource class appropriate to the node type (§13.5), with the pinned context, and awaits a result. It does not stream, does not partially consume, and does not act on incomplete output (`STD-000` §11.4).

**The engine sets and enforces the node's deadline**, sized from measured p99 latency plus margin — never shorter than realistic completion time, since a timeout shorter than the work produces duplicate concurrent execution, which is the worst available outcome (`STD-000` §7.3).

## 6.5 Output validation

On return, the node enters `VALIDATING` (§5.4). The engine invokes the validation stages declared for this boundary (§7), interprets findings, and determines the next action.

**No output is consumed, stored as a consumable artifact, or branched upon before validation completes** (`STD-000` Rule 17).

## 6.6 Result storage

Validated output is stored as an **immutable, versioned artifact** with full provenance (`GDE-003` §3.3), and referenced by identifier thereafter.

**Rules:**

- Artifacts are stored, not held. Nothing produced by a node lives only in memory.
- Artifacts are referenced, not copied, by downstream nodes.
- **Artifacts are not placed into the run context** (§4.2). They are addressed by reference and passed to nodes that declare a need.
- Rejected and failed outputs are also retained — they are diagnostic material and evaluation-case candidates.

## 6.7 Declared side effects

An agent's output may **declare** an intended effect — a publication proposal, a spend recommendation, a notification (`GDE-002` §8.4). The engine, not the agent, decides whether to execute it.

Before executing any declared effect the engine verifies: policy permits it; approval exists where required; budget and quota permit it; an idempotency key is present; a durable pre-attempt record is written (`STD-000` §7.6).

**This is where `STD-000` Rule 38 is operationally enforced.** Model output reaches the world only through a gate the model cannot see or influence.

---

# 7. Validation Flow

Validation stages, their nature, and their boundaries are `STD-000` §6 and `ARC-001` §9. This section covers **sequencing within a run** and what the engine does with each outcome.

## 7.1 The engine's rule

> **Validate at the boundary where the property becomes checkable, exactly once, at the cheapest sufficient stage.**

Three parts, each preventing a distinct failure: *at the boundary* prevents deferred detection; *exactly once* prevents duplicate validation (§18.6); *cheapest sufficient* prevents spending a judge on structurally invalid output.

## 7.2 Pre-execution validation

**When.** Before the run begins — the definition validation of §3.3.

**Why it belongs here.** It is the only validation that costs nothing and catches the defects that are most expensive at runtime: unresolvable references, incompatible contracts, unbounded fan-out, missing joins, unreachable branches.

## 7.3 Input validation

**When.** Before every node dispatch (§6.3).

**Catches.** Malformed or incomplete input; unresolvable references; tenant scope violations; size-bound violations.

**Engine action on failure.** Do not dispatch. This is a **workflow defect**, not an agent failure — the engine assembled the input. It fails fast and does not retry, because retrying a defect delays discovery (`STD-000` §7.1).

## 7.4 Output validation

**When.** Immediately on node return, in the `VALIDATING` state.

**Sequence** (`STD-000` §6.1), cheapest first:

```
  Structural  → Business  → Consistency & grounding  → Quality  → Policy
  (mechanical)                                          (model)   (fail-closed)
```

**Engine action by outcome:**

| Outcome | Action |
|---|---|
| Passed | Store artifact; advance |
| Passed with warnings | Store; advance; record findings for trend analysis |
| Structural failure | **Repair** with structured findings (§8.4) |
| Business failure | Repair; escalate if repair budget exhausted |
| Quality failure | **Regenerate**; escalate if regeneration budget exhausted |
| Policy `BLOCKED` | **Halt. Escalate to human.** Never retried, never overridden |
| `INCONCLUSIVE` | **Halt. Escalate.** Never treated as a pass |

**Repair and regenerate are different responses** and the engine must not conflate them. A structural failure means the model produced the wrong shape — feed it the specific errors. A quality failure means the content was inadequate — re-rolling identical parameters is unlikely to help, so regeneration adjusts inputs or escalates.

## 7.5 Business and cross-artifact validation

**When.** At department handoffs and wherever a node's output must cohere with earlier artifacts.

**Why handoffs specifically.** That is where a complete, meaningful deliverable exists (`ARC-001` §9.2). Checking a fragment costs the same and tells you less, because "is this outline fragment good?" has no answer without the rest.

**Catches.** Strategy non-conformance; cross-artifact inconsistency; referential integrity failures; originality violations.

## 7.6 Completion validation

**When.** Before the run may enter `COMPLETED`.

**Verifies.** The declared deliverable exists; every required artifact is present and complete; every reference resolves; every required approval is recorded; policy clearance is present for anything published; cost is within ceiling.

**Why this stage exists separately.** Every node succeeding does not mean the run produced what it was for (§3.9). A workflow can execute every step correctly and still not have made a video — most commonly when a conditional branch skipped the node that produced the deliverable.

---

# 8. Retry Strategy

`STD-000` §7 is the law; `GDE-002` §10 gives the agent-side split. This section is the engine's operational model.

## 8.1 The division, restated once

| Level | Owns | Bounded by |
|---|---|---|
| **Agent** | Nothing (`GDE-002` §10.1) | — |
| **Runtime** | Bounded repair with structured findings | Repair counter |
| **Workflow engine** | Everything else — transport retry, regeneration, escalation, failover, human escalation, termination | All three counters, deadline, cost ceiling |

## 8.2 Eligibility

Determined **solely by error category** (`STD-000` §7.1), never by message text (`STD-000` Rule 29).

The engine's decision table is `STD-000` §7.1. Three operational emphases:

- **Validation failures are never plain retries.** Identical input produces a similar failure. They are repairs.
- **Quota exhaustion is a reschedule, not a retry.** The resource is gone until a reset boundary; retrying consumes capacity and worsens the condition (§13.7).
- **Policy refusals are never retried.** Retrying is futile and, where the refusal is policy-driven, is an evasion pattern that MUST NOT be attempted (`STD-000` §7.4).

## 8.3 Limits — three counters, never merged

```
  Transport attempts   ≤ 3   infrastructure-level failure
  Repair attempts      ≤ 2   validation errors fed back
  Escalations          ≤ 1   promotion to a more capable model or provider
  ─────────────────────────────────────────────────────────────
  PLUS, enforced independently and able to stop retries early:
  · total invocation cap per node
  · wall-clock deadline per node and per run
  · cost ceiling per node and per run
```

**Merging the counters is how a policy that reads "3 retries" becomes eighteen billed invocations** (`STD-000` §7.2). The engine tracks them separately and reports them separately.

**The independent limits matter as much as the counters.** Attempt limits do not bound time, and neither bounds cost. A node with attempts remaining but a breached cost ceiling stops.

## 8.4 Repair

The runtime re-invokes with the original input, the previous invalid output, and the **specific structured findings** — never the accumulated history of attempts (`STD-000` §7.4).

**Engine responsibilities:** enforce the repair counter; verify findings carry machine-readable paths, without which repair degenerates into regeneration; and detect **repeated failure on the same rule**, which indicates a prompt/schema contradiction rather than a transient problem and MUST be surfaced as a defect rather than absorbed by the retry budget.

## 8.5 Regeneration

For quality failures. Adjusts inputs or parameters within declared ranges and re-invokes.

**The engine MUST NOT raise temperature to obtain a different result.** That increases variance, not capability, and on structured tasks raises failure rate (`GDE-004` §16.9).

## 8.6 Escalation ladder

Applied in order, each rung recorded (`STD-000` §7.5):

```
  1. Transport retry with exponential backoff and full jitter
  2. Repair with structured findings
  3. Regeneration with adjusted inputs
  4. Escalation to a more capable model      (if the manifest permits and budget allows)
  5. Failover to an alternate provider        (if capability requirements are met)
  6. Human escalation with full context
  7. Terminal failure
```

Rungs 4 and 5 are constrained: model escalation respects the cost ceiling, since a more capable model is usually a more expensive one; provider failover never changes the output contract or business behaviour (`STD-000` §14).

## 8.7 Permanent failure

When the ladder is exhausted, the node `FAILED` and the engine applies the node's declared failure policy (§11.6).

**On terminal run failure:** all partial artifacts preserved; declared compensations executed (§11.5); the failure recorded with the complete attempt history, cost consumed, and last output; escalation raised with enough context to decide without investigation.

**Never** is a retry-exhausted failure reported as a success with degraded output (`STD-000` §7.8).

---

# 9. Human Approval Workflow

## 9.1 Why gates are cheap and attention is not

Durable suspension consumes no resources (`ARC-001` §7.6). The scarce resource is **reviewer attention**, and it is spent by every gate whether or not the gate was worth placing.

This inverts the usual instinct. Do not minimise gate count to protect throughput — throughput is unaffected. Minimise gate count to protect the reviewer's ability to actually review, and make each remaining gate decidable in under a minute.

## 9.2 Where to place gates

| Placement | Rationale |
|---|---|
| **Before any irreversible act** | Mandatory. Publishing, spending beyond threshold, external notification (`STD-000` Rule 37) |
| **At department handoffs** | A complete, reviewable deliverable exists here (`ARC-001` §5.7) |
| **Before an expensive stage** | Approving a script before media generation is far cheaper than rejecting a rendered video |
| **On risk triggers** | Low confidence, policy findings, originality warnings, first run of a new channel or a new agent version |
| **Strategy approval** | Mandatory and non-delegable (`ARC-001` §5.2) |

**The economic point in the third row is easy to miss.** A gate placed before the most expensive stage converts a rejection from an expensive loss into a cheap one — media generation and rendering dominate production cost (`ARC-001` §4.16), so a script gate is worth far more than a gate after rendering.

## 9.3 What an approval request must carry

A reviewer must decide correctly in under a minute **from the request alone** (`ARC-001` §2.8). It carries:

- The artifact, in reviewable form, with its exact version.
- **The specific decision required** — not "review this," but the question being asked.
- Validation findings, including warnings that did not block.
- Provenance: which agent and prompt versions produced it.
- Cost consumed so far, and cost that this decision commits.
- Relevant context: the governing strategy elements, prior related decisions.
- What happens on approval, and what happens on rejection.

**A gate whose request lacks these produces rubber-stamping**, which is worse than no gate: it consumes attention and creates a false record of review (`ARC-001` §2.8).

## 9.4 Rejection and feedback

**The most important mechanic in this section.**

Rejection MUST return **structured feedback** — what was wrong, where, and what would make it acceptable — not a bare decision.

**Why.** A rejection that says only "no" forces full regeneration, teaches the system nothing, and gives the next attempt no better chance than the last. Structured rejection feedback:

- routes into a repair or regeneration path as findings (§8.4);
- becomes an evaluation case, so the failure is caught mechanically next time (`STD-000` Rule 56);
- feeds the human-rejection-rate dataset with categorised reasons — the highest-signal quality dataset the platform produces (`STD-000` §13.6).

**Rejection paths are declared in the definition**, exactly like success paths. A rejection with nowhere to go is a run that fails at a gate that was supposed to improve it. Typical routings: back to the producing node with findings; back to an earlier department; to a variant path; or to terminal cancellation.

## 9.5 Resume

On approval, the run leaves `SUSPENDED` and resumes from its checkpoint with pinned versions unchanged (§3.6) — even if the approval took a week and the platform was deployed twice in the interim.

**Approval covers a specific artifact version.** Any change to the artifact after approval invalidates it. Approving a video is not approving a moving target (`ARC-001` §12.3).

## 9.6 Timeout, delegation, escalation

Every gate declares its timeout policy: duration, escalation target, and terminal behaviour.

**`EXPIRED` MUST NOT approve** (§5.5). Permitted terminal behaviours are escalate, cancel, or fail — never proceed.

Delegation is permitted where policy allows and is recorded with both the delegating and the deciding actor.

## 9.7 Manual overrides

An operator may override some automated outcomes. The boundaries are strict:

| Overridable | Not overridable |
|---|---|
| Quality validation failure | **Policy or compliance failure** (`STD-000` §6.8) |
| Originality warning | **Security finding** |
| Cost ceiling, with authorization | **The requirement for approval on an irreversible act** |
| Scheduling deferral | **Tenant isolation** |

Every override requires explicit authorization and a **recorded reason**, and is audited (`ARC-001` §4.14). An override without a reason is indistinguishable from a defect and destroys the audit value of the gate it bypassed.

## 9.8 Audit trail

Every approval event records: actor identity; timestamp; decision; rationale; the **exact artifact version**; the validation findings visible at decision time; and any override with its justification.

The trail is append-only, never sampled, and retained per compliance obligation (`STD-000` §9.8). Its purpose is to answer, years later, *who decided this, on what basis, and what exactly did they see?*

---

# 10. Event Model

## 10.1 What events are for

Events **announce** that something happened, to an unknown set of interested parties (`GDE-003` §3.3). They drive notification, monitoring, analytics ingestion, and operator surfaces.

They are **not** control flow. The engine advances runs from **state**, never from events (§10.6).

## 10.2 Run events

| Event | Emitted when | Primary consumers |
|---|---|---|
| `RUN_CREATED` | Run requested | Monitoring |
| `RUN_RESOLVED` | Versions pinned; budget allocated | Monitoring, cost |
| `RUN_STARTED` | First node dispatched | Monitoring, operator surfaces |
| `RUN_SUSPENDED` | Entered suspension, with reason | Monitoring, **suspension-age tracking** |
| `RUN_RESUMED` | Left suspension | Monitoring |
| `RUN_COMPLETED` | Deliverable verified | Analytics, notification, downstream triggers |
| `RUN_FAILED` | Terminal failure | Alerting, analytics, recovery queue |
| `RUN_CANCELLED` | Terminated by authority | Monitoring, audit |
| `RUN_ARCHIVED` | Moved to long-term retention | Retention management |

## 10.3 Node events

| Event | Emitted when | Primary consumers |
|---|---|---|
| `NODE_DISPATCHED` | Handed to execution capacity | Progress tracking |
| `NODE_COMPLETED` | Validated output produced | Progress, cost, analytics |
| `NODE_SKIPPED` | Branch condition not met | Path reconstruction |
| `NODE_FAILED` | Attempt budget exhausted | Alerting, analytics |
| `VALIDATION_FAILED` | Any validation stage failed | **Quality trend analysis** — highest-value signal |
| `RETRY_STARTED` | Retry, repair, or regeneration begun, with counter type | Retry-rate monitoring |
| `RETRY_COMPLETED` | Retry concluded, with outcome | Retry-rate monitoring |
| `ESCALATED` | Escalation ladder rung entered | Alerting, cost |

## 10.4 Approval events

| Event | Emitted when | Primary consumers |
|---|---|---|
| `APPROVAL_REQUESTED` | Gate reached; run suspended | **Notification** — delivery failure here stalls the run indefinitely |
| `APPROVAL_RECEIVED` | Decision recorded | Monitoring, audit, turnaround metrics |
| `APPROVAL_ESCALATED` | Re-routed to higher authority | Alerting |
| `APPROVAL_EXPIRED` | Timeout policy applied | **Alerting** — always investigated |

## 10.5 Effect events

| Event | Emitted when |
|---|---|
| `EFFECT_PROPOSED` | An agent declared an intended effect |
| `EFFECT_EXECUTED` | The engine executed it, post-gate |
| `EFFECT_REJECTED` | Policy, budget, or quota declined it |
| `COMPENSATION_EXECUTED` | A compensating action ran (§11.5) |

## 10.6 Event rules

1. **Events are notifications, never instructions.** No recipient's behaviour is required for the producer's correctness (`GDE-003` §3.3).
2. **State is authoritative; events are derived.** A consumer that reconstructs state from events will eventually be wrong — events can be delayed, duplicated, or missed, while state cannot. Consumers needing truth read state.
3. **The engine never advances a run in response to an event it emitted.** That would make the engine's correctness depend on its own event delivery, converting a notification channel into a critical path.
4. **Events are small** — identifiers and references, not payloads. A consumer needing the artifact resolves the reference under its own authorization.
5. **Events carry the full correlation chain** (`ARC-001` §8.4).
6. **Delivery is at-least-once**, so consumers are idempotent (`GDE-003` §12.6). Duplicate delivery is expected behaviour, not an error.
7. **Emission never blocks execution.** A failure to publish an event does not fail a run — with one operational caveat: `APPROVAL_REQUESTED` notification failure produces a permanently stalled run, so notification delivery for that event is itself monitored and alerted (§12.5).

---

# 11. Failure Recovery

## 11.1 The recovery decision

Failure is normal in a system spanning many external dependencies. What matters is choosing the right recovery, and the choices differ sharply in cost.

```
  Is the failure cause resolved?
      NO  → do not recover yet. Fix the cause. Recovery into a broken
            dependency wastes the attempt and delays diagnosis.
      YES ↓
  Are completed artifacts still valid?
      YES → RESUME       (cheapest — reuses everything already paid for)
      NO  → is only part invalidated?
              YES → PARTIAL RE-EXECUTION  (re-run the affected subgraph)
              NO  → RESTART               (most expensive — last resort)

  Independently: did any side effect occur that must be undone?
      YES → COMPENSATE   (always, regardless of the strategy above)
```

## 11.2 Resume

**The default and strongly preferred strategy.** The run continues from its last checkpoint; completed nodes are not re-executed.

**Possible because** state is persisted after every transition and artifacts are durable (§2.3). This is the direct payoff of checkpoint discipline.

**Why it matters so much here.** In this domain the completed portion of a run has already paid for inference, media generation, and possibly rendering. Restarting discards all of it. Resume is frequently the difference between a failure costing cents and costing dollars — multiplied across every run in a bad hour.

**Preconditions.** The cause is resolved; completed artifacts remain valid; pinned versions remain resolvable — which they always are, since versions are never deleted (§3.5).

## 11.3 Restart

A fresh run from the beginning. **The most expensive option and the last resort.**

**When justified.** Inputs were wrong. Pinned versions were wrong. Artifacts are corrupt or invalidated. The failure cause invalidates everything downstream of it.

**Rules.** A restart is a **new run** with a new identifier, referencing the original. It never reuses the failed run's identity — reusing it would conflate two executions in every record derived from them. Prior artifacts are retained for comparison and diagnosis.

## 11.4 Rollback

**Rollback of state is available. Rollback of the world is largely not — and pretending otherwise is the trap.**

| Reversible | Not reversible |
|---|---|
| Run state to a checkpoint | A published video |
| Discarding an artifact | Money spent on inference |
| Releasing a budget reservation | Consumed publishing quota |
| Releasing a quota reservation | An external notification sent |
| — | Anything an audience has seen |

Because the right-hand column dominates the consequential acts, **compensation is the real mechanism** (§11.5), and prevention through gates (§9.2) matters more than recovery.

## 11.5 Compensation

For side effects that occurred and cannot be undone, the workflow declares a **compensating action** — something that mitigates rather than reverses.

Examples of the *category*: unlisting rather than un-publishing; issuing a correction record rather than deleting the original; releasing a reservation; notifying affected parties; marking an artifact superseded rather than removing it.

**Rules:**

1. **Every irreversible node declares its compensation, or declares explicitly that none exists.** An undeclared compensation is a gap discovered during an incident, which is the worst time to design one.
2. Compensations execute in **reverse order** of the effects they compensate.
3. Compensations are themselves **idempotent** — they will be retried.
4. Compensation failure is a serious incident requiring human intervention, never a silent condition.
5. Every compensation is recorded as an event and an audit entry (§10.5).

**The honest framing:** compensation acknowledges that some things cannot be undone and defines the best available response. A workflow whose recovery plan assumes reversibility has no recovery plan for the acts that matter most.

## 11.6 Partial execution and node failure policy

Node failure does not automatically fail a run. Every node declares a failure policy:

| Policy | Behaviour | Typical use |
|---|---|---|
| `FAIL_RUN` | Terminal run failure | Nodes producing the deliverable |
| `FAIL_BRANCH` | This branch fails; siblings continue to the join | Parallel per-item work |
| `SKIP_AND_CONTINUE` | Record and proceed | Genuinely optional enrichment |
| `SUBSTITUTE` | Use a declared fallback artifact | Non-critical assets with acceptable defaults |
| `ESCALATE` | Suspend for human decision | Ambiguous or high-consequence cases |

**Join semantics are declared and are inseparable from this** (§4.4): all-must-succeed, best-effort-with-declared-minimum, or first-acceptable. A join without declared semantics produces inconsistent partial results and is a definition-validation failure (§3.3).

**Worked example of why the minimum matters.** A fan-out generating twelve scene visuals where two fail: `all-must-succeed` fails the run and discards ten paid-for generations; `best-effort-with-minimum-ten` proceeds. Neither is universally right — but the choice must be **declared**, because an undeclared join makes the outcome depend on which items happened to fail.

## 11.7 Dead-letter handling

Work exhausting its budget of attempts moves to a dead-letter position per resource class (`ARC-001` §4.10).

**Rules.** Every queue has dead-letter handling with alerting. Dead-lettered items retain full context — the run, the node, the attempt history, the failures. They are triaged, not accumulated: a growing dead-letter volume is an unmonitored systemic failure. Triage outcomes are recover, discard with a recorded reason, or escalate as a defect. **Silent dead-lettering is prohibited** — it converts a loud failure into a lost one.

---

# 12. Monitoring

Platform observability standards are `STD-000` §9. This section covers what is specific to workflow operation.

## 12.1 Progress

Progress is genuinely hard to express here, because nodes differ in cost and duration by orders of magnitude — a classification node and a render node are not comparable units.

**Therefore progress is reported as structured position, never as a single percentage:**

- Current node and its state.
- Nodes completed, skipped, and remaining.
- Current department or stage.
- Elapsed time against deadline.
- Cost consumed against ceiling.
- Suspension state and reason, if suspended.

**A single percentage is misleading and MUST NOT be the primary indicator.** Node count says nothing about remaining work when one remaining node dominates the run's cost.

## 12.2 Cost

Tracked live, per node and cumulatively, against the run's ceiling (`ARC-001` §4.22).

**Forecast, not only actual.** A run at sixty percent of its ceiling with the expensive stages still ahead is in trouble, and reporting only consumption hides that until the ceiling is breached. Forecasting uses the definition's declared per-node budgets against the remaining path.

Cost is attributed to tenant, channel, run, node, agent, and prompt version — enabling detection of cost regression at the version that introduced it.

## 12.3 Tokens

Input, output, cached, and reasoning tokens per invocation and aggregated per run (`STD-000` §9.3).

Beyond cost, token trends reveal what cost alone hides: rising input tokens indicate context bloat (`GDE-004` §12.3); rising output tokens indicate loosening constraints; falling cached tokens indicate a broken cacheable prefix (`GDE-004` §12.4), which raises cost with no visible cause.

## 12.4 Latency

Per node and end-to-end, at p50 and p95, **including queue wait time**.

**Queue wait is the most commonly missed component of end-to-end latency** (`ARC-001` §9.6). A pipeline that appears fast per node can be slow overall because work sits waiting for capacity, and traces that omit queue time make this invisible.

## 12.5 Health signals

| Signal | Watch for | Why |
|---|---|---|
| **Suspension age** | Runs suspended beyond expected duration | A run waiting on an approval nobody knows about consumes nothing, alerts nothing, and never finishes. **This is the most commonly missed operational failure in gated workflows** |
| Stalled nodes | `EXECUTING` beyond p99 plus margin | Distinguishes a slow dependency from a lost work item |
| Queue depth **and age** | Growth in either | Depth alone hides slow-moving starvation (`STD-000` §11.5) |
| Dead-letter volume | Any growth | A systemic failure nobody is triaging |
| Approval turnaround | Lengthening | Reviewer capacity is a throughput constraint |
| Notification delivery | Failures on `APPROVAL_REQUESTED` | Failure here stalls runs indefinitely (§10.6) |

## 12.6 Success and failure rates

Tracked per workflow version, per node, and per pinned agent and prompt version.

**Failure taxonomy matters more than the aggregate rate.** "Five percent of runs fail" is not actionable. "Five percent fail at the compliance gate, up from one percent since prompt version X" identifies both the problem and its cause.

Tracked separately: run success rate; per-node failure rate; validation failure rate by rule; retry and repair rates; escalation rate; human rejection rate with categorised reasons.

## 12.7 Quality trends

The signals that reveal degradation before it reaches an audience (`STD-000` §9.6):

- **Validation failure rate per rule, per prompt version** — the earliest available signal of a prompt regression.
- **Repair rate** — rising repair rate precedes rising failure rate.
- **Human rejection rate with categorised reasons** — the highest-signal quality dataset available, because it captures what automated validation cannot yet detect.
- **Originality findings** — rising similarity indicates content convergence.
- **Cost per finished video** — the measure that matters commercially.
- **Post-publish performance joined to pinned versions** — the only measure reflecting the actual objective (`ARC-001` §13.2).

**A quality regression with no corresponding version change indicates external drift** — a model revision or an input distribution shift — and MUST be investigated rather than absorbed (`GDE-004` §14.6).

---

# 13. Scheduling

## 13.1 What scheduling reconciles

Four constraints, frequently in conflict, resolved in this order:

```
  1. QUOTA         hard  — publishing capacity is finite and shared (§13.7)
  2. RATE LIMITS   hard  — provider limits are external and non-negotiable
  3. PRIORITY      soft  — interactive and unblocked work before bulk
  4. TIMING        soft  — audience-optimal publication time, channel cadence
```

Hard constraints defer; soft constraints reorder. A publication cannot be moved past a quota limit but can be moved within a timing window.

## 13.2 Triggers

| Trigger | Use |
|---|---|
| **Immediate** | Operator-initiated; approval resumption; recovery |
| **Scheduled** | Channel cadence; seasonal plans; a specific publication time |
| **Recurring** | Continuous obligations — analytics ingestion, health checks |
| **Event-driven** | Reactions to platform state — a completed run triggering a dependent one |
| **Backlog-driven** | Fill available capacity from a prioritised queue |

**Rule.** Triggers create runs; they never modify running ones. A trigger firing while a prior run is active either creates a concurrent run or is suppressed by a declared concurrency policy (§13.6) — never merged into the existing run.

## 13.3 Scheduled execution

A scheduled run is created at its scheduled time, then resolves and pins (§3.6). It does not resolve at scheduling time — a run scheduled a week ahead must pin the versions current when it *runs*, not when it was scheduled.

Schedules carry a timezone as an IANA identifier alongside the UTC instant (`STD-000` §5.7). Audience-timing schedules are meaningless without it, and DST transitions turn naive local times into a scheduling defect twice a year.

## 13.4 Queue execution and priority

Work is dispatched through durable queues segregated by resource class (`ARC-001` §4.10). Priority governs ordering within a class:

| Priority | Work |
|---|---|
| **Interactive** | Operator-initiated; anything a human is waiting on |
| **Unblocked** | Runs resuming from approval — a human has already invested attention |
| **Standard** | Normal scheduled production |
| **Bulk** | Backfill, re-render, batch analytics |

**Approval-resumed work is prioritised above standard** deliberately. A reviewer who approves and then waits behind a batch queue experiences the system as slow at exactly the moment their attention was most valuable.

**Priority MUST NOT permit starvation.** Low-priority work ages into higher effective priority; without ageing, bulk work never runs on a busy platform.

## 13.5 Resource classes

Nodes declare their class; classes have independent capacity and concurrency (`ARC-001` §4.10). Typical classes: fast inference, long inference, speech synthesis, image generation, video generation, rendering, publishing, analytics.

**Mixing classes means the slowest work starves the fastest and one saturated dependency degrades everything** (`STD-000` §11.5). A multi-minute render and a sub-second classification must never share a pool.

## 13.6 Concurrency

Declared at multiple scopes, each enforced independently: per resource class; per provider credential (the real binding constraint); per tenant, for fairness; per channel, to prevent one channel monopolising a tenant's allocation; and per run, bounding internal fan-out.

**Workflow-level concurrency policy** — what happens when a trigger fires while a prior run is active — is declared per workflow: allow concurrent, queue, skip, or cancel-and-replace. Undeclared concurrency policy produces duplicate work under load.

## 13.7 Rate limiting and quota

**Provider rate limits** are applied as a **global constraint per credential**, not per worker. Local rate limiting across many workers does not produce a global limit — it produces a violation at a rate proportional to worker count.

**Publishing quota** is different in kind and is the platform's most distinctive scheduling constraint. It is finite, externally imposed, resets on the provider's schedule, and is **shared across all tenants on one credential** (`ARC-001` §12.4).

Scheduling consequences:

- Quota is **accounted before attempting**, never inferred from failures.
- Publishing is scheduled **against known remaining capacity**.
- Exhaustion **defers to the next reset window** — visibly, never silently, and never as a failure of a completed video.
- **Headroom is reserved** for retries and priority work, so bulk publishing cannot consume the capacity time-sensitive publication needs.
- An explicit **fairness policy** governs allocation across tenants. Without one, a single high-volume tenant consumes the day's capacity and starves every other.

**Quota is a first-class scheduling input, not an error condition.** A design treating it as an error handles the common case as an exception.

---

# 14. Multi-Workflow Support

## 14.1 The isolation guarantee

Many runs execute concurrently across many channels and tenants. The guarantee:

> **No run can observe, affect, or degrade any other run, except through explicitly modelled shared resources.**

Three qualifiers, each doing work: *observe* is a security property; *affect* is a correctness property; *degrade* is a fairness property. Systems commonly get the first two right and the third wrong.

## 14.2 Context separation

Each run has its own sealed, immutable context (§4.2). There is **no shared context, no global state, and no cross-run channel**.

A run's artifacts are addressed by reference within its own scope. One run cannot read another's artifacts except where a definition explicitly declares a reference to a prior run's output — an explicit, validated, tenant-scoped dependency, never ambient access.

## 14.3 Tenant separation

Tenant isolation is a **security boundary** enforced structurally at every layer (`ARC-001` §15.2), not by each component remembering to filter.

At the workflow layer: every run is tenant-scoped from creation; every artifact reference resolves within its tenant scope; a cross-tenant reference is a `SECURITY` error that escalates immediately (`GDE-003` §12.4); telemetry, cost, and cache entries are tenant-scoped.

## 14.4 Shared resources

Only three things are genuinely shared, and each is explicitly modelled:

| Resource | Shared across | Governed by |
|---|---|---|
| **Provider rate limits** | All tenants on a credential | Global per-credential limiting (§13.7) |
| **Publishing quota** | All tenants on a credential | Accounting plus fairness policy (§13.7) |
| **Execution capacity** | All tenants | Per-tenant concurrency limits and priority ageing (§13.6) |

**Everything else is isolated.** Where a fourth shared resource appears in a future design, it requires explicit fairness treatment before it ships — shared resources without fairness policy are noisy-neighbour incidents waiting for a busy day.

## 14.5 Parallel execution

**Between runs.** Unbounded in principle, limited by capacity and per-tenant concurrency. Runs never coordinate.

**Within a run.** Bounded fan-out with declared width and declared join semantics (§11.6). **Fan-out width is never derived unbounded from model output** (`STD-000` §11.6) — a model returning five hundred items becomes five hundred billed generations if nothing catches it. Schema bounds catch it before dispatch.

## 14.6 Fairness

The property most easily overlooked, because it only manifests under load:

- Per-tenant concurrency caps prevent one tenant consuming all capacity.
- Priority ageing prevents starvation (§13.4).
- Publishing quota fairness prevents monopolisation of the shared allowance.
- Per-run cost ceilings prevent a runaway run consuming a tenant's budget.
- Resource-class segregation prevents one workload type starving another.

Fairness is tested under load, not assumed. It is invisible when the platform is quiet and decisive when it is not.

---

# 15. Workflow Versioning

## 15.1 Identity and version

A workflow has a stable identifier that never changes, and semantic versions beneath it (`GDE-003` §7). Renaming creates a new workflow with no history.

## 15.2 What constitutes a breaking change

| Change | Version | Reasoning |
|---|---|---|
| Add an optional node on a new branch | MINOR | Existing paths unaffected |
| Add a gate | **MAJOR** | Changes the run's completion profile and operator expectations |
| Remove or reorder nodes on an existing path | **MAJOR** | Execution path changes |
| Change a node's agent version constraint | MINOR or MAJOR by effect | Depends on whether output could differ noticeably |
| Change join semantics | **MAJOR** | Failure behaviour changes |
| Change fan-out bounds | **MAJOR** | Cost and failure profile change |
| Change the cost ceiling or deadline | MINOR | No behavioural change to the graph |
| Change the declared deliverable | **MAJOR** | The workflow's purpose changed |
| Change validation placement | **MAJOR** | Quality profile changes |
| Documentation or naming only | PATCH | No behavioural change |

**Adding a gate is breaking**, which surprises authors. It changes throughput, introduces an indefinite suspension point, and changes what operators must monitor — all of which downstream expectations depend on.

## 15.3 Compatibility

A workflow version is compatible with specific agent, schema, and validator versions, all recorded on it. Definition validation verifies compatibility before publication (§3.3), which is why version incompatibility can never surface at runtime.

## 15.4 In-flight runs

**Runs never migrate.** A run started under version *N* completes under version *N*, including a run suspended at a gate for a week (`ARC-001` §6.7).

There is no mechanism to move a running run to a new definition version, and this is deliberate: migrating a partially-executed run would mean reconciling completed state against a graph that may no longer contain those nodes. The complexity is unbounded and the failure modes are silent.

**The operational consequence:** a new version affects only new runs. Rollout is therefore inherently gradual, and the safe rollout of a workflow change is simply the passage of time.

## 15.5 Migration

Migration is of **future runs**, not existing ones. A new version is published; new runs use it; existing runs drain naturally.

Migration guidance accompanies every major version: what changed, what operators will observe differently, what monitoring changes, and how to roll back.

## 15.6 Rollback

Rollback is a **registry repin** requiring no deployment (`GDE-004` §10.6). New runs resolve the prior version; in-flight runs are unaffected because they were already pinned.

**Rollback triggers.** Run failure rate rising; cost per run rising without justification; approval rejection rate rising; a node failing at a rate its prior version did not; any defect discovered post-publication.

**Rollback is never blocked by "we would lose the improvements."** The improvements are in a retained version and can be re-published once diagnosed.

---

# 16. Workflow Quality Standards

## 16.1 Reliability

| Metric | Target | Meaning |
|---|---|---|
| Run success rate | ≥ 95% excluding deliberate gate rejections | Runs reaching their deliverable |
| Unexplained failure rate | 0 | Every failure classified; `UNKNOWN` is a taxonomy defect (`STD-000` §8.2) |
| Runs lost to worker failure | 0 | Checkpointing works |
| Duplicate side effects | 0 | Idempotency works |
| Silent dead-lettering | 0 | Every dead-letter alerts and is triaged |

Gate rejections are excluded deliberately. A workflow whose gates reject is a workflow whose gates are working; counting that as failure creates pressure to weaken the gates.

## 16.2 Throughput

| Metric | Target |
|---|---|
| Concurrent runs per tenant | Meets declared capacity targets |
| Queue age p95, per resource class | Within declared bounds |
| Approval turnaround p50 | Within the channel's declared expectation |
| Starvation events | 0 — every priority class progresses |

## 16.3 Recoverability

| Metric | Target |
|---|---|
| Failed runs resumable rather than restart-only | ≥ 90% |
| Irreversible nodes with declared compensation | 100% |
| Compensations verified idempotent | 100% |
| Mean time to recover | Within declared bounds |
| Runs unrecoverable due to lost state | 0 |

**Resumability is the single most valuable reliability property in this domain**, because the completed portion of a run has already paid for the expensive work (§11.2).

## 16.4 Determinism

| Metric | Target |
|---|---|
| Execution path reproducible from pinned versions and inputs | 100% |
| Branches evaluated on unvalidated data | 0 |
| Unbounded fan-out | 0 |
| Undeclared join semantics | 0 |
| Transitions outside the state machine | 0 |

## 16.5 Maintainability

| Metric | Target |
|---|---|
| Definitions passing full definition validation | 100% |
| Domain vocabulary in the engine | 0 occurrences |
| Tenant-specific engine branches | 0 |
| Node count within declared complexity bounds | 100% |
| Duplicated sub-graphs not extracted as sub-workflows | 0 |
| Declared deliverable stated | 100% |

**Node count is a genuine complexity signal.** A definition too large to review as a whole will not be reviewed as a whole, and its next change will introduce an interaction nobody predicted. Extract sub-workflows.

## 16.6 Scalability

| Metric | Target |
|---|---|
| Throughput scaling with added capacity | Roughly linear until an external limit binds |
| Externally-bound limits explicitly modelled | 100% |
| Per-tenant isolation under load | Verified by test, not assumed |
| Global state | 0 |
| Suspended runs consuming execution resources | 0 |

## 16.7 Definition of done

A workflow is done when: it is declarative and versioned; every node's failure policy and every join's semantics are declared; every fan-out is bounded; approval gates are placed with sufficient context; the cost ceiling and deadline are declared; the deliverable is declared and verified at completion; every irreversible node declares its compensation; it passes definition validation; and it has been exercised end to end **including its failure and rejection paths**.

That final clause is the one most often skipped. An untested failure path should be assumed broken.

---

# 17. Workflow Review Checklist

Applied before publishing any workflow definition, and for any major version. Every item passes or carries a recorded, time-limited waiver.

## Gate 1 — Purpose and structure

- [ ] The declared deliverable is stated explicitly (§3.2)
- [ ] The workflow has a single coherent purpose
- [ ] Node count within complexity bounds; repeated sub-graphs extracted as sub-workflows (§16.5)
- [ ] Every node has a declared type and contract
- [ ] Department handoffs identifiable and aligned to boundaries (`ARC-001` §5.7)
- [ ] No domain logic in the definition that belongs in an agent or a deterministic component

## Gate 2 — Graph correctness

- [ ] Every referenced agent, sub-workflow, schema, validator, and rubric resolves (§3.3)
- [ ] Every producer's output contract satisfies its consumer's input contract
- [ ] Graph is acyclic
- [ ] Every path terminates
- [ ] No unreachable node; no branch condition that can never be true
- [ ] Every branch condition evaluates on **validated** data only (§2.4)
- [ ] No referenced artifact is past end-of-support

## Gate 3 — Bounds

- [ ] Every fan-out declares a maximum width (§14.5)
- [ ] No fan-out width derived from model output without a schema bound
- [ ] Every join declares its semantics (§11.6)
- [ ] Cost ceiling declared for the run
- [ ] Wall-clock deadline declared for the run and for long-running nodes
- [ ] Per-node budgets sum within the run ceiling
- [ ] Total invocation cap declared where retries could multiply

## Gate 4 — Context and agent invocation

- [ ] Each node receives only what its contract declares (§6.2)
- [ ] Context bindings passed as subsets, not wholesale
- [ ] Run context is not used as a data bus (§4.2)
- [ ] Untrusted inputs marked as untrusted
- [ ] Input validated before dispatch (§6.3)
- [ ] Node deadlines sized from measured p99 plus margin (§6.4)
- [ ] Agents referenced by identifier and version constraint, never by implementation (§2.8)
- [ ] No branch exists as a workaround for a specific agent's quirks

## Gate 5 — Validation placement

- [ ] Validation placed at the boundary where each property becomes checkable (§7.1)
- [ ] No property validated twice at the same boundary (§18.6)
- [ ] Structural validation on every node output
- [ ] Business and consistency validation at department handoffs (§7.5)
- [ ] Policy and compliance validation before every irreversible act
- [ ] Completion validation verifies the declared deliverable (§7.6)
- [ ] Fail-closed outcomes cannot be overridden (§9.7)

## Gate 6 — Retry and failure

- [ ] Retry posture declared; deviations from platform default justified (§8.3)
- [ ] Three counters tracked separately, never merged
- [ ] Deadline and cost ceiling can stop retries independently of attempt counts
- [ ] Every node declares a failure policy (§11.6)
- [ ] Repair distinguished from regeneration (§7.4)
- [ ] No retry on policy refusals, auth, configuration, or contract errors
- [ ] Dead-letter handling present with alerting (§11.7)

## Gate 7 — Approval gates

- [ ] Every irreversible node has a preceding gate (§9.2)
- [ ] Gates placed before expensive stages where rejection is plausible
- [ ] Every gate's request carries complete decision context (§9.3)
- [ ] Every gate declares a rejection path (§9.4)
- [ ] Rejection returns structured feedback, not a bare decision
- [ ] Every gate declares timeout policy
- [ ] **No gate approves on expiry** (§5.5)
- [ ] Override boundaries respected; policy and compliance not overridable (§9.7)

## Gate 8 — Side effects and recovery

- [ ] Every side effect is engine-executed from a declared proposal, never agent-performed (§6.7)
- [ ] Every side-effecting node carries an idempotency key
- [ ] Durable pre-attempt record written before every irreversible act
- [ ] **Every irreversible node declares its compensation, or declares that none exists** (§11.5)
- [ ] Compensations are idempotent and ordered in reverse
- [ ] The workflow is resumable from every checkpoint (§11.2)

## Gate 9 — Scheduling and concurrency

- [ ] Every node declares its resource class (§13.5)
- [ ] Workflow concurrency policy declared (§13.6)
- [ ] Priority class appropriate; approval-resumed work prioritised (§13.4)
- [ ] Publishing nodes are quota-aware and defer rather than fail (§13.7)
- [ ] Scheduled triggers carry a timezone identifier alongside the UTC instant (§13.3)
- [ ] Per-tenant concurrency limits respected

## Gate 10 — Isolation

- [ ] Every run tenant-scoped from creation (§14.3)
- [ ] No cross-tenant reference possible
- [ ] No shared mutable state anywhere (§18.8)
- [ ] No global state
- [ ] Cross-run references, if any, are explicit, validated, and tenant-scoped (§14.2)

## Gate 11 — Observability

- [ ] Every node emits its declared events (§10)
- [ ] Correlation chain propagates to every event and artifact
- [ ] Cost attributed per node and per run (§12.2)
- [ ] Suspension age monitored and alerted (§12.5)
- [ ] Progress reported as structured position, not a single percentage (§12.1)
- [ ] Failure taxonomy sufficient to distinguish causes (§12.6)

## Gate 12 — Governance

- [ ] Definition passes automated definition validation in full (§3.3)
- [ ] Version registered immutably with rationale
- [ ] Compatible agent, schema, and validator versions recorded (§15.3)
- [ ] Rollback target identified and known compatible (§15.6)
- [ ] Exercised end to end **including failure and rejection paths** (§16.7)
- [ ] Owner named; reviewer named and review recorded

---

# 18. Workflow Anti-Patterns

### 18.1 Agents calling agents

**Appears as.** A prompt instructing a model to consult another agent; an output field naming what should run next; a specification listing agents as dependencies.

**Harmful because.** It reintroduces every failure centralised orchestration prevents — invisible graphs, unbounded cost, unattributable failure, orchestration expressed in prose (`ARC-001` §7.2).

**Detect.** Any agent name in a prompt, an output field, or a dependency list.

**Fix.** The dependency is an **artifact and a contract**, never an agent. Sequencing belongs to the definition.

---

### 18.2 Circular execution

**Appears as.** A branch returning to an earlier node without a bound; a revision loop with no maximum; two sub-workflows invoking each other.

**Harmful because.** Unbounded cost and non-termination. In a system where each iteration costs real money, an unbounded loop is a financial incident.

**Detect.** Acyclicity checking in definition validation (§3.3).

**Fix.** Bounded iteration expressed as a declared, counted construct — generate → critique → revise with a maximum, where **the bound belongs to the engine, never to the agents** (`ARC-001` §7.5).

---

### 18.3 Hidden state

**Appears as.** Behaviour depending on execution order that is not declared; a node reading something no contract mentions; retry behaviour differing by attempt in undeclared ways.

**Harmful because.** Execution becomes unreproducible and failures unexplainable. Hidden state is the reason a run behaves differently on replay with identical inputs.

**Detect.** Replay a run from its pinned versions. Any divergence indicates hidden state.

**Fix.** Every input declared; every transition recorded; nothing ambient.

---

### 18.4 The mega-workflow

**Appears as.** One definition of eighty nodes covering ideation through publication and analytics, because it is all one process.

**Harmful because.** It cannot be reviewed as a whole, so it is not reviewed as a whole. A failure anywhere touches the entire graph. It cannot be versioned partially — a change to publication re-versions ideation. Reuse is impossible.

**Detect.** Node count beyond complexity bounds; a definition nobody reads end to end.

**Fix.** Extract sub-workflows at department boundaries. Compose rather than concatenate.

---

### 18.5 A workflow that knows about content

**Appears as.** Branch conditions inspecting script text; node names encoding content decisions; engine logic understanding what a thumbnail is.

**Harmful because.** The engine becomes coupled to content and must change whenever content changes — which is the coupling `ARC-001` §7.7 forbids, and it accumulates until the engine can run only the workflow it grew around.

**Detect.** Domain vocabulary anywhere in the engine or in branch conditions.

**Fix.** Branch on **validated structured fields** produced by agents — an enumerated classification, a boolean flag — never on content interpretation performed by the engine.

---

### 18.6 Duplicate validation

**Appears as.** The same property checked at three boundaries "to be safe."

**Harmful because.** Cost multiplied for no additional information; ambiguity about which check is authoritative; and — most damaging — when a rule changes, the copies diverge and behaviour becomes position-dependent.

**Detect.** The same rule identifier appearing at multiple boundaries in one definition.

**Fix.** Validate at the boundary where the property becomes checkable, once (§7.1). Later boundaries validate *new* properties, never re-validate settled ones.

---

### 18.7 Business logic inside agents

**Appears as.** Quota arithmetic, threshold comparison, scheduling calculation, or format selection performed inside a prompt.

**Harmful because.** Deterministic logic in a prompt is the worst available location for it: non-deterministic, expensive, unversioned as logic, untestable, and silently variable between models (`GDE-002` §15.5).

**Detect.** Arithmetic or conditional business rules in prompt text.

**Fix.** **If it can be computed, it must not be prompted.** Deterministic logic belongs in deterministic nodes.

---

### 18.8 Shared mutable context

**Appears as.** A run context that nodes write into; artifacts accumulated in a bag every node can read; a "state object" passed down the graph and mutated.

**Harmful because.** This is the most damaging pattern available in a workflow system. Node independence is destroyed; execution order becomes load-bearing in undeclared ways; replay becomes impossible; every node becomes a potential cause of every downstream defect; and the engine degenerates into a global variable with a scheduler attached.

**Detect.** Any write path into the run context. Any node reading data no contract declares.

**Fix.** Immutable sealed context (§4.2). Artifacts stored and passed by reference to nodes that declare a need.

---

### 18.9 Infinite or unbounded retries

**Appears as.** Retry with no attempt limit; retry loops with no deadline; retry with no cost ceiling; retrying a policy refusal.

**Harmful because.** Unbounded cost, delayed discovery of real defects, and sustained load on an already-degraded dependency.

**Detect.** Any retry path without all three of attempt limit, deadline, and cost ceiling.

**Fix.** Three counters plus independent deadline and cost enforcement (§8.3).

---

### 18.10 Missing checkpoints

**Appears as.** State persisted only at coarse boundaries; long node sequences with no intermediate durability; state written after the action rather than before.

**Harmful because.** Failure forces restart, discarding everything already paid for — and in this domain that is the expensive part. Writing state after acting produces, on crash, an action with no record, which idempotency cannot repair because nothing knows to look.

**Detect.** Failed runs that can only restart rather than resume (§16.3).

**Fix.** Persist after every transition, before acting (§4.4).

---

### 18.11 Approval gates without context

**Appears as.** A gate presenting an artifact and two buttons.

**Harmful because.** The reviewer must reconstruct context to decide, so they will not — they will approve. This is worse than no gate: it consumes attention and creates a false record of review (§9.3).

**Detect.** Any gate whose request lacks the decision required, validation findings, provenance, or consequences.

**Fix.** Complete decision context, decidable in under a minute.

---

### 18.12 Undeclared join semantics

**Appears as.** A fan-out and join with no statement of what happens when some branches fail.

**Harmful because.** The outcome depends on which items happened to fail, which makes behaviour non-deterministic in exactly the way §2.4 forbids. Two runs with the same inputs produce different results.

**Detect.** Definition validation (§3.3).

**Fix.** Declare all-must-succeed, best-effort-with-minimum, or first-acceptable — explicitly, per join.

---

### 18.13 Copy-paste workflow variants

**Appears as.** Six near-identical definitions differing in one node, because a channel needed something slightly different.

**Harmful because.** Divergence is inevitable and invisible — five get updated, one does not. Every fix must be applied six times, and eventually will not be.

**Detect.** Definitions with high structural similarity.

**Fix.** Parameterise with configuration, or extract shared sub-workflows and compose. Variation belongs in data, not in duplicated definitions (`STD-000` Rule 6).

---

# 19. Future Expansion

## 19.1 Why workflows extend safely

Three properties, each established elsewhere, combine:

1. **Definitions are declarative data**, so a new workflow is a new definition, never a new component (`ARC-001` §15.3).
2. **Definitions are immutable and versioned**, so a new version disturbs nothing existing.
3. **Runs pin at start**, so no change affects work in flight (§15.4).

Together: workflows can be added and changed continuously with no coordination and no maintenance window.

## 19.2 New agents

**Adds.** Nothing to existing workflows. A new agent is unreferenced until a definition chooses it (`GDE-002` §16.1).

**To adopt.** A new workflow version referencing it, passing definition validation, published for new runs.

**If adopting an agent requires changing the engine, the agent's contract is wrong** — the engine knows agents only as contracts.

## 19.3 New departments

**Adds.** New agents, new handoff contracts, new sub-workflows, new gate placements.

**Changes.** Nothing structurally. Departments are organisational, not runtime (`ARC-001` §5.1).

**Composition.** A new department becomes a sub-workflow inserted at the appropriate handoff boundary. Existing sub-workflows are unaffected because they communicate through contracts.

## 19.4 Multiple AI providers

**Adds.** Nothing at the workflow layer.

**Changes.** Nothing. Definitions declare agents and capabilities; provider resolution happens beneath the abstraction (`ARC-001` §4.9).

**The test.** If a workflow must change to accommodate a provider, the abstraction leaked — and the leak, not the workflow, is the defect (`STD-000` §14.6).

## 19.5 Multiple rendering engines

**Adds.** Engine capability declarations.

**Changes.** Nothing. A render node consumes a manifest; engine selection is capability matching beneath it (`GDE-003` §11.3).

**Note.** Because manifests are engine-neutral and permanently retained, a **re-render workflow** — a short definition that resolves a stored manifest and executes it on a different engine or at a different format — is a legitimate new workflow requiring no changes to production workflows. This is one of the highest-value new workflow types available (`ARC-001` §11.7).

## 19.6 Multiple publishing platforms

**Adds.** Platform capability descriptors; publishing sub-workflow variants; per-platform quota accounting.

**Changes.** Nothing in production workflows. Format variants derive from the existing manifest; destination specificity lives in descriptors and adapters (`ARC-001` §12.5).

**Composition.** Multi-destination publication is a bounded fan-out over destinations with declared join semantics — typically best-effort-with-minimum, since one destination's quota exhaustion should not block the others.

## 19.7 Additional workflow types

The engine is deliberately domain-blind, so new workflow types require no engine change. Types the current model already supports:

| Type | Purpose |
|---|---|
| **Re-render** | New format or engine from a stored manifest, with no inference (§19.5) |
| **Republish** | Existing media to an additional destination |
| **Correction** | Targeted repair of a published artifact, with compensation |
| **Backfill** | Retrospective processing over historical artifacts |
| **Strategy review** | The slow strategy loop, gated and human-approved (`ARC-001` §5.2) |
| **Experiment** | Controlled variant production for growth testing |
| **Evaluation** | Scheduled agent and prompt evaluation runs |
| **Maintenance** | Health checks, index rebuilds, retention enforcement |

Each is a definition. None requires new components.

## 19.8 What would require changing this model

Stated honestly, so a future engineer can recognise having left the design rather than extended it:

- **In-flight run migration.** Reconciling partial state against a changed graph has unbounded complexity and silent failure modes (§15.4).
- **Agent-directed orchestration.** Contradicts `ARC-001` §7.2 and would forfeit the cost, security, and reproducibility model entirely.
- **Mutable shared context.** Would reintroduce §18.8 as an architectural feature.
- **Cross-tenant workflows.** Would breach `ARC-001` §15.2, the platform's most absolute boundary.
- **Real-time interactive orchestration.** The model is asynchronous, durable, and gate-oriented; interactive editing is a different system.

Each is possible. None is an extension. All would require an ADR and amendments to `STD-000`, `ARC-001`, and this guide.

---

# Appendix A — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial workflow orchestration guide: eight principles, separated definition and run lifecycles, nine engine responsibilities including the immutable workflow context, three state machines with transition tables and invariants, engine-side agent execution model, validation sequencing, operational retry model with three counters, approval mechanics with structured rejection feedback, event catalogue, recovery taxonomy centred on resume and compensation, workflow-specific monitoring including suspension-age detection, scheduling with quota as a first-class input, multi-workflow isolation and fairness, versioning with no in-flight migration, quality targets, twelve-gate review checklist, thirteen anti-patterns, and evolution paths. |

---

*End of document — GDE-005 v1.0. Governed by STD-000 v1.0. Situated by ARC-001 v1.0. Companion to GDE-002 v1.0, GDE-003 v1.0, and GDE-004 v1.0.*

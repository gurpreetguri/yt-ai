# AI YouTube Automation Platform
## System Architecture
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `ARC-001` |
| Title | System Architecture |
| Version | 1.0 |
| Status | Active |
| Governed by | [`000-project-engineering-standards.md`](000-project-engineering-standards.md) (`STD-000 v1.0`) |
| Owner | Platform Architecture |
| Audience | All engineers, architects, and extension publishers |
| Review cadence | Quarterly, or on any change to the department model or plane boundaries |

**Relationship to the standards document.**
`STD-000` defines *the rules everything must obey*. This document defines *the structure that obeys them*. Where a rule already exists in `STD-000`, this document cites it by section rather than restating it. Where this document appears to conflict with `STD-000`, `STD-000` wins (`STD-000` §Document Control, Rule 57), and the conflict is a defect in this document.

**Scope.**
This is a logical architecture. It describes components, responsibilities, boundaries, and interactions. It deliberately names no language, framework, database, queue, storage product, model vendor, or rendering engine. Those are implementation decisions, recorded separately as ADRs (`STD-000` §12.8), and every one of them must be replaceable without altering this document.

**Requirement language.** RFC 2119 keywords carry the meanings defined in `STD-000` §Document Control.

---

# 1. Architecture Overview

## 1.1 The organizing metaphor

The platform is structured as a **production company**, not as a pipeline of functions.

A production company has departments. Each department owns a stage of the work, holds distinct expertise, produces a defined deliverable, and hands that deliverable to the next department under an agreed standard. Departments do not reach into each other's work. A producer coordinates; the departments execute. An editorial standard governs everyone.

The architecture maps directly onto that structure:

| Company concept | Architectural concept |
|---|---|
| Department | A bounded group of agents sharing a stage and a deliverable (§5) |
| Specialist | An agent — one responsibility, one contract (`STD-000` §3) |
| Producer | The workflow engine — the sole owner of coordination (§7) |
| Editorial standard | The channel strategy contract, binding on every production agent (§5.2) |
| Quality control | The validation plane, independent of the specialists it checks (§9) |
| Executive sign-off | The approval service — human authority over irreversible acts (§4.14) |
| Business analytics | The insight plane, closing the loop back to strategy (§13) |

The metaphor is not decoration. It produces the two structural rules that shape everything else: **specialists do not assign work to each other**, and **the people who check the work are not the people who did it**.

## 1.2 Three planes

The system separates into three planes with different lifecycles, different failure characteristics, different scaling profiles, and different security postures. This separation is the primary structural decision of the architecture.

**Control Plane — what the system *is*.**
Registries, contracts, configuration, identity, policy, budgets, and credentials. Changes deliberately and infrequently, under review. Read constantly, written rarely. Its correctness determines whether execution is even meaningful, since it holds every version identifier that makes a run reproducible.

**Execution Plane — what the system *does*.**
Workflow execution, agent invocation, media generation, rendering, and publishing. High volume, bursty, long-running, heterogeneous in resource profile, and the only plane that spends money or touches the outside world. Entirely stateless in its compute; all durable state lives elsewhere.

**Insight Plane — what the system *learns*.**
Telemetry, cost accounting, quality measurement, published performance, and the derived signals that feed strategy. Append-dominant, tolerant of latency, intolerant of gaps. It is the only plane that closes the loop from outcome back to decision.

Execution never modifies the Control Plane. Insight never modifies either. A run resolves its configuration from the Control Plane **once, at start**, and is pinned to that resolution for its entire life (`STD-000` Rule 50) — so a deployment or a strategy edit mid-run cannot change what that run is doing.

## 1.3 Two clocks

Most naive designs for this domain fail by assuming one cadence. The platform runs on three, and conflating them is what makes such systems rigid.

| Loop | Period | Question it answers | Output |
|---|---|---|---|
| **Strategy loop** | Weeks to quarters | *What should this channel be?* | An approved, versioned strategy contract |
| **Production loop** | Hours to days | *What is the next video, and is it good?* | A published video |
| **Learning loop** | Continuous, evaluated periodically | *Did what we believed turn out to be true?* | Evidence proposed back into the strategy loop |

Strategy is therefore **not a stage of the production pipeline**. It is a slow-moving governing artifact that the fast-moving production loop reads and conforms to. Treating strategy as step one of video creation would mean re-deciding a channel's identity on every video — expensive, unstable, and destructive to the brand consistency that audiences respond to.

The learning loop closes into the *strategy* loop, not directly into production. Analytics does not silently retune a prompt; it produces evidence that a human, or a strategy-class agent under approval, acts upon. This preserves the auditability of why a channel changed direction.

## 1.4 The freeze point

The production loop contains one architecturally critical transition: the **render manifest** (`STD-000` §15.7).

Everything upstream of it is stochastic, expensive, and slow — model inference, generation, judgment. Everything downstream is deterministic, comparatively cheap, and repeatable — media assembly and encoding.

The manifest is the frozen, complete, engine-neutral description of the finished video. Once it exists and has been approved, the creative decisions are settled. The video can then be re-rendered at a different resolution, in a different aspect ratio, with a corrected asset, for a different destination platform, or on an entirely different rendering engine — **without re-running a single model invocation.**

This single boundary is what makes multi-format publishing, cost-efficient correction, and engine replacement possible. It is the highest-leverage structural decision in the platform, and §11 and §16 protect it.

## 1.5 What flows through the system

Work moves as **immutable, versioned, validated artifacts**, never as mutable shared state. Each stage consumes prior artifacts and produces new ones; nothing is edited in place.

Strategy contract → research dossier → topic brief → narrative outline → script → packaging set → scene plan → generated media assets → render manifest → rendered video → publication record → performance record.

Every artifact carries provenance (`STD-000` §5.6). Every artifact is validated before the next stage may consume it (`STD-000` Rule 17). Every artifact is content-addressed and retained, so any published video is fully reconstructible from its inputs (`STD-000` Rule 48).

## 1.6 Architectural philosophy in one paragraph

**Concentrate variability; standardize everything around it.** Language models are the only genuinely unpredictable component in the system. They are therefore confined to narrow, contract-bound agents, wrapped in a uniform runtime, checked by an independent validation plane, and denied any ability to act on the world. Everything surrounding them — orchestration, contracts, validation, storage, rendering, publishing, measurement — is deterministic, versioned, observable, and dull. The platform's reliability comes not from making models behave, but from ensuring that nothing depends on them behaving.

---

# 2. Architectural Goals

Each goal states what it means structurally, and how the architecture is judged against it. These are the criteria by which any future change to this architecture is assessed.

## 2.1 Scalability

**Means.** Capacity grows by adding execution units, along each axis that actually grows: tenants, channels, concurrent runs, media generation, rendering, and publishing.

**Structurally.** All execution is stateless (`STD-000` §3.3); durable state lives in the storage plane. Work is distributed through a durable work fabric segregated by resource class (§4.10), because model invocation, media generation, and rendering share no resource profile and must never share a pool. Concurrency is governed by external provider limits applied as a global constraint, not by local per-worker optimism.

**Judged by.** Adding execution capacity increases throughput until an external limit binds — and that limit is explicitly modeled, observable, and scheduled against rather than discovered through failure.

## 2.2 Replaceability

**Means.** Every component can be replaced in isolation: an agent, a prompt, a model, a provider, a validator, a rendering engine, a publishing destination, a storage category.

**Structurally.** Everything meaningful is a registry entry behind a declared contract (§14). Agents never reference each other (`STD-000` Rule 2). Rendering consumes an engine-neutral manifest. Publishing operates from a platform capability descriptor. Model selection resolves at runtime from a capability profile.

**Judged by.** Replacing any single component requires changes only to that component and to configuration — never to its peers, and never to the core.

## 2.3 Maintainability

**Means.** An engineer arriving in year three can navigate the system from its documents.

**Structurally.** Every agent has the same shape, the same contract form, the same error model, the same telemetry, and the same specification template (`STD-000` §12.7). Departments give the agent population a comprehensible map. Uniformity is deliberately preferred over local optimisation.

**Judged by.** Having understood one department and one agent, an engineer can work in any other without assistance.

## 2.4 AI Independence

**Means.** No business decision anywhere in the system depends on which model or vendor produced a result.

**Structurally.** The six-layer isolation of `STD-000` §14.1 is realised as the AI abstraction layer (§3.5): agents declare capability requirements, a router resolves them into a concrete model at runtime under policy, and adapters normalize every behavioural difference beneath that line. No vendor or model identifier exists above the router except as recorded provenance.

**Judged by.** Adding a provider requires an adapter and configuration only, with the full evaluation suite passing and zero diffs elsewhere (`STD-000` §14.6).

## 2.5 Multi-Channel Support

**Means.** Channels are the primary operational unit, and they differ from each other in every dimension that matters — strategy, brand, locale, cadence, format mix, risk tolerance, and destination platform.

**Structurally.** Every channel binds to a versioned strategy contract, a brand kit, a locale, and a workflow selection. Every production agent receives that binding as explicit input and is validated against it. Nothing about a channel is expressed in logic (`STD-000` Rule 6).

**Judged by.** Onboarding a channel is a data operation. It requires no deployment and touches no code.

## 2.6 Multi-Tenant Support

**Means.** Independent organisations operate on shared infrastructure with no possibility of observing or affecting one another.

**Structurally.** Tenancy is a security boundary enforced by the platform at every layer — storage, work distribution, caching, model context, telemetry, and cost (`STD-000` Rule 42). Isolation is enforced structurally, not by each call site remembering to filter. Per-tenant budgets, quotas, and rate allocations prevent one tenant's load or spend from degrading another's.

**Judged by.** No path exists by which one tenant's data enters another tenant's execution, context, cache, or telemetry.

## 2.7 Auditability and Reproducibility

**Means.** Every published video can be explained completely, after the fact, without access to anyone's memory.

**Structurally.** Runs pin all versions at start. Every artifact carries provenance. Every model invocation is recorded in full (`STD-000` §9.3). Every approval records actor, rationale, and the exact artifact version. Every cost is attributable.

**Judged by.** Any question about any published video — what decided this, which prompt version, what did it cost, who approved it, what strategy governed it — is answerable from records alone.

## 2.8 Cost Governability

**Means.** Cost is a designed, bounded, enforced property, not an emergent monthly surprise.

**Structurally.** Budgets are declared per agent, per run, and per tenant, and enforced by the runtime rather than trusted to components (`STD-000` §11.2). Cost is attributable to tenant, channel, run, node, agent, and prompt version. The freeze point (§1.4) removes inference cost from the correction and re-format paths entirely.

**Judged by.** The cost of a finished video is predictable before the run starts and enforced during it.

## 2.9 Safety and Compliance by Construction

**Means.** The system cannot publish something unreviewed, undisclosed, or unrights-cleared, because no path exists to do so.

**Structurally.** Publishing consumes only validated, approved artifacts — never live model output. Policy gates fail closed. Agents hold no publishing capability. Disclosure and rights state are structural properties of artifacts, checked at the publish gate (`STD-000` Rules 36–38, 44).

**Judged by.** Removing every human from the system produces a system that halts at the gates, not one that publishes freely.

## 2.10 Evolvability

**Means.** The known growth axes — agents, workflows, providers, engines, platforms, languages, brands, third parties — are additive.

**Structurally.** Every one of them is a registry with a versioned contract (§14). Extension points are enumerated and documented; anything extended outside them is a fork.

**Judged by.** Growth along a known axis modifies no existing component.

---

# 3. System Layers

Layers are **logical responsibility bands**, not deployment units. Dependencies point strictly downward and inward; no layer reaches past its neighbour. Three layers are explicitly cross-cutting and are drawn as vertical concerns rather than horizontal bands, because they apply at every level.

```
┌──────────────────────────────────────────────────────────────┐
│  L1  INTERACTION LAYER                                       │
│      Operator surfaces · approval surfaces · programmatic    │
│      access · notifications                                  │
├──────────────────────────────────────────────────────────────┤
│  L2  GOVERNANCE LAYER            (Control Plane)             │
│      Tenancy · identity · authorization · policy · strategy  │
│      contracts · budgets · quota allocation · registries     │
├──────────────────────────────────────────────────────────────┤
│  L3  WORKFLOW LAYER                                          │
│      Orchestration · run state · scheduling · approval gates │
│      retry policy · cost enforcement · sole owner of         │
│      composition                                             │
├──────────────────────────────────────────────────────────────┤
│  L4  AGENT LAYER                                             │
│      Departments 0–4 · agent runtime · prompt rendering ·    │
│      repair loop                                             │
├──────────────────────────────────────────────────────────────┤
│  L5  AI ABSTRACTION LAYER                                    │
│      Capability profiles · model router · provider adapters  │
├──────────────────────────────────────────────────────────────┤
│  L6  MEDIA & ASSET LAYER                                     │
│      Asset lifecycle · provenance & rights · media           │
│      generation coordination · manifest compilation          │
├──────────────────────────────────────────────────────────────┤
│  L7  RENDERING LAYER                                         │
│      Deterministic manifest execution · output QC            │
├──────────────────────────────────────────────────────────────┤
│  L8  PUBLISHING LAYER                                        │
│      Scheduling · quota accounting · platform adapters ·     │
│      publication records                                     │
├──────────────────────────────────────────────────────────────┤
│  L9  ANALYTICS & FEEDBACK LAYER   (Insight Plane)            │
│      Performance ingestion · attribution · insight synthesis │
├──────────────────────────────────────────────────────────────┤
│  L10 STORAGE LAYER                                           │
│      Logical storage categories (§10)                        │
└──────────────────────────────────────────────────────────────┘

  Cross-cutting (apply at every layer):
  ▌ VALIDATION PLANE      — independent, invoked by L3, never by L4
  ▌ OBSERVABILITY PLANE   — telemetry, cost ledger, audit
  ▌ SECURITY PLANE        — isolation, secrets, capability enforcement
```

## L1 — Interaction Layer

**Responsibility.** All human and programmatic entry into the system. Operator surfaces for configuring tenants, channels, brands, strategies, and workflows; approval surfaces where humans exercise authority; observation surfaces for runs, costs, and performance; programmatic access for automation and, later, third parties; and outbound notification.

**Boundaries.** Holds no business logic and makes no decisions. It expresses intent and renders state. It never invokes agents, never touches provider credentials, and never bypasses the governance layer.

**Notable property.** Approval surfaces are architecturally significant, not incidental. A reviewer must be able to decide correctly in under a minute from the request alone (`STD-000` §2.8); therefore the approval surface must present the artifact, its context, its validation findings, and its provenance together. A poor approval surface converts human authority into rubber-stamping, which is worse than having no gate.

## L2 — Governance Layer

**Responsibility.** Everything that defines what the system *is* rather than what it is doing right now: tenant and channel identity; user identity and authorization; the strategy contracts that govern production; brand kits; locale configuration; policy rules; budgets and quota allocation; and all registries (agent, prompt, schema, workflow, validator, provider, engine, platform, brand, locale).

**Boundaries.** Read constantly by every other layer; written only through reviewed, audited operations. Never in the request path of a model invocation except as a cached, pinned resolution. Contains no execution state.

**Notable property.** This layer is the single source of every version identifier that makes a run reproducible. If it is wrong, every downstream record is unreliable, no matter how carefully collected.

## L3 — Workflow Layer

**Responsibility.** The **only** layer permitted to compose work. It resolves a workflow definition, pins every version, sequences nodes, dispatches work, persists state after every transition, applies retry and escalation policy (`STD-000` §7), invokes validation between stages, suspends at approval gates, enforces cost ceilings and deadlines, and terminates runs safely.

**Boundaries.** Knows agents only as registry entries with contracts. Contains no domain knowledge about scripts, thumbnails, or SEO — a workflow layer that understands content is a workflow layer that will need modifying every time content changes.

**Notable property.** Suspension at an approval gate is durable and free: a run may wait days without consuming execution resources or degrading (§7.6). This is what makes human authority practical at scale rather than a throughput ceiling.

## L4 — Agent Layer

**Responsibility.** All domain intelligence, organised into departments (§5). Each agent transforms validated input into validated output under a declared contract (`STD-000` §3). The agent runtime, shared uniformly by all agents, renders prompts, invokes the AI abstraction layer, applies the bounded repair loop, and emits telemetry.

**Boundaries.** Agents are pure. They never call each other (`STD-000` Rule 2), never cause external side effects (Rule 4), never hold credentials, never reach the publishing or storage layers directly, and never decide what runs next.

**Notable property.** Agents *declare* intended effects as output; the workflow layer decides whether to execute them. "Publish this at 14:00" is a proposal in a data structure, not an action. This is what makes every agent trivially retryable and what keeps model output from ever authorizing anything (Rule 38).

## L5 — AI Abstraction Layer

**Responsibility.** Convert a provider-neutral capability requirement into a concrete model invocation, and normalize everything about the response. Routing under policy, budget, availability, tenant restriction, and measured quality; adapters that absorb every behavioural difference between vendors; uniform token, cost, error, refusal, and truncation semantics (`STD-000` §14.3).

**Boundaries.** The vendor containment line. No layer above it may name a provider or model, except in recorded provenance.

**Notable property.** Providers differ in whether they can enforce output structure natively. The abstraction guarantees *uniform behaviour, not uniform mechanism* — validated structured output emerges above this layer regardless of what the vendor beneath it can do.

## L6 — Media & Asset Layer

**Responsibility.** The lifecycle of every non-textual artifact: generation coordination across speech, image, video, and music providers; content-addressed storage and deduplication; provenance and rights records; brand-kit asset resolution; reuse and similarity search; and compilation of the render manifest from the scene plan and resolved assets.

**Boundaries.** Owns media *as data*. It does not decide creative content — that is the agent layer — and it does not execute rendering — that is the rendering layer.

**Notable property.** Rights and provenance are captured at creation time, because they are impossible to reconstruct after a claim (`STD-000` §1.5). An asset without provenance is unusable by construction, not merely discouraged.

## L7 — Rendering Layer

**Responsibility.** Deterministic execution of a render manifest into finished media, followed by automated output quality control.

**Boundaries.** The most tightly constrained layer in the system. It consumes a manifest and referenced assets and produces media. It makes no creative decisions, invokes no models, holds no publishing capability, and has no general network access (§15).

**Notable property.** Determinism is the contract: the same manifest and assets produce equivalent output. This is what makes re-rendering safe and engine substitution meaningful.

## L8 — Publishing Layer

**Responsibility.** Everything about reaching a destination platform: scheduling, quota accounting and allocation, platform capability descriptors, format adaptation driven by those descriptors, idempotent publication, and durable publication records.

**Boundaries.** Consumes only validated, approved artifacts. Never invokes agents. Never accepts live model output. The sole holder of publishing credentials.

**Notable property.** Publishing quota is a **shared, cross-tenant, finite resource** (`STD-000` §1.5), which makes this the one place in the platform where tenant isolation meets deliberate resource sharing. It therefore requires an explicit fairness policy (§12.4) — an architectural requirement that has no analogue anywhere else in the system.

## L9 — Analytics & Feedback Layer

**Responsibility.** Ingest published performance, join it to the production record, attribute outcomes to the decisions and versions that produced them, and synthesise evidence for the strategy loop.

**Boundaries.** Reads everywhere; writes only its own records. It never mutates strategy, prompts, or configuration directly. It **proposes**; governance and humans dispose.

**Notable property.** Its value depends entirely on the attribution join — performance data that cannot be traced back to the strategy version, agent versions, and prompt versions that produced it is a dashboard, not a learning system.

## L10 — Storage Layer

**Responsibility.** Durable custody of every logical storage category (§10), with the retention, immutability, isolation, and access characteristics each category requires.

**Boundaries.** Categories are distinguished by their *properties*, not by their technology. No layer above assumes a storage mechanism.

## Cross-cutting: Validation Plane

Invoked by the workflow layer between stages, never by agents on themselves (§9). Independent by design: the checker must not be the thing being checked.

## Cross-cutting: Observability Plane

Telemetry, cost ledger, and audit trail (`STD-000` §9). Present at every layer, because a component that can fail invisibly will (`STD-000` §2.12).

## Cross-cutting: Security Plane

Tenant isolation, secret custody, capability enforcement, and egress control (§15). Enforced structurally at every layer rather than applied at chosen points.

---

# 4. Major Components

Each component is described by purpose, responsibility, inputs, outputs, and dependencies. Implementation is out of scope throughout.

---

## 4.1 Tenant & Identity Service

**Purpose.** Establish who is acting, on behalf of which organisation, with what authority.

**Responsibility.** Tenant lifecycle; user identity; membership and roles; authorization decisions on every access; elevated authorization for irreversible actions; and the audit record of all of it (`STD-000` §10.8).

**Inputs.** Authentication events; role and permission assignments; access requests from every other component.

**Outputs.** Authorization decisions; authenticated principals; audit entries.

**Dependencies.** Storage (metadata); Observability (audit).

**Boundary note.** Tenant scoping is enforced here and propagated as an inseparable part of every execution context. No component is trusted to remember to filter by tenant.

---

## 4.2 Channel Registry

**Purpose.** Define the operational unit that everything else revolves around.

**Responsibility.** Channel identity; binding to a tenant, a strategy contract version, a brand kit version, a locale, a destination platform account, and a workflow selection; per-channel configuration, thresholds, cadence, budgets, and risk posture; the channel's content history reference used for originality checking.

**Inputs.** Operator configuration; strategy approvals; brand kit assignments.

**Outputs.** Resolved channel bindings consumed at run start.

**Dependencies.** Tenant & Identity; Strategy Store; Brand Registry; Storage.

**Boundary note.** A channel is data. Onboarding one requires no deployment (§2.5).

---

## 4.3 Strategy Store

**Purpose.** Hold the governing contract that every production agent must conform to.

**Responsibility.** Custody of versioned, immutable strategy contracts; their approval state and approving actor; the binding of a channel to a specific strategy version; the history of strategy transitions and their rationale; and resolution of the governing strategy for any run.

**Inputs.** Strategy artifacts produced by Department 0 and approved by a human; evidence proposals from the Insight plane.

**Outputs.** The pinned strategy version supplied to every run; strategy conformance criteria supplied to validation.

**Dependencies.** Governance; Approval Service; Storage.

**Boundary note.** Strategy is the platform's constitution. It is *read* by the production loop and *written* only by the strategy loop, under approval. Because every video records the strategy version that governed it, performance becomes attributable to strategy — which is what makes §13 more than reporting.

---

## 4.4 Brand & Locale Registries

**Purpose.** Make identity and language data rather than assumption.

**Responsibility.** Versioned brand kits (palette, typography, logo, motion, intro/outro, voice selection, tone descriptors, vocabulary preferences and prohibitions, thumbnail conventions, disclosure text); versioned locale definitions (language conventions, length constraints, speaking rate, script and direction, culturally-specific policy rules, voice availability).

**Inputs.** Operator configuration; asset uploads.

**Outputs.** Resolved brand and locale bindings supplied to agents, validators, and the rendering layer.

**Dependencies.** Asset Service; Storage.

**Boundary note.** Versioned, so that a rebrand or a locale revision is a tracked transition and historical content remains explicable (`STD-000` §15.6).

---

## 4.5 Contract Registries (Agent, Prompt, Schema, Validator, Rubric)

**Purpose.** Hold the versioned definitions that make execution reproducible.

**Responsibility.** Custody and resolution of agent manifests; immutable content-addressed prompt versions with their parameters and approved provider/model combinations; versioned schemas with compatibility metadata; versioned validation rules; versioned judging rubrics. Enforcement of promotion gates — nothing is promoted without passing its evaluation set (`STD-000` §13.1).

**Inputs.** Registered artifacts; evaluation results; promotion and rollback decisions; tenant pins.

**Outputs.** Resolved versions at run start; the resolution record that pins the run.

**Dependencies.** Evaluation Service; Governance; Storage.

**Boundary note.** These registries are the reason a run executed two months ago can be explained today. Every identifier recorded in telemetry resolves here.

---

## 4.6 Workflow Definition Registry

**Purpose.** Hold workflows as declarative, versioned data.

**Responsibility.** Custody of workflow definitions and sub-workflows; pre-execution validation (every referenced agent, schema, and contract resolvable; every path terminating; cost ceiling declared; approval gates placed; join semantics declared); version pinning for in-flight runs; tenant-specific workflow variants.

**Inputs.** Workflow definitions; registry resolutions.

**Outputs.** Validated, resolvable workflow versions.

**Dependencies.** Contract Registries; Governance.

**Boundary note.** A workflow is data, not logic. A new workflow is a new definition, never a new component (`STD-000` §15.3).

---

## 4.7 Workflow Engine

**Purpose.** Execute workflows. The sole owner of composition in the entire platform.

**Responsibility.** Resolve and pin all versions at run start; sequence nodes according to the definition; dispatch work to the appropriate execution class; persist run state after every transition; invoke the validation plane between stages; apply retry, repair, and escalation policy (`STD-000` §7); enforce cost ceilings and wall-clock deadlines; suspend durably at approval gates and resume on decision; execute the side effects that agents merely declared; handle partial failure per declared join semantics; and terminate runs safely, leaving no partial side effects.

**Inputs.** Run requests; workflow definitions; resolved bindings; agent outputs; validation results; approval decisions; scheduling triggers.

**Outputs.** Node dispatches; run state transitions; validation invocations; approval requests; publication and other side-effect executions; terminal run outcomes.

**Dependencies.** All registries; Work Distribution Fabric; Agent Runtime; Validation Engine; Approval Service; Cost & Budget Ledger; Storage; Observability.

**Boundary note.** This component's discipline is what keeps the system comprehensible. Every execution edge in the platform appears in a workflow definition and nowhere else (`STD-000` §2.4). It must contain no domain knowledge — the moment it understands what a script is, it becomes coupled to content and stops being replaceable.

---

## 4.8 Agent Runtime

**Purpose.** Provide the single, uniform execution environment shared by every agent.

**Responsibility.** Validate input against the pinned schema before invocation; render the pinned prompt with strict variable resolution (`STD-000` §4.2); delimit and label untrusted content; invoke the AI abstraction layer with the agent's capability profile and parameters; validate output structurally; apply the bounded repair loop with structured error feedback; enforce the agent's declared budgets; and emit the complete invocation record (`STD-000` §9.3).

**Inputs.** Agent identity and version; resolved prompt version; input artifact; execution context (tenant, channel, run, locale, brand, strategy); capability profile; budgets.

**Outputs.** Validated agent output; invocation telemetry including tokens, cost, latency, finish reason, and attempt classification; typed failures.

**Dependencies.** Contract Registries; AI Abstraction Layer; Validation Engine (structural); Cost Ledger; Observability.

**Boundary note.** Uniformity here is what makes 20+ agents tractable and third-party agents possible. Every agent — first-party or external — executes through this same runtime with no privileged path (`STD-000` §15.9).

---

## 4.9 AI Abstraction Layer *(Capability Profiles · Model Router · Provider Adapters)*

**Purpose.** Contain vendor variability absolutely.

**Responsibility.** Interpret capability profiles; route to a concrete model under cost policy, budget state, tenant restriction, availability, circuit-breaker state, measured quality, and explicit pins; adapt requests to each vendor and normalize every response dimension — structure enforcement, tool invocation, parameters, token accounting, cost, finish reasons, errors, throttle signals, refusals, streaming (`STD-000` §14.3); enforce global rate limits per credential; operate circuit breakers; and execute failover.

**Inputs.** Capability profile; normalized invocation request; routing policy; provider health and limit state.

**Outputs.** Normalized responses; normalized errors; usage and cost records; routing decision records.

**Dependencies.** Governance (policy, restrictions); Credential Vault; Cost Ledger; Observability.

**Boundary note.** The vendor containment line. This is the only component permitted to know that a specific vendor exists.

---

## 4.10 Work Distribution Fabric

**Purpose.** Move work durably between the workflow engine and execution capacity.

**Responsibility.** Durable delivery; segregation by resource class (fast inference, long inference, speech, image, video, rendering, publishing, analytics); priority so that interactive and approval-unblocked work preempts bulk background work; global concurrency governance per external credential; delayed delivery for backoff and scheduling; backpressure; dead-letter handling with alerting and triage; and visibility semantics sized to realistic long-running work.

**Inputs.** Dispatched work items; scheduling and delay instructions; capacity signals.

**Outputs.** Work delivery to execution capacity; depth, age, and health signals; dead-lettered items.

**Dependencies.** Observability; Governance (limits and fairness).

**Boundary note.** Class segregation is not an optimisation. Mixing a multi-minute render with a sub-second classification in one pool guarantees that the slowest work starves the fastest and that one saturated dependency degrades everything (`STD-000` §11.5).

---

## 4.11 Validation Engine

**Purpose.** Provide independent, layered verification between every stage.

**Responsibility.** Execute the validation stages of `STD-000` §6.1 — structural, business, consistency and grounding, quality, and policy — in order; resolve versioned rules and rubrics; invoke Critic and Judge agents for model-based stages; aggregate structured findings with severity and location; record every result as analysable data; enforce fail-closed behaviour on policy stages; and route outcomes to repair, regeneration, escalation, or human decision.

**Inputs.** Artifacts to validate; the pinned strategy, brand, and locale bindings; versioned rule sets and rubrics; channel-specific thresholds; content history for originality checking.

**Outputs.** Pass/fail decisions per stage; structured findings; confidence signals; recorded validation events forming a primary quality dataset.

**Dependencies.** Contract Registries; Agent Runtime (for Critic/Judge agents); Originality Service; Policy & Compliance Gate; Storage; Observability.

**Boundary note.** Invoked by the workflow engine, never by the agent whose work is being checked (§9.3).

---

## 4.12 Originality Service

**Purpose.** Prevent the repetition that is simultaneously a quality failure and a monetization risk.

**Responsibility.** Exact, normalized, and semantic comparison of candidate content against the channel's history and, where permitted, the tenant's other channels; independent comparison across titles, hooks, topics, thumbnail concepts, and structural shape; threshold evaluation per channel and per element; and structured match evidence for human adjudication.

**Inputs.** Candidate artifacts; channel content history; per-channel thresholds.

**Outputs.** Similarity findings with matched references and strength.

**Dependencies.** Storage (content history and similarity index); Validation Engine.

**Boundary note.** Structural repetition matters as much as textual repetition (`STD-000` §6.6). A pipeline can produce novel wording over an identical skeleton, and that is precisely what audiences and platform classifiers detect.

---

## 4.13 Policy & Compliance Gate

**Purpose.** Prevent the platform from publishing something that damages the channel it is meant to grow.

**Responsibility.** Evaluate destination-platform policy rules from the platform capability descriptor; verify rights and licensing coverage for every asset; verify synthetic-media disclosure state; check claim categories requiring substantiation; apply locale-specific rules; and fail closed on any absence of a positive result.

**Inputs.** Complete candidate artifacts and their assets; platform descriptors; locale rules; rights and provenance records; disclosure state.

**Outputs.** Clearance or blocking decisions with structured reasons; mandatory escalations.

**Dependencies.** Asset Service (rights and provenance); Platform Descriptors; Validation Engine; Approval Service.

**Boundary note.** This gate is never bypassable, never overridable by automation, and never satisfied by model judgment alone (`STD-000` Rules 36–38).

---

## 4.14 Approval Service

**Purpose.** Make human authority a durable, auditable, low-friction part of execution.

**Responsibility.** Create approval requests carrying complete decision context — the artifact, its provenance, its validation findings, its cost so far, and the specific decision required; suspend the run durably without resource consumption; route to appropriately authorized reviewers; capture decisions with actor, timestamp, rationale, and the exact artifact version approved; convert rejections into structured, actionable feedback for the workflow engine; and handle timeout, delegation, and escalation policy.

**Inputs.** Approval requests from the workflow engine; reviewer decisions.

**Outputs.** Recorded decisions; run resumption or redirection signals; audit entries.

**Dependencies.** Tenant & Identity (authorization); Workflow Engine; Notification Service; Observability (audit).

**Boundary note.** Rejection must return *structured* feedback. A rejection that says only "no" forces a full regeneration and teaches the system nothing.

---

## 4.15 Asset Service

**Purpose.** Own the lifecycle, identity, and legitimacy of every media artifact.

**Responsibility.** Content-addressed custody and deduplication; provenance records (which agent, prompt version, model, and inputs produced it, or what external source and licence it came from); rights and licensing records; usage back-references; similarity search for reuse; brand-kit asset resolution; lifecycle and retention policy distinguishing disposable intermediates from permanent finals.

**Inputs.** Generated media; uploaded media; licensed media; provenance and rights metadata.

**Outputs.** Addressable asset references; provenance and rights records; reuse candidates.

**Dependencies.** Storage (asset and metadata categories); Media Generation Coordinator; Security (access mediation).

**Boundary note.** Provenance and rights are captured at creation and are mandatory. An asset lacking them cannot pass the compliance gate, which makes the requirement structural rather than procedural.

---

## 4.16 Media Generation Coordinator

**Purpose.** Turn a scene plan into resolved media efficiently and within budget.

**Responsibility.** Resolve each scene requirement to generation, retrieval from the reuse library, or licensed acquisition; fan out independent generation work in parallel within declared bounds; enforce per-provider concurrency; apply consistency constraints (style, character, palette) supplied by the brand binding; handle per-item failure and substitution policy; and register every result with the Asset Service including provenance.

**Inputs.** Scene plan; brand and locale bindings; asset reuse library; budget allocation.

**Outputs.** Resolved asset references per scene; generation telemetry and cost; per-item failure findings.

**Dependencies.** AI Abstraction Layer (media providers); Asset Service; Work Distribution Fabric; Cost Ledger.

**Boundary note.** This is the dominant latency and cost contributor in the production loop, and it is trivially parallel. Serializing it is the most common avoidable performance defect in this domain (`STD-000` §11.6). Fan-out width is bounded by schema and by policy, never derived unbounded from model output.

---

## 4.17 Manifest Compiler

**Purpose.** Produce the freeze point (§1.4).

**Responsibility.** Assemble the scene plan, resolved assets, timing data, narration, captions, brand elements, and audio mix into a complete, deterministic, engine-neutral render manifest; verify internal consistency (every reference resolvable, timings coherent, durations reconciled, no gaps or overlaps); declare the manifest's capability requirements; and version and persist it as an immutable artifact.

**Inputs.** Scene plan; resolved assets with timing; narration and caption timing; brand kit; target format specifications.

**Outputs.** A validated, versioned, immutable render manifest.

**Dependencies.** Asset Service; Brand Registry; Validation Engine.

**Boundary note.** Deterministic and engine-neutral, without exception. Any engine-specific instruction that leaks into a manifest destroys engine replaceability and re-render safety — the two properties the freeze point exists to provide.

---

## 4.18 Rendering Service

**Purpose.** Execute manifests into finished media, deterministically.

**Responsibility.** Match manifest capability requirements against engine capabilities *before* rendering; execute the manifest through an engine adapter; support partitioned rendering and assembly for long content; perform automated output quality control (duration reconciliation against the manifest, resolution and format conformance, loudness normalization, silence and black-frame detection, caption synchronisation, corruption checks); and produce output variants for multiple target formats from the same manifest.

**Inputs.** Render manifest; referenced assets; target format specification; engine selection.

**Outputs.** Rendered media variants; QC results; render telemetry.

**Dependencies.** Asset Service (mediated read); Storage; Work Distribution Fabric; Observability.

**Boundary note.** The most privilege-restricted component in the platform: no model invocation, no publishing capability, no credentials, no general network egress (§15.4).

---

## 4.19 Publishing Service *(Scheduler · Quota Ledger · Platform Adapters)*

**Purpose.** Deliver approved content to destination platforms, within finite shared limits.

**Responsibility.** Hold platform capability descriptors; adapt content and metadata to destination requirements from those descriptors; schedule publication against both audience-timing strategy and quota availability; account for quota consumption per credential as a shared resource with an explicit fairness policy; execute idempotent publication protected by durable pre-attempt records; record publication outcomes and platform identifiers; and manage credential lifecycle for destination accounts.

**Inputs.** Approved, compliance-cleared artifacts; publication schedule intent; platform descriptors; quota state; destination credentials.

**Outputs.** Publication records with platform identifiers; quota consumption records; scheduling deferrals; failure findings.

**Dependencies.** Approval Service; Policy & Compliance Gate; Credential Vault; Quota Ledger; Work Distribution Fabric; Observability.

**Boundary note.** The only component holding publishing credentials, and the only one that acts irreversibly on the outside world. It accepts only validated, approved artifacts — never live model output (§15.4).

---

## 4.20 Analytics Ingestion & Attribution Service

**Purpose.** Bring outcomes back into the system and connect them to causes.

**Responsibility.** Periodically ingest performance data from destination platforms; normalize across platforms into platform-neutral measures; join every performance record to its full production lineage — strategy version, workflow version, agent versions, prompt versions, models, assets, approvals, and cost; maintain time-series performance history; and detect anomalies and material shifts.

**Inputs.** Platform performance data; publication records; production lineage records.

**Outputs.** Normalized, attributed performance records; anomaly signals.

**Dependencies.** Publishing Service; Storage (analytics and metadata); Observability.

**Boundary note.** The attribution join is the entire value of this component. Performance data that cannot be traced to the versions that produced it supports reporting but not learning (§13.2).

---

## 4.21 Insight & Feedback Service

**Purpose.** Convert attributed outcomes into evidence the strategy loop can act on.

**Responsibility.** Aggregate performance by strategy dimension (pillar, format, length, packaging pattern, publishing time, topic cluster); establish statistical sufficiency before asserting a finding; produce structured, evidenced insights; propose strategy adjustments for review; and surface quality regressions correlated with version changes.

**Inputs.** Attributed performance records; validation and quality records; cost records.

**Outputs.** Structured insight artifacts; strategy adjustment proposals; regression alerts.

**Dependencies.** Analytics Ingestion; Storage; Approval Service (proposals require human decision).

**Boundary note.** It proposes; it never mutates. Automated strategy mutation would make channel direction unauditable and would let short-horizon metrics erode long-horizon brand consistency (§13.4).

---

## 4.22 Cost & Budget Ledger

**Purpose.** Make spend visible, attributable, and bounded.

**Responsibility.** Record every cost-incurring event attributed to tenant, channel, run, node, agent, and prompt version; enforce ceilings at agent, run, channel, and tenant scope; halt execution on breach; support budget forecasting; and detect cost regressions correlated with version changes.

**Inputs.** Usage and cost records from all cost-incurring components; configured budgets.

**Outputs.** Cost records; budget state; enforcement signals; regression alerts.

**Dependencies.** Governance (budget configuration); Workflow Engine (enforcement); Observability.

**Boundary note.** Enforcement lives here and in the workflow engine, never in individual components. A budget trusted to components is not a budget (`STD-000` §2.14).

---

## 4.23 Evaluation Service

**Purpose.** Gate every change to agent behaviour.

**Responsibility.** Maintain versioned evaluation sets per agent, per locale, and per approved provider; execute evaluations on demand and on every promotion attempt; compare candidates against incumbents on quality, cost, and latency; block promotion on regression; and record results against the version under test.

**Inputs.** Evaluation sets; candidate agent, prompt, and model versions.

**Outputs.** Evaluation results; promotion decisions; regression findings.

**Dependencies.** Agent Runtime; Contract Registries; Storage.

**Boundary note.** A prompt that passes on one provider or in one locale is *unevaluated* on the others (`STD-000` §14.4, §15.5). This component makes that distinction enforceable rather than aspirational.

---

## 4.24 Credential Vault

**Purpose.** Custody of every secret, isolated per tenant.

**Responsibility.** Storage, access control, rotation, revocation, and audit for platform and tenant credentials; envelope encryption with tenant separation; short-lived credential issuance to authorized components only.

**Inputs.** Credential registration and rotation events; scoped access requests.

**Outputs.** Time-limited credential material to authorized components; audit entries.

**Dependencies.** Tenant & Identity; Observability (audit).

**Boundary note.** The most privileged component. Reachable only from the AI abstraction layer and the publishing layer. **Never** reachable from the agent layer, the rendering layer, or the interaction layer (§15.3).

---

## 4.25 Observability Plane

**Purpose.** Make the system explainable.

**Responsibility.** Collect structured telemetry, distributed traces, system metrics, and domain metrics per `STD-000` §9; enforce redaction at the boundary; maintain the separate append-only audit stream; apply tiered retention; and support the reconstruction of any run.

**Inputs.** Telemetry from every component.

**Outputs.** Queryable telemetry; traces; metrics; audit records; alerts.

**Dependencies.** Storage (logs, analytics, audit categories).

**Boundary note.** Redaction is enforced structurally at the collection boundary, not left to each emitting component (`STD-000` §9.7).

---

## 4.26 Notification Service

**Purpose.** Reach humans when the system needs them.

**Responsibility.** Deliver approval requests, escalations, failure alerts, budget and quota warnings, and publication confirmations through configured channels, with routing, deduplication, and escalation policy.

**Inputs.** Notification-worthy events from any component.

**Outputs.** Delivered notifications; delivery records.

**Dependencies.** Tenant & Identity (recipients and preferences); Observability.

**Boundary note.** Notification is how the human-in-the-loop design actually functions. An approval gate whose notification fails is an indefinitely stalled run — so delivery failure must itself be an alertable condition.

---

## 4.27 Extension Registry *(forward-looking)*

**Purpose.** Govern third-party contributions.

**Responsibility.** Registration, review, evaluation gating, versioning, capability and permission declaration, tenant installation and pinning, usage metering, and immediate platform-wide disablement.

**Inputs.** Submitted extensions and manifests; evaluation results; installation decisions.

**Outputs.** Installable extension versions; enforcement policy; metering records.

**Dependencies.** Contract Registries; Evaluation Service; Security Plane; Governance.

**Boundary note.** Third-party agents execute through the same runtime and the same contracts as first-party agents, with no privileged internal path (§17.5).

---

# 5. Department Architecture

## 5.1 Why departments exist

With more than twenty agents, a flat population becomes unnavigable. Departments provide four things a flat list cannot:

1. **A comprehension map.** An engineer can locate any capability by asking which department owns that stage.
2. **Handoff contracts.** Departments exchange a small number of well-defined deliverables rather than an unmanaged mesh of couplings. The number of *inter-department* contracts stays small even as the agent count grows.
3. **Approval placement.** Department boundaries are the natural, meaningful points for human review — a reviewer approves a completed deliverable, not a mid-process fragment.
4. **Failure containment.** A department's failure is legible ("media production failed"), and re-entry after failure begins at a department boundary rather than an arbitrary node.

**Departments are an organisational and contractual concept — not a runtime one.** There is no "department service." Departments group agents and define handoff deliverables; the workflow engine remains the sole executor (§7).

---

## 5.2 Department 0 — Strategy

**Mandate.** Define what a channel *is* and what every future video must conform to.

**Cadence.** The strategy loop — weeks to quarters. Not part of the production loop.

**Owns.** Channel mission and positioning; audience definition and personas; content pillars and categories; tone and brand personality; publishing cadence; long-form versus short-form strategy; length guidelines; call-to-action strategy; packaging direction for titles and thumbnails; SEO direction; monetization strategy; success metrics; growth strategy; competitive positioning; seasonal planning; risk assessment; expansion planning.

**Consumes.** Channel configuration; operator intent; competitive and market context; brand kit; locale; and — on subsequent cycles — evidenced insight proposals from Department 4.

**Produces.** A single deliverable: the **strategy contract**. Versioned, immutable once approved, and human-approved without exception.

**Boundaries.** Department 0 does **not** generate topics, research, write scripts, produce SEO metadata, create media, or publish. It defines constraints; it does not exercise them.

**Why it is separate.** Strategy changes on a slow clock and must remain stable for brand consistency; production changes on a fast clock. Fusing them would re-decide channel identity on every video — expensive, unstable, and corrosive to the consistency audiences actually respond to. Separation also makes strategy *attributable*: because every video records its governing strategy version, Department 4 can measure whether a strategy worked (§13.3).

**Governance.** The strategy contract requires human approval. It is the one artifact in the platform whose approval cannot be delegated to automation, because it defines what all subsequent automation will be judged against.

---

## 5.3 Department 1 — Content Intelligence

**Mandate.** Decide *what* to make, and establish the factual ground it stands on.

**Cadence.** Production loop, running ahead of production.

**Owns.** Trend and demand observation; competitive analysis; audience signal interpretation; topic ideation within the strategy's pillars; topic selection and prioritisation; originality checking against channel history; research and source gathering; fact establishment with citations; and angle definition.

**Consumes.** The pinned strategy contract; channel content history; external research sources; performance signals from Department 4.

**Produces.** Two deliverables: a **topic brief** (the selected subject, angle, rationale, priority, and its mapping to a content pillar) and a **research dossier** (established facts, each with a verifiable source reference).

**Boundaries.** Does **not** define strategy, write scripts, produce metadata, create media, or publish. It decides *what* and *on what basis* — never *how it is said*.

**Why it is separate.** Two reasons, one architectural and one security-critical.

*Architectural*: separating topic selection from execution allows the platform to maintain a topic pipeline ahead of production, to reject a topic cheaply before any expensive work begins, and to measure topic selection quality independently of execution quality. Merged, a poorly performing video gives no signal about whether the subject or the treatment was at fault.

*Security-critical*: **this is the only department that ingests untrusted external content.** Web research, competitor metadata, comments, and transcripts all enter here. Consequently this is the department with the strictest capability restrictions in the platform — no publishing, no spending beyond declared budget, no credentials, no unrestricted egress (§15.5). Isolating untrusted ingestion into one department is what makes prompt injection containable rather than systemic.

---

## 5.4 Department 2 — Content Production

**Mandate.** Turn a topic and its facts into the finished *textual* work.

**Cadence.** Production loop.

**Owns.** Narrative structure and outline; hook construction; script writing; retention-oriented pacing and editorial critique; factual verification against the research dossier; title and thumbnail-concept packaging; description, chapters, and tag metadata; and textual compliance review.

**Consumes.** The pinned strategy contract; topic brief; research dossier; brand kit; locale.

**Produces.** A **content package**: the approved script with structural segmentation, the packaging set (title candidates and thumbnail concepts), and the destination metadata set.

**Boundaries.** Does **not** select topics, conduct research, generate media, render, or publish. It produces words and concepts, not pixels or audio.

**Why it is separate.** This department contains the platform's densest use of the generate–critique–revise pattern: a Generator produces, a Critic finds structured faults, and the workflow decides whether to revise (§7.5). That pattern only works when generation and critique are separate agents with separate contracts and separate prompt versions (`STD-000` §6.4). It also concentrates the highest-value creative decisions in one place, where prompt experimentation has the greatest measurable effect.

**Note on packaging.** Titles and thumbnail concepts are produced *here*, alongside the script, rather than in Media Production. Packaging is a narrative and audience-psychology decision — what promise the video makes — not a visual production task. Media Production *executes* the thumbnail concept; it does not invent it.

---

## 5.5 Department 3 — Media Production

**Mandate.** Turn the content package into finished media.

**Cadence.** Production loop; the dominant cost and latency contributor.

**Owns.** Scene and shot planning; visual direction and style consistency; visual generation prompting; narration direction including emphasis and pacing; speech synthesis; timing alignment between narration and visuals; music and sound direction; caption generation and synchronisation; thumbnail image production from the approved concept; manifest compilation; rendering; and output quality control.

**Consumes.** Content package; brand kit; locale; asset reuse library; target format specifications.

**Produces.** The **render manifest**, and from it the **rendered media variants** with QC results.

**Boundaries.** Does **not** decide content, alter the script's meaning, invent packaging concepts, or publish.

**Why it is separate.** Its resource profile has nothing in common with the rest of the platform — different providers, different concurrency limits, different failure modes, different unit economics, and compute needs that are heavy and specialised. It also contains the freeze point (§1.4): everything before the manifest is stochastic, everything after is deterministic. That division is why re-rendering, multi-format output, and engine replacement are cheap, and it must be preserved absolutely.

---

## 5.6 Department 4 — Publishing & Growth

**Mandate.** Deliver content to audiences and learn from what happens.

**Cadence.** Publishing on the production loop; measurement continuously; insight synthesis periodically.

**Owns.** Publication scheduling against audience timing and quota availability; destination metadata finalisation; compliance and disclosure verification at the gate; idempotent publication; publication records; performance ingestion and normalisation; outcome attribution to production lineage; growth experiment design and evaluation; and insight synthesis with proposals to Department 0.

**Consumes.** Rendered media variants; destination metadata; strategy contract; approval decisions; quota state; platform performance data.

**Produces.** **Publication records**, **attributed performance records**, and **evidenced insight proposals**.

**Boundaries.** Does **not** create content, render, or modify strategy. It proposes strategy change; Department 0 and a human decide.

**Why it is separate.** It is the only department that acts irreversibly on the outside world, which demands the tightest gating and the narrowest credential scope in the platform. It is also the only department operating against a **shared cross-tenant scarce resource** — publishing quota — which requires global allocation and fairness policy that no other department needs (§12.4). And it is the origin of the learning loop, which structurally must sit outside the production loop it measures.

---

## 5.7 Department boundaries and handoffs

```
        ┌──────────────────────────────────────────────────┐
        │  D0  STRATEGY          (strategy loop · slow)    │
        └───────────────────────┬──────────────────────────┘
                     strategy contract (governs all below)
        ┌───────────────────────┼──────────────────────────┐
        │                       ▼                          │
        │  D1  CONTENT INTELLIGENCE                        │
        │      → topic brief + research dossier            │
        │                       │                          │
        │                       ▼                          │
        │  D2  CONTENT PRODUCTION                          │
        │      → content package                           │
        │                       │                          │
        │                       ▼                          │
        │  D3  MEDIA PRODUCTION                            │
        │      → render manifest → rendered variants       │
        │                       │                          │
        │                       ▼                          │
        │  D4  PUBLISHING & GROWTH                         │
        │      → publication + attributed performance      │
        └───────────────────────┬──────────────────────────┘
                     evidenced insight proposals
                                └──────────► back to D0 (learning loop)
```

**Rules governing all handoffs:**

1. A handoff deliverable is an immutable, versioned, validated artifact. Departments never share mutable state.
2. A deliverable crosses a boundary only after passing the validation stages appropriate to it (§9.2).
3. Department boundaries are the default placement for approval gates, because they are where a complete, reviewable deliverable exists.
4. The strategy contract is an input to *every* production department, not a stage they pass through.
5. Departments never invoke each other. The workflow engine moves work across boundaries, exactly as it does within them (§7).
6. A department may be re-entered after failure or rejection without re-running the departments before it — this is what makes rejection affordable.

---

# 6. AI Agent Architecture

## 6.1 What an agent is here

`STD-000` §3.1 defines an agent. Architecturally, three consequences of that definition shape the system:

**An agent is a leaf.** It has no outgoing edges to other agents. All edges belong to workflows (§7). The agent population is therefore a flat set of capabilities, not a graph — which is why adding the twenty-first agent costs roughly what adding the third did.

**An agent is a contract with an implementation attached.** What matters architecturally is the manifest: identity, contracts, capabilities, permissions, budgets. The prompt behind it is an implementation detail of that contract — which is precisely why prompts can be revised, evaluated, and rolled back without disturbing anything else.

**An agent is inert.** It cannot act. It receives data and returns data. Where an effect on the world is required, the agent *declares* it as output and the workflow engine decides whether to execute it. This is what makes model output structurally incapable of authorizing anything (`STD-000` Rule 38), and it is the property on which the security model rests.

## 6.2 Lifecycle

An agent moves through defined states, and the transitions between them are gated.

```
  AUTHORED ──► REGISTERED ──► EVALUATED ──► CANDIDATE ──► ACTIVE
                                                            │
                                              ┌─────────────┼─────────────┐
                                              ▼             ▼             ▼
                                        SUPERSEDED    DEPRECATED     DISABLED
                                              │             │             │
                                              └──────► RETIRED ◄──────────┘
                                        (resolvable forever for replay)
```

| State | Meaning | Gate to leave |
|---|---|---|
| **Authored** | Specification, contracts, prompts, validators, and evaluation set exist | Specification complete per `STD-000` §12.7 |
| **Registered** | Manifest is in the registry and resolvable; not yet executable in production | Manifest complete; contracts resolvable |
| **Evaluated** | Evaluation set executed against every approved provider and locale | Meets declared thresholds; no regression |
| **Candidate** | Executable for a measured share of traffic | Production quality and cost within budget |
| **Active** | Executable in production; the resolvable default for its version range | — |
| **Superseded** | A newer version is default; this one remains executable for pinned tenants | — |
| **Deprecated** | Discouraged; warns at workflow validation; end-of-support date declared | End-of-support date reached |
| **Disabled** | Immediately blocked platform-wide (safety or security action) | Investigation resolved |
| **Retired** | No longer executable; permanently resolvable for replay and audit | Never — history is never deleted |

Two properties matter architecturally. **Multiple versions coexist**: several major versions may be Active simultaneously, since different tenants pin differently and in-flight runs hold their own pins. And **retirement never deletes**: a retired version remains resolvable forever, because a run from eighteen months ago must still be explainable (`STD-000` Rule 48).

## 6.3 Registration

Registration is the act of making an agent knowable. It publishes the manifest (`STD-000` §3.12) into the agent registry, along with its schema, prompt, validator, and rubric references, its declared capability requirements, its declared permissions, and its declared budgets.

Registration is deliberately gated:

- Contracts must resolve in their registries.
- Declared permissions are recorded and become the enforced ceiling — an agent can never exercise a capability it did not declare (§15.6).
- Budgets must be declared; an agent without them cannot be governed.
- The evaluation set must exist before the agent can leave Registered.

Registration is **identical for first-party and third-party agents**. There is no privileged internal registration path. Where such a path exists, the external contract is inevitably under-designed because nothing depends on it (`STD-000` §15.9).

## 6.4 Discovery

Agents are discovered by **capability**, not by name, and never by another agent.

- **Workflow definitions** reference agents by identifier and version constraint. Resolution occurs at run start, and the resolved version is pinned for the run's life.
- **Operators** browse the registry by department, capability, stability level, cost, and measured quality to compose workflows.
- **The platform** resolves tenant pins, rollout policy, and enablement to determine which version a given run receives.

**Agents never discover agents.** There is no lookup path from inside an agent to any other agent. This is the structural enforcement of `STD-000` Rule 2 — the rule is not merely policy, it is unimplementable by construction.

## 6.5 Execution

Every agent invocation follows one uniform sequence in the agent runtime (§4.8), identically for every agent in the platform:

```
  1. Resolve      pinned agent, schema, prompt, capability profile, budgets
  2. Authorize    verify declared permissions cover what this invocation needs
  3. Validate in  input against the pinned input schema
  4. Render       prompt with strict variable resolution; delimit untrusted content
  5. Route        capability profile → concrete model under policy and budget
  6. Invoke       through the provider adapter
  7. Normalize    response, tokens, cost, finish reason, errors, refusals
  8. Validate out structurally against the pinned output schema
  9. Repair       bounded loop with structured error feedback, on failure
 10. Record       complete invocation telemetry and cost attribution
 11. Return       validated output, or a typed failure
```

Everything beyond step 11 — semantic validation, quality judgment, policy clearance, and what happens next — belongs to the validation plane and the workflow engine, never to the agent (§9.3).

Uniformity here is not stylistic. It is what allows every agent to be governed, budgeted, measured, secured, and replaced identically, and what allows an untrusted third-party agent to run under exactly the same controls as a first-party one.

## 6.6 Replacement

Agents are replaceable along three independent dimensions, and the architecture supports each without touching anything else:

| Dimension | What changes | What is unaffected |
|---|---|---|
| **Prompt** | A new immutable prompt version behind an unchanged contract | Contracts, workflows, consumers |
| **Model** | A different model or provider satisfying the same capability profile | Everything above the router |
| **Implementation** | An entirely different agent satisfying the same contracts | Workflows referencing the contract |

The third is the most consequential and the one that makes a marketplace possible: because agents are contract-bound and inert, an external agent satisfying a contract is substitutable for the first-party one. The workflow does not know which it received, and could not behave differently if it did.

Replacement is gated by evaluation in every case, and is reversible: rollback to any prior version requires no deployment, because the version is registry data and the resolution is pinned per run.

## 6.7 Versioning

`STD-000` §3.8 defines the version model. Architecturally, the property that matters is **pinning**:

- A run resolves and pins every version at start — agent, prompt, schema, validator, rubric, workflow, strategy, brand, locale.
- The pin is recorded on the run and stamped into every artifact and telemetry record it produces.
- Nothing may change a run's pinned versions after it starts. A deployment mid-run does not alter that run (`STD-000` Rule 50).

This single discipline produces three otherwise unobtainable properties: **reproducibility** (a run's behaviour is fully determined by its pins), **attribution** (performance and quality can be assigned to specific versions, which is what makes §13 a learning loop), and **safe deployment** (a release cannot corrupt work already in flight, including work suspended at an approval gate for days).

---

# 7. Workflow Architecture

## 7.1 What a workflow is

A workflow is a **declarative, versioned definition of a directed acyclic graph of typed nodes**, held as data in the workflow registry (§4.6). It is not code. Creating a workflow creates a definition; it never creates a component.

Node types include agent invocation, deterministic transformation, conditional branching, parallel fan-out, bounded mapping over a collection, join, human approval, timed wait, sub-workflow invocation, media generation, rendering, and publishing. The node type set is itself extensible through the registry (§14.3).

## 7.2 Why workflows own orchestration

This is the single most important structural decision in the platform, and it deserves its justification stated in full.

**If agents could call agents, the following would all become true simultaneously:**

- **The execution graph would become invisible.** It would exist only as emergent behaviour distributed across prompt text — unreadable, undiagrammable, and impossible to review before execution.
- **Cost would become unbounded and unpredictable.** An agent that calls two agents that each call two agents has produced exponential fan-out that no one declared and no ceiling anticipated. Cost could not be estimated before a run.
- **Failures would become unattributable.** A failure five levels deep in a dynamically-constructed call chain has no stable location. Retry policy could not be applied coherently, because there would be no defined unit to retry.
- **Orchestration logic would live in prompts.** The rules governing what runs next would be expressed in natural language, subject to model interpretation, unversioned as logic, untestable, and silently variable between models and between runs.
- **Recursion and cycles would become possible.** Nothing would structurally prevent an agent from invoking a path that returns to itself.
- **Human approval could not be placed reliably.** A gate can only be inserted where the graph is known in advance.
- **Replay would be impossible.** Reproducing a run would require reproducing a dynamic call chain that was never recorded as a structure.

**Because orchestration is centralised, all of the inverse properties hold:**

- The complete execution graph is declared, inspectable, and reviewable *before* execution.
- Cost is bounded and estimable in advance, because every node and every fan-out width is declared.
- Every failure has a defined location, and retry policy applies uniformly at the node level.
- Orchestration is versioned data, validated before execution, and diffable between versions.
- Cycles are structurally impossible — the definition is acyclic and validated as such.
- Approval gates are placed deliberately at meaningful boundaries.
- Any run is replayable from its pinned definition and recorded state.

The cost of this decision is real: workflows must be authored explicitly, and dynamic self-directed planning is unavailable by default. That trade is accepted deliberately. In a system that spends money and publishes publicly, **predictability is worth more than autonomy.** Where genuine dynamism is required, it is expressed as a Planner-class agent producing a *plan artifact* that the workflow engine validates against declared bounds and then executes — planning is thereby data, subject to review and to limits, rather than uncontrolled execution.

## 7.3 How workflows and agents interact

The relationship is strictly one-directional and mediated:

```
   Workflow Engine                     Agent Runtime                Agent
        │                                    │                        │
        │ ── dispatch(node, input, pins) ──► │                        │
        │                                    │ ── validated input ──► │
        │                                    │ ◄── declared output ── │
        │ ◄──── validated output / typed failure ────                 │
        │                                                             │
        │ ── invoke validation plane (independent) ──►                │
        │ ── decide next node / retry / repair / escalate / suspend   │
        │ ── execute declared side effects (if any)                   │
```

- The engine knows agents only as registry entries with contracts. It has no knowledge of scripts, thumbnails, or SEO — a workflow engine that understands content becomes coupled to content.
- The agent knows nothing of the workflow. It cannot see the graph, its position in it, what ran before, or what runs next.
- All decisions after an agent returns — validate, repair, retry, escalate, branch, suspend, proceed — belong to the engine.
- Side effects declared by an agent are executed by the engine, subject to policy, approval, and idempotency (`STD-000` Rule 4, §7.6).

## 7.4 Run lifecycle

```
  CREATED ──► RESOLVED ──► RUNNING ──┬──► SUSPENDED ──► RUNNING
                                     │      (approval / wait / quota)
                                     ├──► COMPLETED
                                     ├──► FAILED
                                     └──► CANCELLED
```

- **Created** — a run request exists with its trigger and parameters.
- **Resolved** — every version pinned; budget allocated; workflow validated as executable.
- **Running** — nodes dispatched and completed; state persisted after every transition, so no in-memory state is ever load-bearing.
- **Suspended** — durably paused at an approval gate, a timed wait, or a quota deferral. Consumes no execution resources and may persist indefinitely (§7.6).
- **Completed / Failed / Cancelled** — terminal. Failed and Cancelled runs preserve all partial artifacts for diagnosis and leave no partial side effects.

State persists after every transition because runs are long, suspensions are long, and workers are ephemeral. A run's progress must never depend on a process staying alive.

## 7.5 Composition patterns

The engine supports a small set of declared patterns, which together cover the platform's needs:

- **Sequence** — the default within a department.
- **Parallel fan-out with bounded width** — per-scene media generation, per-segment speech synthesis. Bounds are declared and enforced; fan-out width is never derived unbounded from model output (`STD-000` §11.6).
- **Join with declared semantics** — all-must-succeed, best-effort-with-minimum, or first-acceptable. Undeclared join behaviour produces inconsistent partial results and is prohibited.
- **Conditional branch** — on validated data only, never on unvalidated model output.
- **Generate → critique → revise, bounded** — a Generator produces, a Critic returns structured findings, the engine decides whether to revise, up to a declared limit. The bound belongs to the engine, not to the agents; agents cannot loop themselves.
- **Approval gate** — durable suspension awaiting human authority.
- **Sub-workflow** — reusable composition, so common sequences are composed rather than duplicated.

## 7.6 Durable suspension

Human approval, timed scheduling, and quota deferral all suspend a run for periods measured in hours or days.

The architecture treats suspension as a **persisted state, not a waiting process**. A suspended run occupies no worker, no connection, and no memory. It resumes on an external event — an approval decision, a scheduled time, a quota reset — that reactivates it from persisted state.

This is what makes human authority scalable rather than a throughput ceiling. A design that held resources during approval would force a choice between human review and throughput; this one does not.

## 7.7 What the workflow engine must never contain

- Domain knowledge about content. It coordinates artifacts; it does not understand them.
- Prompts or model invocation. It never calls a provider.
- Validation rules. It *invokes* validation; it does not *implement* it (§9).
- Provider, model, or vendor identifiers (`STD-000` Rule 5).
- Tenant-specific special cases. Variation is workflow definitions and configuration, never engine branches.

---

# 8. Communication Architecture

## 8.1 Governing standard

All inter-component communication follows `STD-000` §5 — envelope structure, naming conventions, required and optional field semantics, schema versioning, metadata, date and time representation, identifier policy, and type conventions. **None of that is restated here.** This section describes only the *architectural shape* of communication.

## 8.2 Communication modes

The platform uses four modes, each chosen for distinct reasons:

| Mode | Used for | Why |
|---|---|---|
| **Synchronous request** | Registry resolution, authorization, validation invocation, configuration reads | Immediate answer required; fast, deterministic, low-cost operations |
| **Asynchronous work dispatch** | All agent invocation, media generation, rendering, publishing | Long-running, retryable, rate-limited, resource-class-segregated; durability is essential |
| **Event notification** | Run state transitions, approvals, publications, completions, alerts | Multiple interested consumers; producer must not know or wait for them |
| **Reference passing** | Any large artifact — media, full prompts and responses, rendered output | Content-addressed references keep messages small, cheap, deduplicated, and verifiable |

**Reference passing is architecturally significant.** Large artifacts are never inlined into messages. A message carries a content-addressed reference; the recipient resolves it through the storage layer under its own authorization. This bounds message size, prevents payload growth from degrading the work fabric, enables deduplication, and makes access to the underlying bytes independently governable (`STD-000` §11.7).

## 8.3 Artifact flow versus control flow

Two distinct flows travel together and must not be conflated:

- **Control flow** — small, structured directives: dispatch this node, this validation failed, this approval was granted, resume this run. Carried by the work fabric and event notification. Always small.
- **Artifact flow** — the substantive work products. Carried by reference through the storage layer. Often large.

Separating them means the coordination mechanism never becomes a bulk data transport, which is how work distribution systems degrade under load.

## 8.4 Correlation

Every message, dispatch, event, log record, telemetry span, external call, and stored artifact carries the full correlation chain defined in `STD-000` §9.4. Propagation is automatic and structural — never the responsibility of individual call sites, because a mechanism relying on universal developer diligence eventually fails.

Correlation is what makes the distributed system explainable as one narrative rather than many disconnected fragments.

## 8.5 Communication boundaries

- **Agents communicate with nothing.** They receive input and return output through the runtime. They initiate no communication, hold no connections, and have no addressable peers. This is not a convention; it is the structural implementation of `STD-000` Rule 2 (§6.4).
- **Departments do not communicate.** They exchange artifacts through the workflow engine (§5.7).
- **Provider communication is confined to adapters.** No other component speaks to any external AI or media vendor (§4.9).
- **Publishing communication is confined to platform adapters.** No other component speaks to a destination platform (§4.19).
- **Cross-tenant communication does not exist.** There is no message, event, cache entry, or reference by which one tenant's execution can reach another's (§15.2).

## 8.6 Idempotency and delivery semantics

Delivery is durable and at-least-once, which means duplicate delivery is a certainty rather than an edge case. Every consumer is therefore idempotent, and every side-effecting operation carries an idempotency key derived deterministically from its semantic identity (`STD-000` §7.6, Rule 26).

The architecture does not attempt exactly-once delivery. It achieves exactly-once *effect* through idempotent consumers — which is achievable, whereas exactly-once delivery in a distributed system is not.

---

# 9. Validation Architecture

## 9.1 Position in the architecture

Validation is a **cross-cutting plane**, not a stage. It is invoked by the workflow engine at every boundary where an artifact is produced or consumed. It is never invoked by the agent that produced the artifact.

The stages, their ordering, their nature, and their failure behaviour are defined in `STD-000` §6 and are not restated. This section describes *where* validation sits and *why* it sits there.

## 9.2 Where validation occurs

| Boundary | Stages applied | Rationale |
|---|---|---|
| **Agent input** | Structural | Reject invalid input before spending money on invocation |
| **Agent output** | Structural | Guarantee the shape contract before anything downstream sees it |
| **Node completion** | Business, consistency, grounding | Domain correctness and coherence with upstream artifacts |
| **Department handoff** | Quality, originality, strategy conformance | The deliverable is complete and reviewable here |
| **Manifest compilation** | Internal consistency, capability match | Prevent an unrenderable manifest from reaching the render queue |
| **Render completion** | Output QC | Verify the produced media against what the manifest specified |
| **Pre-publish** | Policy, compliance, rights, disclosure — **fails closed** | The last point before an irreversible public act |
| **Approval gate** | Human judgment | Matters no automated gate can settle |

Two placements deserve emphasis. Validation at *agent input* prevents paying for an invocation that cannot succeed. Validation at *department handoff* is where the most expensive checks belong, because that is where a complete, meaningful deliverable exists — checking a fragment costs the same and tells you less.

## 9.3 Why validation is separated from AI execution

Five independent reasons, each sufficient on its own:

**1. A component cannot be its own checker.** An agent assessing its own output is systematically biased toward approval — the same context that produced the flaw produces the assessment of it. Independence is the entire mechanism by which validation adds information (`STD-000` §6.4).

**2. Determinism must not depend on stochastic components.** The platform's guarantee is that output shape, bounds, and validity are certain regardless of model behaviour (`STD-000` §2.7). That guarantee is only meaningful if the thing enforcing it is deterministic and separate. Validation inside the agent would make the guarantee contingent on the very thing it exists to constrain.

**3. Validation must be independently versionable.** Rules and thresholds evolve on a different schedule than prompts, and often for different reasons — a policy change, a platform rule change, a lesson from a production defect. Coupling them would mean every rule change forces a prompt change and a re-evaluation of unrelated behaviour.

**4. Validation results are a primary dataset.** Failure rate per rule, per agent, per prompt version is the earliest available signal of a prompt regression (`STD-000` §7.7). That signal only exists if validation is a distinct, uniformly-recorded step. Embedded in agents, the data would be inconsistent and incomparable.

**5. Enforcement must not be optional.** If validation lived inside agents, a defective or third-party agent could skip it. As a separate plane invoked by the engine, it cannot be bypassed by anything the agent does — which is what makes it safe to run untrusted third-party agents at all (§17.5).

## 9.4 Validation and the workflow engine

The engine **invokes** validation and **acts on** its results. It does not implement validation, and validation does not implement orchestration.

- Validation returns structured findings with severity and location — never a bare pass/fail, which would be unactionable.
- The engine maps findings to a response per `STD-000` §7: repair, regenerate, escalate, suspend for human decision, or fail.
- Repair receives the specific structured findings, never the accumulated history of attempts.
- Every validation result is recorded, whether it passed or failed. Passes are as informative as failures when analysing version-to-version change.

## 9.5 Model-based validation

Quality validation uses Critic and Judge agents (`STD-000` §3.11). Architecturally these are ordinary agents — same registry, same runtime, same versioning, same evaluation requirements — with three additional constraints enforced by the validation plane:

- A validator may not be the same prompt version, and should not be the same model, that produced the artifact.
- Judges score against versioned rubrics, never against unstructured opinion.
- Judge calibration against human-labelled samples is measured continuously. An uncalibrated judge is a random gate, and a random gate is worse than none because it manufactures false assurance.

Model-based validation informs; it never authorizes. Nothing irreversible depends on it alone (`STD-000` §6.4).

---

# 10. Storage Architecture

Storage is described as **logical categories distinguished by their properties** — access pattern, mutability, retention, isolation, and criticality. No storage technology is named or implied, and no layer above the storage layer assumes a mechanism. Several categories may share an underlying mechanism, or one category may span several; those are implementation decisions recorded as ADRs.

## 10.1 Categories

### Configuration & Registry Store
**Holds.** Tenants, channels, users, roles, strategy contracts, brand kits, locales, agent manifests, prompt versions, schemas, validation rules, rubrics, workflow definitions, provider configuration, platform descriptors, budgets.
**Properties.** Read-dominant and read-constantly; written rarely and under review; strongly consistent; versioned; append-mostly with immutable versions; small volume, extreme criticality.
**Why separate.** This is the source of every version identifier that makes a run reproducible. Its consistency and integrity requirements are unlike anything else in the platform, and its read pattern (constant resolution, near-zero writes) is unlike anything else too.

### Run State Store
**Holds.** Run records, pinned version resolutions, node execution state, attempt history, suspension state, approval requests and decisions, idempotency records.
**Properties.** Write-heavy during execution; strongly consistent (correctness depends on it); durable across process failure and long suspension; moderate volume; high criticality.
**Why separate.** The system of record for in-flight work. Correctness of retry, resumption, and idempotency depends entirely on it. Its consistency requirements are the strictest of any high-write category.

### Document Store
**Holds.** Every textual artifact — strategy contracts, research dossiers, topic briefs, outlines, scripts, packaging sets, metadata sets, render manifests, insight artifacts.
**Properties.** Immutable once written; content-addressed; versioned; retained long-term; moderate volume; read on demand and during replay.
**Why separate.** These artifacts are the substance of the work and the evidence trail behind every published video. Immutability is the defining property — nothing is ever edited in place, so history is intrinsically complete.

### Asset Store
**Holds.** All binary media — generated and licensed images, audio, video, music, fonts, brand assets, rendered outputs and variants, thumbnails.
**Properties.** Very large volume; content-addressed and deduplicated; immutable; tiered lifecycle distinguishing disposable intermediates from permanent finals; served for delivery.
**Why separate.** Its volume and access pattern have nothing in common with any other category, and its lifecycle policy is genuinely distinct — intermediates can be discarded aggressively while finals must persist. It is also the category with the most direct cost consequence, since undeleted intermediates accumulate silently.

### Metadata Store
**Holds.** Relationships and descriptors — asset provenance and rights records, artifact lineage, usage back-references, publication records, quota accounting, approval history, extension installations.
**Properties.** Highly relational; queried across many dimensions; strongly consistent; moderate volume; high criticality.
**Why separate.** This is what makes the platform *explainable*: it holds the connective tissue linking artifacts to their origins, their rights, their approvals, and their outcomes. Rights and provenance in particular cannot be reconstructed later (`STD-000` §1.5).

### Prompt & Interaction Archive
**Holds.** Full rendered prompts and complete model responses for every invocation, referenced from telemetry.
**Properties.** Append-only; immutable; very high volume; write-once and read-rarely; tiered retention; access-controlled as sensitive.
**Why separate.** Volume and access pattern demand it — inlining these into telemetry would destroy telemetry usability and cost. Separation also allows independent, stricter access control, since these records may contain tenant content and reveal proprietary prompts (`STD-000` §10.7).

### Telemetry & Log Store
**Holds.** Structured events, distributed traces, system and domain metrics.
**Properties.** Append-only; extremely high volume; time-series access; tiered retention with aggressive expiry for high-volume low-value events; sampling permitted except where `STD-000` §9.7 forbids it.
**Why separate.** Volume and retention economics are unlike any other category, and it is the one category where deliberate data loss (sampling, expiry) is acceptable.

### Audit Store
**Holds.** Actor-attributed records of every security-relevant and authority-relevant action.
**Properties.** Append-only; tamper-evident; **never sampled**; retained per compliance obligation; strictly access-controlled.
**Why separate.** Its guarantees are categorically different from application logs. Mixing them would subject audit records to sampling and expiry policies that would destroy their evidentiary value (`STD-000` §9.8).

### Analytics Store
**Holds.** Normalised performance time-series, attributed outcome records, aggregate quality and cost measures, experiment results.
**Properties.** Append-dominant; analytical query patterns across large ranges; long retention; latency-tolerant; gap-intolerant.
**Why separate.** Analytical workloads across long time ranges are a different access shape from every operational category, and mixing them means analytical queries degrade production execution.

### Cost Ledger
**Holds.** Every cost-incurring event, fully attributed.
**Properties.** Append-only; immutable; strongly consistent; long retention; queried both operationally (enforcement) and analytically (attribution).
**Why separate.** It serves two masters — real-time budget enforcement and long-range cost analysis — and it is financial in nature, which makes immutability and accuracy non-negotiable.

### Similarity Index
**Holds.** Derived representations of content used for originality checking and asset reuse discovery.
**Properties.** Derived and rebuildable; queried by similarity rather than by key; scoped strictly per tenant.
**Why separate.** Its query model is fundamentally unlike key-based access, and being derived, it can be rebuilt — which means it needs no backup guarantees but does need rebuild procedures.

### Credential Store
**Holds.** Platform and tenant secrets and credentials.
**Properties.** Encrypted with tenant separation; access-controlled and audited on every read; rotatable; smallest volume, highest sensitivity.
**Why separate.** The strictest access boundary in the platform (§15.3). Its isolation from every other category is a security requirement, not a design preference.

## 10.2 Cross-cutting storage rules

1. **Tenant scoping is structural.** Every category is tenant-scoped, and scoping is enforced by the platform rather than by each accessing component (`STD-000` Rule 42).
2. **Artifacts are immutable.** Documents, assets, manifests, and records are never edited in place; new versions supersede old ones. This is what makes lineage intrinsically complete rather than something that must be separately maintained.
3. **Large artifacts are content-addressed.** Deduplication and integrity verification follow directly (`STD-000` §5.8).
4. **Provenance travels with artifacts.** Stripping provenance is prohibited (`STD-000` §5.6).
5. **Historical artifacts are read under their original schema version**, never the current one (`STD-000` §5.5).
6. **Retention is declared per category**, and deletion propagates to derived artifacts, caches, indexes, and archives (`STD-000` §10.3).
7. **No component depends on a storage mechanism** — only on a category's declared properties.

---

# 11. Rendering Architecture

## 11.1 Position and purpose

Rendering is the platform's **deterministic terminus**. It sits after all creative decisions have been made and frozen, and before publication. It converts a complete specification into finished media, and it does nothing else.

## 11.2 Inputs

- **The render manifest** — complete, deterministic, engine-neutral, immutable, versioned (§4.17). The sole source of instruction.
- **Referenced assets** — resolved by content-addressed reference through mediated access.
- **A target format specification** — resolution, aspect ratio, frame rate, codec profile, loudness target, caption treatment.
- **An engine selection** — resolved from manifest capability requirements matched against registered engine capabilities.

## 11.3 Outputs

- **Rendered media variants** — one per target format, all derived from the same manifest.
- **Quality control results** — structured findings from automated post-render verification.
- **Render telemetry** — duration, resource consumption, cost, engine and version, and outcome.

## 11.4 Responsibilities

- **Capability matching before execution.** Manifest requirements are checked against engine capabilities *before* rendering begins. Discovering an incompatibility partway through a long render wastes the most expensive resource in the pipeline.
- **Deterministic execution.** The same manifest and assets produce equivalent output, every time, on the same engine.
- **Partitioned rendering and assembly.** Long content is rendered in segments and assembled, so that a failure costs a segment rather than a whole video, and so that rendering parallelises.
- **Automated output quality control.** Duration reconciled against the manifest; resolution and format conformance; audio loudness normalisation; silence, clipping, and black-frame detection; caption synchronisation; file integrity. Rendering that "succeeded" while producing silent audio or a black final third must be caught here — it is a failure mode that no upstream validation can detect, because upstream artifacts were all correct.
- **Multi-variant production.** Multiple target formats produced from one manifest without any re-inference.

## 11.5 Boundaries

Rendering **must not**:

- Make creative decisions. It has no discretion. Anything not in the manifest does not happen.
- Invoke any model. If rendering needs generation, the manifest was incomplete — which is a defect in manifest compilation, not something rendering should compensate for.
- Modify assets semantically. It composes; it does not create.
- Hold publishing capability or destination credentials.
- Have general network egress. Asset access is mediated and read-only (§15.4).
- Contain engine-specific logic outside its engine adapters.

## 11.6 Why rendering is isolated

**Resource profile.** Rendering is compute- and I/O-intensive, long-running, and bursty — nothing like a model invocation. Sharing capacity between them means either rendering starves inference or inference under-utilises expensive render capacity (`STD-000` §11.5).

**Determinism.** It is the only stage that is fully deterministic. Isolating it preserves that property, which is what makes re-rendering trustworthy.

**Replaceability.** Because the manifest is engine-neutral, a new engine is an adapter (§14.4). That is only true while rendering has no upstream dependencies beyond the manifest.

**Security.** It processes generated content and produces the artifact that will be published. Minimal privilege here is a deliberate containment measure: even if a rendering engine were compromised through malformed media, it holds nothing worth reaching.

## 11.7 Re-rendering

Because the manifest is immutable, versioned, and complete, any video can be re-rendered without re-running any part of the AI pipeline:

- At a different resolution or frame rate.
- In a different aspect ratio for a different destination format.
- With a corrected or substituted asset.
- With updated brand elements after a rebrand.
- On a different engine, after migration.
- Simply because the original render was lost.

This is the practical payoff of the freeze point (§1.4) and the strongest argument for defending the manifest's engine-neutrality without exception.

---

# 12. Publishing Architecture

## 12.1 Position and purpose

Publishing is the only part of the platform that acts irreversibly on the outside world. Every architectural decision in this section follows from that.

## 12.2 Scheduling

Scheduling reconciles three independent constraints, and reconciling them is genuinely non-trivial:

1. **Strategic timing** — when this channel's audience is most likely to engage, per the strategy contract.
2. **Cadence** — the channel's declared publishing rhythm, which audiences and platform algorithms both respond to.
3. **Quota availability** — whether the shared allowance permits publication at that moment (§12.4).

Where these conflict, quota is the hard constraint and timing is the soft one: a publication is deferred to the next feasible slot rather than failing. Deferral is recorded and visible, never silent — an operator must be able to see that a video is waiting on capacity rather than believing it was published.

Scheduling produces *intent*. The publishing service executes intent only after the compliance gate has cleared and human approval has been granted where required.

## 12.3 Approval

Publication is the platform's canonical irreversible action, and is therefore human-gated by default (`STD-000` Rule 37).

- Approval covers a specific artifact version. Any change after approval invalidates it — approving a video is not approving a moving target.
- Approval records actor, timestamp, rationale, and the exact version approved.
- Approval requires elevated authorization (`STD-000` §10.8).
- The approval requirement may be relaxed for a channel only through explicit, audited configuration, and never for content that failed any policy or compliance check.

## 12.4 Quota awareness

Publishing quota is unlike every other resource in the platform: it is **finite, externally imposed, resets on the provider's schedule, and is shared across all tenants served by one application credential** (`STD-000` §1.5). This makes the publishing layer the single place where tenant isolation deliberately meets a shared resource, and it requires architecture that exists nowhere else in the system.

**The architecture must:**

- **Model quota explicitly** as accounted state per credential, not infer it from failures. Discovering exhaustion by being rejected is both wasteful and unschedulable.
- **Account consumption before attempting**, so that scheduling decisions are made against known remaining capacity.
- **Apply an explicit fairness policy** across tenants competing for the shared allowance. Without one, a single high-volume tenant consumes the day's capacity and starves every other — the classic noisy-neighbour failure, here with contractual consequences. Fairness policy is a governance decision surfaced in configuration, not an implementation detail.
- **Support horizontal expansion** of publishing credentials, so capacity can grow. This means quota accounting is per-credential and allocation across credentials is an explicit routing decision.
- **Degrade gracefully.** Exhaustion defers to the next reset window with visibility to operators and tenants; it never fails a completed video, and it never silently drops one.
- **Reserve headroom** for retries and for priority work, so that ordinary batch publishing cannot consume the capacity that time-sensitive publication requires.

Quota is a first-class scheduling input, not an error condition. A design treating it as an error handles the common case as an exception — which is backwards.

## 12.5 Platform independence

Destination platforms are described by **capability descriptors** (`STD-000` §15.8) and served by adapters. A descriptor declares supported aspect ratios and durations, metadata fields and their limits, thumbnail requirements, caption formats, scheduling behaviour, disclosure requirements, policy rules, and the quota model.

Consequently:

- Content adaptation for a destination is a **declared transformation driven by the descriptor** — never a parallel copy of the production pipeline. Adding a destination must not fork production.
- Format variants derive from the same render manifest, so a second destination costs rendering, not inference (§11.7).
- Policy differences are expressed as descriptor-driven validation rules, so the compliance gate adapts automatically rather than accumulating destination-specific special cases.
- Adding a destination platform is a descriptor plus an adapter (§14.5).

## 12.6 Publication execution

- **Idempotent without exception.** Every attempt carries an idempotency key and is preceded by a durable record, so that a crash mid-publication is detectable on recovery rather than resulting in a duplicate (`STD-000` §7.6).
- **Never retried blindly.** Failures are classified; only genuinely transient ones retry; quota exhaustion reschedules rather than retrying (`STD-000` §7.1).
- **Fully recorded.** Publication records capture the destination identifier, timestamp, approving actor, artifact versions, and complete production lineage — the join key on which all of §13 depends.
- **Credential-isolated.** Destination credentials are held only by this layer, scoped per tenant, and never reachable from any other component (§15.3).

## 12.7 Boundaries

Publishing **must not**: create or modify content; invoke agents or models; accept live model output; bypass the compliance gate; publish without an approval record where one is required; or hold any capability beyond what its destination adapters require.

---

# 13. Analytics Architecture

## 13.1 Purpose

Analytics exists to close the learning loop (§1.3). Its job is not reporting. Its job is to answer, with evidence, the only question that ultimately matters: **did what we believed about this channel turn out to be true?**

## 13.2 The attribution join

Everything in this layer rests on one capability: joining an outcome to the complete set of decisions that produced it.

Because every run pins its versions (§6.7) and every artifact carries provenance (`STD-000` §5.6), a published video's performance can be attributed to:

| Dimension | Enables the question |
|---|---|
| Strategy version | Is this strategy working? |
| Content pillar and category | Which themes actually perform? |
| Topic brief and its rationale | Is topic selection good, independent of execution? |
| Agent and prompt versions | Did this prompt change help or harm? |
| Packaging set (title, thumbnail concept) | What packaging patterns earn attention? |
| Format, length, structure | What shape suits this audience? |
| Publishing time and cadence | When does this audience actually watch? |
| Cost | What is the return on production spend? |
| Approval and rejection history | Where does automation still fall short of human judgment? |

**Without this join, analytics is a dashboard. With it, analytics is a control system.** This is why version pinning and provenance are treated as non-negotiable throughout the architecture — their payoff is realised here.

## 13.3 The feedback path

```
  Published video
        │
        ▼
  Performance ingestion   ── normalise across destination platforms
        │
        ▼
  Attribution             ── join to full production lineage
        │
        ▼
  Aggregation             ── by strategy dimension, over sufficient volume
        │
        ▼
  Insight synthesis       ── evidenced findings, statistically sufficient
        │
        ▼
  Strategy proposal       ── structured, evidenced, reviewable
        │
        ▼
  Human decision  ────►  D0 Strategy  ────►  new strategy version
                                                    │
                                                    ▼
                                        governs all subsequent production
```

The loop closes into **Department 0**, not into production, and it closes **through a human decision** (§4.21).

## 13.4 Why the loop closes through strategy and through a human

Both constraints are deliberate, and both resist a tempting shortcut.

**Why strategy, not production.** Feeding performance directly into production prompts would optimise each video against short-horizon metrics while eroding the long-horizon consistency that builds an audience. Channels succeed through coherent identity sustained over time; per-video metric chasing destroys exactly that. Routing learning through strategy forces changes to be expressed as changes in *what the channel is*, which is where they belong and where their effects are visible.

**Why a human.** Automated strategy mutation would make channel direction unauditable — nobody could say why a channel drifted, or when. It would also expose the system to metric gaming, spurious correlation on small samples, and feedback runaway, where an early random result reinforces itself into a trend. A proposal that a human accepts or rejects preserves both the audit trail and the judgment that outcome data alone cannot supply.

The architecture may automate the *evidence*. It does not automate the *decision*.

## 13.5 Statistical discipline

- Insights require declared statistical sufficiency before assertion. Faceless channels operate at volumes where individual video variance dwarfs most real effects; a "finding" from three videos is noise, and acting on it is worse than acting on nothing.
- Growth experiments are designed with declared hypotheses, controls, and evaluation criteria in advance, so that outcomes are interpretable rather than retrofitted.
- Confounders are recorded — seasonality, platform algorithm shifts, external events — because ignoring them produces confident conclusions that are simply wrong.
- Negative results are retained. Knowing what does not work is as valuable as knowing what does, and is far more often discarded.

## 13.6 Analytics beyond content performance

The same layer serves internal measurement, which is what makes the *platform* improvable rather than just the channels:

- **Quality trends** — validation failure rates and rejection reasons by agent and prompt version, which surface regressions before they reach an audience.
- **Cost trends** — cost per finished video by version, so that a quality improvement bought with a large cost increase is a visible trade rather than a hidden one.
- **Operational health** — retry rates, escalation frequency, approval turnaround, quota utilisation, render throughput.
- **Human-machine gap** — what humans reject and why, categorised. This is the highest-signal quality dataset the platform produces, because it captures exactly what automated validation cannot yet detect (`STD-000` §13.6).

---

# 14. Extensibility

The known growth axes are all additive. Growth along any of them modifies no existing component (`STD-000` §15.1). Each axis below states what is added, what changes, and what the platform enforces.

## 14.1 New agents

**Added.** A manifest, input and output schemas, prompts, validators, an evaluation set, documentation, and a registry entry.

**Changed.** Nothing. Workflows reference agents by identifier and version constraint; a new agent is unreferenced until a workflow chooses to use it.

**Enforced.** Registration gates (§6.3); evaluation before promotion; declared permissions as the enforced ceiling; declared budgets.

**Why it works.** Agents are leaves with no outgoing edges (§6.1). Adding a leaf to a set cannot disturb the other leaves. This is the direct structural payoff of `STD-000` Rule 2.

## 14.2 New workflows

**Added.** A workflow definition, validated before execution.

**Changed.** Nothing. Workflows are data (§4.6).

**Enforced.** Pre-execution validation; version pinning for in-flight runs; declared cost ceilings; declared join semantics; approval gate placement.

**Why it works.** Orchestration is declarative, so composition is expression rather than construction.

## 14.3 New node types

**Added.** A node type registration declaring its contract, its execution semantics, and its failure behaviour.

**Changed.** The workflow engine gains a capability without gaining domain knowledge.

**Why it works.** The engine coordinates typed nodes; it does not enumerate them. This axis is what allows the platform to grow beyond video — a new medium is new node types and new agents, not a new platform.

## 14.4 New AI providers and rendering engines

**Added, for a provider.** An adapter, a capability declaration, cost and limit configuration, and evaluation runs on that provider.

**Added, for an engine.** An engine adapter and a capability declaration.

**Changed.** Nothing above the abstraction boundary. Business logic, agents, prompts, workflows, schemas, and validators are untouched (`STD-000` §14.6).

**Enforced.** Full evaluation suite passing on the new provider or engine; zero diffs outside the adapter and configuration. Any other required change means the abstraction is defective and must be fixed rather than worked around.

**Why it works.** Agents declare capabilities, not vendors (§4.9). Manifests are engine-neutral (§4.17). Both boundaries were established precisely so this axis would be cheap.

## 14.5 New publishing platforms

**Added.** A capability descriptor and a platform adapter.

**Changed.** Content adaptation follows the descriptor; the compliance gate derives its rules from the descriptor; format variants derive from the existing manifest. The production pipeline is untouched.

**Enforced.** Idempotent publication; quota modelling for the new platform; policy rules expressed as descriptor-driven validation.

**Why it works.** The pipeline produces a manifest and a content package, both destination-neutral. Destination specificity lives entirely in descriptors and adapters (§12.5).

## 14.6 New languages, brands, and channels

**Added.** Locale definitions with their own evaluation sets; versioned brand kits; channel configurations.

**Changed.** Nothing. All three are configuration and data (`STD-000` Rule 6).

**Enforced.** A locale is unsupported until it passes its own evaluation sets — a prompt that passes in one language is *unevaluated* in another (`STD-000` §15.5). Brand conformance is validated, not assumed.

**Why it works.** Locale and brand were first-class dimensions from the start. Retrofitting either into a system built single-language and single-brand is a rewrite, not a feature.

## 14.7 New validation rules and rubrics

**Added.** Versioned rules or rubrics in their registry, with test cases.

**Changed.** Nothing. Validation is independently versioned precisely so that rules can evolve without touching prompts (§9.3).

**Why it works.** Separating validation from execution means a policy change is a rule change, not a prompt change and a full re-evaluation of unrelated behaviour.

## 14.8 The extensibility contract

Every extension point is an explicit registry with a declared contract, a versioning policy, and a validation process. **Anything extended outside a registered extension point is a fork** — and forks are how platforms die (`STD-000` §15.1). Where a needed extension has no registered point, the correct response is to establish one through the amendment process, never to work around its absence.

---

# 15. Security Boundaries

Security here is **structural containment**, not perimeter defence. The controls that matter are the ones that make a dangerous action unreachable rather than discouraged.

## 15.1 Trust zones

```
  ZONE 0  UNTRUSTED EXTERNAL
          Open internet · research sources · competitor metadata · comments
          transcripts · uploaded files · model output
          ── assumed hostile ──
                    │
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ sanitize · delimit · label · bound ─ ─ ─ ─ ─ ─ ─
                    ▼
  ZONE 1  INGRESS & INTERACTION
          Operator surfaces · programmatic access · notification egress
          ── authenticated, authorized, rate-limited, tenant-scoped ──
                    │
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ authorize · scope to tenant ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                    ▼
  ZONE 2  TENANT EXECUTION
          Workflow engine · agent runtime · agents · media coordination
          rendering · validation
          ── no credentials · no publishing · egress allowlisted ──
                    │
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ mediated · capability-checked ─ ─ ─ ─ ─ ─ ─ ─ ─
                    ▼
  ZONE 3  PRIVILEGED CONTROL
          Governance · registries · policy · budget & quota · cost ledger
          publishing service · provider adapters
          ── holds authority to spend and to act on the world ──
                    │
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ audited · least privilege · time-limited ─ ─ ─ ─
                    ▼
  ZONE 4  SECRETS
          Credential vault
          ── reachable only from Zone 3 · every access audited ──
```

The zones are ordered by privilege, and **the ordering is deliberately inverted relative to exposure**: the components most exposed to untrusted content (Zone 2) hold the least authority, and the components with the most authority (Zones 3–4) never touch untrusted content.

## 15.2 The tenant boundary

Tenant isolation is a boundary that cuts through every zone and every layer. There is no message, event, cache entry, index entry, model context, telemetry record, or storage reference by which one tenant's execution can observe or affect another's.

Isolation is enforced by the platform, structurally, rather than by each component remembering to scope its access (`STD-000` Rule 42). A mechanism relying on universal developer diligence across years and many contributors will eventually fail; a structural one will not.

The single deliberate exception is publishing quota, which is genuinely shared. That sharing is explicit, accounted, and governed by fairness policy (§12.4) — it is a managed exception, not a gap.

## 15.3 Components that must never communicate directly

| From | To | Why |
|---|---|---|
| **Agent** | **Any other agent** | Composition belongs solely to the workflow engine. Enforced structurally: no discovery path exists (§6.4) |
| **Agent** | **Credential vault** | Agents process untrusted content. Credentials in their reach would make injection catastrophic |
| **Agent** | **Publishing service** | Model output must never reach an irreversible action. Agents propose; the engine and gates dispose |
| **Agent** | **Storage layer** | All artifact access is mediated, tenant-scoped, and authorized. Direct access would bypass isolation |
| **Agent** | **External network** | Egress is allowlisted and mediated. Model-produced destinations are a standard exfiltration channel |
| **Rendering service** | **Credential vault** | Rendering needs no credentials. Anything it can reach is reachable through malformed media |
| **Rendering service** | **Publishing service** | Rendering completion is not authorization to publish. Approval and compliance sit between them |
| **Rendering service** | **External network** | Asset access is mediated and read-only |
| **Publishing service** | **Agent layer** | Publishing accepts only validated, approved artifacts — never live model output |
| **Provider adapter** | **Domain layer** | The vendor containment line. Provider semantics must not leak upward (§4.9) |
| **Interaction layer** | **Credential vault** | Credentials never reach a surface that renders to a client |
| **Interaction layer** | **Execution components** | All entry passes through governance for authorization and tenant scoping |
| **Analytics layer** | **Any mutable store** | Insight proposes; it never mutates strategy, prompts, or configuration (§13.4) |
| **Any tenant's execution** | **Any other tenant's anything** | Absolute (§15.2) |

## 15.4 The critical containment: untrusted content and privilege

The platform's defining risk is that it ingests untrusted internet content and feeds it to models that operate inside a system capable of spending money and publishing publicly. `STD-000` §10.5 establishes that this cannot be solved by instructing the model. The architecture solves it by **separation of capability from exposure**:

1. **Untrusted ingestion is concentrated in Department 1** (§5.3). It is the only department that reads the open internet.
2. **Department 1 holds the platform's narrowest capabilities** — no credentials, no publishing, no unrestricted egress, bounded spend.
3. **No agent in any department can act.** Agents return data; the engine executes effects (§6.1).
4. **Irreversible actions sit behind deterministic policy gates and human approval** (§12.3), neither of which consults model output as authority.
5. **Publishing credentials exist only in Zone 3**, in a component that never sees a model.

The consequence is precise and worth stating plainly: **a successful prompt injection in this architecture can corrupt content, and that content will then face independent validation, a compliance gate, and a human. It cannot spend beyond budget, cannot reach credentials, cannot exfiltrate to an arbitrary destination, and cannot publish.** Injection is contained to a blast radius the rest of the system is specifically designed to catch.

## 15.5 Egress control

- Network egress from Zone 2 is deny-by-default and allowlisted.
- Model-produced destinations are never fetched automatically and never included in published output without validation against the allowlist (`STD-000` §10.6).
- Asset retrieval is mediated by the Asset Service, not performed directly by agents or rendering.
- Notification and publishing egress originate in Zone 3, from components that never process untrusted content.

## 15.6 Capability enforcement

Every component and every agent declares its required capabilities at registration, and the declaration becomes the enforced ceiling. A capability not declared cannot be exercised, regardless of what any prompt, output, or extension attempts.

This is what makes third-party agents safe to run at all (§17.5): an external agent executes through the same runtime, under the same validation plane, with the same deny-by-default capability model, and with no privileged path available to it (`STD-000` §10.7).

## 15.7 Failure posture

All security-relevant gates fail closed (`STD-000` Rule 36). If policy evaluation cannot complete, content does not publish. If authorization cannot be determined, access is denied. If tenant scope cannot be resolved, execution halts. Security errors are never absorbed by retry logic and always escalate (`STD-000` §8.5).

---

# 16. Architectural Constraints

These constraints are immutable. They are the load-bearing walls: violating any one of them does not degrade the architecture, it invalidates it. Each traces to the standard it enforces and the section that explains it.

## Composition

1. **Agents never orchestrate.** No agent invokes, discovers, schedules, or selects another agent. The workflow engine is the sole owner of composition. → `STD-000` Rule 2 · §7.2
2. **Every execution edge is declared.** The complete execution graph exists in versioned workflow definitions and nowhere else. → §7.2
3. **Agents never act.** They return data declaring intended effects; the workflow engine executes them under policy. → `STD-000` Rule 4 · §6.1
4. **Agents are stateless and inert.** No memory between invocations; all context arrives as declared input. → `STD-000` Rule 3 · §6.1

## Validation

5. **Validation is independent of execution.** No component validates its own output. Validation is invoked by the engine and cannot be bypassed by an agent. → §9.3
6. **Nothing crosses a boundary unvalidated.** Every artifact passes the stages appropriate to that boundary before the next stage may consume it. → `STD-000` Rule 17 · §9.2
7. **Policy, compliance, and publish gates fail closed.** Absent a positive result, nothing proceeds. → `STD-000` Rule 36 · §15.7
8. **Model output never authorizes.** It may propose; deterministic policy and human authority decide. → `STD-000` Rule 38 · §15.4

## Isolation

9. **Publishing is isolated.** The only component that acts irreversibly on the outside world, the only holder of destination credentials, and it accepts only validated, approved artifacts. → §12.7
10. **Rendering is isolated.** Deterministic manifest execution only — no models, no credentials, no publishing, no general egress. → §11.5
11. **Untrusted ingestion is isolated.** Concentrated in one department holding the narrowest capabilities in the platform. → §15.4
12. **Tenant isolation is absolute and structural.** Enforced by the platform at every layer, not by component discipline. The sole managed exception is publishing quota. → `STD-000` Rule 42 · §15.2

## Independence

13. **Business logic never depends on an AI provider.** No provider, model, or vendor identifier exists above the model router except as recorded provenance. → `STD-000` Rule 5 · §4.9
14. **Render manifests are engine-neutral.** No engine-specific instruction may enter a manifest. → §4.17 · §11.5
15. **Publishing is platform-neutral.** Destination specificity lives only in capability descriptors and adapters. → §12.5
16. **Storage is mechanism-neutral.** No component depends on a storage technology, only on a category's declared properties. → §10.2

## Reproducibility

17. **Runs pin every version at start, and pins never change.** Deployment cannot alter in-flight behaviour. → `STD-000` Rule 50 · §6.7
18. **Artifacts are immutable and carry provenance.** Nothing is edited in place; provenance is never stripped. → §10.2
19. **Every published output is fully traceable** to its inputs, versions, models, costs, and approvals. → `STD-000` Rule 48 · §13.2
20. **History is never deleted.** Retired versions remain resolvable forever for replay and audit. → §6.2

## Boundedness

21. **Nothing is unbounded.** Not retries, not loops, not fan-out, not cost, not payload size, not execution time. → `STD-000` Rule 34 · §7.5
22. **Every run has an enforced cost ceiling** that halts execution when breached. → `STD-000` Rule 46 · §4.22
23. **Fan-out width is never derived unbounded from model output.** → `STD-000` §11.6 · §4.16

## Extension

24. **Extension occurs only through registered extension points.** Anything else is a fork. → `STD-000` §15.1 · §14.8
25. **Third-party components use no privileged path.** External agents execute through the same runtime, contracts, validation, and capability limits as first-party ones. → `STD-000` §15.9 · §17.5

## Precedence

26. **`STD-000` governs.** Where this architecture conflicts with the standards, the standards win and this document is the defect. → `STD-000` Rule 57

---

# 17. Future Expansion

Expansion is not a future project. Each axis below is supported by structure that exists in version 1.0, because every one of these becomes prohibitively expensive if retrofitted.

## 17.1 Multiple channels

**Supported by.** Channels as first-class configuration bound to a strategy version, a brand kit, a locale, a destination account, and a workflow selection. No channel attribute exists in logic (§2.5).

**What growth costs.** A data operation. No deployment.

**What scales with it.** Runs, storage, and quota consumption — all horizontally scalable, with the quota constraint explicitly modelled and scheduled against (§12.4).

## 17.2 Multiple companies

**Supported by.** Tenancy as a structural security boundary at every layer, with per-tenant identity, credentials, budgets, quotas, isolation, and cost attribution (§15.2).

**What growth costs.** Onboarding. The architecture does not change.

**Why it must exist from day one.** Retrofitting multi-tenancy is among the most expensive migrations in software, and it is never done cleanly — isolation gaps discovered after the fact are security incidents, not backlog items.

**What matures with scale.** Fairness policy for the shared publishing quota (§12.4) and per-tenant resource governance become operationally significant well before they become architecturally different.

## 17.3 Multiple brands

**Supported by.** Versioned brand kits as data, bound per channel, supplied as explicit input to every brand-visible agent, and enforced by validation (§4.4).

**What growth costs.** A brand kit. No code.

**What versioning buys.** A rebrand is a tracked version transition, so historical content remains explicable under the brand that governed it — rather than becoming inexplicably inconsistent with current brand rules.

## 17.4 Multiple languages

**Supported by.** Locale as a first-class dimension across prompts, examples, evaluation sets, rubrics, validators, constraints, voices, and rendering (§14.6).

**What growth costs.** Locale definitions plus locale-specific evaluation sets. A locale is unsupported until its evaluations pass — untested locale support is a claim, not a capability (`STD-000` §15.5).

**Why it must exist from day one.** Length constraints, sentence rhythm, speaking rate, title conventions, script direction, and cultural policy all differ materially by language. A system built English-first embeds English assumptions in prompts, validators, and rendering, and removing them later is a rewrite.

## 17.5 AI marketplaces and third-party agents

The architecture already contains the mechanisms a marketplace requires. What remains is governance, not restructuring.

**Already present:**

- Agents are contract-bound leaves with no outgoing edges (§6.1), so an external agent cannot reach into the platform's graph.
- Registration is identical for first-party and third-party agents (§6.3). No privileged internal path exists to under-design.
- Capability and permission declaration is the enforced ceiling (§15.6).
- Validation is external to agents and cannot be bypassed (§9.3), so an external agent's output is checked exactly as a first-party agent's is.
- Evaluation gates promotion (§4.23), so an external agent must prove itself against the same golden sets.
- Cost is attributable per agent (§4.22), which is what makes metering and revenue share possible.
- Versioning, tenant pinning, rollback, and immediate platform-wide disablement all exist (§6.2).

**What a marketplace adds:** submission and review workflow, publisher identity and signing, listing and discovery surfaces, metering and settlement, ratings tied to measured performance rather than opinion, and dispute handling.

**What it must never add:** a privileged execution path, an exemption from validation, an exemption from capability limits, or access to another tenant's data. An extension that requires any of these is not admissible, regardless of its value.

**Beyond agents.** The same registry-and-contract model extends to marketplace workflows, brand kits, niche blueprints, rendering engines, and destination platform adapters. Each is already a registry with a versioned contract (§14).

## 17.6 Adjacent expansion the architecture already permits

These follow from existing structure without architectural change:

- **New media formats and lengths** — new target format specifications rendered from existing manifests (§11.7).
- **New content mediums beyond video** — new node types, new agents, new manifest schemas; the workflow engine, validation plane, and governance are medium-agnostic by construction (§14.3).
- **Additional destination platforms** — descriptors and adapters (§14.5).
- **Alternative production topologies** — different workflows over the same agent population, so a channel can run a lightweight pipeline or an exhaustive one without a different platform (§14.2).
- **Deeper autonomy** — Planner-class agents producing validated plan artifacts that the engine executes within declared bounds, so autonomy increases without orchestration leaving the engine (§7.2).

## 17.7 What would require architectural change

Stated honestly, so that future engineers recognise when they have left the design rather than extended it:

- **Real-time or interactive production.** The architecture is asynchronous, durable, and gate-oriented. Interactive editing is a different system.
- **Agent-to-agent negotiation.** Any requirement for agents to converse or negotiate directly contradicts §7.2 and would require re-establishing the entire cost, security, and reproducibility model from scratch.
- **Fully autonomous strategy mutation.** Removing the human from §13.4 would eliminate the audit trail that makes channel direction explicable — a governance decision with architectural consequences, not a feature toggle.
- **Cross-tenant content sharing or federation.** This would breach §15.2, the platform's most absolute boundary, and would require a new isolation model rather than an exception to this one.

Each of these is possible. None is an extension. All would require an ADR, an amendment to `STD-000`, and a revision of this document.

---

# Appendix A — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial system architecture: three-plane model, ten logical layers, twenty-seven major components, five-department structure, agent and workflow architecture, communication, validation, storage, rendering, publishing, analytics, extensibility, security boundaries, twenty-six immutable constraints, and expansion paths. |

---

*End of document — ARC-001 v1.0. Governed by STD-000 v1.0.*

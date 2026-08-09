# JSON Contract Guide
**Version 1.0**

---

### Document Control

| Field | Value |
|---|---|
| Document ID | `GDE-003` |
| Title | JSON Contract Guide |
| Version | 1.0 |
| Status | Active |
| Governed by | [`000-project-engineering-standards.md`](000-project-engineering-standards.md) (`STD-000 v1.0`) |
| Situated by | [`001-system-architecture.md`](001-system-architecture.md) (`ARC-001 v1.0`) |
| Companion to | [`002-ai-agent-development-guide.md`](002-ai-agent-development-guide.md) (`GDE-002 v1.0`) |
| Owner | Platform Architecture |
| Audience | Anyone defining, consuming, reviewing, or publishing a contract — including third-party publishers |
| Review cadence | Quarterly, or on any change to the envelope structure |

**Requirement language.** RFC 2119 keywords carry the meanings defined in `STD-000` §Document Control.

**Precedence.** `STD-000` governs. Where this guide appears to conflict with it, `STD-000` wins and this guide is the defect (`STD-000` Rule 57).

---

### Naming reconciliation

Two block names in the commissioning brief differ from names already fixed by `STD-000` §5.3. Under the precedence rule, a conflict must be resolved rather than tolerated, so the canonical names are retained:

| Brief | Canonical | Resolution |
|---|---|---|
| `metadata` | **`meta`** | Fixed by `STD-000` §5.3. Renaming would be a breaking amendment to the universal envelope for no functional gain. Where this guide says "metadata," it means the `meta` block. |
| `payload` | **`data`** | Fixed by `STD-000` §5.3. Same reasoning. Where this guide says "payload," it means the `data` block. |

The blocks the brief adds — `contractVersion`, `contractType`, `validation`, `execution`, `references` — are new, do not conflict, and are specified in §4.

---

# 1. Introduction

## 1.1 Position in the document set

| Document | Question it answers |
|---|---|
| `STD-000` Engineering Standards | *What are the rules?* |
| `ARC-001` System Architecture | *Where do components sit, and why?* |
| `GDE-002` Agent Development Guide | *How do I design an agent?* |
| `GDE-003` **this guide** | *What moves between components, and what shape is it?* |

`STD-000` §5 fixes the **rules for JSON messages** — formatting, naming, optionality, versioning, dates, identifiers, types. Those rules are binding and are cited here, never restated.

This guide defines the **contracts themselves**: the complete taxonomy of message types the platform exchanges, the full envelope every one of them shares, the design method for adding a new contract, and the four areas `STD-000` deliberately left open — contract categories, references, manifests, and evolution mechanics.

## 1.2 What a contract is

A **contract** is a named, versioned, schema-defined message type exchanged between two components that were designed independently and may be replaced independently.

The word matters. A contract is a **promise**, not a data structure that happens to travel. Once published, it binds the producer to a shape and binds the consumer to accept nothing else. Everything in this guide follows from taking that promise seriously.

## 1.3 The unit of coupling

> **The contract is the only place two components are allowed to be coupled.**

This is the guide's organising idea. `ARC-001` makes every component replaceable — agents, providers, engines, publishers, storage. That replaceability is entirely mediated by contracts: a component can be replaced precisely because everything anyone knows about it is written in a contract, and a component becomes irreplaceable the moment anything true about it is *not* written in one.

Consequently, a contract is not a serialisation convenience. It is the interface, the documentation, the test surface, and the compatibility boundary simultaneously. Contract design is not a formatting exercise; it is the design of the system's joints.

## 1.4 Scope

**In scope.** Contract categories; the universal envelope; metadata; payload design; versioning and evolution mechanics; validation result representation; error representation on the wire; references; manifests; contract-level acceptance rules; contract security and performance properties.

**Out of scope.** Implementation, storage, transport, interfaces, workflows (`ARC-001` §7), prompts (`STD-000` §4), agent design (`GDE-002`), and the specific payload schemas of individual agents (each `AGT-nn` specification).

## 1.5 The consumer is always a stranger

Every rule in this guide is a consequence of one assumption:

> **The consumer of a contract is a stranger — a different team, a third-party publisher, a replacement implementation, or an engineer reading a message in a log eighteen months from now, with no access to the system that produced it.**

A contract that only makes sense to someone with context is not a contract. It is an internal convention that will break the first time it crosses a boundary that matters.

---

# 2. Contract Philosophy

Seven principles. Each states the rule, its justification, the failure it prevents, and — where one exists — its deliberate limit.

## 2.1 Contract-First Design

**Principle.** The contract is designed before either side is built, from the consumer's requirements backward.

**Why.** A contract derived from a producer's convenience encodes that producer's internals, and the coupling survives every attempt to replace it. A contract derived from consumer need survives the producer being replaced entirely — which is the whole point.

`GDE-002` §3.4 states this for agents. Here it generalises: it applies equally to events, manifests, records, and configuration. Determine every consumer, determine what each genuinely needs, then design.

**Prevents.** Contracts shaped by accident — most commonly, contracts retrofitted around whatever a model or component happened to emit during experimentation.

**Limit.** Contracts may be revised during design. What must not happen is *discovering* the contract from observed behaviour.

## 2.2 Deterministic Communication

**Principle.** A consumer must be able to process a contract without inference, negotiation, heuristics, or conditional parsing.

**Why.** Every point where a consumer must *work out* what it received is a point where two implementations will disagree. Determinism here means: the shape is known from the declared version; every field's presence is decidable from the schema; every value's meaning is fixed; nothing depends on what the consumer happens to know.

**Concretely, this forbids:** fields whose meaning depends on the value of another field without a declared discriminator (§6.7); values that are sometimes a string and sometimes an object; presence that signals meaning ("if this field is here, it was the fast path"); and any interpretation requiring knowledge not in the message or its schema.

**Prevents.** The class of defect where two correct-looking implementations disagree about the same message.

## 2.3 Backward Compatibility

**Principle.** A published contract version's meaning never changes. Consumers written against version *N* continue working, unmodified, for the entire published support window.

**Why.** In a platform with long-running workflows, suspended approvals, third-party consumers, and stored historical artifacts, a contract change does not break one caller at one moment. It breaks an unknown set of callers at unknown times, including runs that began days ago and artifacts written months ago.

**Who bears the cost.** The producer bears the cost of compatibility; the consumer bears the cost of adopting new capability. A producer that breaks a contract has externalised its cost onto every consumer simultaneously — which is why breaking changes require a major version, a support window, and a migration path rather than an announcement (`STD-000` §2.16).

**Limit.** Compatibility is a promise about a *version*, not a promise never to change. Major versions exist precisely so that genuine evolution is possible; they simply make the cost explicit and scheduled.

## 2.4 Explicit Metadata

**Principle.** Every message carries its own identity, correlation, and provenance. None of it is optional, and none of it is inferred from context.

**Why.** Context is exactly what is missing when it matters — during an incident, during an audit, during a replay, or when a message is found alone in a log. Metadata carried on the message is the only metadata that survives the message leaving its original setting.

**The orphan test.** *Take any single message out of its stream and hand it to someone with no other information. Can they determine what it is, what produced it, what run it belongs to, which tenant it concerns, and when it happened?* If not, the metadata is incomplete.

**Prevents.** Unattributable behaviour, un-replayable runs, and the discovery during an incident that the one field needed to correlate two systems was never carried.

## 2.5 Self-Describing Messages

**Principle.** A message declares everything needed to interpret it: its contract type, its contract version, its payload schema version, and the versions of every artifact it references.

**Why.** Self-description is what makes a message interpretable across time and across implementations. A message that must be interpreted "using the current schema" is uninterpretable once the current schema has moved on — and historical artifacts vastly outnumber live ones.

**Concretely.** Historical artifacts MUST be read under the schema version they were written with, never the current one (`STD-000` §5.5). That is only possible because each carries its own version. This single property is what makes `ARC-001`'s replay and lineage guarantees achievable.

**Limit.** Self-description is about *interpretation*, not *resolution*. A message declares which versions it uses; it does not embed them. Resolution is the registry's job (§10).

## 2.6 Schema Validation

**Principle.** Validation is a property of the boundary, not a courtesy performed by well-behaved consumers.

**Why.** In this platform the producer is frequently a language model (`STD-000` Rule 17). But even for deterministic producers, "the caller is trusted" is a claim that decays: implementations change, third parties arrive, and a component that was correct last quarter is not necessarily correct now.

**Rules.** Every contract has a registered schema. Every schema is **closed** — unknown properties are errors, never ignored (`STD-000` §5.1). Every message is validated at the boundary, in both directions. There are no trusted producers and no exempt paths.

**Why closed schemas specifically.** Ignoring unknown properties hides contract drift until it causes a production defect somewhere unrelated. A closed schema converts a silent divergence into an immediate, localised, diagnosable failure — at the exact boundary where it originated.

## 2.7 Version Evolution

**Principle.** Contracts evolve by addition and supersession, never by mutation.

**Why.** Mutation is undetectable. Removing a field breaks loudly and is therefore survivable; *changing what a field means* breaks silently, because every consumer keeps reading it successfully and interpreting it wrongly. That failure can persist for months and corrupts everything derived from it.

**The discipline.** Add optional fields. Introduce new versions. Deprecate on a published schedule. Retire after the window. **Never repurpose a name** (`STD-000` §5.5).

**Limit.** Additive-only within a major version. Genuine breaking change is legitimate — it simply requires a major version and the process that goes with it (§7, §13).

---

# 3. Contract Categories

## 3.1 Why categories exist

Every contract belongs to exactly one category. Category determines the envelope blocks required, the retention posture, the mutability posture, and the validation treatment. Declaring it (`contractType`, §4.2) means a consumer, a logger, an auditor, or a triage tool knows how to handle a message before inspecting its payload.

## 3.2 A note on "Metadata" as a category

Metadata is a **block present in every contract** (§5), not a contract type of its own. A standalone metadata message would be a message about nothing.

The category that occupies that space — and is genuinely needed — is the **Record**: an immutable statement that something happened. Publication records, approval decisions, cost entries, and quota consumption are all Records, and without the category they end up misfiled as Events (which are transient) or Responses (which are not).

The taxonomy below therefore substitutes Record for Metadata, and covers metadata comprehensively in §5.

## 3.3 The nine categories

| Category | Direction | Mutability | Retention | Primary purpose |
|---|---|---|---|---|
| **Request** | Into a component | Immutable | Run lifetime + audit | Ask for work |
| **Response** | Out of a component | Immutable | Long-term | Deliver a work product |
| **Event** | Broadcast | Immutable | Short to medium | Announce that something happened |
| **Validation Result** | Out of the validation plane | Immutable | Long-term | Report verification outcome |
| **Error** | Out of any component | Immutable | Long-term | Report failure |
| **Record** | Into durable custody | **Append-only, never amended** | Permanent | Assert a historical fact |
| **Manifest** | Into an executor | Immutable | Permanent | Completely specify an executable outcome |
| **Configuration** | Into any component | Versioned, immutable per version | Permanent | Declare governing settings |
| **Analytics** | Into the insight plane | Immutable | Long-term | Convey measurement |

---

### Request

**Purpose.** Ask a component to perform work.

**Produced by.** The workflow engine, almost exclusively (`ARC-001` §7.3). Components do not request work from each other.

**Lifecycle.** Constructed with resolved inputs and pinned versions → validated against the target's input schema → dispatched → retained for the run's audit trail.

**Required blocks.** `meta`, `data`. **Typically present.** `references`.

**Rules.** A Request MUST carry every input the target needs; there is no ambient context (`GDE-002` §3.2). A Request MUST NOT instruct the target *how* to work — no model selection, no parameters, no strategy hints. Those are resolved by policy (`ARC-001` §4.9). A Request is immutable once dispatched; a retry re-sends the same Request, it does not amend it.

---

### Response

**Purpose.** Return a completed work product.

**Produced by.** Any component performing work, most often an agent through the runtime.

**Lifecycle.** Produced → structurally validated → carried through the validation plane → consumed or rejected → retained as an artifact.

**Required blocks.** `meta`, `status`, and exactly one of `data` (on success) or `issues` (on failure). **Typically present.** `execution`, `references`.

**Rules.** A Response MUST be complete or a failure — never partially complete presented as success (`STD-000` §2.13). `status` of `PARTIAL` MUST NOT be used by content-producing components (`STD-000` §5.3). A Response MUST NOT echo its Request; the consumer already has it.

---

### Event

**Purpose.** Announce that something has happened, to an unknown set of interested parties.

**Produced by.** Any component, at defined lifecycle points.

**Lifecycle.** Emitted → delivered to zero or more subscribers → retained per policy → expired.

**Required blocks.** `meta`, `data`.

**Rules.** Events are **notifications, not instructions.** An Event MUST NOT direct a recipient to act, and no recipient's behaviour may be required for the producer's correctness — a producer never waits for or depends on a consumer (`ARC-001` §8.2). Events are fire-and-forget by design. Events MUST be small, carrying identifiers and references rather than payloads; a consumer that needs the artifact resolves the reference under its own authorization.

**Why the smallness rule matters.** Fat events become a shadow data pipeline: consumers start reading business state from event payloads instead of from artifacts, and the event's shape silently becomes a contract nobody designed.

---

### Validation Result

**Purpose.** Report the outcome of a verification stage.

**Produced by.** The validation plane (`ARC-001` §4.11).

**Lifecycle.** Produced per stage → aggregated → drives the workflow's next decision → retained permanently as a quality dataset.

**Required blocks.** `meta`, `status`, `validation`. Full structure in §8.

**Rules.** Validation Results are **first-class retained artifacts, not transient control signals.** Failure rate per rule, per agent, per prompt version is the earliest signal of a prompt regression (`STD-000` §7.7), and that dataset only exists if results are retained whether they passed or failed.

---

### Error

**Purpose.** Report that an operation failed.

**Produced by.** Any component.

**Lifecycle.** Produced → classified → drives retry, repair, escalation, or termination → retained permanently.

**Required blocks.** `meta`, `status` (`FAILURE`), `issues`. Full structure in §9.

**Rules.** An Error is a first-class contract, not a degraded Response. It MUST carry a registered code, a category, and an explicit retryability determination (`STD-000` §8.1).

---

### Record

**Purpose.** Assert that something happened, permanently.

**Produced by.** Components performing consequential acts — publishing, approval, spending, quota consumption, credential access.

**Lifecycle.** Written once → **never amended** → retained permanently → read by audit, analytics, and attribution.

**Required blocks.** `meta`, `data`. **Typically present.** `references`.

**Rules.** Records are **append-only**. A correction is a new Record referencing the original, never an edit — an amended Record is not evidence of anything. Records MUST carry the complete lineage needed to reconstruct their context, because that context will not be available later (`ARC-001` §13.2). Records MUST identify the actor for anything involving authority.

---

### Manifest

**Purpose.** Completely specify an outcome such that a conforming executor can produce it with no further inference.

**Produced by.** Compilation components (`ARC-001` §4.17).

**Lifecycle.** Compiled → validated for internal consistency and capability match → executed, possibly many times → retained permanently for re-execution.

**Required blocks.** `meta`, `data`, `references`. Full treatment in §11.

**Rules.** Manifests MUST be complete, deterministic, executor-neutral, and immutable. These four properties are what make re-execution and executor substitution possible; a manifest missing any of them is a request in disguise.

---

### Configuration

**Purpose.** Declare settings that govern behaviour.

**Produced by.** The governance layer (`ARC-001` §L2).

**Lifecycle.** Authored → reviewed → versioned → resolved at run start and **pinned** → retained permanently.

**Required blocks.** `meta`, `data`.

**Rules.** Configuration is versioned and immutable per version. Runs pin the version resolved at start (`ARC-001` §6.7), so a configuration change never alters in-flight behaviour. Configuration MUST NOT contain secrets — those are resolved separately from the credential vault (`STD-000` §10.1).

---

### Analytics

**Purpose.** Convey measurement into the insight plane.

**Produced by.** Any component; ingestion services; the cost ledger.

**Lifecycle.** Emitted → normalised → attributed to production lineage → aggregated → retained long-term.

**Required blocks.** `meta`, `data`. **Typically present.** `references`.

**Rules.** Analytics contracts MUST carry sufficient reference material for attribution (`ARC-001` §13.2) — a measurement that cannot be joined to the versions that produced it supports reporting but not learning. Measures MUST declare their units and their measurement window; a number without both is uninterpretable.

---

# 4. Standard Contract Structure

## 4.1 The universal envelope

Every contract in the platform, without exception, uses this envelope. Blocks marked *Always* are mandatory on every message; blocks marked *Conditional* are present when their condition holds and absent otherwise (never present-but-empty).

```
{
  "contractVersion": "1.0",              ← Always   · envelope format version
  "contractType":    "RESPONSE",         ← Always   · category (§3)
  "schemaVersion":   "2.1.0",            ← Always   · version of the data payload's schema
  "meta":            { … },              ← Always   · identity, correlation, provenance (§5)
  "status":          "SUCCESS",          ← Always   · SUCCESS | PARTIAL | FAILURE
  "data":            { … },              ← On success · the payload (§6)
  "issues":          [ … ],              ← On failure, or warnings alongside data (§9)
  "validation":      { … },              ← When validated (§8)
  "execution":       { … },              ← When produced by an executing component (§4.7)
  "references":      [ … ]               ← When the contract points at other artifacts (§10)
}
```

*(Contract illustration only — not an implementation.)*

## 4.2 `contractVersion` and `contractType`

**`contractVersion`** — the version of **the envelope format itself**, platform-wide. It changes only when the envelope's structure changes, which should be rare and is always a significant event.

**`schemaVersion`** — the version of **this message's payload schema**. It changes whenever that specific contract's payload changes (`STD-000` §5.5).

These are deliberately separate and are frequently confused. The envelope evolves on a platform clock measured in years; individual payload schemas evolve on their own clocks measured in weeks. Conflating them would force every contract in the platform to re-version whenever any single contract changed.

**`contractType`** — the category from §3.3. Declared explicitly rather than inferred from shape, so that routing, logging, retention, and triage can act on a message without parsing its payload. Inferring type from structure is fragile the moment two categories share a shape.

## 4.3 Block placement — the decision rule

The most common contract-design error is putting a field in the wrong block. Apply this test, in order:

```
  Does a consumer BRANCH on it, or is it the work product?     → data
  Does it describe WHO/WHEN/WHERE/WHICH-VERSION produced it?   → meta
  Is it the outcome of a VERIFICATION?                          → validation
  Is it a MEASUREMENT of the execution that produced this?      → execution
  Does it POINT AT another artifact?                            → references
  Does it describe a FAILURE?                                   → issues
  None of the above                                             → it should not exist
```

**The sharpest form of the rule:** *if a consumer makes a business decision using the field, it belongs in `data` — regardless of how much it feels like metadata.* Provenance-shaped business data (a locale that drives content selection, a brand that drives validation) belongs in `data` even though a similar field also exists in `meta` for provenance purposes. The duplication is intentional: one is the record of what governed production, the other is an input to a decision.

## 4.4 `meta`

Identity, correlation, and provenance. Never business data (`STD-000` §5.6). Full field catalogue in §5.

## 4.5 `status` and `data`

**`status`** — `SUCCESS`, `PARTIAL`, or `FAILURE` (`STD-000` §5.3). Exactly one of `data` or `issues` is required by it. `PARTIAL` is reserved for batch operations with differing per-item outcomes and MUST NOT be used by content-producing components.

**`data`** — the payload. Design rules in §6.

## 4.6 `validation`

Present when the contract has passed through the validation plane. Carries stage outcomes, findings, and confidence. Structure in §8.

**Rule.** A `validation` block is a *statement about* this message, produced by an independent party (`ARC-001` §9.3). A producer MUST NOT populate it about its own output — that is self-assessment, and it is systematically biased toward approval (`GDE-002` §15.10).

## 4.7 `execution`

Present when a component executed work to produce this contract. Carries the execution summary: attempt number and type, duration, cost, resource class, and outcome. It is the *summary* — the complete invocation record lives in telemetry (`STD-000` §9.3) and is not duplicated here.

**Purpose.** It lets a consumer or reviewer see what a result cost without leaving the message. **Limit.** It MUST NOT grow into a telemetry channel; anything beyond a summary belongs in the observability plane.

## 4.8 `references`

Outbound pointers to other artifacts, as a flat array of reference objects. Structure and rules in §10.

**Rule.** References are collected in this block rather than scattered through the payload wherever they happen to be used. Centralising them makes the message's dependency graph inspectable without parsing the payload — which is what makes cross-reference validation (§12.4), lineage traversal, and integrity checking possible as generic operations rather than per-contract ones.

## 4.9 Envelope rules

1. Blocks MUST NOT be reordered in meaning; key order carries no significance (`STD-000` §5.1), but the canonical order above SHOULD be used for readability.
2. Conditional blocks MUST be **absent** when not applicable, never present-and-empty (`STD-000` §5.4).
3. No block may be added outside this specification. Extending the envelope is a `contractVersion` change.
4. The envelope is identical for first-party and third-party components. There is no extended envelope for privileged producers.

---

# 5. Metadata Standards

## 5.1 Four groups

`meta` fields divide into four groups by purpose. Grouping them clarifies which are always required and which are contextual.

| Group | Answers | Always required |
|---|---|---|
| **Identity** | What is this message? | Yes |
| **Correlation** | What larger activity does it belong to? | Yes, where an activity exists |
| **Binding** | Whose is it, and under what governing context? | Yes, in tenant-scoped contexts |
| **Provenance** | What produced it, and how? | Yes for produced artifacts |

## 5.2 Identity fields

| Field | Purpose | Consequence of omission |
|---|---|---|
| `messageId` | Unique identity of this specific message | Duplicates undetectable; idempotency impossible |
| `createdAt` | When the message was produced (RFC 3339 UTC, `STD-000` §5.7) | No ordering, no latency measurement, no retention policy |
| `locale` | Language and region governing this message's content (BCP 47) | Locale-sensitive validation cannot select its rules |

## 5.3 Correlation fields

These reconstruct the causal graph. Propagation is automatic and structural, never the responsibility of individual producers (`ARC-001` §8.4).

| Field | Purpose | Consequence of omission |
|---|---|---|
| `correlationId` | Constant across an entire run; the primary join key | A run cannot be reconstructed; incidents become unanswerable |
| `causationId` | The message that directly caused this one | Causal order lost; only a flat set of correlated events remains |
| `runId` | The workflow run this belongs to | No association with execution state or cost |
| `nodeId` | The workflow node that produced or requested this | Failures cannot be localised in the graph |
| `attempt` | Which attempt produced this | Retries indistinguishable from first attempts; retry rate unmeasurable |

**`correlationId` and `runId` are conceptually distinct** even where they coincide. A correlation may span more than one run — a re-render, a republish, or a repair run initiated from a prior run's output. Collapsing them forfeits the ability to trace those chains.

## 5.4 Binding fields

The governing context under which the message was produced. These are the platform's isolation and conformance dimensions.

| Field | Purpose | Consequence of omission |
|---|---|---|
| `tenantId` | The owning tenant — the security boundary (`ARC-001` §15.2) | Isolation cannot be verified; a cross-tenant leak becomes undetectable |
| `channelId` | The operational unit the work belongs to | No per-channel attribution, history, or originality scope |
| `strategyVersion` | The strategy contract governing this production | Strategy becomes unmeasurable — the learning loop cannot attribute outcomes to it (`ARC-001` §13.2) |
| `brandVersion` | The brand kit governing identity | Historical content becomes inexplicable after a rebrand |
| `localeVersion` | The locale definition in force | Locale-rule changes cannot be correlated with quality changes |

**`strategyVersion` deserves emphasis.** It is the field that converts `ARC-001` §13 from reporting into learning. Without it on every produced artifact, there is no way to ask whether a strategy worked.

## 5.5 Provenance fields

What produced this, and how. Required on every produced artifact; supplied by the runtime, never authored by the producing component (`GDE-002` §6.7).

| Field | Purpose |
|---|---|
| `producer` | Component name and version — the accountable party |
| `agentId`, `agentVersion` | The agent, where one produced this (`STD-000` §3.8) |
| `promptVersion` | Immutable content-addressed prompt identity — the field that makes quality changes attributable (`STD-000` §4.9) |
| `provider`, `modelId`, `modelVersion` | Recorded for audit only. **These MUST NOT influence any consumer's behaviour** (`STD-000` Rule 5) |
| `parameters` | Normalised sampling parameters, for reproducibility |

**The provider and model fields are the one place vendor identity is permitted above the abstraction layer** (`ARC-001` §4.9), and they exist purely as an audit record. Any consumer branching on them is a violation of AI independence and a review failure.

## 5.6 Metadata rules

1. **`meta` MUST NOT carry business data.** If a consumer branches on it to make a business decision, it belongs in `data` (§4.3).
2. **`meta` MUST NOT be stripped** from stored artifacts (`STD-000` §5.6). A stripped artifact is unattributable and therefore worthless for audit, replay, and learning.
3. **`meta` MUST NOT carry secrets, credentials, or PII** beyond what the task requires (`STD-000` §10.3).
4. **`meta` MUST pass the orphan test** (§2.4).
5. **`meta` is bounded.** It is fixed overhead on every message; unbounded metadata growth is a platform-wide cost.

---

# 6. Payload Standards

Formatting, naming, and type conventions are fixed by `STD-000` §5.2 and §5.9. Output design method for agents is `GDE-002` §6. This section covers **payload composition** — the structural rules that apply to every contract's `data` block regardless of category.

## 6.1 Required fields

A field is required when the contract is meaningless without it. Requiredness is a design decision, not a hedge.

- Required fields MUST always be present. Present-but-empty is not presence (`STD-000` §5.4).
- A field MUST NOT be required if a producer might legitimately be unable to supply it. That case needs the declared-unknown mechanism (§6.5), not a required field the producer is forced to invent a value for.
- Adding a required field to an existing contract is **breaking** (`STD-000` §5.5).

## 6.2 Optional fields

A field is optional when the contract has genuinely different, correct, documented behaviour with and without it.

- Every optional field MUST document **what its absence means** and **what the consumer does** when it is absent. An optional field without declared absence semantics is a required field with the requirement undocumented — and it will produce divergent behaviour across consumers the first time it is genuinely omitted.
- Optional MUST NOT be used to avoid the work of guaranteeing a value upstream. That pushes uncertainty into every consumer.
- Optional fields MUST be omitted when absent, never present as `null` (§6.5).

## 6.3 Object naming and composition

- Objects MUST be named for **what they are**, not for their position or their relationship to something else. `thumbnailConcept` is a thing; `secondaryData` is a location.
- Objects MUST be cohesive: every field within an object should be relevant to the same subject. An object whose fields divide into two unrelated clusters is two objects.
- Fields MUST NOT be prefixed with their containing object's name. Nesting already supplies that context, and the redundancy costs tokens on every message.
- Wrapper objects with a single field MUST NOT exist unless the wrapper is expected to gain siblings, and that expectation is documented.

## 6.4 Nesting

- **Maximum nesting depth is four levels** below `data`. Beyond that, structure becomes hard to validate, hard to reference, hard to diff, and hard for both humans and models to produce correctly.
- Depth beyond three levels SHOULD prompt a review of whether the deep structure is really a separate artifact that ought to be referenced rather than embedded (§10).
- Nesting MUST reflect genuine containment, not grouping for tidiness. Fields grouped into an object purely for visual organisation add a path segment to every reference and every validation finding, for no semantic gain.

## 6.5 Null handling — the one rule

Four states are distinguishable in JSON, and permitting all four is a defect factory. The platform permits two.

| State | Permitted | Meaning |
|---|---|---|
| Field present with a value | Yes | The value |
| Field **absent** | Yes | Not applicable, or not supplied |
| Field present with `null` | **Only where the schema explicitly declares null as a distinct meaningful value, and documents it** | The documented meaning |
| Field present with `""` or `[]` as a proxy for absence | **Never** | — |

**The rule:** absence is expressed by omission. Empty string is a string that is empty. An empty array is an empty collection — not a missing one (`STD-000` §5.4, Rule 16).

**Why this matters more here than elsewhere.** Language models produce all four states interchangeably unless the schema forbids it. Permitting the distinction between "absent" and "null" as *both* meaning absence guarantees that different producers will choose differently and consumers will handle only one.

## 6.6 Arrays and collections

- Arrays MUST NEVER be `null`. The empty case is `[]` (`STD-000` Rule 16).
- Every array MUST declare its **ordering semantics** — meaningful (and what the order signifies) or explicitly unordered. Undeclared ordering means consumers will rely on incidental order and break when it changes.
- Every array MUST declare **minimum and maximum cardinality**. Unbounded arrays are cost risk, truncation risk, and fan-out risk simultaneously (`STD-000` §11.6).
- Arrays MUST be **homogeneous** — every element the same type. Mixed-type arrays defeat validation and force conditional parsing (§2.2).
- Where elements have stable identity, each element MUST carry an identifier. Positional identity breaks the moment anything is inserted, removed, or reordered, and it makes validation findings unlocatable.
- **Arrays of key–value pairs MUST NOT be used where an object would serve.** A pair array is an object with the type information removed.
- Conversely, **objects with dynamic keys MUST NOT be used where an array of identified elements would serve.** Dynamic keys cannot be validated, cannot be documented, and cannot be referenced by a stable path.

## 6.7 Variant structures

Where a payload can take several shapes, the variance MUST be expressed as a **discriminated union**: a required, closed enumeration field naming the variant, with each variant's shape defined per value.

This is the only permitted mechanism for shape variance. Specifically forbidden:

- Inferring the variant from which fields are present.
- Fields whose type changes by context — sometimes a string, sometimes an object.
- Fields whose *meaning* changes by context while the type stays the same. This is the most damaging form, because nothing fails; consumers simply misinterpret.

Discriminated unions keep the contract deterministic (§2.2), keep the schema closed, and let consumers handle unknown variants explicitly rather than by accident.

## 6.8 Defaults

- **Defaults belong to the schema and the consumer, never to the producer.** A producer MUST NOT apply a default value and emit it as though it had been supplied — that erases the distinction between "chosen" and "defaulted," which is exactly the distinction anyone diagnosing behaviour needs.
- Where a default exists, the schema declares it and the field is optional. The producer omits it; the consumer applies it.
- Defaults MUST NOT change within a major version. A changed default silently changes behaviour for every message that relied on it.
- **A required field has no default.** If a default would be acceptable, the field is optional.

## 6.9 Payload composition rules

1. Every field traces to a consumer and a decision (`GDE-002` §6.1). Fields no one consumes are pure cost and eventually acquire a dependent.
2. Every decision is a closed enumeration; free text where an enumeration would serve is forbidden (`STD-000` §5.2).
3. Every string declares a length range and a counting unit (`STD-000` §5.9).
4. Every value bearing a unit names the unit in the field name (`STD-000` §5.2).
5. Prose is permitted only in fields explicitly declared to contain prose; markup only in fields explicitly declared to contain markup (`STD-000` §5.9).
6. The payload MUST NOT echo its request, restate its metadata, or carry reasoning (`GDE-002` §6.8).

---

# 7. Versioning Strategy

## 7.1 Three version axes

The platform versions three distinct things, on three distinct clocks. Confusing them is the most common versioning error.

| Axis | Versions | Clock | Changed by |
|---|---|---|---|
| **`contractVersion`** | The envelope format, platform-wide | Years | A platform-wide structural change |
| **`schemaVersion`** | One contract's payload schema | Weeks to months | That contract's evolution |
| **Referenced artifact versions** | Prompts, agents, workflows, strategies, brands, locales | Continuously | Their own lifecycles |

A change on one axis MUST NOT force a change on another. Agent versions moving daily must not re-version the envelope; an envelope change must not invalidate stored payload schemas.

## 7.2 Compatibility rules

Semantic versioning rules are fixed by `STD-000` §5.5. The operational matrix:

| Change | Version impact | Consumer action |
|---|---|---|
| Add an optional field | MINOR | None |
| Add an enumeration value to an **open** enum | MINOR | Handle unknown members via declared fallback |
| Add an enumeration value to a **closed** enum | **MAJOR** | Migrate |
| Add a required field | **MAJOR** | Migrate |
| Remove any field | **MAJOR** | Migrate |
| Make an optional field required | **MAJOR** | Migrate |
| Narrow a type, range, or length | **MAJOR** | Migrate |
| Widen a type or range | **MAJOR** | Migrate — consumers may have relied on the narrower bound |
| Change a field's meaning | **PROHIBITED** | — |
| Change a default | **MAJOR** | Migrate |
| Change ordering semantics | **MAJOR** | Migrate |
| Documentation only | PATCH | None |

**Widening is breaking.** This is counter-intuitive and routinely missed. A consumer that allocated for a maximum of five items, or assumed a value between one and ten, breaks when the producer starts sending fifteen or eleven — even though nothing about the change "removed" anything.

**Every enumeration MUST declare whether it is closed or open** (`STD-000` §5.5). Default is closed. An open enum shifts the burden to consumers, who MUST declare a fallback behaviour for unknown members; that trade is sometimes correct but is never automatic.

## 7.3 Version resolution

Producers and consumers never negotiate at message time. Versions are **resolved once at run start and pinned for the run's life** (`ARC-001` §6.7).

Consequences worth stating:

- A deployment mid-run cannot change what that run produces or expects.
- A run suspended at an approval gate for a week resumes under the versions it started with.
- Multiple major versions are live simultaneously, which is normal and expected, not a migration failure.

## 7.4 Deprecation

1. **Announce** — the version is marked deprecated with a stated replacement and end-of-support date.
2. **Warn** — validation surfaces a warning; usage is tracked per consumer.
3. **Support** — the full published window, during which the deprecated version behaves exactly as before. Behaviour MUST NOT degrade during deprecation; a version that is unreliable is retired, not deprecated.
4. **Retire** — the version is no longer produced or accepted for new work.
5. **Retain** — the schema remains **resolvable forever**, because historical artifacts must be readable under the version they were written with (`STD-000` §5.5, `ARC-001` §6.2).

Silent breaking changes are prohibited without exception (`STD-000` Rule 55).

## 7.5 Migration

Migration is a **producer-driven, consumer-paced** process. The producer makes the new version available; consumers migrate within the window on their own schedule. Mechanics in §13.2.

Migration guidance MUST accompany every major version: what changed, why, field-by-field mapping, and what a consumer must do. A major version without migration guidance is an unannounced breaking change with a number attached.

---

# 8. Validation Contracts

## 8.1 Purpose and shape

A Validation Result reports the outcome of one or more verification stages against a specific artifact version. It is produced by the validation plane and is a permanently retained artifact (§3.3).

```
{
  "contractType": "VALIDATION_RESULT",
  "meta":   { … , "subject": { "type": "…", "id": "…", "version": "…" } },
  "status": "FAILURE",
  "validation": {
    "outcome":     "FAILED",
    "stages":      [ { "stage": "STRUCTURAL",  "outcome": "PASSED",  "durationMs": 4  },
                     { "stage": "BUSINESS",    "outcome": "FAILED",  "durationMs": 12 } ],
    "findings":    [ … ],
    "confidence":  { "value": 0.0, "basis": "DETERMINISTIC" },
    "recommendations": [ … ]
  }
}
```

*(Contract illustration only — not an implementation.)*

## 8.2 Status

The overall `outcome` is one of:

| Outcome | Meaning | Downstream effect |
|---|---|---|
| `PASSED` | Every stage passed; no blocking findings | Proceed |
| `PASSED_WITH_WARNINGS` | No blocking findings; non-blocking findings present | Proceed; findings recorded for analysis |
| `FAILED` | One or more blocking findings | Repair, regenerate, escalate, or fail per policy |
| `BLOCKED` | A fail-closed gate could not reach a positive result | Halt; escalate. **Never treated as a pass** |
| `INCONCLUSIVE` | Validation could not complete | Halt; escalate. **Never treated as a pass** |

**Aggregation rule.** The overall outcome is the **most severe** stage outcome, never an average and never a majority. A single blocking finding fails the whole result regardless of how many stages passed.

**`BLOCKED` and `INCONCLUSIVE` are distinct from `FAILED` and from each other,** and the distinction matters operationally: `FAILED` means the artifact is wrong; `BLOCKED` means a gate refused; `INCONCLUSIVE` means the system does not know. All three stop progression (`STD-000` Rule 36), but they call for different human responses.

## 8.3 Findings

Every finding MUST carry:

| Field | Purpose |
|---|---|
| `ruleId` | Stable identifier of the rule violated — enables per-rule failure-rate measurement |
| `severity` | `BLOCKER` \| `ERROR` \| `WARNING` \| `INFO` (`STD-000` §6.1) |
| `path` | Machine-readable location in the subject artifact |
| `expected` / `actual` | What the rule required and what was found |
| `message` | Human-readable statement for a reviewer |
| `suggestion` | A concrete correction, where one can be stated |
| `basis` | `DETERMINISTIC` \| `MODEL_ASSESSED` \| `HUMAN` |

Two of these carry disproportionate weight:

**`path` is what makes repair possible.** A finding without a machine-readable location forces full regeneration instead of targeted repair (`GDE-002` §10.3), converting a cheap correction into an expensive one.

**`basis` is what makes findings trustworthy.** A deterministic finding is a fact; a model-assessed finding is a judgment with known error characteristics. Presenting them identically leads consumers — and reviewers — to treat a judgment as a fact. Every model-assessed finding MUST be marked as such.

**All findings MUST be reported, not just the first** (`STD-000` §6.2). Serial single-finding repair loops multiply cost and latency directly.

## 8.4 Confidence

Where present, confidence follows `STD-000` §6.5: a decimal in `[0.0, 1.0]` with documented meaning. In a Validation Result it MUST additionally declare its **basis**:

- `DETERMINISTIC` — the check is mechanical. Confidence is `1.0` or absent; a deterministic check does not have an opinion.
- `MODEL_ASSESSED` — a judgment. The confidence is a model's, with all the calibration caveats that implies.
- `AGGREGATE` — derived from agreement across independent assessments. The most trustworthy form, and the basis MUST state how many and what kind.

Confidence MUST NOT be attached to deterministic findings as decoration. A schema violation is not 94% certain.

## 8.5 Warnings, errors, and recommendations

Three distinct things, frequently conflated:

| Kind | Blocks progression | Requires action | Purpose |
|---|---|---|---|
| **Error** (`BLOCKER`/`ERROR`) | Yes | Yes | The artifact is not acceptable |
| **Warning** | No | No | Acceptable, but notable; recorded for trend analysis |
| **Recommendation** | No | No | A suggested improvement, not a defect |

Rules: warnings MUST NOT be used for things that should block — a warning that everyone ignores is a defect in the rule's severity, not in the reader. Recommendations MUST NOT be actionable requirements in disguise. Warning volume MUST be monitored; a validation stage producing warnings on most artifacts is miscalibrated and should be either promoted to a rule or removed.

## 8.6 Validation contract rules

1. A Validation Result MUST identify its **subject artifact and version** precisely. A result that cannot be tied to an exact version is unusable for attribution.
2. A Validation Result MUST be produced by an independent party, never by the artifact's producer (`ARC-001` §9.3).
3. Validation Results MUST be retained whether they passed or failed. Passes are as informative as failures when analysing version-to-version change.
4. A Validation Result MUST NOT modify its subject. Any correction is a separate, recorded repair (`STD-000` §6.8).
5. Absent a positive result, progression MUST NOT occur (`STD-000` Rule 36).

---

# 9. Error Contracts

## 9.1 Relationship to `STD-000` §8

`STD-000` §8 defines the error object — its fields, categories, severity levels, and code naming convention. That definition is binding and is not restated. This section defines how errors **appear in contracts**.

## 9.2 Two forms

| Form | When | Shape |
|---|---|---|
| **Error contract** | The operation failed; there is no work product | `contractType: "ERROR"`, `status: "FAILURE"`, `issues` populated, `data` absent |
| **Embedded issues** | The operation succeeded with non-blocking findings | `status: "SUCCESS"`, `data` present, `issues` carrying warnings only |

`issues` is always an **array**. A single error is an array of one. Multiple errors MUST all be reported — a caller that receives one error, fixes it, and receives the next is being made to serialise work that could have been parallel.

## 9.3 Category mapping

The canonical category set is `STD-000` §8.2 and is the authority. The shorthand categories in common use map as follows:

| Shorthand | Canonical categories (`STD-000` §8.2) |
|---|---|
| Validation | `VALIDATION` |
| AI | `AI_PROVIDER` (the provider failed) · `AI_OUTPUT` (the response was unusable) |
| Security | `SECURITY` · `AUTH` · `PERMISSION` |
| Workflow | `WORKFLOW` |
| Timeout | `TIMEOUT` |
| External Service | `EXTERNAL_API` · `NETWORK` · `RATE_LIMIT` · `QUOTA` |
| Unknown | `UNKNOWN` |

**`AI_PROVIDER` and `AI_OUTPUT` must not be collapsed.** The first is transient and retryable; the second is a repair or escalation case. Merging them produces either futile retries or abandoned recoverable work.

**`UNKNOWN` is a defect in the taxonomy**, not a resting category. Every occurrence is triaged and reclassified (`STD-000` §8.2).

## 9.4 Severity and recoverability

Severity (`FATAL` / `ERROR` / `WARNING` / `INFO`) and category are **orthogonal** (`STD-000` §8.3). Severity states how bad it is; category states what kind of thing it is; `retryable` states whether another attempt could succeed.

**`retryable` MUST be set by the producer**, derived from category, never inferred by the consumer from message text (`STD-000` Rule 29). A consumer parsing error strings to decide whether to retry is the failure mode this field exists to prevent.

The three-outcome distinction from `GDE-002` §11.2 — declared unknown, typed failure, refusal — is expressed on the wire as:

| Outcome | `status` | `issues` | `data` |
|---|---|---|---|
| Declared unknown | `SUCCESS` | Absent, or warnings | Present, with the declared unknown representation |
| Typed failure | `FAILURE` | Populated, `retryable` as appropriate | Absent |
| Refusal | `FAILURE` | Populated, `retryable: false` | Absent |

## 9.5 Error contract rules

1. An error MUST NEVER be a bare string. Errors are structured data (`STD-000` §8.5).
2. Codes MUST come from the registered catalogue and MUST be stable forever (`STD-000` §8.4).
3. Codes MUST NOT embed dynamic values; dynamic content belongs in `details`.
4. `message` (for engineers) and `userMessage` (for end users) MUST be separate, and `userMessage` MUST NOT leak internal structure, provider identity, prompt content, or identifiers (`STD-000` §8.1).
5. Raw provider responses MUST NEVER appear in an error contract. They are normalised at the adapter boundary (`ARC-001` §4.9) and redacted before logging.
6. Wrapping MUST preserve the cause chain. The root cause is what diagnosis needs (`STD-000` §8.1).
7. Every error MUST carry the `correlationId` of its originating run.
8. Partial failure in a fan-out MUST name **which items failed and why**. An aggregate "some failed" is not actionable.

---

# 10. Reference Standards

References are how contracts point at things without embedding them. They are the mechanism behind lineage, replay, deduplication, and message-size control — and the property that makes all of that work is immutability.

## 10.1 Reference structure

Every reference declares:

| Field | Purpose |
|---|---|
| `refType` | What kind of thing — artifact, asset, prompt, workflow, contract, configuration, external |
| `refId` | The target's identifier |
| `version` | The exact version. **Mandatory** — see §10.3 |
| `integrity` | Content hash, where the target is content-addressed |
| `role` | Why this contract references it — `INPUT`, `SOURCE`, `PARENT`, `SUPERSEDES`, `GOVERNS`, `PRODUCES` |
| `scope` | The tenant the reference resolves within |

**`role` is what makes a reference graph interpretable.** Without it, a set of references states only "these things are related," which supports no automated reasoning about lineage, supersession, or governance.

## 10.2 Reference types

| Type | Points at | Notes |
|---|---|---|
| **Artifact** | A previous contract's output — a script, dossier, package | Always version-pinned; the backbone of lineage |
| **Asset** | Binary media | Content-addressed; integrity hash mandatory |
| **Prompt** | An immutable prompt version | Recorded as provenance, never resolved by consumers |
| **Workflow** | A workflow definition version | For records and analytics attribution |
| **Contract** | Another message | For causation, supersession, and correction chains |
| **Configuration** | A strategy, brand, or locale version | The governing context |
| **External** | A source outside the platform | **Untrusted** — must carry a trust annotation (§14.6) |

## 10.3 Immutable references — the central rule

> **A reference MUST resolve to the same content forever.**

Every reference is version-pinned. Floating references — pointing at "the current version," "the latest," or "the active one" — are **prohibited in every artifact, record, manifest, and message.**

**Why this is absolute.** A floating reference makes a message's meaning depend on *when it is read*. That single property destroys, simultaneously:

- **Replay** — re-executing a run resolves different content than the original run did.
- **Reproducibility** — the same manifest produces a different video next month.
- **Audit** — a record of what was approved no longer shows what was approved.
- **Attribution** — performance cannot be tied to what actually produced it (`ARC-001` §13.2).
- **Debugging** — the artifact you are examining is not the artifact that failed.

Floating resolution is legitimate in exactly one place: **the governance layer at run start**, where "the channel's current strategy" is resolved into a specific pinned version (`ARC-001` §6.7). After that moment, everything downstream carries the pin. Resolution happens once, at the boundary, and never again.

## 10.4 Integrity

Where a target is content-addressed, the reference MUST carry its content hash. This gives:

- **Verification** — the resolved content is provably the referenced content.
- **Deduplication** — identical content is stored once (`STD-000` §5.8).
- **Tamper evidence** — substitution is detectable.

A reference whose resolved content fails its integrity check MUST be treated as a `DATA_INTEGRITY` error and MUST escalate — never as a cache miss, and never silently re-resolved.

## 10.5 Reference graph rules

1. **No cycles.** The reference graph is acyclic. Cycles are a `DATA_INTEGRITY` defect (§17.7).
2. **No cross-tenant references.** A reference MUST resolve within its declared scope. A cross-tenant reference is a critical security incident, not a validation warning (`ARC-001` §15.2).
3. **Depth is bounded.** Lineage chains have a declared maximum; unbounded traversal is a denial-of-service surface.
4. **Dangling references are errors.** Every reference must resolve at acceptance time (§12.4). Because targets are immutable and retained permanently, a dangling reference indicates data loss or corruption, never normal expiry.
5. **References are declared in the `references` block**, not scattered through the payload (§4.8). A payload field may carry an identifier for its own purposes; the authoritative reference is still declared in the block.

## 10.6 Reference versus embedding

| Embed | Reference |
|---|---|
| Small, and needed to interpret this message | Large |
| Meaningless outside this message | Independently meaningful |
| Would require a round trip for every consumer | Used by only some consumers |
| — | Any binary media, always |

**Default to referencing.** Embedding is an optimisation with a cost: embedded content is duplicated across every message that carries it, cannot be deduplicated, inflates message size permanently, and creates two copies that can diverge. Media is referenced without exception (`ARC-001` §8.2).

---

# 11. Manifest Contracts

## 11.1 What makes a manifest a manifest

A manifest is not merely a large contract. It is defined by a testable property:

> **The completeness test — could a conforming executor, with no access to the system that produced this manifest, produce the correct output from the manifest and its referenced artifacts alone?**

If the answer is no, it is a request, not a manifest. The distinction matters because everything valuable about manifests — re-execution, executor substitution, deterministic output, permanent replay — depends on that test passing.

## 11.2 The four properties

| Property | Requirement | Why |
|---|---|---|
| **Complete** | Every decision is made; nothing is left to executor discretion | Discretion means different executors produce different output |
| **Deterministic** | The same manifest and referenced content produce equivalent output every time | The basis of re-execution and verification |
| **Executor-neutral** | No engine-, vendor-, or platform-specific instruction | The basis of executor substitution (`ARC-001` §15.7) |
| **Immutable** | Versioned, content-addressed, never amended | A changed manifest is a different manifest |

**Executor-neutrality is the property most easily lost and hardest to recover.** One engine-specific instruction admitted "temporarily" makes every subsequent manifest engine-bound, and the loss is discovered only when someone tries to substitute the engine — by which time thousands of manifests carry the dependency. This is why `ARC-001` Constraint 14 states it absolutely.

## 11.3 Capability declaration

Every manifest declares the **capabilities its execution requires**. Every executor declares the capabilities it provides. Compatibility is checked **before** execution begins (`ARC-001` §11.4).

This is what makes executor-neutrality operational rather than aspirational: neutrality without capability declaration produces manifests that are nominally portable and fail unpredictably. Declaring requirements converts an unpredictable runtime failure into a deterministic pre-flight check.

## 11.4 Render Manifest

**Purpose.** The complete, engine-neutral description of a finished video (`ARC-001` §4.17, §11).

**Declares.** Timeline and structure; every media reference with timing; narration with alignment; captions; brand elements; audio mix and loudness target; output format requirements; required capabilities.

**Executed by.** The rendering layer, through an engine adapter.

**Significance.** This is the platform's **freeze point** (`ARC-001` §1.4) — the boundary between stochastic, expensive AI work and deterministic, cheap media work. Its completeness is what allows a video to be re-rendered at a different resolution, in a different aspect ratio, with a corrected asset, or on a different engine, **without a single model invocation**.

**Boundary.** A render manifest MUST NOT contain generation instructions. If rendering would need to generate something, the manifest is incomplete — which is a defect in compilation, not something the renderer should compensate for.

## 11.5 Asset Manifest

**Purpose.** Declare a set of assets with their provenance, rights, and roles.

**Declares.** Each asset's content-addressed reference and integrity hash; its provenance — what produced it, or what external source and licence it came from; its rights and licensing terms; its synthetic-media disclosure state; its role in the production.

**Consumed by.** The compliance gate, the manifest compiler, the asset service.

**Significance.** Rights and provenance are **capturable only at creation time** and are impossible to reconstruct after a claim (`STD-000` §1.5). The asset manifest is where that record lives, and an asset lacking it cannot clear the compliance gate — making the requirement structural rather than procedural.

## 11.6 Publishing Manifest

**Purpose.** Completely specify a publication, per destination.

**Declares.** The media variant reference; destination metadata within that platform's declared limits; scheduling intent; disclosure declarations; the approval record reference; the compliance clearance reference; idempotency key.

**Executed by.** The publishing layer, through a platform adapter.

**Boundary.** A publishing manifest is **not authorization to publish.** Authorization is the approval record and compliance clearance it references. The manifest specifies *what* would be published; the gates decide *whether* (`ARC-001` §12.3).

## 11.7 Workflow Manifest

**Purpose.** Declare a workflow's complete resolved execution plan.

**Declares.** The workflow definition version; every pinned artifact version for the run — agents, prompts, schemas, validators, strategy, brand, locale; node structure with declared bounds and join semantics; approval gate placement; cost ceiling and deadline.

**Consumed by.** The workflow engine at run start; replay and audit thereafter.

**Significance.** This is the artifact that makes a run reproducible. It is the complete record of *what was pinned* (`ARC-001` §6.7), and it is what a replay resolves against rather than resolving current versions.

## 11.8 Manifest rules

1. A manifest MUST pass the completeness test (§11.1).
2. A manifest MUST be internally consistent — every reference resolvable, every timing coherent, no gaps or overlaps — and this MUST be validated at compilation, before execution is attempted.
3. A manifest MUST declare its required capabilities (§11.3).
4. A manifest MUST be immutable and retained permanently. Re-execution resolves the original, never a rebuilt equivalent.
5. A manifest MUST NOT contain executor-specific instruction.
6. A manifest MUST NOT contain authorization. It specifies; gates authorize.

---

# 12. Contract Validation Rules

## 12.1 Acceptance

A contract is **accepted** when it has passed every check below. An unaccepted contract MUST NOT be consumed, stored as an artifact, or acted upon.

Checks run in this order — cheapest and most discriminating first, so that expensive checks never run on a message that a structural check would have rejected.

```
  1. Structural       → schema conformance
  2. Completeness     → semantic presence, not just field presence
  3. Business         → domain rules
  4. Cross-reference  → the reference graph resolves
  5. Duplicate        → this is not a repeat
```

## 12.2 Structural validation

Conformance to the declared schema version (`STD-000` §6.2). Mandatory at every boundary, in both directions, with no trusted-caller exemption (§2.6).

Specifically checks: valid JSON; declared `contractVersion`, `contractType`, and `schemaVersion` all resolvable; envelope blocks correct for the category; closed-schema conformance with no unknown properties; every type, range, length, cardinality, and enumeration satisfied; the `status`/`data`/`issues` relationship correct.

**All violations MUST be reported together**, each with a machine-readable path (§8.3).

## 12.3 Completeness validation

Structural validity is not sufficiency. A message can satisfy every schema constraint and still be empty of content.

Checks: no placeholder or template residue; no degenerate values — filler, repeated padding, ellipsis continuations; no truncation, verified against the producer's stop reason rather than inferred from content; declared cardinality actually met; cross-block coherence, so that `references` covers everything the payload points at (`STD-000` §6.7).

**Truncation detection is not optional.** A response that ended because it hit a length limit is a failure, and it is the classic silent-corruption path — the message parses, validates, and is wrong.

## 12.4 Cross-reference validation

The check that only exists because references exist, and the one most often omitted.

Every reference MUST: resolve to an existing artifact; resolve to the **exact declared version**; pass its integrity check where a hash is declared; resolve within the declared tenant scope; and introduce no cycle into the graph.

Additionally, referenced **versions must be mutually compatible** — a manifest referencing a brand version incompatible with its locale version is structurally valid and semantically incoherent, and only cross-reference validation catches it.

**A cross-tenant reference MUST be treated as a `SECURITY` error and escalate immediately.** It is never a validation warning (§10.5).

## 12.5 Business validation

Domain rules that a schema cannot express (`STD-000` §6.3): cross-field coherence, conformance to the governing strategy, temporal sanity, and bounds appropriate to the channel, locale, and destination.

Rules are declarative, individually named, individually versioned, and individually testable. Every rule has a stable identifier used in findings, so that per-rule failure rates are measurable.

## 12.6 Duplicate detection

Two distinct concerns, frequently merged and requiring different responses:

| Kind | Detects | Response |
|---|---|---|
| **Message duplication** | The same message delivered more than once | Return the original result; do not re-execute. Normal and expected under at-least-once delivery (`ARC-001` §8.6) |
| **Content duplication** | Substantively repeated content | A quality and monetization finding requiring adjudication (`STD-000` §6.6) |

Message duplication is detected by `messageId` and idempotency key. Content duplication is detected by exact, normalised, and semantic comparison against channel history (`ARC-001` §4.12).

**Message duplication is not an error.** It is the expected consequence of durable at-least-once delivery, and treating it as a failure produces spurious alerts on healthy behaviour.

## 12.7 Rejection

A contract failing acceptance is **rejected**, never partially accepted or repaired in place.

- Rejection produces an Error contract naming every failure with paths (§9).
- Rejected contracts are retained for diagnosis, never discarded — a rejection you cannot examine is a defect you cannot fix.
- Repeated rejection at the same boundary is a producer defect and MUST alert; it indicates a contract mismatch, not a transient condition.
- Rejections for `SECURITY` or `DATA_INTEGRITY` reasons MUST escalate immediately and MUST NOT be absorbed by retry logic (`STD-000` §8.5).

---

# 13. Evolution Strategy

## 13.1 Strict readers, versioned writers

A common convention — *be liberal in what you accept, strict in what you send* — is **deliberately rejected** by this platform for structured contracts. The reasoning is worth recording, because the convention is widespread enough that its absence will otherwise look like an oversight.

Liberal acceptance means ignoring unknown properties. In a system whose producers include language models, that converts a producer defect into a silent data loss: the model emits a field the consumer quietly drops, and nothing indicates that anything was lost. The divergence surfaces weeks later as an unexplainable behavioural difference.

The platform therefore uses **closed schemas and strict readers** (`STD-000` §5.1), and obtains the flexibility that liberal acceptance was meant to provide from a different mechanism: **explicit versioning with coexistence**. Multiple versions run simultaneously; consumers migrate on their own schedule; nothing is silently tolerated and nothing is silently lost.

The trade is deliberate: more version management, in exchange for no silent divergence.

## 13.2 Expand and contract

The standard mechanism for evolving a contract without breaking anyone. Four phases, and **the order is not negotiable**.

```
  PHASE 1 · EXPAND
    Producer emits both old and new fields.
    New field is OPTIONAL. Old field remains authoritative.
    → Consumers unaffected. Version: MINOR.

  PHASE 2 · MIGRATE
    Consumers adopt the new field on their own schedule.
    Producer emits both. Adoption is tracked per consumer.
    → Nothing breaks. No version change.

  PHASE 3 · DEPRECATE
    Old field marked deprecated with an end-of-support date.
    Remaining usage tracked and communicated.
    → Warnings only. No version change.

  PHASE 4 · CONTRACT
    Old field removed after the support window and after
    usage reaches zero.
    → Version: MAJOR.
```

**Phase 4 requires verified zero usage, not an elapsed date.** Removing a field on schedule while a consumer still reads it is a breaking change with a calendar attached. Usage tracking is what makes the window meaningful.

Where the old and new fields must both be populated during phases 1–3, the producer bears the cost of maintaining both. That cost is the price of not externalising the migration onto every consumer at once (§2.3).

## 13.3 Evolving enumerations

The hardest evolution case, because adding a value looks additive and usually is not.

- **Closed enum (default)** — adding a value is **MAJOR**. Consumers match exhaustively and an unknown member is a genuine failure for them.
- **Open enum** — adding a value is MINOR, but only because consumers were required from the outset to declare a fallback for unknown members. Openness is a promise made at design time, not a decision made when the new value is needed.
- **Never** retrofit openness to a closed enum as a way of avoiding a major version. Consumers built against a closed enum have no fallback, and adding one silently changes their behaviour from "fail loudly" to "do something unspecified."
- **Never** remove or repurpose an enumeration value. Retire it: keep it valid for reading, stop producing it.

## 13.4 Evolving references

- Adding a new **reference type** is MINOR if consumers ignore unknown types by declared policy; MAJOR otherwise.
- Adding a new **role** follows the same rule as any enumeration (§13.3).
- **Changing what a reference points at is prohibited.** That is repurposing, and it is undetectable by consumers (§2.7).

## 13.5 Run pinning as the safety net

Version pinning at run start (`ARC-001` §6.7) is what makes contract evolution survivable in practice: an in-flight run, including one suspended at an approval gate for days, is completely insulated from a contract change deployed while it was running.

This is why evolution can proceed continuously without a maintenance window, and why a deployment can never corrupt work already in progress. Every other mechanism in this section assumes it.

## 13.6 Evolution rules

1. Additive within a major version; anything else is a major version (§7.2).
2. Never repurpose a name — field, enumeration value, or reference role (`STD-000` §5.5).
3. Expand before contract, always; never contract first (§13.2).
4. Track usage; retire on verified zero, not on a date.
5. Migration guidance accompanies every major version (§7.5).
6. Historical artifacts are read under their original schema version, forever (§2.5).
7. Every change is evaluated for its effect on message size and cost (§15.1).

---

# 14. Security Considerations

Platform security standards are `STD-000` §10; trust boundaries are `ARC-001` §15. This section covers only the properties of **contracts themselves**.

## 14.1 Sensitive field classification

Every field carrying anything sensitive MUST be classified in its schema, and the classification determines handling in logs, storage, and any surface.

| Class | Examples | Handling |
|---|---|---|
| `PUBLIC` | Published titles, public metadata | No restriction |
| `INTERNAL` | Scripts, briefs, strategy content | Tenant-scoped; not externally exposed |
| `SENSITIVE` | Prompt content, cost data, performance figures | Restricted access; redacted in general logs |
| `RESTRICTED` | PII, identifiable individuals | Minimised, access-audited, deletion-propagated |
| `SECRET` | Credentials, tokens, keys | **MUST NEVER appear in any contract** |

**`SECRET` is not a handling instruction; it is a prohibition.** Contracts never carry credentials. Components requiring credentials resolve them from the vault under their own authority (`ARC-001` §15.3); a credential in a contract has already been copied into logs, storage, and message history before anyone notices.

## 14.2 Redaction

- Redaction is declared **in the schema**, per field, so that it is applied uniformly and automatically rather than at each producer's discretion (`STD-000` §9.7).
- Redaction MUST be enforced structurally at the logging and storage boundary. Redaction left to individual call sites fails reliably.
- Redaction MUST be **visible**: a redacted field is marked as redacted, not silently omitted. A silently dropped field is indistinguishable from a producer defect.
- Redaction MUST be verified by automated testing. Unverified redaction fails.

## 14.3 Encryption boundaries

- All contracts in transit are encrypted, internal hops included (`STD-000` §10.4).
- Contracts at rest are encrypted; contracts containing `RESTRICTED` fields receive application-level encryption in addition, so that storage compromise alone is insufficient.
- **Encryption is not a substitute for classification.** An encrypted contract carrying a credential is still a contract carrying a credential — it will be decrypted somewhere, by something, and copied.

## 14.4 Trust boundaries

Contracts cross the trust zones defined in `ARC-001` §15.1, and a contract's required treatment depends on which boundaries it crosses:

| Crossing | Requirement |
|---|---|
| Zone 0 → Zone 1 (untrusted in) | Sanitised, bounded, trust-annotated (§14.6) |
| Zone 1 → Zone 2 (into execution) | Authenticated, authorized, tenant-scoped |
| Zone 2 → Zone 3 (into privileged control) | Fully validated; proposals only, never authorizations (`ARC-001` §15.4) |
| Zone 3 → Zone 4 (into secrets) | Contracts do not cross this boundary |

**No contract crosses a tenant boundary.** There is no legitimate contract whose producer and consumer are different tenants (`ARC-001` §15.2).

## 14.5 Signatures and integrity

Signing is not universal — it has real cost and is warranted where a contract's authenticity is itself load-bearing:

| Contract | Signed | Why |
|---|---|---|
| Records (approval, publication, cost) | **Yes** | Evidentiary; must be provably unaltered |
| Audit entries | **Yes** | Tamper evidence is the point |
| Manifests | **Yes** | Executed later, possibly by a substituted executor |
| Third-party agent output | **Yes** | Producer authenticity is not otherwise assured |
| Ordinary internal Requests, Responses, Events | No | Transport and tenant isolation are sufficient |

Content integrity is carried on references as content hashes (§10.4). A failed integrity check is a `DATA_INTEGRITY` error that escalates — never a cache miss.

## 14.6 Trust annotation on untrusted content

Any payload field carrying content that originated outside the platform MUST be **annotated as untrusted in the schema**.

This annotation is load-bearing, not documentation. It drives: delimiting and labelling when the content enters a prompt (`STD-000` §10.5); size bounding before invocation, as a denial-of-wallet control; sanitisation before rendering or publication; and the capability restrictions applied to any component that handles it (`ARC-001` §15.4).

**Model output is untrusted input to every downstream consumer**, including other agents (`STD-000` §10.6). A contract carrying model output into a rendering or publishing path MUST annotate it accordingly.

## 14.7 Contract security rules

1. No credentials in any contract, ever (§14.1).
2. No raw provider responses in any contract; normalised at the adapter boundary (§9.5).
3. No prompt content in any contract exposed outside the platform (`STD-000` §10.7).
4. Sensitive fields classified in the schema, redaction enforced structurally.
5. Untrusted content annotated in the schema.
6. Every contract tenant-scoped; cross-tenant references escalate as security incidents.
7. Model output never carries authorization; proposals only (`STD-000` Rule 38).
8. Error contracts never leak internal structure to end users (§9.5).

---

# 15. Performance Considerations

## 15.1 Contract size

Contracts are exchanged constantly, validated on every hop, stored permanently, and — for agent contracts — consumed by models at direct token cost. Size is therefore a first-class design property, not an afterthought.

- Every contract MUST declare a **maximum size**. Unbounded contracts are a cost, memory, and availability risk (`STD-000` §5.1).
- `meta` is **fixed overhead on every message**. It must stay lean; a field added to metadata is paid for by every contract in the platform, forever.
- Payload size is bounded by field-level constraints — string lengths, array cardinalities (§6.6).
- Size distributions MUST be monitored. Growth is usually gradual and passes every individual review.

## 15.2 Payload optimisation

The highest-leverage decision is **reference versus embed** (§10.6). Referencing keeps messages small, enables deduplication, and avoids permanently duplicating content across every message that mentions it.

Secondary measures:

- Do not echo the request in the response (§6.9).
- Do not restate metadata inside the payload.
- Do not carry reasoning, explanation, or commentary (`GDE-002` §6.8).
- Do not include fields with no consumer (`GDE-002` §6.1).
- Prefer identifiers to embedded objects where the consumer will not use the object's contents.

**What not to do.** Key names MUST NOT be abbreviated to save bytes (`STD-000` §5.2). Self-describing names are worth their cost: they reduce model error rates on generated contracts and reduce human error everywhere else. Optimise structure, not vocabulary.

## 15.3 Compression

- Compression is a transport and storage concern, applied below the contract layer. Contracts are designed as though uncompressed, because compression does not remove the cost of validating, parsing, or reasoning about oversized structures — and it does nothing at all for token cost when a contract reaches a model.
- Compression MUST NOT be relied upon to make an oversized contract acceptable. It hides a design defect rather than fixing it.
- Content-addressed artifacts are stored once; deduplication is a far larger win than compression on repeated content.

## 15.4 Streaming compatibility

**Contracts are validated as complete documents and are never processed incrementally** (`STD-000` §11.4). Partial structured output is not validated output, and acting on it violates the determinism guarantee.

What "streaming compatible" therefore means here:

- A streamed response is **assembled fully, then validated** as one document. Interrupted streams are failures, never partial successes.
- Streaming is legitimate for human-facing progressive display, and MUST NOT be used to begin downstream processing.
- **Large artifacts are streamed as content, not as contracts.** A contract references media; the media itself streams through the storage layer without ever being buffered as part of a message (`STD-000` §11.7).

## 15.5 Partial loading

Consumers frequently need only part of a contract — analytics needs `meta` and a few payload fields; triage needs `meta` and `issues`; audit needs `meta` and `references`.

The envelope's **block separation is what makes this possible** (§4.1). Because identity, provenance, payload, validation, execution, and references are separate top-level blocks rather than intermingled, a consumer can process the blocks it needs without materialising the rest.

Design rules that preserve this:

- Keep blocks genuinely separable; do not spread one concern across several blocks.
- Keep `meta` small enough to be read cheaply on its own — it is the block most frequently read in isolation.
- Declare references in the `references` block so the dependency graph can be traversed without parsing payloads (§4.8).
- Do not nest independently useful structures so deeply that extracting them requires parsing everything above them (§6.4).

## 15.6 Validation cost

Validation runs on every hop, so its cost is multiplied by the number of boundaries.

- Order checks cheapest-first (§12.1). Structural rejection must never be preceded by expensive work.
- Deterministic checks always precede model-based ones (`STD-000` §6.1).
- Cross-reference validation involves resolution and is therefore the most expensive structural check — it runs after everything cheaper has passed.
- Bounded contracts keep validation bounded. Unbounded arrays make validation cost unbounded too, not just generation cost.

---

# 16. Best Practices

A working list. Each is stated so it can be checked in review.

**Design**

1. Design the contract before either side; derive it from consumer need, never from producer convenience.
2. Name every field for what it is, not where it sits or how it is used.
3. Give every field a named consumer and a decision. If you cannot, delete it.
4. Make every decision a closed enumeration. Free text where an enumeration would serve is a permanent loss of analysability.
5. Bound everything — strings, arrays, nesting depth, total size.
6. Express variance with a discriminated union, never with inferred shape.
7. Keep nesting at or below four levels; deep structure usually wants to be a referenced artifact.
8. Prefer a referenced artifact to a large embedded one.

**Semantics**

9. Express absence by omission. One rule, applied everywhere.
10. Name the unit in the field name whenever a value has one.
11. Declare ordering semantics for every array.
12. Declare every enumeration as closed or open at design time, never retroactively.
13. Let defaults belong to the schema and the consumer; never emit a default as though it were supplied.
14. Document what absence means and what the consumer does about it, for every optional field.

**Metadata and references**

15. Pass the orphan test: any single message must be fully interpretable alone.
16. Carry `strategyVersion` on every produced artifact — it is what makes the learning loop possible.
17. Pin every reference to an exact version. Floating references are prohibited.
18. Declare a `role` on every reference, so the lineage graph means something.
19. Carry integrity hashes on content-addressed references.

**Versioning**

20. Version the envelope, the payload schema, and referenced artifacts independently.
21. Add optional fields; never repurpose a name.
22. Expand before you contract, and contract only on verified zero usage.
23. Ship migration guidance with every major version.
24. Remember that widening a bound is a breaking change.

**Operational**

25. Validate at every boundary, in both directions, with no trusted-caller exemptions.
26. Report every finding at once, each with a machine-readable path.
27. Mark model-assessed findings as such; never present a judgment as a fact.
28. Retain validation results whether they passed or failed.
29. Classify sensitive fields in the schema; enforce redaction structurally.
30. Annotate untrusted content in the schema, and treat model output as untrusted downstream.
31. Keep `meta` lean — it is paid for by every message in the platform.
32. Monitor contract size distributions; growth is gradual and passes every individual review.

---

# 17. Anti-Patterns

Each is stated as it appears, why it is harmful, how to detect it, and the fix.

### 17.1 Hidden fields

**Appears as.** Fields produced or consumed but absent from the schema; "internal" fields consumers are told to ignore; behaviour that depends on a field's presence rather than its value.

**Harmful because.** A field outside the schema is outside validation, versioning, documentation, and review. Consumers discover and depend on it anyway, and it becomes an undocumented contract that breaks without warning.

**Detect.** Closed schemas make it structurally impossible — which is the strongest argument for them.

**Fix.** Everything is in the schema, or it does not exist.

---

### 17.2 Silent breaking changes

**Appears as.** A field's meaning changed while its name stayed; a bound widened; an enumeration value added to a closed enum; a default changed.

**Harmful because.** Nothing fails. Consumers keep parsing successfully and interpreting wrongly, and the corruption propagates into everything derived from it before anyone notices.

**Detect.** Schema diffs reviewed against the compatibility matrix (§7.2) — not by reading the change description, which will describe the intent rather than the effect.

**Fix.** Major version, support window, migration guidance. Never a quiet edit.

---

### 17.3 Ambiguous naming

**Appears as.** `data`, `info`, `value`, `type`, `config` as field names. Unit-less numbers. Booleans that read as negations. Names that describe position rather than meaning.

**Harmful because.** Ambiguity is resolved differently by every reader, human and model. Unit-less numbers in a media pipeline are a recurring source of severe defects — seconds and milliseconds look identical in JSON.

**Detect.** Could two engineers give different answers about what this field holds?

**Fix.** Specific names; unit suffixes; positive booleans (`STD-000` §5.2).

---

### 17.4 Missing metadata

**Appears as.** Messages without correlation identifiers; artifacts stripped of provenance for size; events carrying only a payload.

**Harmful because.** Unattributable behaviour, un-replayable runs, and — during an incident — the discovery that the one field needed to join two systems was never carried. Metadata omitted is not recoverable later.

**Detect.** The orphan test (§2.4).

**Fix.** Metadata is mandatory and MUST NOT be stripped (§5.6).

---

### 17.5 Duplicate identity

**Appears as.** Two different things sharing an identifier; an identifier reused after deletion; the same logical artifact carrying different identifiers in different messages; positional identity in arrays.

**Harmful because.** Deduplication, idempotency, lineage, and attribution all break simultaneously, and the resulting corruption is exceptionally hard to diagnose because every individual message looks correct.

**Detect.** Any identifier assigned by more than one component, or reused for any reason.

**Fix.** Single immutable identity assigned once at creation; never reused (`STD-000` §5.8).

---

### 17.6 Metadata carrying business data

**Appears as.** A consumer branching on a `meta` field to make a business decision; provenance fields driving behaviour.

**Harmful because.** It couples business logic to provenance, which is exactly the coupling `STD-000` Rule 5 prohibits when the provenance is a model or provider identity. It also makes metadata unbounded, since every business need adds a field paid for by every message.

**Detect.** Any consumer reading `meta` for anything except correlation, audit, or display.

**Fix.** The block placement rule (§4.3). If a consumer branches on it, it belongs in `data`.

---

### 17.7 Circular references

**Appears as.** Artifact A referencing B, which references A. Bidirectional parent/child links. Self-referencing lineage.

**Harmful because.** Traversal does not terminate; validation does not terminate; lineage becomes uncomputable; and the cycle usually indicates that a genuine hierarchy has been modelled as a mesh.

**Detect.** Cycle detection during cross-reference validation (§12.4).

**Fix.** References point one way — toward the past and toward inputs. If reverse traversal is needed, it is derived at query time, never stored as a reciprocal reference.

---

### 17.8 Deep nesting

**Appears as.** Structures five or more levels below `data`; objects created purely to group fields visually.

**Harmful because.** Long paths in every validation finding; harder correct generation by models; harder partial loading; harder diffing; and structures that cannot be referenced independently.

**Detect.** Depth exceeding four (§6.4).

**Fix.** Flatten, or promote the deep structure to a separately referenced artifact.

---

### 17.9 Mixed responsibilities

**Appears as.** One contract serving two unrelated purposes; a Response that is also an Event; a payload whose fields divide into clusters no consumer uses together; error information mixed into a success payload.

**Harmful because.** The contract must version whenever either concern changes, doubling churn for every consumer. Neither concern can evolve independently, and consumers of one half are disrupted by changes to the other.

**Detect.** Two field clusters with disjoint consumers. A `contractType` that could plausibly be two values.

**Fix.** Split. Contracts follow single responsibility exactly as agents do (`STD-000` §2.1).

---

### 17.10 Versioning inside field names

**Appears as.** `titleV2`, `newDescription`, `descriptionLegacy`.

**Harmful because.** It moves version management into the payload, where it is invisible to tooling, unenforceable by validation, and permanent — nobody ever removes the old field, and every consumer must guess which one is authoritative.

**Detect.** Any version indicator, or any word like "new," "old," or "legacy," in a field name.

**Fix.** Version the schema, not the field. Use expand-and-contract (§13.2).

---

### 17.11 Stringly-typed payloads

**Appears as.** Enumerations as free strings; numbers as strings; dates in inconsistent formats; structured data serialised into a single string field; JSON embedded in a JSON string.

**Harmful because.** Validation cannot check it, consumers must parse it, and every parser is an opportunity to disagree. Embedded serialised JSON in particular escapes the schema entirely — it is a hidden field (§17.1) wearing a disguise.

**Detect.** Any string field whose contents have internal structure that is not declared.

**Fix.** Model the structure. If it is data, it belongs in the schema.

---

### 17.12 The god payload

**Appears as.** One large contract carrying everything any consumer might want, because "it's all related."

**Harmful because.** Every consumer pays the full size cost, validation cost, and token cost for the fraction it uses. Every change disturbs every consumer. Nothing can be loaded partially in practice, because the concerns are intermingled.

**Detect.** A payload where no single consumer uses most fields.

**Fix.** Split by consumer need; reference rather than embed (§10.6).

---

### 17.13 Floating references

**Appears as.** A reference to "the current strategy," "the latest brand kit," or an identifier with no version.

**Harmful because.** The message's meaning changes depending on when it is read, which destroys replay, reproducibility, audit, and attribution simultaneously (§10.3).

**Detect.** Any reference without an exact version.

**Fix.** Resolve floating references once, in the governance layer at run start. Everything downstream carries the pin.

---

# 18. Future Expansion

## 18.1 Why contracts scale additively

Contracts are the platform's coupling surface (§1.3). Because every contract is independently named, independently versioned, and independently validated, adding one cannot disturb any other. A new contract is unreferenced until something chooses to consume it.

This is the same additive property that holds for agents (`GDE-002` §16.1), and it holds for the same structural reason.

## 18.2 New agents

**Adds.** Input and output schemas, registered as new contracts.

**Changes.** Nothing. No existing contract is touched.

**Requires.** Conformance to the universal envelope (§4), the payload rules (§6), and category classification (§3). There is no separate contract style for new agents, and no lighter standard for third-party ones.

## 18.3 New workflows

**Adds.** Workflow manifest instances; possibly new intermediate artifact contracts.

**Changes.** Nothing. Workflows compose existing contracts (`ARC-001` §14.2).

**Note.** If a new workflow requires an existing contract to change, the contract was designed around one workflow rather than around the artifact it represents — which is a contract-design defect, not a workflow constraint.

## 18.4 Multiple AI providers

**Adds.** Nothing at the contract level.

**Changes.** Nothing. Provider and model identity appear only as provenance in `meta`, recorded for audit, and MUST NOT influence any consumer's behaviour (§5.5).

**The test.** Adding a provider requires an adapter and configuration only (`STD-000` §14.6). If any contract must change, the abstraction has leaked and the leak is the defect — not the new provider.

**Corollary.** Provider-specific fields MUST NOT be added to domain contracts under any justification, including "temporarily." The first such field ends AI independence at the contract layer, and it will not be removed.

## 18.5 Multiple rendering engines

**Adds.** Engine capability declarations.

**Changes.** Nothing in the render manifest, which is engine-neutral by construction (§11.4).

**Requires.** New engines declare capabilities; manifests declare requirements; compatibility is checked before execution (§11.3). Manifest completeness (§11.1) is what allows a manifest produced years ago to be executed by an engine that did not exist when it was written.

## 18.6 Multiple publishing platforms

**Adds.** Platform capability descriptors as Configuration contracts; publishing manifest variants scoped by destination.

**Changes.** Nothing in the production pipeline's contracts. Destination-specific constraints live in descriptors, and adaptation is a declared transformation driven by them (`ARC-001` §12.5).

**Corollary.** Destination-specific fields MUST NOT leak into production contracts. A script contract that knows about a particular platform's title length has already forked the pipeline.

## 18.7 Other growth

| Growth | Contract impact |
|---|---|
| **New locale** | None structurally. Locale is in `meta`; locale-sensitive constraints are per-locale schema constraints (`STD-000` §15.5) |
| **New brand** | None. Brand is a versioned Configuration contract, referenced not embedded |
| **New media type** | New payload schemas and manifest variants; envelope unchanged |
| **New destination medium** | New contract categories only if a genuinely new lifecycle appears; otherwise new schemas within existing categories |
| **Third-party contracts** | Identical envelope, identical validation, identical versioning. No privileged path (`ARC-001` §17.5) |

## 18.8 What would require an envelope change

Stated honestly, so a future engineer can recognise when they have left the design rather than extended it:

- **A new universal block** that every contract must carry. This is a `contractVersion` change and a platform-wide migration.
- **A different correlation model** — for example, if runs became nestable in a way the current identifiers cannot express.
- **Multi-tenant contracts**, which would breach `ARC-001` §15.2 and require a new isolation model rather than an envelope field.
- **Streaming-native contracts** processed before completion, which would contradict `STD-000` §11.4 and the determinism guarantee that depends on it.

Each is possible. None is an extension. All would require an ADR, an amendment to `STD-000`, and revisions to `ARC-001` and this guide.

---

# Appendix A — Change Log

| Version | Date | Author | Type | Summary |
|---|---|---|---|---|
| 1.0 | 2026-08-09 | Platform Architecture | Added | Initial JSON contract guide: seven contract principles, nine-category taxonomy, universal envelope with block placement rule, four-group metadata catalogue, payload composition rules including discriminated unions and the null rule, three-axis versioning with compatibility matrix, validation and error contract representation, immutable reference standard, manifest contracts with the completeness test, five-stage acceptance validation, expand-and-contract evolution, contract security classification, size and partial-loading performance rules, thirty-two best practices, thirteen anti-patterns, and expansion paths. |

---

*End of document — GDE-003 v1.0. Governed by STD-000 v1.0. Situated by ARC-001 v1.0. Companion to GDE-002 v1.0.*

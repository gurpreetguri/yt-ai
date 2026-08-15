# AGT-01 — Topic Discovery Agent · Implementation Checklist

For the NestJS developer wiring this package into the platform. Ordered so that each step is verifiable before the next depends on it. Nothing here restates platform behaviour the runtime already provides — where the platform default applies, the item says so.

---

## 0. Prerequisites

- [ ] Confirm the agent runtime, validation plane, and workflow engine are available; this package is a **contract package**, not a service. It ships schemas, a prompt, types, and validators — no controller, no HTTP route, no queue consumer.
- [ ] Confirm the error catalogue accepts new code registrations (§5 below).
- [ ] Confirm the prompt registry supports content-addressed prompt versions (`STD-000` §4.9).
- [ ] Confirm AGT-00's Strategy Manifest is resolvable so the workflow can derive `strategyBinding` from it at run start — this agent never reads the full manifest itself.

---

## 1. Module placement

- [ ] Create `src/agents/topic-discovery/` in the agents module. Files land as:
  - `topic-discovery.schemas.ts` — re-exports the two JSON schemas as frozen constants
  - `topic-discovery.validator.ts` — copy of [validator.ts](validator.ts)
  - `topic-discovery.types.ts` — copy of [interfaces.ts](interfaces.ts)
  - `topic-discovery.agent.module.ts` — the Nest module
- [ ] Register `TopicDiscoveryAgentModule` in the agent registry module, **not** in `AppModule` directly. Agents are registry artifacts.
- [ ] Enable `resolveJsonModule` and `esModuleInterop` in `tsconfig.json` so the schemas import as modules.
- [ ] Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The contract distinguishes *absent* from *present-and-undefined*; without `exactOptionalPropertyTypes` the type system does not.

---

## 2. Contract registration

- [ ] Register `topic-discovery-agent-input/v1` at version `1.0.0` in the schema registry with owner, changelog, and deprecation policy.
- [ ] Register `topic-discovery-agent-output/v1` at version `1.0.0` likewise.
- [ ] Register the agent manifest (`STD-000` §3.12): identity `topic-discovery-agent`, version `1.0.0`, class `Generator`, category `Research`, one-sentence purpose, non-responsibilities, schema references, prompt reference, required capabilities (`structured-output`), required permissions (**none** — no network egress, no storage scope, no tool access), cost and latency budgets (§7), determinism posture, evaluation-set reference, owner, stability `stable`.
- [ ] Verify the manifest declares **deny-by-default permissions**. This agent reads nothing and writes nothing; if it resolves any permission, that is a defect.
- [ ] Confirm the workflow definition that precedes this agent derives `strategyBinding` as a **projection** of the approved Strategy Manifest, not a copy stored independently — a stale projection would silently diverge from the pinned strategy version.

---

## 3. Ajv wiring

- [ ] Install `ajv@^8` and `ajv-formats@^3`. Use the 2020-12 entry point: `import Ajv2020 from 'ajv/dist/2020'`.
- [ ] Compile both schemas **once at module init**, not per request. Compilation is the expensive part; validation is not.
- [ ] Provide three compiled validators through DI:

```ts
// topic-discovery.agent.module.ts — wiring only; all validation logic lives in the validator module.
@Module({
  providers: [
    {
      provide: TOPIC_DISCOVERY_AJV,
      useFactory: () => createContractValidator(),
    },
    {
      provide: TOPIC_DISCOVERY_REQUEST_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(INPUT_SCHEMA_ID)!,
    },
    {
      provide: TOPIC_DISCOVERY_RESPONSE_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(OUTPUT_SCHEMA_ID)!,
    },
    {
      provide: TOPIC_DISCOVERY_SET_VALIDATOR,
      inject: [TOPIC_DISCOVERY_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(TOPIC_SET_SCHEMA_POINTER)!,
    },
  ],
  exports: [TOPIC_DISCOVERY_REQUEST_VALIDATOR, TOPIC_DISCOVERY_RESPONSE_VALIDATOR, TOPIC_DISCOVERY_SET_VALIDATOR],
})
export class TopicDiscoveryAgentModule {}
```

- [ ] Assert at boot that `getSchema` returned a function for all three identifiers. A silent `undefined` here produces an agent that validates nothing.
- [ ] **Do not** enable `removeAdditional`, `useDefaults`, or `coerceTypes`. Each one silently rewrites model output, which is exactly what closed schemas exist to prevent (`GDE-003` §13.1).
- [ ] **Do not** use `class-validator` / `class-transformer` for these contracts. The JSON Schema is the registered artifact; a decorator copy is a second source of truth that will drift.

---

## 4. Invocation path

- [ ] Validate the request **before dispatch** with `validateTopicDiscoveryRequest`. On any finding: do not dispatch, do not retry — this is a workflow defect (`GDE-005` §7.3).
- [ ] Render the prompt with strict variable resolution. An unresolved required variable is a **hard failure before invocation**, never an empty substitution (`STD-000` §4.2).
- [ ] Neutralise `<<<` and `>>>` inside every rendered variable so a block cannot be terminated early.
- [ ] Bound `trendContext` before rendering: ≤ 30 observations, ≤ 500 code points each (`R-IN-006`).
- [ ] Place blocks 1–7 in the system layer, block 8 in the user layer. Untrusted content **never** enters the system layer.
- [ ] Set parameters from the agent class, not at the call site: `temperature 0.7`, `topP 1.0`, seed where supported. Repair invocations use the **same or lower** temperature (`STD-000` §4.5) — note this is the floor of the declared Generator range, not zero.
- [ ] Request schema-constrained generation where the provider supports it — then validate anyway. Constrained decoding guarantees shape, not semantic validity.
- [ ] Reject any response whose normalised `finishReason` is `TRUNCATED`, before parsing.
- [ ] Parse the model output as `TopicDiscoveryModelOutput`. If it carries `refusal`, map `reasonCode` to the registered error code per [system-prompt.md](system-prompt.md) §4 and emit an `ERROR` contract. Do **not** attempt to salvage a partial topic set.
- [ ] Validate the topic set with `validateTopicOpportunitySet`, passing the request `data` so cross-artifact rules (pillar/persona resolution, duplicate grounding, prohibited-topic containment) can run.
- [ ] Wrap the validated set in the response envelope. **The runtime populates `meta`, `execution`, and `references`; the model never does** (`GDE-002` §6.7).
- [ ] Assert in code that the agent never populates the `validation` block on its own output. Self-assessment is biased toward approval (`GDE-003` §4.6).

---

## 5. Error catalogue

- [ ] Register every code in `TopicDiscoveryAgentErrorCode` with description, cause, remediation, and owner. An unregistered code MUST NOT ship (`STD-000` §8.4).
- [ ] Set `retryable` from category, in one place, never from message text (`STD-000` Rule 29).
- [ ] Give `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` an immediate escalation path. It MUST NOT be absorbed by retry logic.
- [ ] Verify `userMessage` on every code leaks no path, identifier, provider name, or prompt content.
- [ ] Verify all findings are emitted together in one `issues` array. A serial one-error-at-a-time loop is a direct cost and latency multiplier.

---

## 6. Retry and repair

- [ ] Use the platform default retry posture. **The agent itself retries nothing** (`GDE-002` §10.1) — no loops, no attempt counters, no backoff in this module.
- [ ] Confirm the repair path feeds structured findings back, never the whole prior conversation.
- [ ] Confirm repairability: findings carry stable paths (`$.topics[2].pillarKey`), so a single bad field is repaired without regenerating the whole set. Verify with a fixture that repairs test case `12-A` and leaves every other topic byte-identical.
- [ ] Confirm non-recoverable failures (`R-IN-*`, refusals) are marked non-retryable and escalate immediately rather than burning the retry budget.

---

## 7. Budgets and telemetry

- [ ] Declare and enforce budgets (`STD-000` §11.8). Seed these values, then **replace them with measurements** within the first week of production — a budget nobody measured is documentation, not a control:

| Budget | Initial value | Basis |
|---|---|---|
| Expected latency (p50) | 14 s | Seed — replace with measurement |
| Maximum latency (p95) | 35 s | Seed — replace with measurement |
| Expected cost per invocation | 22 000 µUSD | Seed — replace with measurement |
| Maximum cost per invocation | 90 000 µUSD | Hard ceiling; halts on breach |
| Maximum input tokens | 5 000 | Derived from bounded inputs (`existingContentInventory` at 300 items dominates) |
| Maximum output tokens | 6 000 | Matches the prompt declaration |
| Maximum total invocations incl. retries | 4 | Platform default |

- [ ] Record on every invocation: agent version, prompt version, schema version, model identity, normalised parameters, tokens, cost, latency, finish reason (`STD-000` Rule 22).
- [ ] Emit per-rule failure counts keyed by `ruleId` and prompt version. A rising rate on any single rule is the earliest signal of a prompt regression — watch `R-BUS-005` (score arithmetic) and `R-BUS-009` (missed exact duplicates) specifically, since both are mechanically avoidable and a rising rate indicates the model is not applying the declared formula or is not checking `existingContentInventory` thoroughly.
- [ ] Confirm `correlationId` propagates to every log line, span, and error.

---

## 8. Evaluation

- [ ] Build the evaluation set from [test-cases.md](test-cases.md), including every case in the "Additional coverage" and "Prompt injection" sections. No agent reaches production without one (`STD-000` §3.13).
- [ ] Add a locale variant evaluation set for every locale the channel set uses. A prompt that passes in English is unevaluated in every other language.
- [ ] Wire `C-CONF-001` … `C-CONF-008` into CI. They fail the build, not a report.
- [ ] Record the pass rate against the agent and prompt versions. A change that reduces it does not ship without a recorded waiver.
- [ ] Add a determinism-of-shape replay test: same input, same seed, structurally valid output every time (content diversity is expected and desired for a Generator-class agent — do not assert content equality, only shape and arithmetic correctness).
- [ ] Track calibration once production performance data exists: compare `researchPriority` and `scoreBreakdown` values against which topics Agent 02 Research actually found viable, and which published videos performed well. This agent's scores are `MODEL_ASSESSED` and uncalibrated at launch (README §8) — this is the mechanism that closes that gap over time, via the Insight & Feedback Service (`ARC-001` §4.21), never by this agent adjusting its own scoring.

---

## 9. Duplicate detection boundary

- [ ] Confirm the workflow supplies a **bounded, recent** `existingContentInventory` slice (≤ 300 items) rather than a channel's entire history unfiltered — minimum-context principle (`GDE-002` §5.1).
- [ ] Confirm downstream (Originality Service, `ARC-001` §4.12) treats this agent's `duplicateStatus` as a **first-pass signal only**, never as a substitute for semantic-embedding comparison. This package explicitly defers semantic similarity infrastructure (README §9); do not treat `classification: NONE` as a guarantee of originality.
- [ ] Confirm a topic classified `EXACT_DUPLICATE` or with `researchPriority: LOW` due to duplication is still delivered to the workflow, not silently dropped — the human or downstream stage decides disposition, this agent only surfaces the finding (`STD-000` §2.13, fail loud).

---

## 10. Pre-merge gate

- [ ] Both schemas closed at every level; no `additionalProperties: true` anywhere.
- [ ] Every enumeration documented as closed; every string bounded; every array bounded with declared ordering semantics.
- [ ] No `null` permitted anywhere; absence is omission.
- [ ] Prompt, schema, and `SCORE_WEIGHTS` bounds agree exactly (`C-CONF-002`).
- [ ] All three examples validate (`C-CONF-001`), including the invalid one, with its explanation recorded.
- [ ] `validator.ts` is free of I/O, DI, clock reads, randomness, and mutation — pure functions only.
- [ ] No business logic anywhere in this package beyond validation. It defines a contract and checks conformance; it does not discover or score topics.
- [ ] Second-person prompt review completed against `STD-000` §13.3, with particular attention to the ambiguity audit on rules 18–20 (duplicate classification boundaries) and rule 8 (the weighted-score formula).
- [ ] Agent specification `AGT-01` written using all seventeen mandatory sections, no additions, no reordering (`STD-000` §12.7). **This package is the contract package; the specification document is a separate deliverable and the agent is not done without it** (`STD-000` §13.1).

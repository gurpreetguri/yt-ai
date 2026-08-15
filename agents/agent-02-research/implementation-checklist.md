# AGT-02 — Research Agent · Implementation Checklist

For the NestJS developer wiring this package into the platform. Ordered so that each step is verifiable before the next depends on it. Nothing here restates platform behaviour the runtime already provides — where the platform default applies, the item says so.

---

## 0. Prerequisites

- [ ] Confirm the agent runtime, validation plane, and workflow engine are available; this package is a **contract package**, not a service. It ships schemas, a prompt, types, and validators — no controller, no HTTP route, no queue consumer, and (critically for this agent) **no search or fetch client**.
- [ ] Confirm the error catalogue accepts new code registrations (§5 below).
- [ ] Confirm the prompt registry supports content-addressed prompt versions (`STD-000` §4.9).
- [ ] Confirm AGT-01's Topic Opportunity Set is resolvable so the workflow can derive `topicOpportunity` from one selected entry at run start — this agent never reads the full set itself.
- [ ] **Build the research/search provider abstraction before this agent can run against live data.** This package assumes `researchMaterials` arrives pre-populated; it does not build the provider that populates it. That component is out of scope for this contract package and must be specified separately (README §16).

---

## 1. Module placement

- [ ] Create `src/agents/research/` in the agents module. Files land as:
  - `research.schemas.ts` — re-exports the two JSON schemas as frozen constants
  - `research.validator.ts` — copy of [validator.ts](validator.ts)
  - `research.types.ts` — copy of [interfaces.ts](interfaces.ts)
  - `research.agent.module.ts` — the Nest module
- [ ] Register `ResearchAgentModule` in the agent registry module, **not** in `AppModule` directly. Agents are registry artifacts.
- [ ] Enable `resolveJsonModule` and `esModuleInterop` in `tsconfig.json` so the schemas import as modules (already enabled platform-wide — verify the agent's local build target inherits it).
- [ ] Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The contract distinguishes *absent* from *present-and-undefined*; without `exactOptionalPropertyTypes` the type system does not.

---

## 2. Contract registration

- [ ] Register `research-agent-input/v1` at version `1.0.0` in the schema registry with owner, changelog, and deprecation policy.
- [ ] Register `research-agent-output/v1` at version `1.0.0` likewise.
- [ ] Register the agent manifest (`STD-000` §3.12): identity `research-agent`, version `1.0.0`, class `Extractor`, category `Research`, one-sentence purpose, non-responsibilities, schema references, prompt reference, required capabilities (`structured-output`), required permissions (**none** — no network egress, no storage scope, no tool access; this is the security-critical property of the whole package, README §16), cost and latency budgets (§7), determinism posture, evaluation-set reference, owner, stability `stable`.
- [ ] Verify the manifest declares **deny-by-default permissions**, matching D1's platform-wide restriction as the only department ingesting untrusted content (`ARC-001` §5.3). This agent reads nothing external and writes nothing; if it resolves any permission beyond schema-constrained generation, that is a defect.
- [ ] Confirm the workflow definition that precedes this agent derives `topicOpportunity` as a **projection** of one entry of the approved Topic Opportunity Set, not a copy stored independently.
- [ ] Confirm the workflow definition that precedes this agent invokes the (separately specified) research/search provider to populate `researchMaterials` **before** this agent is dispatched — this agent never calls that provider itself.

---

## 3. Ajv wiring

- [ ] Install `ajv@^8` and `ajv-formats@^3` (already present in this repository — reuse the existing dependency). Use the 2020-12 entry point: `import Ajv2020 from 'ajv/dist/2020'`.
- [ ] Compile both schemas **once at module init**, not per request. Compilation is the expensive part; validation is not.
- [ ] Provide three compiled validators through DI:

```ts
// research.agent.module.ts — wiring only; all validation logic lives in the validator module.
@Module({
  providers: [
    {
      provide: RESEARCH_AJV,
      useFactory: () => createContractValidator(),
    },
    {
      provide: RESEARCH_REQUEST_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(INPUT_SCHEMA_ID)!,
    },
    {
      provide: RESEARCH_RESPONSE_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(OUTPUT_SCHEMA_ID)!,
    },
    {
      provide: RESEARCH_PACKAGE_VALIDATOR,
      inject: [RESEARCH_AJV],
      useFactory: (ajv: Ajv2020) => ajv.getSchema(RESEARCH_PACKAGE_SCHEMA_POINTER)!,
    },
  ],
  exports: [RESEARCH_REQUEST_VALIDATOR, RESEARCH_RESPONSE_VALIDATOR, RESEARCH_PACKAGE_VALIDATOR],
})
export class ResearchAgentModule {}
```

- [ ] Assert at boot that `getSchema` returned a function for all three identifiers. A silent `undefined` here produces an agent that validates nothing.
- [ ] **Do not** enable `removeAdditional`, `useDefaults`, or `coerceTypes`. Each one silently rewrites model output, which is exactly what closed schemas exist to prevent (`GDE-003` §13.1).
- [ ] **Do not** use `class-validator` / `class-transformer` for these contracts. The JSON Schema is the registered artifact; a decorator copy is a second source of truth that will drift.

---

## 4. Invocation path

- [ ] Validate the request **before dispatch** with `validateResearchRequest`. On any finding: do not dispatch, do not retry — this is a workflow defect (`GDE-005` §7.3).
- [ ] Render the prompt with strict variable resolution. An unresolved required variable is a **hard failure before invocation**, never an empty substitution (`STD-000` §4.2).
- [ ] Neutralise `<<<` and `>>>` inside every rendered variable so a block cannot be terminated early.
- [ ] Bound `researchMaterials` before rendering: ≤ 40 materials, ≤ 6000 code points of `content` each (`R-IN-004`).
- [ ] Place blocks 1–7 in the system layer, block 8 in the user layer. Untrusted content (`researchMaterials`) **never** enters the system layer.
- [ ] Set parameters from the agent class, not at the call site: `temperature 0`, `topP 1.0`, seed where supported. Repair invocations use the **same or lower** temperature (`STD-000` §4.5) — for this Extractor-class agent that means `0` in every case.
- [ ] Request schema-constrained generation where the provider supports it — then validate anyway. Constrained decoding guarantees shape, not grounding.
- [ ] Reject any response whose normalised `finishReason` is `TRUNCATED`, before parsing.
- [ ] Parse the model output as `ResearchAgentModelOutput`. If it carries `refusal`, map `reasonCode` to the registered error code per [system-prompt.md](system-prompt.md) §4 and emit an `ERROR` contract. Do **not** attempt to salvage a partial research package.
- [ ] Validate the research package with `validateResearchPackage`, passing the request `data` so cross-artifact rules (source provenance grounding, evidence references, search-result/source distinction) can run.
- [ ] Wrap the validated package in the response envelope. **The runtime populates `meta`, `execution`, and `references`; the model never does** (`GDE-002` §6.7).
- [ ] Assert in code that the agent never populates the `validation` block on its own output. Self-assessment is biased toward approval (`GDE-003` §4.6).
- [ ] Persist the accepted `ResearchPackage` (and its identifying `sourceId`s under durable `sourceRefId`s) to the Research Package Store so a later invocation can supply it back as `existingResearch` (README §4).

---

## 5. Error catalogue

- [ ] Register every code in `ResearchAgentErrorCode` with description, cause, remediation, and owner. An unregistered code MUST NOT ship (`STD-000` §8.4).
- [ ] Set `retryable` from category, in one place, never from message text (`STD-000` Rule 29).
- [ ] Give `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` an immediate escalation path. It MUST NOT be absorbed by retry logic.
- [ ] Verify `userMessage` on every code leaks no path, identifier, provider name, prompt content, or untrusted material content.
- [ ] Verify all findings are emitted together in one `issues` array. A serial one-error-at-a-time loop is a direct cost and latency multiplier.
- [ ] Wire `AI_OUTPUT.CONTENT.FABRICATED_SOURCE` to `R-BUS-006` and `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM` to `R-BUS-004`/`R-BUS-005` in the repair-prompt mapping, so a repair invocation receives a specific, targeted correction rather than a generic business-rule failure.

---

## 6. Retry and repair

- [ ] Use the platform default retry posture. **The agent itself retries nothing** (`GDE-002` §10.1) — no loops, no attempt counters, no backoff in this module.
- [ ] Confirm the repair path feeds structured findings back, never the whole prior conversation, and never the raw untrusted `researchMaterials` content a second time beyond what the original prompt already carried.
- [ ] Confirm repairability: findings carry stable paths (`$.sources[2].derivedFromMaterialId`), so a single bad field is repaired without regenerating the whole package. Verify with a fixture that repairs test case `24-A` and leaves every other source and evidence item byte-identical.
- [ ] Confirm non-recoverable failures (`R-IN-*`, refusals) are marked non-retryable and escalate immediately rather than burning the retry budget.

---

## 7. Budgets and telemetry

- [ ] Declare and enforce budgets (`STD-000` §11.8). Seed these values, then **replace them with measurements** within the first week of production — a budget nobody measured is documentation, not a control:

| Budget | Initial value | Basis |
|---|---|---|
| Expected latency (p50) | 20 s | Seed — replace with measurement |
| Maximum latency (p95) | 50 s | Seed — replace with measurement |
| Expected cost per invocation | 32 000 µUSD | Seed — replace with measurement |
| Maximum cost per invocation | 140 000 µUSD | Hard ceiling; halts on breach |
| Maximum input tokens | 12 000 | Derived from bounded inputs (`researchMaterials` at 40 × 6000 characters dominates) |
| Maximum output tokens | 8 000 | Matches the prompt declaration |
| Maximum total invocations incl. retries | 4 | Platform default |

- [ ] Record on every invocation: agent version, prompt version, schema version, model identity, normalised parameters, tokens, cost, latency, finish reason (`STD-000` Rule 22).
- [ ] Emit per-rule failure counts keyed by `ruleId` and prompt version. A rising rate on `R-BUS-006` (fabricated source grounding) or `R-BUS-007`/`R-BUS-008` (search-result-only evidence misrepresented as strong or corroborated) is the earliest signal of a hallucination regression and should page the prompt owner, not just log.
- [ ] Confirm `correlationId` propagates to every log line, span, and error, including any log emitted by the (separately specified) research/search provider that populates `researchMaterials`.

---

## 8. Evaluation

- [ ] Build the evaluation set from [test-cases.md](test-cases.md), including every case in the "Additional coverage" and "Prompt injection" sections. No agent reaches production without one (`STD-000` §3.13).
- [ ] Add a locale variant evaluation set for every locale the channel set uses. A prompt that passes in English is unevaluated in every other language.
- [ ] Wire `C-CONF-001` … `C-CONF-008` into CI. They fail the build, not a report.
- [ ] Record the pass rate against the agent and prompt versions. A change that reduces it does not ship without a recorded waiver.
- [ ] Add a grounding-precision evaluation specifically: for every emitted `evidenceText` with `extractionType: QUOTATION`, assert the text appears verbatim (byte-for-byte, modulo whitespace normalisation) in the cited material's supplied `content`. This is the one grounding check `validator.ts` deliberately cannot perform without the untrusted material text in hand (README §18, test case `25-B`), so it belongs in the evaluation harness, which does have both artifacts.
- [ ] Track calibration once production performance data exists: compare `sourceQuality`, `evidenceStrength`, and `completeness.readyForFactVerification` against which claims Agent 03 actually verified or rejected. This agent's judgements are `MODEL_ASSESSED` and uncalibrated at launch (README §14) — this is the mechanism that closes that gap over time, via the Insight & Feedback Service (`ARC-001` §4.21), never by this agent adjusting its own scoring.

---

## 9. Search / tool boundary

- [ ] Confirm the workflow supplies `researchMaterials` from a provider-neutral research/search abstraction (README §16), and that this agent's contract makes no assumption about which concrete search or browse tool populated it.
- [ ] Confirm the research/search provider — not this agent — holds any network egress capability, and that its output is size-bounded (≤ 40 materials, ≤ 6000 characters each) **before** it reaches this agent's prompt (`R-IN-004`), independent of this agent's own bound enforcement — defence in depth against a denial-of-wallet vector.
- [ ] Confirm `recommendedFollowUpSearches` is consumed by the workflow to schedule a further research/search provider invocation (typically on a subsequent iteration with `existingResearch` populated from this pass), never executed synchronously inside this agent's own invocation.
- [ ] Confirm a research package with `completeness.readyForFactVerification: false` is still delivered to the workflow, not silently discarded — the human or downstream stage decides whether to iterate or proceed, this agent only surfaces the assessment (`STD-000` §2.13, fail loud).

---

## 10. Pre-merge gate

- [ ] Both schemas closed at every level; no `additionalProperties: true` anywhere.
- [ ] Every enumeration documented as closed; every string bounded; every array bounded with declared ordering semantics.
- [ ] No `null` permitted anywhere; absence is omission.
- [ ] Prompt, schema, and `validator.ts` bounds agree exactly (`C-CONF-002`).
- [ ] All three examples validate (`C-CONF-001`) — **verified**: `input.schema.json` and `output.schema.json` compile under Ajv 2020-12 `strict: true`, and `examples/request.json`, `examples/response.json`, and `examples/failure.json` each validate against their schema with zero errors.
- [ ] `validateResearchRequest`, `validateResearchResponse`, and `validateResearchPackage` each report `PASSED` with zero findings against the baseline examples — **verified** (`C-CONF-008`).
- [ ] `interfaces.ts` and `validator.ts` compile under `tsc --strict --noEmit` with zero errors — **verified**.
- [ ] `validator.ts` is free of I/O, DI, clock reads, randomness, and mutation — pure functions only.
- [ ] No business logic anywhere in this package beyond validation. It defines a contract and checks conformance; it does not search, fetch, extract, or score research materials.
- [ ] Second-person prompt review completed against `STD-000` §13.3, with particular attention to the search-result-vs-source boundary (rules 5–6) and the fabrication prohibitions (rules 16–17, 37).
- [ ] Agent specification `AGT-02` written using all seventeen mandatory sections, no additions, no reordering (`STD-000` §12.7). **This package is the contract package; the specification document is a separate deliverable and the agent is not done without it** (`STD-000` §13.1).

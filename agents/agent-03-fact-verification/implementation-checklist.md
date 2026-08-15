# AGT-03 — Fact Verification Agent · Implementation Checklist

For the NestJS developer wiring this package into the platform. Ordered so that each step is verifiable before the next depends on it.

---

## 0. Prerequisites

- [ ] Confirm the agent runtime, validation plane, and workflow engine are available; this package is a **contract package**, not a service on its own.
- [ ] Confirm the error catalogue accepts new code registrations (§5 below).
- [ ] Confirm the prompt registry supports content-addressed prompt versions (`STD-000` §4.9).
- [ ] Confirm AGT-02's Research Package is resolvable so the workflow can derive `researchPackage` from a completed Agent 02 invocation at run start.

---

## 1. Module placement

- [ ] Create `src/agents/fact-verification/` in the agents module. Files land as:
  - `fact-verification.schemas.ts` — re-exports the two JSON schemas as frozen constants
  - `fact-verification.validator.ts` — copy of [validator.ts](validator.ts)
  - `fact-verification.types.ts` — copy of [interfaces.ts](interfaces.ts)
  - `fact-verification.agent.module.ts` — the Nest module
- [ ] Register `FactVerificationModule` in the agent registry module, **not** in `AppModule` directly.
- [ ] Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` for this package's build target, matching Agent 00/01/02.

---

## 2. Contract registration

- [ ] Register `fact-verification-agent-input/v1` at version `1.0.0` in the schema registry with owner, changelog, and deprecation policy.
- [ ] Register `fact-verification-agent-output/v1` at version `1.0.0` likewise.
- [ ] Register the agent manifest (`STD-000` §3.12): identity `fact-verification-agent`, version `1.0.0`, class `Judge`, category `Validation`, one-sentence purpose, non-responsibilities, schema references, prompt reference, required capabilities (`structured-output`), required permissions (**none** — no network egress, no storage scope, no tool access), cost and latency budgets (§7), determinism posture, evaluation-set reference, owner, stability `stable`.
- [ ] Verify the manifest declares **deny-by-default permissions**, matching the D1 Content Intelligence security posture (`ARC-001` §5.3).
- [ ] Confirm the workflow definition that precedes this agent derives `researchPackage` as a **projection** of a completed, approved Agent 02 invocation, not a copy stored independently.

---

## 3. Ajv wiring

- [ ] Install `ajv@^8` and `ajv-formats@^3` (already present in this repository — reuse the existing dependency). Use the 2020-12 entry point: `import Ajv2020 from 'ajv/dist/2020'`.
- [ ] Compile both schemas **once at module init**, not per request.
- [ ] Provide three compiled validators through DI, mirroring `agents/agent-02-research/implementation-checklist.md` §3's `TOPIC_DISCOVERY_*`/`RESEARCH_*`-style wiring exactly, using `FACT_VERIFICATION_*` tokens.
- [ ] Assert at boot that `getSchema` returned a function for all three identifiers.
- [ ] **Do not** enable `removeAdditional`, `useDefaults`, or `coerceTypes`.
- [ ] **Do not** use `class-validator` / `class-transformer` for these contracts.

---

## 4. Invocation path

- [ ] Validate the request **before dispatch** with `validateFactVerificationRequest`. On any finding: do not dispatch, do not retry.
- [ ] Render the prompt with strict variable resolution. An unresolved required variable is a **hard failure before invocation**.
- [ ] Neutralise `<<<` and `>>>` inside every rendered variable — applied to the **entire** `researchPackage` block, not a designated subset, since any nested string could carry adversarial text (README §17).
- [ ] Place blocks 1–7 in the system layer, block 8 in the user layer.
- [ ] Set parameters from the agent class: `temperature 0`, `topP 1.0`, seed where supported. Repair invocations use the same temperature (already the floor).
- [ ] Request schema-constrained generation where the provider supports it — then validate anyway.
- [ ] Reject any response whose normalised `finishReason` is `TRUNCATED`, before parsing.
- [ ] Parse the model output as `FactVerificationModelOutput`. If it carries `refusal`, map `reasonCode` to the registered error code per [system-prompt.md](system-prompt.md) §4 and emit an `ERROR` contract. Do **not** attempt to salvage a partial verification package.
- [ ] Validate the verification package with `validateVerificationPackage`, passing the request `data` so cross-artifact rules (evidence/source grounding, quote/causal/calculation gating, summary arithmetic, downstream-safety mapping) can run.
- [ ] Wrap the validated package in the response envelope. **The runtime populates `meta`, `execution`, and `references`; the model never does.**
- [ ] Assert in code that the agent never populates the `validation` block on its own output.

---

## 5. Error catalogue

- [ ] Register every code in `FactVerificationAgentErrorCode` with description, cause, remediation, and owner.
- [ ] Set `retryable` from category, in one place, never from message text.
- [ ] Give `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` an immediate escalation path.
- [ ] Verify `userMessage` on every code leaks no path, identifier, provider name, or research-package content.
- [ ] Wire the output-rule → error-code mapping exactly as `fact-verification.errors.ts` implements it: `R-BUS-003`/`R-BUS-004` → `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM`/`AI_OUTPUT.CONTENT.FABRICATED_EVIDENCE`; `R-BUS-005`–`R-BUS-009`, `R-BUS-013`, `R-BUS-014` → `AI_OUTPUT.CONTENT.UNSUPPORTED_CERTAINTY` where the violation is specifically an unearned status upgrade; every other `R-BUS-*` → the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`. This mirrors the documented, deliberately-simplified mapping precedent in [Agent 02](../agent-02-research/README.md) §18.

---

## 6. Retry and repair

- [ ] Use the platform default retry posture. **The agent itself retries nothing.**
- [ ] Confirm the repair path feeds structured findings back, never the whole prior conversation.
- [ ] Confirm repairability: findings carry stable paths (`$.claims[2].downstreamSafety`), so a single bad field is repaired without regenerating the whole package.
- [ ] Confirm non-recoverable failures (`R-IN-*`, refusals) are marked non-retryable and escalate immediately.

---

## 7. Budgets and telemetry

- [ ] Declare and enforce budgets (`STD-000` §11.8). Seed these values, then **replace them with measurements** within the first week of production:

| Budget | Initial value | Basis |
|---|---|---|
| Expected latency (p50) | 18 s | Seed — replace with measurement |
| Maximum latency (p95) | 45 s | Seed — replace with measurement |
| Expected cost per invocation | 30 000 µUSD | Seed — replace with measurement |
| Maximum cost per invocation | 130 000 µUSD | Hard ceiling; halts on breach |
| Maximum input tokens | 14 000 | Derived from bounded inputs (`researchPackage.evidence` at 80 items dominates) |
| Maximum output tokens | 8 000 | Matches the prompt declaration |
| Maximum total invocations incl. retries | 4 | Platform default |

- [ ] Record on every invocation: agent version, prompt version, schema version, model identity, normalised parameters, tokens, cost, latency, finish reason.
- [ ] Emit per-rule failure counts keyed by `ruleId` and prompt version. A rising rate on `R-BUS-006` (VERIFIED from search-result-only evidence) or `R-BUS-017` (downstream-safety mismatch) is the earliest signal of a hallucination or certainty-inflation regression.
- [ ] Confirm `correlationId` propagates to every log line, span, and error.

---

## 8. Evaluation

- [ ] Build the evaluation set from [test-cases.md](test-cases.md), including every case in the "Additional coverage" and prompt-injection sections.
- [ ] Add a locale variant evaluation set for every locale the channel set uses.
- [ ] Wire `C-CONF-001` … `C-CONF-008` into CI. They fail the build, not a report.
- [ ] Record the pass rate against the agent and prompt versions.
- [ ] Track calibration once production performance data exists: compare `verificationStatus`/`downstreamSafety` against which claims Agent 04/05 actually used, qualified, or excluded, and (once available) against post-publish fact-check outcomes — via the Insight & Feedback Service (`ARC-001` §4.21), never by this agent adjusting its own scoring.

---

## 9. Claim-verification boundary

- [ ] Confirm this agent never calls a search or fetch client — it grades `researchPackage` exactly as supplied (README §3).
- [ ] Confirm `VERIFIED` is documented everywhere it appears (dashboards, logs, downstream consumers) as "supported by the supplied evidence under this contract's rules," never as "confirmed true" — the distinction the entire contract exists to enforce (README §1).
- [ ] Confirm a verification package with `verificationSummary.overallReadiness: false` or a material count of `DO_NOT_USE` claims is still delivered to the workflow, not silently discarded — the human or downstream stage decides whether to iterate or proceed.

---

## 10. Pre-merge gate

- [ ] Both schemas closed at every level; no `additionalProperties: true` anywhere.
- [ ] Every enumeration documented as closed; every string bounded; every array bounded with declared ordering semantics.
- [ ] No `null` permitted anywhere; absence is omission.
- [ ] Prompt, schema, and `validator.ts` bounds agree exactly (`C-CONF-002`), including `DOWNSTREAM_SAFETY_BY_STATUS`.
- [ ] All three examples validate (`C-CONF-001`) — **verified**: both schemas compile under Ajv 2020-12 `strict: true`, and all three example files validate against their schema with zero errors.
- [ ] `validateFactVerificationRequest`, `validateFactVerificationResponse`, and `validateVerificationPackage` each report `PASSED` with zero findings against the baseline examples — **verified** (`C-CONF-008`).
- [ ] `interfaces.ts` and `validator.ts` compile under `tsc --strict --noEmit` with zero errors — **verified**.
- [ ] `validator.ts` is free of I/O, DI, clock reads, randomness, and mutation — pure functions only.
- [ ] No business logic anywhere in this package beyond validation. It defines a contract and checks conformance; it does not identify or grade claims.
- [ ] Second-person prompt review completed against `STD-000` §13.3, with particular attention to the `VERIFIED`-gating rules (4a rules 7–14) and the untrusted-content handling of `researchPackage` (rule 37).
- [ ] Agent specification `AGT-03` written using all seventeen mandatory sections, no additions, no reordering (`STD-000` §12.7). This package is the contract package; the specification document is a separate deliverable.

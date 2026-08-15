# AGT-04 — Story Architect Agent · Implementation Checklist

For the NestJS developer wiring this package into the platform. Ordered so that each step is verifiable before the next depends on it.

---

## 0. Prerequisites

- [ ] Confirm the agent runtime, validation plane, and workflow engine are available; this package is a **contract package**, not a service on its own.
- [ ] Confirm the error catalogue accepts new code registrations (§5 below).
- [ ] Confirm the prompt registry supports content-addressed prompt versions (`STD-000` §4.9).
- [ ] Confirm AGT-03's Verification Package and AGT-01's Topic Opportunity are resolvable so the workflow can derive `verificationPackage` and `topicOpportunity` at run start.

---

## 1. Module placement

- [ ] Create `src/agents/story-architect/` in the agents module. Files land as:
  - `story-architect.schemas.ts` — re-exports the two JSON schemas as frozen constants
  - `story-architect.validator.ts` — copy of [validator.ts](validator.ts)
  - `story-architect.types.ts` — copy of [interfaces.ts](interfaces.ts)
  - `story-architect.agent.module.ts` — the Nest module
- [ ] Register `StoryArchitectModule` in the agent registry module, **not** in `AppModule` directly.
- [ ] Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` for this package's build target, matching Agent 00–03.

---

## 2. Contract registration

- [ ] Register `story-architect-agent-input/v1` at version `1.0.0` in the schema registry with owner, changelog, and deprecation policy.
- [ ] Register `story-architect-agent-output/v1` at version `1.0.0` likewise.
- [ ] Register the agent manifest (`STD-000` §3.12): identity `story-architect-agent`, version `1.0.0`, class `Generator`, category `Creative`, one-sentence purpose, non-responsibilities, schema references, prompt reference, required capabilities (`structured-output`), required permissions (**none** — no network egress, no storage scope, no tool access), cost and latency budgets (§7), determinism posture, evaluation-set reference, owner, stability `stable`.
- [ ] Verify the manifest declares **deny-by-default permissions**.
- [ ] Confirm the workflow definition that precedes this agent derives `verificationPackage` as a projection of a completed, approved Agent 03 invocation, and `topicOpportunity` from the same Agent 01 entry Agent 02/03 researched — never independently re-selected.

---

## 3. Ajv wiring

- [ ] Install `ajv@^8` and `ajv-formats@^3` (already present in this repository — reuse the existing dependency). Use the 2020-12 entry point: `import Ajv2020 from 'ajv/dist/2020'`.
- [ ] Compile both schemas **once at module init**, not per request.
- [ ] Provide three compiled validators through DI, mirroring `agents/agent-03-fact-verification/implementation-checklist.md` §3's wiring pattern exactly, using `STORY_ARCHITECT_*` tokens.
- [ ] Assert at boot that `getSchema` returned a function for all three identifiers.
- [ ] **Do not** enable `removeAdditional`, `useDefaults`, or `coerceTypes`.
- [ ] **Do not** use `class-validator` / `class-transformer` for these contracts.

---

## 4. Invocation path

- [ ] Validate the request **before dispatch** with `validateStoryArchitectRequest`. On any finding: do not dispatch, do not retry.
- [ ] Render the prompt with strict variable resolution. An unresolved required variable is a **hard failure before invocation**.
- [ ] Neutralise `<<<` and `>>>` inside every rendered variable — applied to the entire `verificationPackage` block, not a designated subset (README §15).
- [ ] Place blocks 1–7 in the system layer, block 8 in the user layer.
- [ ] Set parameters from the agent class: `temperature 0.7`, `topP 1.0`, seed where supported. Repair invocations use the same or lower temperature (`STD-000` §4.5).
- [ ] Request schema-constrained generation where the provider supports it — then validate anyway.
- [ ] Reject any response whose normalised `finishReason` is `TRUNCATED`, before parsing.
- [ ] Parse the model output as `StoryArchitectModelOutput`. If it carries `refusal`, map `reasonCode` to the registered error code per [system-prompt.md](system-prompt.md) §4 and emit an `ERROR` contract. Do **not** attempt to salvage a partial architecture.
- [ ] Validate the story architecture with `validateStoryArchitecture`, passing the request `data` so cross-artifact rules (claim/evidence grounding, DO_NOT_USE protection, qualification preservation, duration reconciliation, readiness consistency) can run.
- [ ] Wrap the validated architecture in the response envelope. **The runtime populates `meta`, `execution`, and `references`; the model never does.**
- [ ] Assert in code that the agent never populates the `validation` block on its own output.
- [ ] **Never repair invalid model output automatically, and never invent a missing claim to fill a gap the model left** — a business-rule failure is reported for repair by the model on a subsequent attempt, never silently patched by this runtime (task brief, "RUNTIME FLOW").

---

## 5. Error catalogue

- [ ] Register every code in `StoryArchitectAgentErrorCode` with description, cause, remediation, and owner.
- [ ] Set `retryable` from category, in one place, never from message text.
- [ ] Give `SECURITY.PROMPT_INJECTION.INSTRUCTION_IN_DATA_BLOCK` an immediate escalation path.
- [ ] Wire the output-rule → error-code mapping exactly as `story-architect.errors.ts` implements it: `R-BUS-003`/`R-BUS-004` → `AI_OUTPUT.CONTENT.UNGROUNDED_CLAIM`; `R-BUS-005` → `AI_OUTPUT.CONTENT.UNSAFE_CLAIM_USAGE`; `R-BUS-006` → `AI_OUTPUT.CONTENT.QUALIFICATION_LOST`; every other `R-BUS-*` → the generic `AI_OUTPUT.BUSINESS.RULE_VIOLATED`. This mirrors the documented, deliberately-simplified mapping precedent established in Agent 02/03.

---

## 6. Retry and repair

- [ ] Use the platform default retry posture. **The agent itself retries nothing.**
- [ ] Confirm the repair path feeds structured findings back, never the whole prior conversation.
- [ ] Confirm repairability: findings carry stable paths (`$.beats[3].qualification`), so a single bad field is repaired without regenerating the whole architecture.
- [ ] Confirm non-recoverable failures (`R-IN-*`, refusals) are marked non-retryable and escalate immediately.

---

## 7. Budgets and telemetry

- [ ] Declare and enforce budgets (`STD-000` §11.8). Seed these values, then **replace them with measurements** within the first week of production:

| Budget | Initial value | Basis |
|---|---|---|
| Expected latency (p50) | 16 s | Seed — replace with measurement |
| Maximum latency (p95) | 40 s | Seed — replace with measurement |
| Expected cost per invocation | 28 000 µUSD | Seed — replace with measurement |
| Maximum cost per invocation | 120 000 µUSD | Hard ceiling; halts on breach |
| Maximum input tokens | 10 000 | Derived from bounded inputs (`verificationPackage.claims` at 60 items dominates) |
| Maximum output tokens | 7 000 | Matches the prompt declaration |
| Maximum total invocations incl. retries | 4 | Platform default |

- [ ] Record on every invocation: agent version, prompt version, schema version, model identity, normalised parameters, tokens, cost, latency, finish reason.
- [ ] Emit per-rule failure counts keyed by `ruleId` and prompt version. A rising rate on `R-BUS-005` (DO_NOT_USE claim usage) is the single most important signal to watch — it indicates the model is not respecting Agent 03's safety determination.
- [ ] Confirm `correlationId` propagates to every log line, span, and error.

---

## 8. Evaluation

- [ ] Build the evaluation set from [test-cases.md](test-cases.md), including every case in the "Additional coverage" and prompt-injection sections.
- [ ] Add a locale variant evaluation set for every locale the channel set uses.
- [ ] Wire `C-CONF-001` … `C-CONF-008` into CI. They fail the build, not a report.
- [ ] Record the pass rate against the agent and prompt versions.
- [ ] Track calibration once production performance data exists: compare `downstreamReadiness` against whether Agent 05 (once implemented) actually produced a usable script from the architecture, and whether `readinessBlockers` correctly predicted where a human had to intervene.

---

## 9. Claim-safety boundary

- [ ] Confirm this agent never calls a search or fetch client, never re-verifies a claim, and never overrides an Agent 03 `verificationStatus`/`downstreamSafety` determination (README §6).
- [ ] Confirm `R-BUS-005` (DO_NOT_USE protection) is treated as the single highest-severity rule in this package — any violation is a BLOCKER, never a WARNING, and should page the prompt owner on a rising rate (§7).
- [ ] Confirm a `NOT_READY_FOR_SCRIPT` architecture with populated `researchGaps` is still delivered to the workflow, not silently discarded — the human or downstream stage decides whether to iterate or proceed.

---

## 10. Pre-merge gate

- [ ] Both schemas closed at every level; no `additionalProperties: true` anywhere.
- [ ] Every enumeration documented as closed; every string bounded; every array bounded with declared ordering semantics.
- [ ] No `null` permitted anywhere; absence is omission.
- [ ] Prompt, schema, and `validator.ts` bounds agree exactly (`C-CONF-002`), including `STORY_DURATION_TOLERANCE_RATIO`.
- [ ] All three examples validate (`C-CONF-001`) — **verified**: both schemas compile under Ajv 2020-12 `strict: true`, and all three example files validate against their schema with zero errors.
- [ ] `validateStoryArchitectRequest`, `validateStoryArchitectResponse`, and `validateStoryArchitecture` each report `PASSED` with zero findings against the baseline examples — **verified** (`C-CONF-008`).
- [ ] `interfaces.ts` and `validator.ts` compile under `tsc --strict --noEmit` with zero errors — **verified**.
- [ ] `validator.ts` is free of I/O, DI, clock reads, randomness, and mutation — pure functions only.
- [ ] No business logic anywhere in this package beyond validation. It defines a contract and checks conformance; it does not architect stories.
- [ ] Second-person prompt review completed against `STD-000` §13.3, with particular attention to the DO_NOT_USE protection rules (4a rules 6–7) and the untrusted-content handling of `verificationPackage` (rule 34).
- [ ] Agent specification `AGT-04` written using all seventeen mandatory sections, no additions, no reordering (`STD-000` §12.7). This package is the contract package; the specification document is a separate deliverable.

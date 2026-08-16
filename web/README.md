# Agent Pipeline Observability UI

A lightweight developer tool to trigger the Agents 00–07 pipeline and inspect
each agent's input/output artifacts. **Not a production UI.**

## Setup

```bash
cd web
npm install
cp .env.example .env.local   # optional — only needed to point at a real backend
npm run dev
```

Open http://localhost:3001 (or whatever port `next dev` reports).

## Backend integration

The UI calls `POST {NEXT_PUBLIC_API_BASE_URL}/api/pipeline/run` with:

```json
{ "topic": "string", "niche": "string", "audience": "string" }
```

expecting back:

```json
{ "steps": [{ "agent": "agent-00-strategy", "artifact": "Strategy Manifest", "status": "success", "input": {}, "output": {} }] }
```

**If that endpoint does not exist yet** (this repo's Agents 00–07 are
intentionally frozen behind their own contracts, with no workflow
orchestration endpoint built — see `docs/005-workflow-orchestration-guide.md`),
the UI automatically falls back to a local, sequential mock simulation
(`lib/mock-data.ts`) with realistic per-agent artifacts and a 300–700ms delay
between steps. No backend changes were made or are required to use this tool.

To wire up a real endpoint later, implement `POST /api/pipeline/run` on the
NestJS backend returning the shape above — the UI needs no changes.

## Structure

```
app/page.tsx              3-column layout, owns all pipeline state (useState only)
components/
  InputForm.tsx            topic / niche / audience form + Run button
  PipelineView.tsx          ordered list of the 8 steps
  StepCard.tsx               one step's status indicator + label
  StepDetails.tsx            tabs: Formatted View / Input JSON / Output JSON
  JsonViewer.tsx              collapsible JSON tree + copy button
  ui/                        button, card, tabs, badge (shadcn-style primitives)
lib/
  api.ts                    runPipeline(): real backend first, mock fallback
  mock-data.ts                mocked per-agent artifacts
  utils.ts                    cn() class-merging helper
types/pipeline.ts           PipelineStep, PipelineRunRequest/Response
```

## Notes

- State is local `useState` in `app/page.tsx` only — no Redux, no global store.
- Formatted views: Agent 05 renders as readable narration text, Agent 06 as a
  findings list, Agent 07 as a scene breakdown. Every other agent (and any
  unexpected shape) falls back to the raw JSON viewer.
- "Copy JSON" and "Download output" are implemented. "Run step-by-step" is a
  toggle in the header — when on, execution pauses after each step until you
  click "Next step".

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, OnModuleInit } from '@nestjs/common';

import type { FactVerificationRequestData } from '@agents/agent-03-fact-verification/interfaces';

import { appendRepairGuidance } from '../../common/repair-guidance.util';

/**
 * Loads and renders the approved system prompt
 * (`agents/agent-03-fact-verification/system-prompt.md`) — the single source
 * of truth for the Fact Verification Agent's instructions. This module never
 * duplicates the prompt text; it parses the two fenced ```text blocks the
 * approved file already contains (system layer, user-layer template) and
 * fills the template's two named placeholders from the request payload.
 *
 * Structurally identical mechanism to `research.prompt.ts`,
 * `topic-discovery.prompt.ts`, and `strategy.prompt.ts` (same fenced-block
 * parsing, same delimiter neutralisation, same strict-resolution policy) —
 * deliberately NOT extracted into a shared/library prompt loader, because
 * every prompt is owned by exactly one agent (STD-000 §3.9, GDE-002 §12.7).
 *
 * Untrusted content handling (GDE-004 §6.7, §13.6, README §17): every
 * rendered value has the `<<<`/`>>>` delimiter sequences neutralised before
 * insertion, applied to the ENTIRE `researchPackage` block — not a
 * designated subset — since any nested free-text field (a source title, an
 * evidence quotation, a gap description) could carry adversarial text
 * originating from Agent 02's own upstream, genuinely untrusted
 * `researchMaterials`, even though `researchPackage` itself is a
 * provenance-TRUSTED, already-validated platform artifact.
 */

export const FACT_VERIFICATION_PROMPT_ID = 'prm_fact_verification_agent';

const PROMPT_RELATIVE_SEGMENTS = ['agents', 'agent-03-fact-verification', 'system-prompt.md'] as const;

/**
 * Resolves the approved prompt file's location WITHOUT depending on the
 * process's current working directory (a production deployment may launch
 * `node dist/src/main.js` from any directory).
 *
 * The primary candidate is resolved relative to this module's own compiled
 * location (`__dirname`), which is deterministic in both places this file
 * ever runs from:
 *  - the TypeScript source tree (`src/agents/fact-verification/`, three
 *    levels below the repo root) during development and tests;
 *  - the compiled `dist/src/agents/fact-verification/` output, three levels
 *    below `dist/`, where `npm run build` (`scripts/copy-prompt-asset.js`)
 *    copies the approved file verbatim to
 *    `dist/agents/agent-03-fact-verification/` — the same relative depth.
 *
 * `process.cwd()` is consulted only as a secondary, best-effort fallback.
 */
function resolvePromptFile(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', ...PROMPT_RELATIVE_SEGMENTS),
    join(process.cwd(), ...PROMPT_RELATIVE_SEGMENTS),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found !== undefined) return found;
  throw new Error(
    `fact-verification-agent: could not locate the approved prompt asset (system-prompt.md). Checked: ${candidates.join(', ')}. ` +
      'Confirm the production build ran "npm run build" (which copies this asset via scripts/copy-prompt-asset.js).',
  );
}

const USER_BLOCK_KEYS = ['researchPackage', 'language'] as const;

type UserBlockKey = (typeof USER_BLOCK_KEYS)[number];

interface UserTemplateBlock {
  readonly key: UserBlockKey;
  readonly openLine: string;
  readonly closeLine: string;
}

interface ParsedPrompt {
  readonly systemPrompt: string;
  readonly userTemplateBlocks: readonly UserTemplateBlock[];
}

export interface RenderedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly promptId: string;
}

const BLOCK_PATTERN = /<<<(?<open>.+?)>>>\r?\n\{\{(?<key>\w+)\}\}\r?\n<<<END\s+(?<close>.+?)>>>/gs;

@Injectable()
export class FactVerificationPromptService implements OnModuleInit {
  private parsed: ParsedPrompt | undefined;

  onModuleInit(): void {
    // Fail fast at boot, not on the first request, if the approved prompt file
    // has drifted from the shape this renderer depends on.
    this.parsed = this.loadAndParse();
  }

  /**
   * Renders the approved prompt against a schema-valid request payload. Both
   * `researchPackage` and `language` are required, so both blocks are always
   * rendered — there are no optional blocks in this prompt's user layer.
   */
  render(data: FactVerificationRequestData, repairGuidance?: string): RenderedPrompt {
    const parsed = this.ensureParsed();
    const source = data as unknown as Record<string, unknown>;

    const renderedBlocks: string[] = [];
    for (const block of parsed.userTemplateBlocks) {
      const value = source[block.key];
      if (value === undefined) continue;
      const neutralised = neutraliseDelimiters(value);
      renderedBlocks.push(`${block.openLine}\n${JSON.stringify(neutralised)}\n${block.closeLine}`);
    }

    return {
      systemPrompt: appendRepairGuidance(parsed.systemPrompt, repairGuidance),
      userPrompt: renderedBlocks.join('\n\n'),
      promptId: FACT_VERIFICATION_PROMPT_ID,
    };
  }

  private ensureParsed(): ParsedPrompt {
    if (this.parsed === undefined) {
      this.parsed = this.loadAndParse();
    }
    return this.parsed;
  }

  private loadAndParse(): ParsedPrompt {
    const source = readFileSync(resolvePromptFile(), 'utf8');
    const fenced = [...source.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]);

    const systemPrompt = fenced[0];
    const userTemplate = fenced[1];
    if (fenced.length !== 2 || systemPrompt === undefined || userTemplate === undefined) {
      throw new Error(
        `fact-verification-agent: expected exactly 2 fenced text blocks in system-prompt.md, found ${fenced.length}`,
      );
    }

    const userTemplateBlocks: UserTemplateBlock[] = [];
    for (const match of userTemplate.matchAll(BLOCK_PATTERN)) {
      const open = match.groups?.open;
      const key = match.groups?.key;
      const close = match.groups?.close;
      if (open === undefined || key === undefined || close === undefined) continue;
      if (!isUserBlockKey(key)) {
        throw new Error(`fact-verification-agent: unknown template variable {{${key}}} in system-prompt.md`);
      }
      userTemplateBlocks.push({ key, openLine: `<<<${open}>>>`, closeLine: `<<<END ${close}>>>` });
    }

    if (userTemplateBlocks.length !== USER_BLOCK_KEYS.length) {
      throw new Error(
        `fact-verification-agent: expected ${USER_BLOCK_KEYS.length} user-layer blocks in system-prompt.md, found ${userTemplateBlocks.length}`,
      );
    }

    return { systemPrompt, userTemplateBlocks };
  }
}

function isUserBlockKey(value: string): value is UserBlockKey {
  return (USER_BLOCK_KEYS as readonly string[]).includes(value);
}

/**
 * Deep-clones `value`, replacing any `<<<`/`>>>` sequence inside string
 * leaves with a visually similar but structurally inert substitute, so
 * rendered content can never be mistaken for a block delimiter
 * (GDE-004 §6.7). Applied uniformly across the entire `researchPackage`
 * block (README §17) — every source title, evidence quotation/paraphrase,
 * conflict description, and gap description is treated as inert data.
 */
function neutraliseDelimiters(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››');
  }
  if (Array.isArray(value)) {
    return value.map((item) => neutraliseDelimiters(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, neutraliseDelimiters(item)]));
  }
  return value;
}

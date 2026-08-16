import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, OnModuleInit } from '@nestjs/common';

import type { TopicDiscoveryRequestData } from '@agents/agent-01-topic-discovery/interfaces';

import { appendRepairGuidance } from '../../common/repair-guidance.util';

/**
 * Loads and renders the approved system prompt
 * (`agents/agent-01-topic-discovery/system-prompt.md`) — the single source of
 * truth for the Topic Discovery Agent's instructions. This module never
 * duplicates the prompt text; it parses the two fenced ```text blocks the
 * approved file already contains (system layer, user-layer template) and
 * fills the template's six named placeholders from the request payload.
 *
 * Structurally identical mechanism to `strategy.prompt.ts` (same fenced-block
 * parsing, same delimiter neutralisation, same strict-resolution policy) —
 * deliberately NOT extracted into a shared/library prompt loader, because
 * every prompt is owned by exactly one agent and there are no shared, global,
 * or library prompts on this platform (STD-000 §3.9, GDE-002 §12.7). Each
 * agent's prompt-rendering module is scoped to that agent's own block keys
 * and is reviewed, versioned, and evaluated with that agent, not shared
 * infrastructure that could silently couple two agents' prompt changes.
 *
 * Untrusted content handling (GDE-004 §6.7, §13.6): every rendered value —
 * trusted and untrusted alike — has the `<<<`/`>>>` delimiter sequences
 * neutralised before insertion, so no field (including `trendContext`, the
 * one UNTRUSTED block, and every `existingContentInventory` entry, which
 * carries prior-topic titles/angles as contextual data only) can terminate a
 * block early and inject sibling content. `trendContext` size bounds
 * (<=30 observations, <=500 code points each) are enforced structurally by
 * the input JSON Schema before this service is ever reached, per `R-IN-006`.
 */

export const TOPIC_DISCOVERY_PROMPT_ID = 'prm_topic_discovery_agent';

const PROMPT_RELATIVE_SEGMENTS = ['agents', 'agent-01-topic-discovery', 'system-prompt.md'] as const;

/**
 * Resolves the approved prompt file's location WITHOUT depending on the
 * process's current working directory (a production deployment may launch
 * `node dist/src/main.js` from any directory).
 *
 * The primary candidate is resolved relative to this module's own compiled
 * location (`__dirname`), which is deterministic in both places this file
 * ever runs from:
 *  - the TypeScript source tree (`src/agents/topic-discovery/`, three levels
 *    below the repo root) during development and tests;
 *  - the compiled `dist/src/agents/topic-discovery/` output, three levels
 *    below `dist/`, where `npm run build` (`scripts/copy-prompt-asset.js`)
 *    copies the approved file verbatim to
 *    `dist/agents/agent-01-topic-discovery/` — the same relative depth, so
 *    the same `../../../` traversal finds it.
 *
 * `process.cwd()` is consulted only as a secondary, best-effort fallback,
 * never as the primary resolution strategy.
 */
function resolvePromptFile(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', ...PROMPT_RELATIVE_SEGMENTS),
    join(process.cwd(), ...PROMPT_RELATIVE_SEGMENTS),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found !== undefined) return found;
  throw new Error(
    `topic-discovery-agent: could not locate the approved prompt asset (system-prompt.md). Checked: ${candidates.join(', ')}. ` +
      'Confirm the production build ran "npm run build" (which copies this asset via scripts/copy-prompt-asset.js).',
  );
}

const USER_BLOCK_KEYS = [
  'strategyBinding',
  'existingContentInventory',
  'discoveryConstraints',
  'trendContext',
  'language',
  'requestedTopicCount',
] as const;

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
export class TopicDiscoveryPromptService implements OnModuleInit {
  private parsed: ParsedPrompt | undefined;

  onModuleInit(): void {
    // Fail fast at boot, not on the first request, if the approved prompt file
    // has drifted from the shape this renderer depends on.
    this.parsed = this.loadAndParse();
  }

  /**
   * Renders the approved prompt against a schema-valid request payload.
   * Required blocks (`strategyBinding`, `existingContentInventory`,
   * `language`, `requestedTopicCount`) are always rendered — the input
   * schema guarantees they are present; optional blocks
   * (`discoveryConstraints`, `trendContext`) are omitted ENTIRELY — never
   * rendered empty — when the corresponding key is absent from `data`.
   */
  render(data: TopicDiscoveryRequestData, repairGuidance?: string): RenderedPrompt {
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
      promptId: TOPIC_DISCOVERY_PROMPT_ID,
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
        `topic-discovery-agent: expected exactly 2 fenced text blocks in system-prompt.md, found ${fenced.length}`,
      );
    }

    const userTemplateBlocks: UserTemplateBlock[] = [];
    for (const match of userTemplate.matchAll(BLOCK_PATTERN)) {
      const open = match.groups?.open;
      const key = match.groups?.key;
      const close = match.groups?.close;
      if (open === undefined || key === undefined || close === undefined) continue;
      if (!isUserBlockKey(key)) {
        throw new Error(`topic-discovery-agent: unknown template variable {{${key}}} in system-prompt.md`);
      }
      userTemplateBlocks.push({ key, openLine: `<<<${open}>>>`, closeLine: `<<<END ${close}>>>` });
    }

    if (userTemplateBlocks.length !== USER_BLOCK_KEYS.length) {
      throw new Error(
        `topic-discovery-agent: expected ${USER_BLOCK_KEYS.length} user-layer blocks in system-prompt.md, found ${userTemplateBlocks.length}`,
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
 * (GDE-004 §6.7). Applied uniformly to trusted and untrusted values alike —
 * including `existingContentInventory` entries (prior-topic titles, angles,
 * rejection reasons) and `trendContext` observations, since both carry
 * external/historical text this agent must treat as inert data, never as
 * instructions (system-prompt.md rule 43).
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

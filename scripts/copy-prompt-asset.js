#!/usr/bin/env node
'use strict';

/**
 * Build step: copies every approved, frozen agent system prompt
 * (each agent package's own `system-prompt.md`) into the production build
 * output at the same relative depth from the compiled entry point that the
 * source file has from its owning agent's prompt-loader module (three
 * levels below the repo root either way: `src/agents/<agent>/` during
 * development, or `dist/src/agents/<agent>/` after `nest build`).
 *
 * This does NOT duplicate or rewrite any prompt as a second source of truth
 * — each `agents/<agent-package>/system-prompt.md` remains the only authored
 * copy. This script only makes a verbatim copy of each approved file
 * available next to the compiled runtime so production deployments (which
 * ship `dist/`, not the whole repo tree) are not required to also carry
 * `agents/` alongside `dist/` and rely on the developer's current working
 * directory to find it.
 *
 * One script, one list — adding a future agent's prompt asset means adding
 * one entry below, never a second copy of this script (STD-000 §2.3).
 *
 * Wired into `npm run build` (`nest build && node scripts/copy-prompt-asset.js`).
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const PROMPT_ASSETS = [
  { agentPackage: 'agent-00-strategy' },
  { agentPackage: 'agent-01-topic-discovery' },
  { agentPackage: 'agent-02-research' },
  { agentPackage: 'agent-03-fact-verification' },
  { agentPackage: 'agent-04-story-architect' },
  { agentPackage: 'agent-05-script-writer' },
  { agentPackage: 'agent-06-script-reviewer' },
];

let failed = false;

for (const { agentPackage } of PROMPT_ASSETS) {
  const sourceFile = path.join(projectRoot, 'agents', agentPackage, 'system-prompt.md');
  const destDir = path.join(projectRoot, 'dist', 'agents', agentPackage);
  const destFile = path.join(destDir, 'system-prompt.md');

  if (!fs.existsSync(sourceFile)) {
    console.error(`copy-prompt-asset: approved prompt source not found at ${sourceFile}`);
    failed = true;
    continue;
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(sourceFile, destFile);

  const sourceBytes = fs.readFileSync(sourceFile);
  const destBytes = fs.readFileSync(destFile);
  if (!sourceBytes.equals(destBytes)) {
    console.error(`copy-prompt-asset: copied file does not match the source byte-for-byte for ${agentPackage}.`);
    failed = true;
    continue;
  }

  console.log(`copy-prompt-asset: copied system-prompt.md -> ${path.relative(projectRoot, destFile)}`);
}

if (failed) {
  process.exit(1);
}

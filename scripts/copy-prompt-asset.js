#!/usr/bin/env node
'use strict';

/**
 * Build step: copies the approved, frozen AGT-00 system prompt
 * (`agents/agent-00-strategy/system-prompt.md`) into the production build
 * output at the same relative depth from the compiled entry point that the
 * source file has from `src/agents/strategy/strategy.prompt.ts`.
 *
 * This does NOT duplicate or rewrite the prompt as a second source of truth
 * — `agents/agent-00-strategy/system-prompt.md` remains the only authored
 * copy. This script only makes a verbatim copy of that one file available
 * next to the compiled runtime so production deployments (which ship
 * `dist/`, not the whole repo tree) are not required to also carry
 * `agents/` alongside `dist/` and rely on the developer's current working
 * directory to find it.
 *
 * Wired into `npm run build` (`nest build && node scripts/copy-prompt-asset.js`).
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceFile = path.join(projectRoot, 'agents', 'agent-00-strategy', 'system-prompt.md');
const destDir = path.join(projectRoot, 'dist', 'agents', 'agent-00-strategy');
const destFile = path.join(destDir, 'system-prompt.md');

if (!fs.existsSync(sourceFile)) {
  console.error(`copy-prompt-asset: approved prompt source not found at ${sourceFile}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(sourceFile, destFile);

const sourceBytes = fs.readFileSync(sourceFile);
const destBytes = fs.readFileSync(destFile);
if (!sourceBytes.equals(destBytes)) {
  console.error('copy-prompt-asset: copied file does not match the source byte-for-byte.');
  process.exit(1);
}

console.log(`copy-prompt-asset: copied system-prompt.md -> ${path.relative(projectRoot, destFile)}`);

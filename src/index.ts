#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Command } from 'commander';
import { analyze } from './commands/analyze.js';
import { apply } from './commands/apply.js';
import { ui } from './ui.js';
import {
  DEFAULT_GOAL,
  FOCUS_PRESETS,
  REFERENCE_DIR,
  DEFAULT_FOCUS,
} from './config.js';

const program = new Command();

program
  .name('repogap')
  .description(
    'Compare your repo against a reference implementation, get a prioritized gap report, and apply approved improvements one commit at a time.',
  )
  .version('0.1.0');

program
  .command('analyze')
  .description('Phase 1 — read-only analysis. Writes GAP_ANALYSIS.md and nothing else.')
  .requiredOption('-r, --reference <url>', 'public reference repo to compare against')
  .option('-C, --repo <path>', 'repo to analyze', process.cwd())
  .option('-g, --goal <text>', 'what this repo is for', DEFAULT_GOAL)
  .option(
    '-f, --focus <areas>',
    `focus areas — a preset (${Object.keys(FOCUS_PRESETS).join(', ')}) or free text`,
    'all',
  )
  .option('-x, --out-of-scope <text>', 'changes to rule out', '')
  .option('-m, --model <model>', 'model to run the agent on')
  .option('--max-turns <n>', 'turn budget for the analysis', '60')
  .option('--keep-reference', 'do not suggest cleaning up the clone', false)
  .action(async (options) => {
    const code = await analyze({
      reference: options.reference,
      repo: options.repo,
      goal: options.goal,
      focus: FOCUS_PRESETS[options.focus] ?? options.focus ?? DEFAULT_FOCUS,
      outOfScope: options.outOfScope,
      model: options.model,
      maxTurns: Number(options.maxTurns),
      keepReference: options.keepReference,
    });
    process.exitCode = code;
  });

program
  .command('apply')
  .description('Phase 2 — implement approved items, one at a time, one commit each.')
  .argument('<items...>', 'item IDs from the report, e.g. G-01 G-04')
  .option('-C, --repo <path>', 'repo to modify', process.cwd())
  .option('-m, --model <model>', 'model to run the agent on')
  .option('--max-turns <n>', 'turn budget per item', '40')
  .option('-y, --yes', 'skip the per-item approval gates', false)
  .action(async (items: string[], options) => {
    const code = await apply({
      repo: options.repo,
      items: items.map((item) => item.toUpperCase()),
      model: options.model,
      maxTurns: Number(options.maxTurns),
      yes: options.yes,
    });
    process.exitCode = code;
  });

program
  .command('clean')
  .description('Remove the cloned reference repo.')
  .action(async () => {
    await fs.rm(REFERENCE_DIR, { recursive: true, force: true });
    ui.ok(`Removed ${REFERENCE_DIR}`);
  });

program.parseAsync(process.argv).catch((error: Error) => {
  ui.error(error.message);
  process.exitCode = 1;
});

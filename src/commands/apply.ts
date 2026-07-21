import fs from 'node:fs/promises';
import path from 'node:path';
import { runAgent } from '../agent.js';
import { applyGuard } from '../guard.js';
import { detectLicense } from '../license.js';
import { implementPrompt, planPrompt, planSystemPrompt } from '../prompts.js';
import { confirm, ui } from '../ui.js';
import { REFERENCE_DIR, REPORT_FILE } from '../config.js';
import type { LicensePolicy } from '../config.js';

export type ApplyOptions = {
  repo: string;
  items: string[];
  model?: string;
  maxTurns: number;
  yes: boolean;
};

/** Phase 2: implement approved items, one at a time, one commit each. */
export async function apply(options: ApplyOptions): Promise<number> {
  const repo = path.resolve(options.repo);
  const reportPath = path.join(repo, REPORT_FILE);

  try {
    await fs.access(reportPath);
  } catch {
    ui.error(`No ${REPORT_FILE} in ${repo}. Run \`repogap analyze\` first.`);
    return 1;
  }

  // The license policy still binds during implementation — the clone may be
  // gone by now, in which case fall back to the strictest reading.
  let license: LicensePolicy;
  try {
    await fs.access(REFERENCE_DIR);
    license = await detectLicense(REFERENCE_DIR);
  } catch {
    license = {
      name: 'reference no longer available',
      permissive: false,
      rule:
        'The reference repo is no longer on disk. Do not reproduce its code from memory. ' +
        'Implement from the description in the report, in this repo\'s own style.',
    };
  }

  const completed: string[] = [];
  const skipped: string[] = [];

  for (const item of options.items) {
    ui.heading(`${item} — plan`);

    const plan = await runAgent({
      prompt: planPrompt(item, reportPath),
      systemPrompt: planSystemPrompt(repo, license),
      cwd: repo,
      tools: ['Read', 'Grep', 'Glob'],
      canUseTool: applyGuard(repo),
      model: options.model,
      maxTurns: Math.min(options.maxTurns, 20),
    });

    if (!plan.ok) {
      ui.error(`Could not plan ${item}. Stopping.`);
      skipped.push(item);
      break;
    }

    const go =
      options.yes || (await confirm(`Implement ${item} with this plan?`));
    if (!go) {
      ui.warn(`Skipped ${item}`);
      skipped.push(item);
      continue;
    }

    ui.heading(`${item} — implement`);
    const build = await runAgent({
      prompt: implementPrompt(item, reportPath),
      systemPrompt: planSystemPrompt(repo, license),
      cwd: repo,
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'TodoWrite'],
      canUseTool: applyGuard(repo),
      model: options.model,
      maxTurns: options.maxTurns,
    });

    if (!build.ok) {
      ui.error(`${item} did not complete. Review the working tree before continuing.`);
      skipped.push(item);
      break;
    }

    completed.push(item);
    ui.ok(`${item} done`);

    const remaining = options.items.slice(options.items.indexOf(item) + 1);
    if (remaining.length && !options.yes) {
      const next = await confirm(`Continue to ${remaining[0]}?`);
      if (!next) {
        skipped.push(...remaining);
        break;
      }
    }
  }

  ui.heading('Summary');
  ui.ok(`Completed: ${completed.length ? completed.join(', ') : 'none'}`);
  if (skipped.length) ui.warn(`Skipped: ${skipped.join(', ')}`);
  ui.step('Commits were made locally. Nothing was pushed.');
  return completed.length ? 0 : 1;
}

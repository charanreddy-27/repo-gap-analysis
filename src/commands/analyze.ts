import fs from 'node:fs/promises';
import path from 'node:path';
import { runAgent } from '../agent.js';
import { analysisGuard } from '../guard.js';
import { cloneReference, detectLicense, licenseHeadline } from '../license.js';
import { analysisPrompt, analysisSystemPrompt } from '../prompts.js';
import { stampReport } from '../report.js';
import { ui } from '../ui.js';
import { REFERENCE_DIR, REPORT_FILE, type AnalyzeConfig } from '../config.js';

export type AnalyzeOptions = {
  reference: string;
  repo: string;
  goal: string;
  focus: string;
  outOfScope: string;
  model?: string;
  maxTurns: number;
  keepReference: boolean;
};

/** Phase 1: read-only analysis producing a single report file. */
export async function analyze(options: AnalyzeOptions): Promise<number> {
  const repo = path.resolve(options.repo);
  const reportPath = path.join(repo, REPORT_FILE);

  try {
    await fs.access(repo);
  } catch {
    ui.error(`Repo not found: ${repo}`);
    return 1;
  }

  ui.heading('Reference');
  ui.step(`Cloning ${options.reference}`);
  try {
    await cloneReference(options.reference, REFERENCE_DIR);
  } catch (error) {
    ui.error(`Clone failed: ${(error as Error).message.split('\n')[0]}`);
    return 1;
  }
  ui.ok(`Cloned to ${REFERENCE_DIR}`);

  const license = await detectLicense(REFERENCE_DIR);
  const headline = licenseHeadline(license);
  if (license.permissive) {
    ui.ok(`License: ${headline}`);
  } else {
    ui.warn(`License: ${headline}`);
  }

  const config: AnalyzeConfig = {
    repo,
    reference: options.reference,
    referenceDir: REFERENCE_DIR,
    goal: options.goal,
    focus: options.focus,
    outOfScope: options.outOfScope,
    reportPath,
    model: options.model,
    maxTurns: options.maxTurns,
  };

  ui.heading('Analysis');
  ui.step(`Goal: ${options.goal}`);
  ui.step(`Focus: ${options.focus}`);
  console.log();

  const result = await runAgent({
    prompt: analysisPrompt(config, license),
    systemPrompt: analysisSystemPrompt(config, license),
    cwd: repo,
    // No Edit/NotebookEdit: Write is the only mutation path, and the guard
    // narrows even that to the single report file.
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'TodoWrite'],
    canUseTool: analysisGuard(reportPath),
    model: options.model,
    maxTurns: options.maxTurns,
    additionalDirectories: [REFERENCE_DIR],
  });

  if (!result.ok) {
    ui.error('Analysis did not complete.');
    return 1;
  }

  try {
    await fs.access(reportPath);
  } catch {
    ui.error(`Agent finished but ${REPORT_FILE} was not written.`);
    return 1;
  }

  // Correct the header facts the program owns rather than trusting the model.
  await stampReport(reportPath, license, options.reference);

  ui.heading('Done');
  ui.ok(`Report written to ${reportPath}`);
  ui.step(`Review it, then apply items with: repogap apply G-01 [G-02 ...]`);
  if (!options.keepReference) {
    ui.step(`Remove the reference clone with: repogap clean`);
  }
  return 0;
}

import path from 'node:path';
import os from 'node:os';

/** Where the reference repo is cloned. Deliberately outside the target repo so
 *  it never lands in the user's git history. */
export const REFERENCE_DIR = path.join(os.tmpdir(), 'repogap-reference');

/** The single file Phase 1 is allowed to create. */
export const REPORT_FILE = 'GAP_ANALYSIS.md';

export type Verdict = 'adopt' | 'port' | 'skip';

export type LicensePolicy = {
  /** Raw SPDX-ish name detected from the reference repo. */
  name: string;
  /** Permissive licenses allow porting code with attribution. */
  permissive: boolean;
  /** One line, injected verbatim into the agent's system prompt. */
  rule: string;
};

export type AnalyzeConfig = {
  repo: string;
  reference: string;
  referenceDir: string;
  goal: string;
  focus: string;
  outOfScope: string;
  reportPath: string;
  model?: string;
  maxTurns: number;
};

export const DEFAULT_GOAL = 'production-ready portfolio project';

export const DEFAULT_FOCUS =
  'features, architecture, testing & CI, error handling, docs & DX, security & config';

export const FOCUS_PRESETS: Record<string, string> = {
  all: DEFAULT_FOCUS,
  features: 'features',
  architecture: 'architecture & code structure',
  testing: 'testing & CI/CD',
  errors: 'error handling & robustness',
  docs: 'docs & developer experience',
  security: 'security & configuration',
};

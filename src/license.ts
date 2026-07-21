import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LicensePolicy } from './config.js';

const run = promisify(execFile);

const PERMISSIVE = [
  { match: /\bMIT\b/i, name: 'MIT' },
  { match: /Apache License.*2\.0|Apache-2\.0/is, name: 'Apache-2.0' },
  { match: /BSD 3-Clause|BSD-3-Clause/i, name: 'BSD-3-Clause' },
  { match: /BSD 2-Clause|BSD-2-Clause/i, name: 'BSD-2-Clause' },
  { match: /\bISC\b/i, name: 'ISC' },
  { match: /Unlicense/i, name: 'Unlicense' },
];

const COPYLEFT = [
  { match: /GNU AFFERO GENERAL PUBLIC LICENSE|AGPL/i, name: 'AGPL' },
  { match: /GNU LESSER GENERAL PUBLIC LICENSE|LGPL/i, name: 'LGPL' },
  { match: /GNU GENERAL PUBLIC LICENSE|\bGPL\b/i, name: 'GPL' },
  { match: /Mozilla Public License|MPL-2\.0/i, name: 'MPL-2.0' },
];

const LICENSE_FILENAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt',
];

/**
 * Shallow-clone the reference repo outside the target repo.
 * Re-clones from scratch so a stale cache can never be mistaken for HEAD.
 */
export async function cloneReference(url: string, dest: string): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true });
  await run('git', ['clone', '--depth', '1', url, dest], {
    maxBuffer: 1024 * 1024 * 32,
  });
}

/**
 * Read the reference repo's license and turn it into a policy the agent must
 * follow. Permissive licenses allow porting code with attribution; copyleft or
 * a missing license means patterns and ideas only, reimplemented from scratch.
 */
export async function detectLicense(dir: string): Promise<LicensePolicy> {
  let text = '';
  for (const name of LICENSE_FILENAMES) {
    try {
      text = await fs.readFile(path.join(dir, name), 'utf8');
      break;
    } catch {
      // try the next candidate filename
    }
  }

  if (!text.trim()) {
    return {
      name: 'no license file found',
      permissive: false,
      rule:
        'The reference repo has NO license file. All rights are reserved by default. ' +
        'You must NEVER copy code, comments, config, or prose verbatim. ' +
        'Describe patterns and ideas only, to be reimplemented from scratch.',
    };
  }

  const head = text.slice(0, 4000);

  for (const { match, name } of COPYLEFT) {
    if (match.test(head)) {
      return {
        name,
        permissive: false,
        rule:
          `The reference repo is ${name} licensed, which is copyleft and would impose its terms on this repo. ` +
          'You must NEVER copy code verbatim. Describe patterns and ideas only, to be reimplemented from scratch.',
      };
    }
  }

  for (const { match, name } of PERMISSIVE) {
    if (match.test(head)) {
      return {
        name,
        permissive: true,
        rule:
          `The reference repo is ${name} licensed, so porting code is permitted WITH attribution. ` +
          'Any recommendation whose verdict is "Port with attribution" must name the source file it came from ' +
          'so the attribution can be added at implementation time. Prefer adapting patterns over copying.',
      };
    }
  }

  return {
    name: 'unrecognized license',
    permissive: false,
    rule:
      'The reference repo has a license file that could not be classified. Treat it as all-rights-reserved: ' +
      'NEVER copy code verbatim. Describe patterns and ideas only.',
  };
}

/** Short one-liner for the report header. */
export function licenseHeadline(policy: LicensePolicy): string {
  return policy.permissive
    ? `${policy.name} → port with attribution allowed`
    : `${policy.name} → patterns only, no verbatim copying`;
}

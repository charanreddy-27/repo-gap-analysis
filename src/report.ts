import fs from 'node:fs/promises';
import type { LicensePolicy } from './config.js';
import { licenseHeadline } from './license.js';

/**
 * Rewrite the report's header facts with values the program already knows.
 *
 * The license and the date are not the model's to invent — and in practice it
 * does invent them (a model will happily stamp a report with a date from its
 * training prior). Anything verifiable in code gets corrected in code.
 */
export async function stampReport(
  reportPath: string,
  license: LicensePolicy,
  reference: string,
): Promise<void> {
  const original = await fs.readFile(reportPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);

  const stamped = original
    .replace(
      /^\*\*Reference license:\*\*.*$/m,
      `**Reference license:** ${licenseHeadline(license)}`,
    )
    .replace(/^\*\*Date:\*\*.*$/m, `**Date:** ${today}`);

  const withProvenance = /^\*\*Reference repo:\*\*/m.test(stamped)
    ? stamped
    : stamped.replace(
        /^(\*\*Reference license:\*\*.*)$/m,
        `**Reference repo:** ${reference}\n$1`,
      );

  if (withProvenance !== original) {
    await fs.writeFile(reportPath, withProvenance, 'utf8');
  }
}

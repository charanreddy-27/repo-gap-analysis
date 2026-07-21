import pc from 'picocolors';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export const ui = {
  heading(text: string): void {
    console.log('\n' + pc.bold(pc.cyan(text)));
  },

  step(text: string): void {
    console.log(pc.dim('  · ') + text);
  },

  ok(text: string): void {
    console.log(pc.green('  ✓ ') + text);
  },

  warn(text: string): void {
    console.log(pc.yellow('  ! ') + text);
  },

  error(text: string): void {
    console.error(pc.red('  ✗ ') + text);
  },

  /** A tool call the agent made, rendered as one compact line. */
  tool(name: string, detail: string): void {
    const trimmed = detail.replace(/\s+/g, ' ').slice(0, 90);
    console.log(pc.dim(`  ${name}${trimmed ? ' ' + trimmed : ''}`));
  },

  /** A tool call the guard refused, so blocked work is visible, not silent. */
  blocked(name: string, reason: string): void {
    console.log(pc.red(`  ⛔ ${name}`) + pc.dim(` — ${reason}`));
  },

  text(text: string): void {
    console.log(text);
  },

  usage(costUsd: number, turns: number, ms: number): void {
    const seconds = (ms / 1000).toFixed(1);
    console.log(
      pc.dim(`\n  ${turns} turns · ${seconds}s · $${costUsd.toFixed(4)}`),
    );
  },
};

/** Approval gate. Every state-changing phase goes through this. */
export async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(pc.bold(`\n${question} `) + pc.dim('[y/N] '));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(pc.bold(`\n${question} `))).trim();
  } finally {
    rl.close();
  }
}

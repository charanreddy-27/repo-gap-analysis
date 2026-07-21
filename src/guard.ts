import path from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { ui } from './ui.js';

/**
 * Permission interceptors. The ground rules ("Phase 1 is strictly read-only",
 * "one item = one commit") are enforced here rather than only asked for in the
 * prompt — a prompt is a request, `canUseTool` is a gate the model cannot talk
 * its way past.
 */

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/** Read-only commands Phase 1 may run. Anything else is denied. */
const READ_ONLY_BASH = [
  /^git\s+(log|status|show|diff|ls-files|branch|remote|describe|shortlog|rev-parse|config\s+--get)\b/,
  /^(ls|dir|cat|head|tail|wc|find|stat|file|tree|du)\b/,
  /^(node|npm|npx|python|python3|go|cargo|java)\s+(-v|--version)\b/,
  /^npm\s+(ls|list|view|outdated)\b/,
  /^(echo|pwd|which|where|basename|dirname|sort|uniq|grep|rg)\b/,
];

/** Never allowed, in any phase. */
const ALWAYS_DENIED_BASH = [
  { pattern: /\bgit\s+push\b/, why: 'pushing is the user\'s call, not the agent\'s' },
  { pattern: /\bgit\s+reset\s+--hard\b/, why: 'discards uncommitted work' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, why: 'deletes untracked files' },
  { pattern: /\brm\s+-[a-z]*[rf]/, why: 'recursive or forced delete' },
  { pattern: /\b(shutdown|reboot|mkfs|dd)\b/, why: 'destructive system command' },
  { pattern: /\bcurl\b[^|]*\|\s*(sh|bash)/, why: 'pipes remote content into a shell' },
  { pattern: /\bnpm\s+publish\b/, why: 'publishes outward' },
];

function splitCommand(command: string): string[] {
  return command
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function deny(message: string): PermissionResult {
  return { behavior: 'deny', message };
}

function allow(input: Record<string, unknown>): PermissionResult {
  return { behavior: 'allow', updatedInput: input };
}

function checkAlwaysDenied(command: string): string | null {
  for (const { pattern, why } of ALWAYS_DENIED_BASH) {
    if (pattern.test(command)) return why;
  }
  return null;
}

/** True when `target` is inside `root` (or is `root` itself). */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function pathOf(input: Record<string, unknown>): string | null {
  const candidate = input.file_path ?? input.path ?? input.notebook_path;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Phase 1 guard: the target repo is strictly read-only. The only write allowed
 * anywhere on disk is the report file, and Bash is narrowed to an allowlist of
 * read-only commands.
 */
export function analysisGuard(reportPath: string): CanUseTool {
  const resolvedReport = path.resolve(reportPath);

  return async (toolName, input) => {
    if (WRITE_TOOLS.has(toolName)) {
      const target = pathOf(input);
      if (!target || path.resolve(target) !== resolvedReport) {
        const reason = `Phase 1 is read-only. The only writable file is ${path.basename(resolvedReport)}.`;
        ui.blocked(toolName, reason);
        return deny(
          `${reason} Do not modify ${target ?? 'that file'}. Record the finding in the report instead.`,
        );
      }
      return allow(input);
    }

    if (toolName === 'Bash') {
      const command = String(input.command ?? '');
      const destructive = checkAlwaysDenied(command);
      if (destructive) {
        ui.blocked('Bash', destructive);
        return deny(`Denied: ${destructive}.`);
      }
      const segments = splitCommand(command);
      const offending = segments.find(
        (segment) => !READ_ONLY_BASH.some((pattern) => pattern.test(segment)),
      );
      if (offending) {
        const reason = `not a read-only command: ${offending.slice(0, 60)}`;
        ui.blocked('Bash', reason);
        return deny(
          `Phase 1 only permits read-only shell commands (git log/status/show/diff, ls, cat, grep, ...). ` +
            `Use the Read, Grep and Glob tools instead.`,
        );
      }
      return allow(input);
    }

    return allow(input);
  };
}

/**
 * Phase 2 guard: writes are allowed, but only inside the target repo, and the
 * outward-facing or history-destroying operations stay blocked.
 */
export function applyGuard(repoRoot: string): CanUseTool {
  return async (toolName, input) => {
    if (WRITE_TOOLS.has(toolName)) {
      const target = pathOf(input);
      if (target && !isInside(repoRoot, target)) {
        const reason = 'write outside the target repo';
        ui.blocked(toolName, reason);
        return deny(
          `Denied: ${target} is outside ${repoRoot}. Only edit files inside the repo being improved.`,
        );
      }
      return allow(input);
    }

    if (toolName === 'Bash') {
      const command = String(input.command ?? '');
      const destructive = checkAlwaysDenied(command);
      if (destructive) {
        ui.blocked('Bash', destructive);
        return deny(`Denied: ${destructive}. Stop and report this to the user instead.`);
      }
      return allow(input);
    }

    return allow(input);
  };
}

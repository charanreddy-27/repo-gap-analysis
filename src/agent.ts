import { query, type CanUseTool, type Options } from '@anthropic-ai/claude-agent-sdk';
import { ui } from './ui.js';

export type AgentRun = {
  prompt: string;
  systemPrompt: string;
  cwd: string;
  tools: string[];
  canUseTool: CanUseTool;
  model?: string;
  maxTurns: number;
  /** Extra directories the agent may read outside cwd (e.g. the reference clone). */
  additionalDirectories?: string[];
};

export type AgentResult = {
  text: string;
  costUsd: number;
  turns: number;
  durationMs: number;
  ok: boolean;
};

/** One-line summary of a tool call, for the streaming log. */
function describeTool(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash') return String(input.command ?? '');
  if (name === 'Grep') return String(input.pattern ?? '');
  if (name === 'Glob') return String(input.pattern ?? '');
  const target = input.file_path ?? input.path ?? input.notebook_path;
  return typeof target === 'string' ? target : '';
}

/**
 * Run a single agent turn to completion, streaming its progress.
 *
 * `settingSources: []` keeps the run hermetic — no ambient CLAUDE.md or
 * settings.json from the machine leaks into the analysis, so the same repo pair
 * produces the same report on any developer's laptop.
 */
export async function runAgent(run: AgentRun): Promise<AgentResult> {
  const options: Options = {
    cwd: run.cwd,
    model: run.model,
    maxTurns: run.maxTurns,
    systemPrompt: run.systemPrompt,
    tools: run.tools,
    canUseTool: run.canUseTool,
    permissionMode: 'default',
    settingSources: [],
    additionalDirectories: run.additionalDirectories,
  };

  let text = '';
  let costUsd = 0;
  let turns = 0;
  let durationMs = 0;
  let ok = false;

  for await (const message of query({ prompt: run.prompt, options })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          text += block.text;
          ui.text(block.text.trimEnd());
        } else if (block.type === 'tool_use') {
          ui.tool(block.name, describeTool(block.name, block.input as Record<string, unknown>));
        }
      }
    } else if (message.type === 'result') {
      costUsd = message.total_cost_usd;
      turns = message.num_turns;
      durationMs = message.duration_ms;
      if (message.subtype === 'success') {
        ok = true;
        if (message.result) text = message.result;
      } else if (message.subtype === 'error_max_turns') {
        ui.error(
          `Ran out of turns after ${turns}. Re-run with a larger --max-turns budget.`,
        );
      } else {
        ui.error(`Agent stopped: ${message.subtype}`);
        for (const error of message.errors ?? []) ui.error(error);
      }
    }
  }

  ui.usage(costUsd, turns, durationMs);
  return { text, costUsd, turns, durationMs, ok };
}

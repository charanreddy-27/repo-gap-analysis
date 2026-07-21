# repogap — deep dive

Architecture, data flow, and the parts that were actually hard.

---

## 1. The shape of the problem

Two failure modes drove every design decision.

**Padding.** Ask a model to compare two repos and it produces an agreeable inventory. Everything
the reference has and you don't becomes a "gap", ranked by nothing. The list doesn't shrink when
your project is small, because nothing in the request gives the model permission to return less.

**Unreviewable writes.** Hand an agent write access to fix those gaps and you get one commit
across forty files, some of it work you never asked for. Reviewing it costs more than doing it.

So the tool is two phases with a hard boundary: **analysis that cannot write**, and
**implementation that writes one item at a time, only after you approve it.**

---

## 2. Architecture

```
┌─ Phase 1 · analyze ─────────────────────────────────────────────┐
│                                                                 │
│  cloneReference()      git clone --depth 1 → os.tmpdir()        │
│         │              (outside the target repo, always)        │
│         ▼                                                       │
│  detectLicense()       LICENSE → { name, permissive, rule }     │
│         │                                                       │
│         ▼                                                       │
│  analysisSystemPrompt(config, license)                          │
│         │              ← the licence rule is embedded here,     │
│         │                before the agent reads any code        │
│         ▼                                                       │
│  runAgent({                                                     │
│    tools: [Read, Grep, Glob, Bash, Write, TodoWrite],           │
│    canUseTool: analysisGuard(reportPath),   ← the rail          │
│    settingSources: [],                      ← hermetic          │
│    additionalDirectories: [REFERENCE_DIR],                      │
│  })                                                             │
│         │                                                       │
│         ▼                                                       │
│  GAP_ANALYSIS.md → stampReport()  ← programme corrects the      │
│                                     facts it already owns       │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  YOU pick item IDs │
                    └─────────┬──────────┘
                              │
┌─ Phase 2 · apply (per item) ▼───────────────────────────────────┐
│                                                                 │
│  plan       tools: [Read, Grep, Glob]        ← cannot write     │
│    │        canUseTool: applyGuard(repoRoot)                    │
│    ▼                                                            │
│  confirm()  ← human gate, unless --yes                          │
│    │                                                            │
│    ▼                                                            │
│  implement  tools: [+ Edit, Write, Bash]                        │
│             canUseTool: applyGuard(repoRoot)                    │
│             → verify → git commit "gap(G-XX): …"                │
└─────────────────────────────────────────────────────────────────┘
```

### Folder structure

```
src/
  index.ts            commander CLI — three subcommands
  config.ts           paths, defaults, shared types
  ui.ts               streaming output, approval prompts
  agent.ts            Agent SDK wrapper: query(), message narrowing, cost accounting
  guard.ts            ⭐ the permission interceptors
  license.ts          clone + licence classification → policy
  prompts.ts          ground rules, report contract, per-phase prompts
  report.ts           post-hoc correction of programme-owned facts
  commands/
    analyze.ts        Phase 1 orchestration
    apply.ts          Phase 2 orchestration, per-item loop
test/
  guard.test.js       6 cases, no API key needed
site/                 the showcase site (static, deploys to Vercel)
```

---

## 3. The hard part: constraints as interceptors

### Why the prompt isn't enough

The first version put the rule in the system prompt:

> Phase 1 is read-only. Do not modify anything except `GAP_ANALYSIS.md`.

This is a *request*. A model that concludes the rule doesn't apply to a particular action — or
that simply loses the instruction in a long context — will act, and you discover it afterwards
by reading `git status`. For a tool whose entire pitch is "safe to point at your repo", that's
not good enough.

The Agent SDK exposes `canUseTool`, a callback invoked **before** each tool executes, returning
allow or deny. That turns the rule into a gate.

```ts
export function analysisGuard(reportPath: string): CanUseTool {
  const resolvedReport = path.resolve(reportPath);

  return async (toolName, input) => {
    if (WRITE_TOOLS.has(toolName)) {
      const target = pathOf(input);
      if (!target || path.resolve(target) !== resolvedReport) {
        return deny(`Phase 1 is read-only. …Record the finding in the report instead.`);
      }
      return allow(input);
    }
    // …Bash allowlisting
  };
}
```

### Denials carry a reason

`deny()` returns a `message`, not just a refusal. That message goes back to the model, so a
blocked agent adapts — "record the finding in the report instead" — rather than retrying the
same call until it burns the turn budget. A silent denial would produce a loop.

### The bug: chained commands

The first Bash implementation matched the allowlist against the whole command string. That
meant a read-only prefix laundered anything after it:

```bash
ls && rm -rf src        # allowed — matched /^ls\b/
```

The fix splits on `&&`, `||`, `;` and `|`, and requires **every** segment to match the
allowlist. There's also an unconditional deny list (`rm -rf`, `git push`, `git reset --hard`,
`curl … | sh`, `npm publish`) checked against the raw string, so it catches destructive commands
regardless of how they're chained.

```ts
const segments = splitCommand(command);
const offending = segments.find(
  (segment) => !READ_ONLY_BASH.some((pattern) => pattern.test(segment)),
);
```

That case is now `test/guard.test.js` case three.

### Phase 2 uses a different rail, not no rail

`applyGuard` allows writes, but only inside the target repo — resolved with `path.relative`, so
`..` traversal and absolute paths outside the root are both caught:

```ts
function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
```

The always-denied list is shared across both phases. Committing is allowed; pushing is not.
That line is deliberate — a commit is local and revertible, a push is outward-facing and the
user's call.

---

## 4. Licence policy as prompt state

Porting a pattern from an MIT repo is fine. Doing the same from an AGPL repo is a licensing
problem. Deciding after the fact is too late — by then the model has already written a detailed
description of the implementation.

So `detectLicense()` runs immediately after the clone and returns a policy object whose `rule`
string is embedded in the system prompt:

| Detected | `permissive` | Rule injected |
|---|---|---|
| MIT, Apache-2.0, BSD, ISC, Unlicense | `true` | Porting permitted **with attribution**; "Port with attribution" verdicts must name the source file |
| GPL, AGPL, LGPL, MPL | `false` | Never copy verbatim; patterns and ideas only, reimplemented from scratch |
| No `LICENSE` file | `false` | All rights reserved by default — the **strictest** case, not the loosest |
| Unrecognised text | `false` | Treated as all-rights-reserved |

The no-licence case is the one worth arguing about. The intuitive default is "no licence, no
restriction." The correct default is the opposite: absent a licence grant, the author retains
all rights. Getting this backwards would be the kind of bug that matters.

---

## 5. Facts the programme owns

The first real run produced a well-structured report stamped:

```
**Date:** 2025-01-21
```

The correct date — `2026-07-21` — was interpolated into the prompt template the model was
filling in. It overwrote it with a date from its training prior.

This is a small bug with a large lesson: **injecting a fact into a prompt does not guarantee the
model carries it.** `src/report.ts` now rewrites the licence and date lines after generation,
and adds a provenance line naming the reference URL:

```ts
const stamped = original
  .replace(/^\*\*Reference license:\*\*.*$/m, `**Reference license:** ${licenseHeadline(license)}`)
  .replace(/^\*\*Date:\*\*.*$/m, `**Date:** ${today}`);
```

The generalised rule, now applied across the codebase: if the programme can know something, the
programme decides it. Prompts are for judgment, not for data transport.

---

## 6. Turn budget as prompt state

The first bounded run (`--max-turns 30`) explored both repos thoroughly, read fifteen files,
and hit the ceiling **before writing anything**. Total output: nothing.

The agent had no way to know how much budget remained. The fix is two lines in the prompt:

> You have roughly `${config.maxTurns}` turns. Spend at most half of them exploring, then write
> the report with what you have. A complete report from partial exploration is useful;
> exhaustive exploration with no report is worthless.

Plus a specific error message on `error_max_turns` pointing at the flag. Autonomy needs a clock.

---

## 7. Hermetic runs

```ts
settingSources: []
```

By default the SDK loads `~/.claude/settings.json`, project `.claude/settings.json`, and
`CLAUDE.md` files. For a tool whose output is a *report you'll act on*, that's a reproducibility
hazard: the same repo pair would produce different analyses on different machines depending on
each developer's ambient config.

Empty `settingSources` means the only inputs are the two repos, the CLI flags, and the prompts
in this codebase.

---

## 8. Message handling

The SDK's `SDKMessage` union is narrowed by `type`, then `subtype`:

```ts
if (message.type === 'assistant') {
  for (const block of message.message.content) { … }   // note: message.message
} else if (message.type === 'result') {
  costUsd = message.total_cost_usd;
  if (message.subtype === 'success') { … }
  else if (message.subtype === 'error_max_turns') { … }
}
```

Two things worth flagging for anyone building on this SDK:

1. `SDKAssistantMessage` wraps the API message — content is at `message.message.content`, not
   `message.content`.
2. `PermissionResult` uses `{ behavior: 'allow' | 'deny' }`, and the allow branch requires
   `updatedInput`. The published docs page shows `{ type: 'allow' }`, which does not compile.
   This project was written against the shipped `.d.ts` files rather than the docs.

---

## 9. Tradeoffs taken

| Decision | Cost | Why it's still right |
|---|---|---|
| Bash allowlist over blocklist | Phase 1 occasionally can't run a useful command | A blocklist is a guess about what's dangerous; an allowlist is a statement about what's needed. It routes around with `Read`/`Grep`. |
| Commit but never push | User has to push manually | Local commits are revertible. Pushing is outward-facing and not the agent's decision. |
| Shallow clone | No access to the reference's history or commit messages | Fast, and structurally incapable of ending up in your git history. |
| One agent call per item in Phase 2 | More total tokens than one batched call | One item, one commit, one review. Batching is exactly the failure being designed against. |
| Report written once at the end | A crashed run loses the analysis | Incremental writes would need many more Write calls through the guard; the budget instruction addresses the real cause. |

---

## 10. What I'd do next

- **Cache the reference analysis.** Comparing five repos against the same reference re-reads it
  five times. A content-hash cache would cut cost substantially.
- **Structured output for the report.** Emitting JSON and rendering the markdown locally would
  make `apply` parsing exact instead of prompt-dependent, and would let `stampReport` go away.
- **A `--dry-run` for `apply`** that prints the diff without committing.
- **Guard telemetry.** Every denial is logged to the console; writing them to the report would
  show which rails actually fired during a run.

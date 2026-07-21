# repogap

Point it at your repo and a repo you admire. It reads both, tells you the five things
actually worth copying, and then implements the ones you approve — one commit each.

```bash
repogap analyze -r https://github.com/tensorflow/playground -C ./neuroforge \
  -g "recruiter-impressive portfolio demo"

repogap apply G-03 G-08
```

Built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript).

---

## Why this exists

"Look at how project X does it" is good advice and useless instructions. The gap between
admiring a codebase and knowing which three things to steal from it is a day of reading.

The obvious way to automate that is to ask a model to compare two repos. The problem is what
you get back: a flattering, exhaustive list of everything the reference has and you don't,
padded to look thorough, with no sense of what matters for *your* project. And if you then let
an agent loose on the repo, you get one giant unreviewable commit.

repogap is built around fixing both of those.

## What makes the output usable

**It is told to say no.** The prompt's first rule is patterns over parity: never recommend
something merely because the reference has it. Every item is scored against a goal you supply
(`-g "recruiter-impressive portfolio demo"` produces a different report than
`-g "production-ready service"`), and items that don't clear the bar get a **Skip** verdict with
a one-line reason. In the run below, 10 of 16 findings were Skips. That is the feature.

**Recommendations are things to do.** The Top 5 table only contains actionable items, ranked by
benefit-to-effort. If only four things are worth doing, it lists four.

**Findings cite the source.** Each item names the reference file — and often the lines — the
pattern came from, so you can go read it yourself:

```markdown
### G-03 — URL state serialization for shareability
- **What's missing in my repo:** State lives in memory only. No way to bookmark a
  configuration or share a link to "spiral with 3 hidden layers, Adam, LR=0.01".
- **How the reference does it:** `src/state.ts` lines 170–245 deserialize from
  `window.location.hash` on load, serialize all controls back to hash on change.
- **Effort:** M
- **Benefit for my goal:** High — "Here's the exact setup that solves spiral" becomes a
  clickable link in a presentation.
- **Verdict:** Adopt pattern
```

## What makes it safe to run

**Phase 1 cannot write to your repo.** Not "is asked not to" — cannot. The read-only rule is a
[`canUseTool`](src/guard.ts) interceptor: every `Write`/`Edit` whose path isn't `GAP_ANALYSIS.md`
is denied before it executes, and `Bash` is narrowed to an allowlist of read-only commands
(`git log`, `ls`, `grep`, …). Chained commands are checked per segment, so `ls && rm -rf src`
is refused on the second segment. A prompt is a request; a permission callback is a gate.

**Licenses are checked before analysis, not after.** repogap reads the reference repo's LICENSE
first and derives a policy from it. MIT/Apache/BSD permits porting code *with attribution
flagged in the report*. GPL, AGPL, or **no license file at all** flips the agent to
patterns-only — describe the idea, never reproduce the code. That policy string goes into the
system prompt, so the constraint is present for every judgment the model makes.

**One item, one commit.** `apply` takes item IDs. For each one it plans first and waits for your
"go", implements only that item, runs your existing tests, and commits as
`gap(G-03): <description>`. Writes outside the repo are blocked; `git push`,
`git reset --hard`, and `npm publish` are blocked in every phase. Nothing leaves your machine.

**Verifiable facts aren't left to the model.** The report's license and date lines are
[rewritten in code](src/report.ts) after generation. This was not theoretical — the first real
run stamped the report `2025-01-21`, a date from the model's training prior, ignoring the date
in its prompt. Anything the program can know, the program decides.

## Install

```bash
git clone https://github.com/charanreddychanda/repo-gap-analysis
cd repo-gap-analysis
npm install && npm run build
npm link          # optional, puts `repogap` on your PATH
```

Requires Node 18+, `git`, and Claude Code authentication (`ANTHROPIC_API_KEY`, or an existing
`claude` login).

## Usage

### `repogap analyze`

Read-only. Produces `GAP_ANALYSIS.md` and nothing else.

| Flag | Description | Default |
|---|---|---|
| `-r, --reference <url>` | Public repo to compare against | required |
| `-C, --repo <path>` | Repo to analyze | cwd |
| `-g, --goal <text>` | What this repo is for — every benefit score is relative to this | `production-ready portfolio project` |
| `-f, --focus <areas>` | `all`, `features`, `architecture`, `testing`, `errors`, `docs`, `security`, or free text | `all` |
| `-x, --out-of-scope <text>` | Rule changes out up front, e.g. `"no framework migration"` | — |
| `-m, --model <model>` | Model to run on | SDK default |
| `--max-turns <n>` | Turn budget | `60` |

The agent is told its turn budget and instructed to spend at most half of it exploring — a
complete report from partial exploration beats exhaustive exploration with no report.

### `repogap apply <items...>`

```bash
repogap apply G-03 G-08        # plan → approve → implement → verify → commit, per item
repogap apply G-03 --yes       # skip the approval gates
```

Stops and tells you if an item turns out bigger than its estimate, rather than silently
expanding scope.

### `repogap clean`

Removes the cloned reference from your temp directory.

## How it works

```
analyze ──▶ git clone --depth 1 (to tmp, never inside your repo)
       ──▶ read LICENSE ──▶ derive policy ──▶ inject into system prompt
       ──▶ agent: tools [Read Grep Glob Bash Write] + analysisGuard
       ──▶ GAP_ANALYSIS.md ──▶ stamp verified license + date

apply   ──▶ per item: plan (read-only tools) ──▶ your approval
       ──▶ implement (+Edit +Write) + applyGuard ──▶ verify ──▶ commit
```

The reference is cloned to your temp directory, never inside the repo being analyzed, so it
can't end up in your git history.

| File | Role |
|---|---|
| [`src/guard.ts`](src/guard.ts) | The permission interceptors — the safety rails |
| [`src/license.ts`](src/license.ts) | Clone + license classification → policy |
| [`src/prompts.ts`](src/prompts.ts) | Ground rules and report contract |
| [`src/agent.ts`](src/agent.ts) | Agent SDK wrapper, streaming, cost accounting |
| [`src/report.ts`](src/report.ts) | Post-hoc correction of facts the program owns |

`settingSources: []` keeps runs hermetic — no ambient `CLAUDE.md` or `settings.json` from the
machine leaks in, so the same repo pair gives the same analysis on any laptop.

## Tests

```bash
npm test
```

Six cases over the permission guards, including the chained-command bypass
(`ls && rm -rf src`) and the write-outside-repo escape. No API key needed — the guards are
pure functions.

## Cost

A full six-category analysis of a small repo: **50 turns, ~4.5 minutes, ~$0.57**. Each run
prints its own turn count, duration, and cost. Narrow `--focus` to spend less.

## Limitations

- Single-shot analysis. It doesn't watch the repo or re-run on changes.
- The reference is shallow-cloned at `--depth 1`, so findings reflect current `HEAD`, not history.
- Bash allowlisting is conservative by design. If Phase 1 needs a command it can't run, it
  routes around it with `Read`/`Grep` rather than asking you to loosen the rails.

## License

MIT — see [LICENSE](LICENSE).

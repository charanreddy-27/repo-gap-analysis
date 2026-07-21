<div align="center">

<img src="site/favicon.svg" width="64" height="64" alt="repogap" />

# repogap

**The agent that says skip.**

Point it at your repo and a repo you admire. It reads both, tells you the few things
actually worth copying, and implements the ones you approve — one commit each.

[Live site](https://repogap.charanreddy.dev) ·
[How it was built](https://repogap.charanreddy.dev/about-project.html) ·
[Portfolio](https://www.charanreddy.dev)

</div>

---

```
$ repogap analyze -r github.com/tensorflow/playground -C ./neuroforge \
      -g "recruiter-impressive portfolio demo"

Reference
  · Cloning github.com/tensorflow/playground
  ✓ Cloned to /tmp/repogap-reference
  ✓ License: Apache-2.0 → port with attribution allowed

Analysis
  Read    src/nn.js
  Read    reference/src/nn.ts
  Write   GAP_ANALYSIS.md

| ID   | Gap                        | Effort | Benefit | Verdict       |
| G-03 | URL state serialization    | M      | High    | Adopt pattern |
| G-08 | JSDoc types for vanilla JS | S      | Low     | Adopt pattern |

  50 turns · 269.0s · $0.5670

Done
  ✓ Report written to neuroforge/GAP_ANALYSIS.md
```

> *Screenshot placeholder — drop a terminal GIF at `site/demo.gif` and swap it in here.*

---

## Why this exists

"Look at how project X does it" is good advice and useless instructions.

The gap between admiring a codebase and knowing which three things to steal from it is a day
of reading. The obvious fix is to ask a model — and what comes back is an exhaustive, agreeable
inventory of everything the reference has and you don't, padded to look thorough, ranked by
nothing, with no idea what your project is for.

And if you then hand an agent write access, you get one enormous commit that touches forty
files and nobody can review.

repogap is built around fixing both of those.

## Features

**A report that skips more than it recommends.** Every finding is scored against a goal you
supply — `-g "recruiter demo"` produces a different report than `-g "production service"`.
Anything that doesn't clear the bar gets a **Skip** and a one-line reason. In the verified run
below, 10 of 16 findings were Skips. That's the feature.

**Findings cite their source.** Each item names the reference file, often the lines, so you can
go read it yourself instead of taking the model's word for it.

**Phase 1 physically cannot write to your repo.** Not "is asked not to" — cannot. The read-only
rule is a [`canUseTool`](src/guard.ts) interceptor: every `Write`/`Edit` whose path isn't
`GAP_ANALYSIS.md` is denied *before* it executes, and `Bash` is narrowed to an allowlist of
read-only commands. Chained commands are checked per segment, so `ls && rm -rf src` is refused
on the second segment.

**Licences are checked before analysis, not after.** repogap reads the reference's `LICENSE`
first and derives a policy. MIT/Apache/BSD permits porting code *with attribution flagged in the
report*. GPL, AGPL, or **no licence file at all** flips the agent to patterns-only. That policy
goes into the system prompt, so the constraint is present for every judgment the model makes.

**One item, one commit.** `apply` plans first, waits for your go, implements a single item, runs
your existing tests, and commits as `gap(G-03): …`. `git push`, `git reset --hard` and
`npm publish` are blocked in every phase. Nothing leaves your machine.

**Verifiable facts aren't left to the model.** The report's licence and date lines are
[rewritten in code](src/report.ts) after generation — because the first real run stamped the
report `2025-01-21`, a date from the model's training prior, ignoring the one in its prompt.

## Tech stack

| Piece | Why this one |
|---|---|
| [`@anthropic-ai/claude-agent-sdk`](https://code.claude.com/docs/en/agent-sdk/typescript) | Ships the agent loop, the tool set, and a permission callback. The rails exist because the SDK exposes that hook. |
| TypeScript (strict, NodeNext) | The SDK's union types do real work — narrowing `SDKMessage` by `type` catches mistakes the docs wouldn't. |
| `commander` | Two subcommands with flags. Anything heavier is furniture. |
| `picocolors` | Terminal colour in ~2 kB. The output *is* the interface. |
| `node:test` | Built in. The guards are pure functions, so the suite needs no API key and no mocks. |

## Run it locally

```bash
git clone https://github.com/charanreddy-27/repo-gap-analysis
cd repo-gap-analysis
npm install
npm run build
npm link          # optional — puts `repogap` on your PATH
```

Requires **Node 18+**, `git`, and Claude Code authentication (`ANTHROPIC_API_KEY`, or an
existing `claude` login).

### Analyze (read-only)

```bash
repogap analyze -r https://github.com/owner/reference -g "your goal here"
```

| Flag | Description | Default |
|---|---|---|
| `-r, --reference <url>` | Public repo to compare against | required |
| `-C, --repo <path>` | Repo to analyse | cwd |
| `-g, --goal <text>` | What this repo is for — every benefit score is relative to this | `production-ready portfolio project` |
| `-f, --focus <areas>` | `all`, `features`, `architecture`, `testing`, `errors`, `docs`, `security`, or free text | `all` |
| `-x, --out-of-scope <text>` | Rule changes out up front, e.g. `"no framework migration"` | — |
| `-m, --model <model>` | Model to run on | SDK default |
| `--max-turns <n>` | Turn budget | `60` |

The agent is told its turn budget and instructed to spend at most half of it exploring — a
complete report from partial exploration beats exhaustive exploration with no report.

### Apply (one commit per item)

```bash
repogap apply G-03 G-08        # plan → approve → implement → verify → commit
repogap apply G-03 --yes       # skip the approval gates
```

### Clean

```bash
repogap clean                  # removes the cloned reference
```

## Tests

```bash
npm test
```

Six cases over the permission guards, including the chained-command bypass (`ls && rm -rf src`)
and the write-outside-repo escape.

## Cost

A full six-category analysis of a small repo: **50 turns, ~4.5 minutes, ~$0.57**. Every run
prints its own turn count, duration and cost. Narrow `--focus` to spend less.

## Limitations

- Single-shot. It doesn't watch the repo or re-run on changes.
- The reference is shallow-cloned (`--depth 1`), so findings reflect current `HEAD`, not history.
- Report quality tracks goal quality. A vague goal gets a vague report — the scoring has nothing
  to score against.
- Bash allowlisting is conservative by design; Phase 1 routes around it with `Read`/`Grep`.

## Docs

- [`PROJECT_DEEP_DIVE.md`](PROJECT_DEEP_DIVE.md) — architecture, data flow, the hard parts
- [`INTERVIEW_PREP.md`](INTERVIEW_PREP.md) — walkthrough, STAR stories, likely Q&A
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — shipping the site to Vercel
- [`CHANGELOG.md`](CHANGELOG.md)

---

## About the developer

**Charan Reddy Chanda** — AI & Automation Engineer, Bangalore. I build intelligent systems.

I ship production LLM systems — from a Springer-published model that reads chest X-rays well
enough for a radiologist to take seriously, to document pipelines that run themselves. Before
that I wrote real-time control code for jet engines at DRDO, where a millisecond of lag isn't a
bug — it's a flameout. That job is why this project's most interesting file is the one that
stops the agent.

This is one project. There are eighteen more — and a few jet engines — over at
**[charanreddy.dev](https://www.charanreddy.dev)**.

Want to build something, or break something interesting? Let's talk.

[Book a call](https://cal.com/charanreddy-27/30min) ·
[Email](mailto:charanreddychanda@gmail.com) ·
[LinkedIn](https://www.linkedin.com/in/chandacharanreddy/) ·
[GitHub](https://github.com/charanreddy-27) ·
[ORCID](https://orcid.org/0009-0003-2414-6717)

## Licence

MIT — see [LICENSE](LICENSE).

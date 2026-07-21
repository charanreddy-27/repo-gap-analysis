# Changelog

Notable changes to repogap. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-07-21

First working release. Analysis, implementation, guards, tests, docs, and the showcase site.

### Added

- **`repogap analyze`** — read-only comparison of a repo against a public reference, producing
  a prioritised `GAP_ANALYSIS.md` with per-item effort, benefit and verdict.
- **`repogap apply <items…>`** — implements approved items one at a time: plan → human approval
  → implement → verify → commit as `gap(G-XX): …`.
- **`repogap clean`** — removes the cloned reference from the temp directory.
- **Permission interceptors** (`src/guard.ts`). Phase 1 denies every write outside
  `GAP_ANALYSIS.md` and narrows Bash to a read-only allowlist. Phase 2 confines writes to the
  target repo. `git push`, `git reset --hard`, `git clean -f`, `rm -rf`, `curl | sh` and
  `npm publish` are denied in every phase.
- **Licence classification** (`src/license.ts`). The reference's `LICENSE` is read before
  analysis begins and turned into a policy embedded in the system prompt. Permissive licences
  permit porting with attribution; copyleft or a missing licence file restricts the agent to
  patterns only.
- **Report stamping** (`src/report.ts`). Licence, date and reference-URL lines are rewritten
  from values the programme holds rather than trusting the model to carry them.
- **Guard test suite** (`test/guard.test.js`) — six cases on `node:test`, no API key required.
- **Showcase site** (`site/`) — three static pages, dual-theme design system, deploys to Vercel
  with no build step.
- **Docs** — `README.md`, `PROJECT_DEEP_DIVE.md`, `INTERVIEW_PREP.md`, `DEPLOYMENT.md`.

### Fixed

- **Chained commands bypassed the Bash allowlist.** The allowlist was matched against the whole
  command string, so a permitted prefix laundered anything after it — `ls && rm -rf src` was
  allowed. Commands are now split on `&&`, `||`, `;` and `|`, and every segment must clear the
  allowlist independently. Covered by guard test 3.
- **A starved turn budget produced no output at all.** At `--max-turns 30` the agent explored
  both repos thoroughly and hit the ceiling before writing the report — a complete run with an
  empty result. The prompt now states the turn budget and instructs the agent to spend at most
  half of it exploring; `error_max_turns` prints a message naming the flag.
- **The model stamped the report with a date from its training prior** (`2025-01-21`), ignoring
  the correct date interpolated into its own prompt. Header facts are now corrected in code.
- **"Skip" verdicts appeared in the Top 5 recommendations table.** A recommendations list is a
  list of things to do; the prompt now restricts it to actionable verdicts and permits fewer
  than five rather than padding.

### Verified

End-to-end run against `neuroforge` vs `tensorflow/playground`, six focus areas: 50 turns,
269 s, $0.5670. Sixteen findings, ten correctly marked Skip. Apache-2.0 detected and the
permissive policy applied. Guard suite 6/6.

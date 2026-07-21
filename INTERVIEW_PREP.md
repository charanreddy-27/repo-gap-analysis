# repogap — interview prep

Rehearse from this. Read the pitch aloud twice; the rest is reference.

---

## 30-second elevator pitch

> repogap is a CLI that audits your repo against one you admire. You point it at both, tell it
> what your project is *for*, and it produces a prioritised report — then implements the items
> you approve, one commit each.
>
> The interesting part isn't the analysis, it's the constraints. Analysis physically can't write
> to your repo — that rule is a permission interceptor that runs before every tool call, not a
> line in a prompt. And it's built to say no: in my verified run, ten of sixteen findings came
> back marked Skip. Anyone can generate suggestions. Being told which ones don't matter is the
> scarce thing.

---

## The 2-minute walkthrough

**Start with the itch.**
> I had a long prompt I kept pasting into a chat window — "compare my repo to this one, tell me
> what's missing." It worked, sort of, but every answer was agreeable. Every reference repo
> apparently had fifteen things mine needed, no matter how small my project was. And when I let
> the model actually make changes, I got one commit touching a dozen files. Reviewing it took
> longer than doing the work myself.

**Name the two problems.**
> So there were two problems: the output couldn't be trusted to say no, and the write access was
> too broad to review. The tool is built around both.

**The output problem.**
> Every finding is scored against a goal you supply on the command line. `-g "recruiter demo"`
> produces a different report than `-g "production service"` — same repos, different verdicts,
> because benefit is relative to purpose. Anything that doesn't clear the bar gets a Skip and a
> one-line reason. On my verified run against neuroforge, ten of sixteen were Skips. Findings
> also cite the reference file and line numbers, so you can go check the model's work.

**The write-access problem — this is the technical core.**
> The Claude Agent SDK exposes a `canUseTool` callback that fires before any tool executes and
> returns allow or deny. I put every constraint that matters in there. During analysis, any Write
> whose path isn't `GAP_ANALYSIS.md` is denied before it runs. Bash is narrowed to an allowlist.
>
> I got that wrong the first time — I matched the allowlist against the whole command string, so
> `ls && rm -rf src` passed because it started with `ls`. Now it splits on the chaining operators
> and every segment has to clear the allowlist independently. That's test three in the suite.

**Close on the lesson.**
> The thing I'd carry to any agent system: a constraint in a prompt is a request, a constraint in
> a permission callback is a guarantee. Same sentence, completely different property. That's a
> habit from writing engine control code at DRDO — what a system refuses to do matters more than
> what it does.

---

## STAR stories

### STAR 1 — The chained-command bypass

**Situation.** repogap's core promise is that Phase 1 can't modify your repo. I'd moved that
rule out of the system prompt and into a `canUseTool` interceptor, and Bash was restricted to an
allowlist of read-only commands — `git log`, `ls`, `grep`, and so on.

**Task.** Verify the rail actually held before claiming it in the README.

**Action.** I wrote a direct test harness against the guard functions rather than exercising them
through a live agent run — the guards are pure functions, so they test in milliseconds with no
API key. I deliberately wrote adversarial cases, not happy-path ones. One of them was
`ls && rm -rf src`. It returned **allow**: I was matching the allowlist against the entire
command string, and the string started with `ls`.

I changed the guard to split on `&&`, `||`, `;` and `|` and require every segment to match
independently, and added an unconditional deny list checked against the raw string so
destructive commands are caught regardless of chaining.

**Result.** Six guard cases now run on `npm test`, and the bypass is case three. The broader
change was to how I test agent code: the interesting failures aren't in the happy path, and
testing the pure functions directly means adversarial cases cost nothing to run.

---

### STAR 2 — The model that invented a date

**Situation.** After the first successful end-to-end run, I read the generated report properly
instead of just confirming the file existed.

**Task.** Sanity-check the output before writing documentation around it.

**Action.** The header read `**Date:** 2025-01-21`. The correct date, `2026-07-21`, was
interpolated into the prompt template the model was filling in — it had overwritten it with a
date from its training prior. I could have escalated the prompt wording, but that treats the
symptom. Instead I added a post-processing step that rewrites the licence and date lines from
values the programme already holds, and a provenance line naming the reference URL.

**Result.** Those fields are now correct by construction rather than by persuasion. The rule I
generalised: if the programme can know something, the programme decides it — prompts are for
judgment, not data transport. That's now applied wherever the tool emits a verifiable fact.

---

### STAR 3 — The agent that explored until it died

**Situation.** I ran a bounded analysis at `--max-turns 30` as a quick smoke test.

**Task.** Confirm the pipeline worked end to end before scaling the budget up.

**Action.** The agent read both repos thoroughly — fifteen files, sensible choices — and hit the
turn ceiling before writing anything. Total output: nothing. The obvious fix was raising the
number, but the actual defect was that the agent had no idea how much budget it had. I put the
turn budget into the prompt with an explicit instruction to spend at most half on exploration
and then write with what it had, and made the `error_max_turns` path print a message naming the
flag rather than a generic failure.

**Result.** The next run at 60 turns produced a complete sixteen-item report in fifty. More
usefully, it reframed how I think about autonomy: an agent without a sense of its own budget
will optimise for thoroughness right up until it produces nothing.

---

## Likely technical questions

**Why not just use a system prompt for the read-only rule? It mostly works.**
> "Mostly" is the problem. A prompt is a request the model can decide doesn't apply, and you find
> out by reading `git status` afterwards. `canUseTool` runs before execution and returns a
> decision the model can't route around. It also cost me nothing — the SDK exposes the hook, I
> just had to use it. The one design subtlety is that denials return a *reason*, so the model
> adapts instead of retrying the same call until the budget's gone.

**Allowlist versus blocklist for Bash — why the more annoying option?**
> A blocklist encodes a guess about what's dangerous, and you're wrong about the thing you didn't
> think of. An allowlist encodes what the phase actually needs, which for read-only analysis is a
> short, knowable list. The cost is real — occasionally the agent can't run something useful and
> routes around with Read and Grep. I'd rather it be mildly inconvenienced than mildly
> destructive.

**How do you know the report is any good, rather than plausible-sounding?**
> Two things. Findings cite the reference file and often the line numbers, so claims are checkable
> — I spot-checked several against the actual source. And the Skip rate is the signal I watch: a
> model in agreeable mode marks everything Adopt. Ten Skips out of sixteen, each with a reason
> tied to the stated goal, means the scoring is discriminating rather than flattering.

**Why does no licence file mean the strictest policy? That seems backwards.**
> It's the opposite of the intuitive default and it's the correct one. Absent an explicit licence
> grant, the author retains all rights — no licence means no permission, not open season. So the
> agent gets patterns-only: describe the idea, never reproduce the code. Getting that backwards
> is the kind of bug that ends up in someone's legal review.

**Why commit but not push?**
> A local commit is revertible and costs nothing if it's wrong. A push is outward-facing, may
> trigger CI, and may be visible to other people. That's a decision the human should make. Same
> reasoning excludes `npm publish`. The line is "reversible by the user in one command."

**What's the biggest weakness?**
> Report quality tracks goal quality. If you pass a vague goal, the benefit scoring has nothing
> to score against and you get a mediocre report — the tool can't tell you that's what happened.
> The fix I'd build is validating the goal up front, or having the agent restate its
> understanding of the goal before analysing so a mismatch surfaces early rather than at the end.

**How does this scale to a large repo?**
> Today it doesn't especially well — it's a single agent with a turn budget, and a large
> monorepo would exhaust exploration before covering it. The `--focus` flag is the current
> mitigation: narrowing to one category makes the budget go much further. The real fix is
> hierarchical — analyse per package with a shared reference cache, which is also the change
> that would cut cost the most.

**Why TypeScript rather than Python for an agent tool?**
> The Agent SDK's TypeScript types are genuinely load-bearing here. `SDKMessage` is a discriminated
> union, and narrowing it by `type` and `subtype` caught real mistakes at compile time — including
> one where the published docs disagreed with the shipped types. I wrote against the `.d.ts`
> files, and the compiler is what told me the docs were stale.

**What would you do differently if you started again?**
> Structured output for the report. Right now it's markdown that the apply phase re-reads and the
> stamping step patches with regex. If the agent emitted JSON and I rendered the markdown locally,
> `apply` would parse exactly instead of prompt-dependently, and `report.ts` could go away
> entirely.

---

## What I'd improve next

1. **Reference caching.** Comparing five repos to one reference re-reads it five times. A
   content-hash cache is the single biggest cost win available.
2. **Structured output.** JSON from the agent, markdown rendered locally. Removes the regex
   patching and makes `apply` parsing exact.
3. **`--dry-run` on apply.** Show the diff, don't commit.
4. **Goal validation.** Catch a vague `-g` before spending $0.57 discovering it was vague.
5. **Guard telemetry in the report.** Every denial is logged to console; surfacing which rails
   fired during the run would make the safety story visible in the artefact, not just the terminal.

---

## Questions to ask the interviewer

- Where do you draw the line today between what an agent may do unattended and what needs a
  human gate? Is that written down, or is it convention?
- When an LLM feature misbehaves in production, what does the debugging loop look like — do you
  have replay, or is it log-reading?
- How do you evaluate model output quality beyond "it looks right"? Golden sets, human review,
  something else?
- What's the review culture for AI-generated code here — same bar as human PRs, or a different one?
- What's the most expensive lesson the team has learned about agent autonomy so far?

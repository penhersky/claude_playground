# Plan mode vs. direct execution — three graded tasks

Exercise 2's final step: run tasks of varying complexity and observe when plan
mode earns its cost. Task 3.4 is the exam objective.

The tasks below are ordered by where the answer should be obvious, then
arguable, then obvious in the other direction. Do them in a Claude Code session
in this repo (not through the SDK), so you can toggle plan mode with `shift+tab`.

Record what you observed in `docs/decisions/`. Noticing *why* plan mode helped
or didn't is the transferable part.

---

## Task A — single-file bug fix (expect: direct execution)

`src/runtime/session.ts` has a `shouldResume()` heuristic. Make it treat a
churn ratio of exactly `0.5` as "start fresh" rather than "resume".

- One function, one comparison operator, a clear specification.
- The guide's example is "a single-file bug fix with a clear stack trace" and
  "adding a date validation conditional".

**Watch for:** plan mode here costs an exploration round trip and a plan you'd
read once, to change `>` to `>=`. If you find yourself using it anyway, notice
what you were actually uncertain about — often it's *whether the change is
right*, which a plan doesn't resolve either.

---

## Task B — cross-cutting convention change (expect: plan mode)

Every lab entrypoint currently prints with `src/runtime/print.ts`. Add a
`--json` flag to all four labs that emits one JSON object per run — trace,
cost, result — while keeping the human-readable output as the default.

- Touches four entrypoints, the shared printer, `package.json` scripts, and
  the README.
- There are at least three viable designs: a flag parsed per entrypoint, an
  environment variable read inside `runAgent`, or a second printer selected by
  `runAgent` from its input. They differ in how much each lab has to know.

**Watch for:** this is the guide's "multiple valid approaches" case. The value
of plan mode isn't the file list — it's being forced to name the three designs
before committing to one. Also try the **Explore** subagent for the discovery
pass: it isolates verbose file reading and returns a summary, keeping the main
context free for the decision.

---

## Task C — open-ended, adaptive (expect: plan mode, then direct execution)

Add a fifth lab covering **Scenario 4 — Developer Productivity with Claude**:
an agent that explores an unfamiliar codebase using only the built-in tools
(`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`), drilling Tasks 2.5, 5.4, and 1.6.

- Nothing about the scope is settled: what codebase, which questions, what
  "done" means.
- The `/new-lab` skill scaffolds the shape, but not the content.

**Watch for:** the combination the guide recommends — plan mode for the
investigation, direct execution for the implementation once the plan is agreed.
Also watch for **task decomposition** (Task 1.6): mapping structure first,
identifying high-impact areas, then producing a prioritized plan that adapts as
dependencies surface. That's dynamic decomposition, not a fixed pipeline.

---

## What to record

For each task, in `docs/decisions/`:

| | |
|---|---|
| Mode chosen | plan / direct / plan-then-direct |
| Was it right | and how you knew |
| Time to first edit | plan mode delays this; sometimes worth it |
| Rework | did you undo anything? that's what plan mode buys |
| Explore used | did isolating discovery keep the main context usable? |

The exam asks you to *select* the mode from a scenario description. Three
calibration points from your own experience beat re-reading the objective.

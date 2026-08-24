---
description: Produce a dated study plan for the CCAR-F exam, weighted by the official domain percentages and by which labs have been run.
argument-hint: "[days until exam]"
---

# Study plan — $1 days out

<!--
DELIBERATE ARTIFACT. This is the *older* flat command-file form
(`.claude/commands/<name>.md`), kept alongside `.claude/skills/<name>/SKILL.md`
so both forms exist on disk to compare. Exam Task 3.2 asks you to distinguish them.

Both create `/study-plan`. What the skill form adds:
  - a directory, so the prompt can ship supporting files next to it
  - `context: fork` / `background` — run in an isolated subagent
  - `disable-model-invocation` / `user-invocable` — control who can invoke it
  - `model`, `effort`, `allowed-tools`, `disallowed-tools`, `hooks`

If a command file and a skill share a name, the command file wins and the name
appears once in `slash_commands`.

Rule of thumb from the guide: CLAUDE.md for always-loaded universal standards,
skills for on-demand task-specific workflows, command files only for legacy.
-->

Build a study plan covering the $1 days before the exam.

## Inputs to gather first

1. Read `docs/exam/blueprint.md` for the domain weights and task statements.
2. Read `docs/exam/prep-exercises.md` for the four official exercises.
3. Check which labs have actually been exercised: look for `labs/*/.scratch/`
   and `labs/*/out/` directories, and for notes under `docs/decisions/`.

## Plan shape

- Allocate study days in proportion to the blueprint weights, not evenly:
  Domain 1 27%, Domain 3 20%, Domain 4 20%, Domain 2 18%, Domain 5 15%.
- Front-load the labs. The exam is scenario-based and judgment-based; reading
  the task statements without having built the thing does not transfer.
- Map each block to a concrete artifact in this repo — a lab to run, a file to
  read, a `/domain-review` to invoke — never "review Domain 2".
- Reserve the last two days for `/exam-drill all` runs and for re-reading the
  task statements of whichever domain scored lowest.
- Note the logistics: 60 items, 120 minutes, proctored, 720/1000 to pass,
  $125, credential valid 12 months.

Output a table: day range, domain focus, artifact, done-when.

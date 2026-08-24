---
name: domain-review
description: Review a file or directory against the task statements of one CCAR-F exam domain, reporting where the code follows the exam's stated best practice and where it hits a named anti-pattern.
argument-hint: "[path] [domain 1-5]"
allowed-tools: Read Grep Glob
disallowed-tools: Write Edit Bash
---

# Domain review — $ARGUMENTS

Read-only audit of `$1` against exam domain `$2`.

`allowed-tools` pre-approves the read tools for the invoking turn;
`disallowed-tools` removes the write tools from the pool entirely, so this
skill structurally cannot edit the thing it is reviewing.

> In **Agent SDK** sessions the `allowed-tools` field is ignored for project
> skills — grant tools through `options.allowedTools` instead. It applies when
> you invoke this skill from the Claude Code CLI.

## Steps

1. Read the task statements for domain `$2` in `docs/exam/blueprint.md`.
2. Read `$1` (recursively if it is a directory).
3. For each task statement in the domain, report one of:
   - **Demonstrates** — the code shows the skill the statement names. Quote the
     `file:line` and say which "Skills in:" bullet it satisfies.
   - **Anti-pattern** — the code does something the statement explicitly warns
     against. Name the anti-pattern in the guide's own words.
   - **Absent** — the domain covers this and the code does not exercise it.
4. Rank findings: anti-patterns first, then absences, then demonstrations.
5. Do **not** fix anything. Propose the change in one sentence and stop.

## Anti-patterns worth grepping for

- Loop termination by parsing assistant text, or an iteration cap as the primary
  stopping mechanism, instead of `stop_reason` (Task 1.1).
- Tools with near-identical descriptions, or a generic `analyze_*` tool that
  should be split by purpose (Task 2.1).
- A uniform `"Operation failed"` error with no category or retryable flag (Task 2.2).
- An agent holding far more tools than its role needs (Task 2.3).
- Prompt instructions used where a prerequisite gate is required (Task 1.4).
- Verbose tool output flowing into context untrimmed (Task 5.1).
- Errors swallowed into empty success results, or one subagent failure killing
  the whole workflow (Task 5.3).

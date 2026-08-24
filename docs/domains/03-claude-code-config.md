# Domain 3 — Claude Code Configuration & Workflows (20%)

Six task statements. The most *factual* domain — much of it is "where does this
file go and when does it load" — which makes it the cheapest points on the exam
if you have actually configured a project.

You have: this repo's own `.claude/` tree is the artifact.

Full task statements: [`../exam/blueprint.md`](../exam/blueprint.md#domain-3--claude-code-configuration--workflows-20).

## The loading table

Almost every Task 3.1/3.3 item is answerable from this:

| Mechanism | Location | Loads | Shared via git |
|---|---|---|---|
| Managed policy | OS-specific path | every session, cannot be excluded | org-wide |
| User CLAUDE.md | `~/.claude/CLAUDE.md` | every session | ❌ **never** |
| Project CLAUDE.md | `./CLAUDE.md` or `./.claude/CLAUDE.md` | every session, in full | ✅ |
| Local CLAUDE.md | `./CLAUDE.local.md` | every session | ❌ gitignored |
| Directory CLAUDE.md | `sub/dir/CLAUDE.md` | when Claude reads that directory | ✅ |
| `@import` | anywhere | expanded at launch, in full | ✅ |
| Rule, no `paths` | `.claude/rules/*.md` | every session | ✅ |
| Rule with `paths` | `.claude/rules/*.md` | when a **matching file** is read | ✅ |
| Skill | `.claude/skills/*/SKILL.md` | on invocation, or when judged relevant | ✅ |

Load order is root → down, so files closer to the working directory appear
*later* in context.

**The classic item**: a new team member isn't getting the instructions. Answer:
they're in `~/.claude/CLAUDE.md`, which is per-user and never shared. Move them
to project scope.

**The second classic**: CLAUDE.md is too big. `@import` does **not** help —
imported files are expanded into context at launch. Path-scoped rules do.

**Third**: an instruction disappeared after `/compact`. Root project CLAUDE.md
is re-read from disk and re-injected. Nested `CLAUDE.md` files and path-scoped
rules are not; they reload the next time a matching file is read.

Live examples: [`.claude/rules/`](../../.claude/rules/) has four files, three
path-scoped; [`labs/02-claude-code-config/sandbox/CLAUDE.md`](../../labs/02-claude-code-config/sandbox/CLAUDE.md)
is a directory-level file that imports a standards file.

## Skills vs. commands vs. CLAUDE.md (Task 3.2)

| Use | For |
|---|---|
| CLAUDE.md | always-loaded **universal standards** — facts every session needs |
| Skill | on-demand **task-specific workflows** — procedures |
| Path-scoped rule | conventions for a **file type or area** |
| `.claude/commands/*.md` | the older flat form; skills are the successor |

A command file and a skill of the same name both create `/name`. The command
file wins, and the name appears once in `slash_commands`.

Frontmatter fields the exam names specifically:

- **`context: fork`** — run in an isolated subagent so verbose output doesn't
  pollute the main conversation. For codebase analysis, brainstorming, drills.
  See [`.claude/skills/exam-drill/SKILL.md`](../../.claude/skills/exam-drill/SKILL.md).
- **`allowed-tools`** — pre-approve tools for the invoking turn.
- **`argument-hint`** — autocomplete hint for expected arguments.

> **SDK caveat.** For project and personal skills, `allowed-tools` applies to
> the Claude Code CLI only. In Agent SDK sessions, grant tools through
> `options.allowedTools`.

Personal customization: put a variant in `~/.claude/skills/` **under a different
name**, so teammates are unaffected.

## Path-scoped rules (Task 3.3)

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "tests/**/*.test.ts"
---
```

Rules without `paths` load unconditionally. Rules with `paths` load when Claude
reads a matching file — which is why they can't be verified from `system:init`.

The discriminator against a subdirectory CLAUDE.md: **use a glob rule when the
convention follows a file type across directories.** Test files are spread
throughout a codebase; `**/*.test.tsx` catches them all and a per-directory
CLAUDE.md catches none of them.

## Plan mode (Task 3.4)

| Plan mode | Direct execution |
|---|---|
| large-scale changes | single-file, well-scoped |
| multiple valid approaches | one obvious approach |
| architectural decisions | a clear stack trace |
| multi-file modifications | adding one conditional |

The guide's own examples: plan mode for a microservice restructuring, a library
migration touching 45+ files, or choosing between integration approaches with
different infrastructure requirements. Direct execution for a single-file bug
fix or a date-validation conditional.

Two extras that show up as options:

- The **`Explore` subagent** isolates verbose discovery and returns a summary,
  preserving main-conversation context during multi-phase work.
- **Combine them**: plan mode for the investigation, direct execution for the
  implementation once the plan is agreed.

Three calibration tasks to run yourself:
[`labs/02-claude-code-config/tasks.md`](../../labs/02-claude-code-config/tasks.md).

## Iterative refinement (Task 3.5)

- **Concrete input/output examples** beat prose when a description keeps being
  interpreted inconsistently. Two or three is enough.
- **Test-driven iteration**: write the suite first, then iterate by sharing
  failures.
- **The interview pattern**: have Claude ask questions to surface considerations
  you hadn't anticipated — cache invalidation, failure modes — *before*
  implementing, in unfamiliar domains.
- **Interacting problems go in one message; independent ones go sequentially.**
  Fixing interacting issues one at a time means each fix breaks the last.

## CI/CD (Task 3.6)

| Need | Flag |
|---|---|
| non-interactive, no hang | `-p` / `--print` |
| machine-parseable output | `--output-format json` |
| a specific output shape | `--json-schema` |

Plus:

- **CLAUDE.md is how CI-invoked Claude Code gets project context** — testing
  standards, fixture conventions, review criteria. There's no interactive
  session to explain them in.
- **Include prior review findings** on re-runs and instruct Claude to report
  only new or still-unaddressed issues, or every commit re-posts the same
  comments.
- **Provide existing test files** so generated tests don't duplicate covered
  scenarios.
- **Session context isolation**: the session that generated the code is worse at
  reviewing it than an independent instance, because it retains its own
  reasoning and is less likely to question it. (This is also Task 4.6.)

## Drills

```
/exam-drill 3 8
/domain-review .claude 3
bun run lab2:verify
```

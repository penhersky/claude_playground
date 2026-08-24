# Lab 2 — Claude Code configuration for a team workflow

**Official Exercise 2.** Domains reinforced: **3** (Claude Code Configuration &
Workflows, 20%), **2** (Tool Design & MCP Integration).

Maps to **Scenario 2 — Code Generation with Claude Code**.

This lab is unusual: **the deliverable lives at the repo root, not in this
directory.** The `.claude/` tree, `CLAUDE.md`, and `.mcp.json` *are* the
exercise. This directory holds the verifier, the plan-mode tasks, and a sandbox
for the things you can only see from a subdirectory.

```bash
bun run lab2:verify   # one cheap turn; asserts what the session actually loaded
```

## Where the artifacts are

| Exercise step | Artifact | Task |
|---|---|---|
| Project-level CLAUDE.md with standards | [`/CLAUDE.md`](../../CLAUDE.md) | 3.1 |
| `@import` for modular organization | [`sandbox/CLAUDE.md`](sandbox/CLAUDE.md) → [`standards/api-conventions.md`](sandbox/standards/api-conventions.md) | 3.1 |
| Path-scoped rules | [`/.claude/rules/`](../../.claude/rules/) — four files, three scoped | 3.3 |
| Skill with `context: fork` | [`/.claude/skills/exam-drill/`](../../.claude/skills/exam-drill/SKILL.md) | 3.2 |
| Skill with tool restrictions | [`/.claude/skills/domain-review/`](../../.claude/skills/domain-review/SKILL.md) | 3.2 |
| Project-scoped command file | [`/.claude/commands/study-plan.md`](../../.claude/commands/study-plan.md) | 3.2 |
| MCP server with env expansion | [`/.mcp.json`](../../.mcp.json) | 2.4 |
| Permission policy | [`/.claude/settings.json`](../../.claude/settings.json) | 3.1 |
| Enforcement hook | [`/.claude/hooks/block-env-writes.sh`](../../.claude/hooks/block-env-writes.sh) | 1.4 |
| Plan mode vs. direct execution | [`tasks.md`](tasks.md) | 3.4 |

## What `verify.ts` checks, and what it can't

**Checks** — from the `system:init` message: the four skills loaded, the
`study-plan` command is on the surface, the `docs` MCP server connected, and
(via the alpha `resolveSettings()`) that deny rules cover `.env`.

**Can't check** — path-scoped rules. They load *lazily*, when Claude reads a
matching file, so they never appear in `init`. Verify by hand:

1. Open a Claude Code session at the repo root and run `/context`. Note what is
   under **Memory files**.
2. Ask Claude to read `labs/02-claude-code-config/sandbox/notes.ts`.
3. Run `/context` again. `.claude/rules/typescript.md` (glob `**/*.ts`) and
   `sandbox/CLAUDE.md` should now be present. `.claude/rules/testing.md`
   (glob `**/*.test.ts`) should **not** be.
4. Ask Claude to read `labs/01-multi-tool-agent/gate.test.ts`. Now `testing.md`
   loads too.

That's the objective in Task 3.3: rules scoped by glob follow the *file type*
across directories, which a subdirectory `CLAUDE.md` cannot do — test files are
spread throughout a codebase, not gathered in one tree.

## The `github` server is expected to fail

`.mcp.json` declares two servers. `docs` should connect. `github` will not,
unless you set `GITHUB_TOKEN`.

That is the demonstration, not a bug. `${GITHUB_TOKEN}` is expanded at load
time, so the *reference* is committed and shared with the team while the
*secret* is not. Task 2.4 asks specifically about this pattern. Set the variable
in `.env`, re-run, and watch the status change.

## The user-scoped server

The exercise also asks for a personal, experimental server in `~/.claude.json`
— outside this repo. Add one, re-run `verify.ts`, and confirm it appears
alongside the project servers.

The point being tested is that scopes **compose** rather than override: tools
from every configured server are discovered at connection time and are all
available simultaneously. Project scope is for shared team tooling; user scope
is for personal experiments your teammates shouldn't inherit.

## Why the permission rules are anchored with `/`

`.claude/settings.json` writes `Edit(/src/**)`, not `Edit(./src/**)`. The forms
differ:

| Pattern | Anchors at |
|---|---|
| `//path` | filesystem root |
| `~/path` | home directory |
| `/path` | **the settings source** — for project settings, the project root |
| `path` or `./path` | the current working directory |

A single leading slash is *not* an absolute path. For rules in project
settings, `/src/**` resolves against the project root regardless of where the
session was launched, which is what you want from a checked-in policy;
`./src/**` would follow the cwd and quietly stop matching in a subdirectory.

Note also that `Edit(path)` rules govern every built-in tool that writes files,
including `Write` and `NotebookEdit`. A `Write(path)` rule is accepted and then
never consulted — Claude Code warns about it at startup.

## Troubleshooting

**A skill doesn't appear.** Check the YAML parses. Check `settingSources`
includes `"user"` and `"project"` — omitting them is the single most common
cause in SDK sessions. Check `cwd` points at or below the directory holding
`.claude/skills/`. A skill with `user-invocable: false` loads but is
deliberately absent from the `skills` array.

**A new subagent doesn't appear.** Claude Code watches `.claude/agents/` for
changes, but only directories that existed when the session started. The first
file in a brand-new `agents/` directory needs a restart.

**A rule never loads.** It has `paths:` and nothing matched yet — that's
working as intended. Confirm with the `InstructionsLoaded` hook, which logs
exactly which instruction files loaded and when.

**Instructions vanished after `/compact`.** Root project CLAUDE.md is re-read
from disk and re-injected. Nested `CLAUDE.md` files and path-scoped rules are
not; they reload the next time Claude reads a matching file.

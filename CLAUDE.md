# claude_architecture

A TypeScript + Bun workspace that is two things at once: a playground for
building agents with `@anthropic-ai/claude-agent-sdk`, and a study environment
for the **Claude Certified Architect – Foundations** exam (`CCAR-F`).

The exam blueprint drives the layout. Read it before proposing structural changes:

@docs/exam/blueprint.md

## Commands

| Command | What it does |
|---|---|
| `bun install` | Install deps. Never pass `--omit=optional` — the Agent SDK ships its Claude Code binary as a platform-specific optional dependency. |
| `bun run typecheck` | `tsc --noEmit`. The only compile gate; there is no build step. |
| `bun test` | Offline unit tests. **Must pass with no API key and no network.** |
| `bun run lab1` … `lab4` | The four labs. These call the real API and cost money. |

## Layout

```
.claude/          Config surface. This IS study material for Domain 3 (20%) —
                  settings, path-scoped rules, skills, subagents, a hook.
docs/exam/        Transcription of the official Exam Guide v1.0.
docs/domains/     Study notes per domain, each pointing at working code.
docs/decisions/   Short tradeoff notes. The exam is tradeoff-shaped; so are these.
src/              Shared runtime every lab imports. Not a library — a thin
                  wrapper so labs show their own concept, not boilerplate.
labs/01..04/      The four official preparation exercises, one per directory.
```

## How work in this repo should go

**Reuse the shared runtime.** `src/runtime/run.ts` (`runAgent`),
`src/runtime/print.ts` (message printer), and `src/mcp/errors.ts` (`toolError`)
exist so labs don't each grow their own. A second message printer is a bug.

**Never recall SDK field names — fetch them.** Option names, hook payload
shapes, and frontmatter keys drift faster than any model's training data. Use
the `/sdk-doc` skill or the `sdk-researcher` subagent, which fetch
`https://code.claude.com/docs/en/<slug>.md`. For Claude API questions (Messages
API, `tool_use`, `output_config`, Batches, caching, model IDs) invoke the
bundled `claude-api` skill instead.

**Keep decisions in pure functions.** Permission gates, error classification,
validators, confidence routing, conflict merging — all take plain data and
return plain data, so `bun test` can cover them without an API key. The model
call stays at the edge. This is a testing constraint that happens to produce the
architecture the exam asks for.

**Every agent entrypoint sets `maxBudgetUsd`.** Don't remove it. Raise it
deliberately and say why.

**Every run persists to `labs/<lab>/out/`.** `startRunLog()` from
`src/runtime/log.ts` writes an ANSI-stripped transcript plus a JSON sidecar
carrying cost, tool chain, and the lab's own numbers — so a decision note
written a week later can cite them. Call it as the first line of `main()`,
never at module scope: `bun test` imports some entrypoints for their pure
helpers and must stay free of filesystem side effects. Off with `LAB_LOG=0`;
relocate with `LAB_LOG_DIR`. The tee is not a second message printer — it
formats nothing and sits underneath `print.ts`.

**Labs are teaching artifacts.** When a lab contains a deliberate anti-pattern
for contrast — like `tools/descriptions.before.md` in lab 1 — it is labelled as
such. Don't "fix" it. Do fix accidental ones.

## Facts that are easy to get wrong

- A one-shot `query()` **throws after** yielding its error result. Wrap the loop.
- TypeScript `options.env` **replaces** the subprocess environment (Python merges).
  Spread `process.env`.
- Subagents inherit **no** parent context. Everything goes in the Agent prompt.
- The spawning tool was renamed `Task` → `Agent` in Claude Code v2.1.63.
  `tool_use` blocks say `"Agent"`; `system:init` still says `"Task"`. Allow both.
- Permission order: hooks → deny → ask → mode → allow → `canUseTool`. A bare
  `allowedTools` entry auto-approves before `canUseTool` ever runs.
- Default model is `claude-opus-5`. Thinking is on by default; `budget_tokens`
  and assistant prefill both return 400 on current models.

More in `.claude/rules/agent-sdk.md`, which loads automatically when you touch
`src/**` or `labs/**`.

## Secrets

`.env` is gitignored, denied in `.claude/settings.json`, and blocked by the
`PreToolUse` hook at `.claude/hooks/block-env-writes.sh`. New variables get a
documented placeholder in `.env.example` and nothing else. `.mcp.json`
references credentials only via `${VAR}` expansion.

# claude_architecture

A TypeScript + Bun workspace for learning the **Claude Agent SDK** and preparing
for the **Claude Certified Architect – Foundations** certification (`CCAR-F`).

Two things at once, on purpose. The exam is scenario-based and judgment-based —
it asks which of four real techniques fits a given production symptom — so
reading about the techniques transfers poorly. Everything here is runnable.

The layout is driven by the official **Exam Guide v1.0 (effective July 2026)**,
transcribed into [`docs/exam/blueprint.md`](docs/exam/blueprint.md). Its four
hands-on preparation exercises are `labs/01` through `labs/04`, verbatim.

---

## Setup

**1. Install Bun** (not currently installed on this machine):

```bash
curl -fsSL https://bun.sh/install | bash
# or: brew install oven-sh/bun/bun
```

**2. Install dependencies:**

```bash
bun install
```

> Never install with optional dependencies omitted. The Agent SDK ships its
> Claude Code binary as a platform-specific `optionalDependency`; skipping them
> leaves the SDK with no binary to spawn, and you'd have to point
> `pathToClaudeCodeExecutable` at a native install instead.

**3. Add an API key:**

```bash
cp .env.example .env    # then add ANTHROPIC_API_KEY
```

Bun auto-loads `.env` and the Agent SDK subprocess inherits `process.env`, so no
`dotenv` package is needed. Under plain Node you'd need `node --env-file=.env`
— neither SDK reads `.env` on its own.

**4. Verify:**

```bash
bun run typecheck   # tsc --noEmit
bun test            # offline unit tests — no API key, no network needed
```

---

## Commands

| Command | Cost | What it does |
|---|---|---|
| `bun test` | free | All offline tests. Runs with no key and no network |
| `bun run typecheck` | free | `tsc --noEmit` |
| `bun run lab2:verify` | ~$0.01 | One turn; asserts `.claude/` actually loaded |
| `bun run lab1` | ~$0.10 | Support agent with a prerequisite gate |
| `bun run lab1:loop` | ~$0.05 | Same case on the raw Messages API |
| `bun run lab3` | ~$0.50 | Extraction, validation, retry over 8 fixtures |
| `bun run lab4` | ~$1.00 | Coordinator over four subagents |
| `bun run lab4:parallel` | ~$0.60 | Parallel vs. sequential delegation, timed |
| `bun run lab3:batch` | ~$0.30 | Message Batches — **may take up to 24h** |

Every agent entrypoint carries a `maxBudgetUsd` cap. Estimates are rough; check
the printed cost.

---

## The labs

| Lab | Exercise | Domains | Builds |
|---|---|---|---|
| [01 — Multi-tool agent](labs/01-multi-tool-agent/) | 1 | 1, 2, 5 | Support agent, four MCP tools, `PreToolUse` gate, structured errors, raw `stop_reason` loop |
| [02 — Claude Code config](labs/02-claude-code-config/) | 2 | 3, 2 | The repo's own `.claude/` tree, plus a verifier that asserts it loaded |
| [03 — Extraction pipeline](labs/03-extraction-pipeline/) | 3 | 4, 5 | JSON schemas, all three `tool_choice` modes, validation-retry, Batches, confidence routing |
| [04 — Multi-agent research](labs/04-multi-agent-research/) | 4 | 1, 2, 5 | Coordinator + 4 subagents, provenance, conflict handling, error propagation, crash recovery |

Lab 3 is the one built on `@anthropic-ai/sdk` rather than the Agent SDK —
Domain 4 is written against raw Messages API concepts that `query()` abstracts
away.

---

## Layout

```
.claude/            Config surface. Also the Domain 3 study artifact:
  settings.json       permissions (allow/ask/deny), a PreToolUse hook, env caps
  rules/              4 rule files, 3 path-scoped with `paths:` globs
  skills/             4 skills, one using `context: fork`
  agents/            3 filesystem subagents
  commands/           1 legacy flat command file, kept for contrast
  hooks/              the shell hook settings.json references
docs/exam/          Blueprint, the 6 scenarios, the 4 prep exercises
docs/domains/       Study notes per domain, each pointing at working code
docs/decisions/     Your tradeoff notes — the highest-value thing to write
src/                Shared runtime every lab imports
labs/               The four exercises
```

---

## Study path

**Start here:** [`docs/exam/blueprint.md`](docs/exam/blueprint.md) for the
weights, then [`docs/exam/scenarios.md`](docs/exam/scenarios.md) — knowing the
six scenarios in advance is most of the preparation.

**Then build.** Run the labs in order; each lab README explains what to watch
for and which task statements it drills.

**Then drill.** Four skills are available in a Claude Code session here:

| Skill | Does |
|---|---|
| `/exam-drill [domain] [count]` | Scenario-framed practice questions, graded, in a forked context |
| `/domain-review [path] [domain]` | Read-only audit of code against a domain's task statements |
| `/sdk-doc [topic]` | Fetches the authoritative doc page instead of recalling it |
| `/study-plan [days]` | Weighted plan mapped to artifacts in this repo |

Plus three subagents: `exam-coach`, `sdk-researcher`, `lab-reviewer`.

**Weight your time by the blueprint**, not evenly:

| Domain | Weight |
|---|---|
| 1 — Agentic Architecture & Orchestration | 27% |
| 3 — Claude Code Configuration & Workflows | 20% |
| 4 — Prompt Engineering & Structured Output | 20% |
| 2 — Tool Design & MCP Integration | 18% |
| 5 — Context Management & Reliability | 15% |

Scoring is domain-weighted and the score report breaks down by domain, so a weak
heavy domain costs more than a weak light one.

**Exam logistics:** 60 items, 120 minutes, proctored, scaled 720/1000 to pass,
$125, valid 12 months. Four scenarios drawn at random from the six.

---

## Conventions

Detailed in [`CLAUDE.md`](CLAUDE.md) and the path-scoped rules in
[`.claude/rules/`](.claude/rules/). The short version:

- **Tests never call the API.** `bun test` must pass with no key and no network.
  That forces decision logic — permission gates, error classification,
  validators, routing, conflict merging — into pure functions, with the model
  call at the edge. It's a testing constraint that happens to produce the
  architecture the exam asks for.
- **Never recall SDK field names.** Use `/sdk-doc` or the `sdk-researcher`
  subagent. Option names and payload shapes drift faster than training data.
- **Deliberate anti-patterns are labelled.** `descriptions.before.md` in lab 1
  is meant to be bad. Don't fix it.
- **Secrets never enter a tracked file.** `.env` is gitignored, denied in
  `.claude/settings.json`, and blocked by a `PreToolUse` hook. `.mcp.json`
  references credentials only via `${VAR}` expansion.

---

## Sources

- [Agent SDK documentation](https://code.claude.com/docs/en/agent-sdk)
- [Certification page](https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification) — the exam guide PDF, terms, and policy
- [Example agents](https://github.com/anthropics/claude-agent-sdk-demos)

`docs/exam/` is transcribed from the official guide, version 1.0, effective
July 2026. If Anthropic revises it, re-download and update — that transcription
is the ground truth for everything else here.

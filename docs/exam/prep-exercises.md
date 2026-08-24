# The four official preparation exercises

Section 8 of the official Exam Guide v1.0 defines four hands-on exercises. This
repo implements all four, one per directory under `labs/`. The steps below are
the guide's own; the checkboxes are what "done" means here.

Run them in order. Each builds on the previous one's concepts.

---

## Exercise 1 → [`labs/01-multi-tool-agent/`](../../labs/01-multi-tool-agent/)

**Objective:** practice designing an agentic loop with tool integration,
structured error handling, and escalation patterns.

**Domains reinforced:** 1, 2, 5

| Guide step | Where |
|---|---|
| Define 3–4 MCP tools with detailed descriptions that clearly differentiate purpose, expected inputs, and boundary conditions — **including at least two with similar functionality** that need careful description to avoid selection confusion | `tools/support-server.ts`, with the deliberate before/after pair in `tools/descriptions.before.md` and `.after.md` |
| Implement an agentic loop that checks `stop_reason` to decide whether to continue tool execution or present the final response; handle both `"tool_use"` and `"end_turn"` | `manual-loop.ts` |
| Add structured error responses: `errorCategory` (transient/validation/permission), `isRetryable`, human-readable descriptions. Test that the agent retries transient errors and explains business errors | `src/mcp/errors.ts` + `tools/support-server.ts` |
| Implement a programmatic hook that intercepts tool calls to enforce a business rule (blocking operations above a threshold), redirecting to escalation | `hooks/prerequisite-gate.ts` |
| Test with multi-concern messages and verify the agent decomposes, handles each concern, and synthesizes a unified response | the `multiConcern` prompt in `agent.ts` |

```bash
bun run lab1        # Agent SDK version, with the gate active
bun run lab1:loop   # same scenario, raw Messages API, stop_reason visible
```

---

## Exercise 2 → [`labs/02-claude-code-config/`](../../labs/02-claude-code-config/)

**Objective:** practice configuring CLAUDE.md hierarchies, custom slash
commands, path-specific rules, and MCP server integration for a multi-developer
project.

**Domains reinforced:** 3, 2

| Guide step | Where |
|---|---|
| Create a project-level CLAUDE.md with universal coding standards and testing conventions; verify project-level instructions apply for all team members | root [`CLAUDE.md`](../../CLAUDE.md) |
| Create `.claude/rules/` files with YAML frontmatter glob patterns for different code areas; test that rules load only when editing matching files | [`.claude/rules/`](../../.claude/rules/) — four files, three path-scoped |
| Create a project-scoped skill with `context: fork` and `allowed-tools` restrictions; verify it runs in isolation without polluting the main conversation | [`.claude/skills/exam-drill/`](../../.claude/skills/exam-drill/) and [`domain-review/`](../../.claude/skills/domain-review/) |
| Configure an MCP server in `.mcp.json` with env var expansion for credentials; add a personal experimental server in `~/.claude.json` and verify both are available | [`.mcp.json`](../../.mcp.json) + `verify.ts` reports connected servers |
| Test plan mode vs. direct execution on a single-file bug fix, a multi-file migration, and a feature with multiple valid approaches | `tasks.md` — three graded tasks |

```bash
bun run lab2:verify
```

**Note on the personal server.** The guide's step asks for a user-scoped server
in `~/.claude.json`. That file is outside this repo — add it yourself, then
re-run `verify.ts` and confirm it appears alongside the project ones. The point
being tested is that project and user scope compose rather than override.

---

## Exercise 3 → [`labs/03-extraction-pipeline/`](../../labs/03-extraction-pipeline/)

**Objective:** practice designing JSON schemas, using `tool_use` for structured
output, implementing validation-retry loops, and designing batch processing.

**Domains reinforced:** 4, 5

| Guide step | Where |
|---|---|
| Define an extraction tool with required and optional fields, an enum with `"other"` + detail string, and nullable fields. Verify the model returns `null` rather than fabricating | `schema.ts` + the `missing-field` fixture |
| Implement a validation-retry loop: on failure, send a follow-up with the document, the failed extraction, and the specific error. Track which errors retry can fix (format) and which it can't (information absent) | `validate.ts`, `retry.ts` |
| Add few-shot examples for varied formats (inline citations vs. bibliographies, narrative vs. tables) and verify improved handling | `fewshot.ts` |
| Design a batch strategy: submit documents via the Message Batches API, handle failures by `custom_id`, resubmit with chunking, and calculate processing time against an SLA | `batch.ts` |
| Implement human review routing: field-level confidence scores, route low-confidence to review, analyze accuracy by document type and field | `review-routing.ts` |

```bash
bun run lab3        # extraction + validation + retry over fixtures/
bun run lab3:batch  # Batches API — may take up to 24h to settle
```

---

## Exercise 4 → [`labs/04-multi-agent-research/`](../../labs/04-multi-agent-research/)

**Objective:** practice orchestrating subagents, managing context passing,
implementing error propagation, and handling synthesis with provenance tracking.

**Domains reinforced:** 1, 2, 5

| Guide step | Where |
|---|---|
| Build a coordinator delegating to at least two subagents. Ensure `allowedTools` includes `"Task"` and that each subagent receives findings **directly in its prompt** rather than relying on inheritance | `coordinator.ts`, `agents.ts` |
| Implement parallel execution by emitting multiple Task calls in a single response; measure the latency improvement | `parallel.ts` |
| Design structured subagent output separating content from metadata: claim, evidence excerpt, source, publication date. Verify synthesis preserves attribution | `findings.ts` |
| Implement error propagation: simulate a subagent timeout, verify the coordinator receives structured error context and can proceed with partial results plus coverage-gap annotations | `failures.ts` |
| Test with conflicting source data and verify synthesis preserves both values with attribution, distinguishing well-established from contested findings | the two conflicting documents in `corpus/` |

```bash
bun run lab4           # full coordinator run
bun run lab4:parallel  # parallel vs. sequential timing
```

---

## Beyond the exercises

Section 7 of the guide also recommends:

- **Prompt engineering practice** — few-shot examples for ambiguous scenarios,
  explicit review criteria to reduce false positives, multi-pass review
  architectures for large reviews. See Domain 4 in the blueprint.
- **Context management patterns** — extracting structured facts from verbose
  tool output, scratchpad files for long sessions, subagent delegation to manage
  context limits. Labs 3 and 4 cover these; `labs/04/scratchpad.ts` is the
  scratchpad implementation.
- **Escalation and human-in-the-loop review** — when to escalate (policy gaps,
  explicit requests, no progress) versus resolve autonomously, and
  confidence-based routing for human review. Lab 1 covers escalation;
  `labs/03/review-routing.ts` covers confidence routing.

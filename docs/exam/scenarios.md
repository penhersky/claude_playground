# The six exam scenarios

The exam is scenario-based. Each scenario frames a set of questions with a
realistic production context. **Four of these six are presented, drawn at
random.** Transcribed from section 5 of the official Exam Guide v1.0.

Because the scenarios are known in advance, the highest-leverage preparation is
to have opinions ready for each one: what breaks, what you'd reach for, and
which plausible alternative you'd reject and why.

---

## Scenario 1 — Customer Support Resolution Agent

> You are building a customer support resolution agent using the Claude Agent
> SDK. The agent handles high-ambiguity requests like returns, billing disputes,
> and account issues. It has access to your backend systems through custom MCP
> tools (`get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`).
> Your target is 80%+ first-contact resolution while knowing when to escalate.

**Primary domains:** 1 (Agentic Architecture & Orchestration), 2 (Tool Design & MCP Integration), 5 (Context Management & Reliability)

**Rehearsed in** [`labs/01-multi-tool-agent/`](../../labs/01-multi-tool-agent/) — the tool names are the same ones.

Recurring failure modes to have answers for:
- The agent skips `get_customer` and acts on a stated name → prerequisite gate, not a prompt (Task 1.4).
- `get_customer` fires when the user asked about an order → the descriptions overlap (Task 2.1).
- A refund exceeds policy → hook interception and redirect to escalation (Task 1.5).
- The order lookup returns 40 fields, 5 of which matter → trim before it accumulates (Task 5.1).
- Multiple customers match → ask for another identifier, don't guess (Task 5.2).

---

## Scenario 2 — Code Generation with Claude Code

> You are using Claude Code to accelerate software development. Your team uses
> it for code generation, refactoring, debugging, and documentation. You need to
> integrate it into your development workflow with custom slash commands,
> CLAUDE.md configurations, and understand when to use plan mode vs. direct
> execution.

**Primary domains:** 3 (Claude Code Configuration & Workflows), 5 (Context Management & Reliability)

**Rehearsed in** [`labs/02-claude-code-config/`](../../labs/02-claude-code-config/).

Recurring failure modes:
- A teammate doesn't get the instructions → they're in `~/.claude/`, not project scope (Task 3.1).
- CLAUDE.md has grown unreadable → split into `.claude/rules/` with `paths` scoping (Task 3.3).
- A skill floods the conversation with analysis output → `context: fork` (Task 3.2).
- A 45-file migration started without a plan → plan mode's actual use case (Task 3.4).

---

## Scenario 3 — Multi-Agent Research System

> You are building a multi-agent research system using the Claude Agent SDK. A
> coordinator agent delegates to specialized subagents: one searches the web,
> one analyzes documents, one synthesizes findings, and one generates reports.
> The system researches topics and produces comprehensive, cited reports.

**Primary domains:** 1 (Agentic Architecture & Orchestration), 2 (Tool Design & MCP Integration), 5 (Context Management & Reliability)

**Rehearsed in** [`labs/04-multi-agent-research/`](../../labs/04-multi-agent-research/) — same four subagent roles.

Recurring failure modes:
- The synthesis agent doesn't know what search found → context isn't inherited; put it in the prompt (Task 1.3).
- Subagents duplicate each other's work → partition scope explicitly (Task 1.2).
- Citations vanish in synthesis → structured claim-source mappings (Task 5.6).
- Two sources disagree → annotate both with attribution, don't pick one (Task 5.6).
- A subagent times out and the run dies → structured error context and coverage gaps (Task 5.3).
- The synthesis agent tries a web search → it shouldn't have that tool (Task 2.3).

---

## Scenario 4 — Developer Productivity with Claude

> You are building developer productivity tools using the Claude Agent SDK. The
> agent helps engineers explore unfamiliar codebases, understand legacy systems,
> generate boilerplate code, and automate repetitive tasks. It uses the built-in
> tools (Read, Write, Bash, Grep, Glob) and integrates with MCP servers.

**Primary domains:** 2 (Tool Design & MCP Integration), 3 (Claude Code Configuration & Workflows), 1 (Agentic Architecture & Orchestration)

This is the one scenario without a dedicated lab. Its content is covered by
Task 2.5 (built-in tool selection), Task 5.4 (scratchpads, delegation, crash
recovery), and Task 1.6 (decomposition). Read those, and note the built-in tool
selection rules: `Grep` for content, `Glob` for paths, `Read`+`Write` when
`Edit` can't find a unique anchor, and incremental exploration over reading
everything up front.

---

## Scenario 5 — Claude Code for Continuous Integration

> You are integrating Claude Code into your CI/CD pipeline. The system runs
> automated code reviews, generates test cases, and provides feedback on pull
> requests. You need to design prompts that provide actionable feedback and
> minimize false positives.

**Primary domains:** 3 (Claude Code Configuration & Workflows), 4 (Prompt Engineering & Structured Output)

Recurring failure modes:
- The job hangs waiting for input → `-p` / `--print` (Task 3.6).
- Findings can't be posted as inline comments → `--output-format json --json-schema` (Task 3.6).
- Re-running after a commit duplicates comments → include prior findings, report only new ones (Task 3.6).
- Reviews are noisy → explicit categorical criteria, not "be conservative" (Task 4.1).
- The generator reviews its own code → use an independent instance (Task 4.6).
- Nightly test generation is slow and expensive → batch API; but never for pre-merge (Task 4.5).

---

## Scenario 6 — Structured Data Extraction

> You are building a structured data extraction system using Claude. The system
> extracts information from unstructured documents, validates the output using
> JSON schemas, and maintains high accuracy. It must handle edge cases
> gracefully and integrate with downstream systems.

**Primary domains:** 4 (Prompt Engineering & Structured Output), 5 (Context Management & Reliability)

**Rehearsed in** [`labs/03-extraction-pipeline/`](../../labs/03-extraction-pipeline/).

Recurring failure modes:
- Fields get fabricated to satisfy `required` → make them nullable (Task 4.3).
- Line items don't sum to the stated total → schema syntax was never the problem; validate semantics (Task 4.3, 4.4).
- Retries keep failing → the information isn't in the document; no retry fixes that (Task 4.4).
- A new document layout breaks extraction → few-shot examples across formats (Task 4.2).
- 97% accuracy overall, but one document type is terrible → segment the metrics (Task 5.5).

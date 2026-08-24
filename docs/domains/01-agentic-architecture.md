# Domain 1 — Agentic Architecture & Orchestration (27%)

The heaviest domain. Seven task statements, and the items are almost always
"here is a production symptom; which of these four real techniques fixes it".

Full task statements: [`../exam/blueprint.md`](../exam/blueprint.md#domain-1--agentic-architecture--orchestration-27).

## The tradeoff pairs

Every one of these is a pair of techniques that are both correct in general and
distinguishable by the symptom in front of you. Learn the discriminator, not the
techniques.

| Symptom | Right answer | Plausible wrong answer | Discriminator |
|---|---|---|---|
| Agent skips a required tool 12% of the time, with financial consequences | Programmatic prerequisite gate | Stronger system prompt; few-shot examples | Prompt compliance is probabilistic. If a non-zero failure rate is unacceptable, only code guarantees it |
| Agent calls the *wrong* tool | Better tool descriptions | A prerequisite gate | Selection ≠ ordering. A gate cannot make the model pick correctly, only stop it acting early |
| Refunds over $500 must not process | `PreToolUse` hook that denies and redirects | A deny rule; a system prompt | The hook can inspect the *arguments* and name the alternative workflow. A glob cannot see `amountUsd` |
| Subagent doesn't know what the previous agent found | Put the findings in the Agent prompt | Increase the parent's context; use a shared memory | Subagents inherit nothing. There is no shared memory to increase |
| Four independent subtasks run slowly | Emit all four Agent calls in one response | Spawn more subagents | Parallelism is per-response, not per-agent |
| A predictable multi-aspect review | Prompt chaining (fixed pipeline) | Dynamic decomposition | Predictability. Fixed pipeline when the steps are known in advance |
| An open-ended investigation | Dynamic decomposition | Prompt chaining | The subtasks depend on what earlier steps discover |
| Resuming after code changed | Resume + tell it which files changed | Resume and let it figure it out | A resumed agent has no idea the tree moved |
| Prior tool results are stale | Fresh session with an injected summary | Resume | Stale results are worse than no results — they read as current |

## The loop (Task 1.1)

Written against literal `stop_reason` values, which `query()` hides. See
[`labs/01-multi-tool-agent/manual-loop.ts`](../../labs/01-multi-tool-agent/manual-loop.ts).

```
while true:
    response = create(...)
    if response.stop_reason == "end_turn": break      # ← THE stopping condition
    if response.stop_reason == "pause_turn": append and continue
    execute every tool_use block
    append ALL tool_results in ONE user message
```

Three named anti-patterns, all of which look reasonable in isolation:

- **Parsing natural-language signals to terminate.** "It said 'let me know if
  you need anything else', so it's done." Brittle, and it silently breaks on
  phrasing changes.
- **An iteration cap as the primary stopping mechanism.** A cap is a circuit
  breaker. If it fires, something is wrong — so the code should say so, not
  return the last message as a result. `manual-loop.ts` throws.
- **Assistant text as a completion indicator.** A response can contain both text
  and `tool_use` blocks. Text is not an ending.

One more, not an anti-pattern but a trap: return **every** `tool_result` in a
**single** user message. Splitting them across messages trains the model out of
parallel tool calls, and dropping one for a failed tool breaks the pairing.

## Hub and spoke (Task 1.2)

The coordinator manages all inter-subagent communication. Not because it's
tidier, but because it puts error handling, information routing, and
observability in exactly one place.

Two failure modes worth holding in mind together, since they pull in opposite
directions:

- **Too narrow a decomposition** leaves broad topics under-covered. The
  coordinator asks four precise questions and never notices the fifth.
- **Too much overlap** wastes budget and produces duplicate findings that then
  need reconciling.

The fix for both is explicit scope partitioning by subtopic or source type —
see [`labs/04-multi-agent-research/agents.ts`](../../labs/04-multi-agent-research/agents.ts),
where the corpus analyst and web researcher have disjoint tool sets so they
*cannot* cover the same ground.

And: the coordinator should **dynamically select** which subagents to invoke
based on the query, not always run the full pipeline.

## Enforcement vs. guidance (Tasks 1.4, 1.5)

The domain's thesis, and worth memorizing in the guide's own words:

> When deterministic compliance is required (e.g., identity verification before
> financial operations), prompt instructions alone have a non-zero failure rate.

Hooks give deterministic guarantees. Prompts give probabilistic compliance.
Both are legitimate — the question is only whether your failure rate can be
non-zero.

`PostToolUse` has a second use beyond blocking: **normalizing** heterogeneous
data before the model sees it. Unix timestamps from one MCP server, ISO 8601
from another, numeric status codes from a third. Reconciling that in a hook
means every downstream agent sees one format. See
[`labs/04-multi-agent-research/hooks/trim-output.ts`](../../labs/04-multi-agent-research/hooks/trim-output.ts).

## Handoff protocols (Task 1.4)

When escalating mid-process, the receiving human **cannot see the transcript**.
The handoff must stand alone: customer ID, root cause (not the customer's
description), what was already attempted, recommended action, amount at stake.

This is why `escalate_to_human` in
[`labs/01-multi-tool-agent/tools/support-server.ts`](../../labs/01-multi-tool-agent/tools/support-server.ts)
has five required fields rather than one free-text summary. A schema that
demands the fields gets them; a description asking nicely often doesn't.

## Sessions (Task 1.7)

- `--resume <name>` continues a named conversation.
- `fork_session` branches from a shared baseline — two refactoring strategies
  explored from one analysis, without either trampling the other.
- Resume when prior context is mostly valid **and** you can say what changed.
- Start fresh with an injected summary when tool results are stale.

`shouldResume()` in [`src/runtime/session.ts`](../../src/runtime/session.ts)
encodes the heuristic as a churn ratio.

## Drills

```
/exam-drill 1 8
/domain-review labs/01-multi-tool-agent 1
/domain-review labs/04-multi-agent-research 1
```

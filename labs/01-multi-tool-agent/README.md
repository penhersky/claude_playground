# Lab 1 — Multi-tool agent with escalation logic

**Official Exercise 1.** Domains reinforced: **1** (Agentic Architecture &
Orchestration), **2** (Tool Design & MCP Integration), **5** (Context Management
& Reliability).

Maps to **Scenario 1 — Customer Support Resolution Agent**, down to the tool
names: `get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`.

```bash
bun test labs/01-multi-tool-agent   # offline, no key needed
bun run lab1                        # Agent SDK, gate active
bun run lab1:loop                   # raw Messages API, stop_reason visible
```

## Files

| File | Task statements | What it shows |
|---|---|---|
| `data/store.ts` | 5.1 | Synthetic backend. Orders carry 20 fields; `returnRelevantView()` trims to 8 before they hit context. |
| `tools/support-server.ts` | 2.1, 2.2 | Four tools with discriminating descriptions and structured errors. |
| `tools/descriptions.before.md` | 2.1 | The thin descriptions that cause misrouting. **Deliberate anti-pattern — don't fix it.** |
| `tools/descriptions.after.md` | 2.1 | What changed and why, ingredient by ingredient. |
| `hooks/prerequisite-gate.ts` | 1.4, 1.5 | `PreToolUse` gate: verification before refunds, ceiling redirect to escalation. |
| `agent.ts` | 1.4, 1.5, 5.2 | Three scenarios against the Agent SDK. |
| `manual-loop.ts` | 1.1 | The same case on the raw API, with `stop_reason` as the stopping condition. |
| `gate.test.ts` | — | Offline coverage of every decision above. |

## The two failure modes, and why they need different fixes

This is the lab's central lesson, and the exam tests it as a distinction.

**Selection failure** — the agent calls `get_customer` when the user asked about
an order. The tools are fine; the *descriptions* don't discriminate. Fix the
descriptions: input formats, example queries, edge cases, explicit "use this
instead of that when…" boundaries. Few-shot examples help but patch the symptom;
a keyword routing layer replaces reasoning with brittle matching.

**Ordering failure** — the agent skips `get_customer` entirely and refunds
against a name. Better descriptions raise compliance here but cannot guarantee
it, and the consequence is a refund on the wrong account. Fix it with a
`PreToolUse` gate. The guide is blunt about this: where deterministic compliance
is required, *prompt instructions alone have a non-zero failure rate*.

The exam's sample question puts both fixes in the same four options. Knowing
which symptom you're looking at is the whole answer.

## Why `PreToolUse` and not `canUseTool`

Permission evaluation runs: **hooks → deny → ask → mode → allow → `canUseTool`**.

`agent.ts` pre-approves the support tools via `allowedTools`. A bare
`allowedTools` entry auto-approves the tool at the *allow* step, which is after
the mode and **before** `canUseTool` — so a check placed in `canUseTool` would
never run for these tools. Silently. A `PreToolUse` hook runs first, on every
call, and its deny survives even `bypassPermissions`.

## What to watch in the trace

**Scenario A** — the user volunteers an order number, tempting the model to skip
ahead. Expect a `process_refund` denial, then `get_customer`, then a successful
refund. If `ORD-5150` is looked up first it fails once with
`errorCategory: "transient"` and should be retried, not escalated.

**Scenario B** — $780 against a $500 ceiling. Expect a denial whose reason names
`escalate_to_human`, then an escalation carrying customer ID, root cause, what
was attempted, and a recommendation. A bare "escalating this" is a failed run:
the receiving human cannot see the conversation.

**Scenario C** — three concerns in one message. Expect decomposition, then one
unified response. The lamp refund fails with `errorCategory: "business"`
(delivered February, 30-day window) and must **not** be retried — that
distinction between business and transient is Task 2.2's core.

## Running the description experiment

1. Copy the thin descriptions from `descriptions.before.md` into `support-server.ts`.
2. `bun run lab1`, and try `"check my order ORD-5150"` and `"what's on file for Okafor"`.
3. Compare which tools get called.
4. Restore. `descriptions.after.md` explains each ingredient you just put back.

## Exercise steps not yet done

The guide's step 5 asks you to test with multi-concern messages. Scenario C
covers one shape. Write two more — a billing dispute plus an address change, and
a refund request where the customer asks for a human mid-way — and check that
the agent honours the human request *immediately* rather than investigating
first (Task 5.2).

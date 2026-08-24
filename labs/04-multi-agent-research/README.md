# Lab 4 — Multi-agent research pipeline

**Official Exercise 4.** Domains reinforced: **1** (Agentic Architecture &
Orchestration, 27%), **2** (Tool Design & MCP Integration), **5** (Context
Management & Reliability).

Maps to **Scenario 3 — Multi-Agent Research System**, with the guide's own four
subagent roles: web search, document analysis, synthesis, report generation.

```bash
bun test labs/04-multi-agent-research   # offline
bun run lab4                            # full coordinator run
bun run lab4:parallel                   # parallel vs. sequential timing
```

## Files

| File | Task | What it shows |
|---|---|---|
| `agents.ts` | 1.2, 2.3 | Four `AgentDefinition`s with scoped tool sets; two have none at all |
| `coordinator.ts` | 1.2, 1.3 | Hub-and-spoke delegation, explicit context passing, failure routing |
| `findings.ts` | 1.3, 5.6 | The claim/evidence/source/date record, conflict grouping, report rendering |
| `failures.ts` | 2.2, 5.3 | Corpus MCP server with rigged failures; the coordinator's decision function |
| `hooks/trim-output.ts` | 5.1, 1.5 | `PostToolUse` trimming via `updatedToolOutput`, plus date normalization |
| `scratchpad.ts` | 5.4 | State export, manifest, resume plan, summary injection |
| `parallel.ts` | 1.3 | Measured speedup from batching Agent calls into one response |
| `corpus/` | 5.6 | Five documents rigged with a temporal difference and a real disagreement |

## Subagents inherit nothing

This is the single most testable fact in Domain 1, and the most common design
error. A subagent's context window starts fresh. It gets its own system prompt
(`AgentDefinition.prompt`), the Agent tool's prompt string, project CLAUDE.md,
and its tool definitions. It does **not** get the parent's conversation, the
parent's tool results, or the parent's system prompt.

So the coordinator prompt in `coordinator.ts` says, explicitly, that when
delegating to the synthesizer its prompt must carry the actual findings — every
claim, source, date, and excerpt. "Synthesize the findings above" delegates to
an agent that cannot see anything above.

## Why two agents have no tools

`synthesizer` and `report-writer` are declared with `tools: []`.

Task 2.3 names the failure directly: agents with tools outside their
specialization misuse them, and the example given is "a synthesis agent
attempting web searches". A synthesizer that can fetch a document will, when a
figure is missing — and what should have surfaced as a coverage gap becomes an
unsourced assertion instead. Removing the capability is stronger than
instructing against using it.

The related rule: tool count itself degrades selection. The guide puts numbers
on it — 18 tools instead of 4–5 measurably hurts. No agent here holds more than
two.

## Parallelism comes from one response, not many turns

`bun run lab4:parallel` runs four identical subtasks twice, differing only in
the delegation instruction. Sequential costs the sum of subagent durations;
parallel costs the maximum.

Watch the **delegating turns** column: parallel should be `1` (one assistant
message holding four Agent calls), sequential `4`. If parallel also shows 4, the
coordinator ignored the instruction and the timing comparison is meaningless.

Cost is roughly unchanged between the two. Parallelism buys latency, not tokens.

## The corpus is rigged, deliberately

`corpus/README.md` has the details. Two traps:

**A temporal difference that is not a conflict.** The 2024 report says 1,240 MW;
the 2026 report says 2,870 MW. Same metric, different years. `synthesize()`
detects the >365-day gap and marks the group `likelyTemporal`. A synthesis that
"resolves" this by taking the newer number has thrown away the trend.

**A real disagreement that must survive.** The operator reports 4.1% curtailment
for H1 2026; Helios reports 6.8% for the same period. The gap is methodological
— one counts economic curtailment only, the other counts everything. Both
figures belong in the report with their attributions and that explanation.
Averaging them yields a number true of nothing.

`coordinator.ts` checks for both at the end of the run.

## Failures degrade coverage; they do not end runs

`failures.ts` rigs two:

- `helios-institute-2026.md` times out on first read, then works. The
  corpus-analyst should retry it **itself** — local recovery for transient
  failures, so the coordinator never hears about it.
- `restricted-annex.md` is permanently inaccessible and returns
  `errorCategory: "permission"` with partial results and alternatives. The
  coordinator proceeds and records a coverage gap naming what was inaccessible
  and what was attempted.

`decide()` is the coordinator's routing function, and it is worth noting what
it *cannot* return: there is no `abort`. "Terminating the entire workflow on a
single failure" is a named anti-pattern, and making it inexpressible is stronger
than instructing against it. Its sibling anti-pattern — swallowing an error into
an empty success — is handled by `interpretResult()`, which keeps "the search
failed" and "the search found nothing" distinct. Reporting the first as the
second is the more dangerous direction: the gap silently never appears.

## Trimming without losing provenance

The `PostToolUse` hook replaces document text with `updatedToolOutput` before
Claude sees it, so full documents never enter context. It keeps headings,
numeric lines, and methodology notes; it drops narrative prose.

The constraint that shapes it: a trim that discarded dates or source references
would break exactly the provenance chain the rest of the lab is built on.
Trimming and losing attribution are easy to confuse — `research.test.ts` asserts
that dates survive.

The hook matches only `mcp__corpus__load_document`. An unmatched hook runs on
every tool call, including ones whose output was already small.

## Crash recovery

Each agent writes state to `.scratch/` (gitignored) after each phase, not only
on success — the run you are recovering from is the one that did not finish. The
coordinator writes a manifest and reads it on the next run.

`resumePlan()` treats a `complete` state as carried forward and both `failed`
and `running` as work to redo: a `running` state means the process died
mid-flight and its findings may be partial. `buildResumeContext()` injects both
the established findings **and** what was already attempted, so a resumed agent
does not repeat a search that came back empty.

Run `bun run lab4`, kill it partway with `ctrl-c`, and run it again — the second
run reports what it found in `.scratch/`.

## Exercise steps not yet done

The guide's step 2 asks you to **measure** the latency improvement.
`bun run lab4:parallel` does. What it does not do is explore the shape of the
gain: try repartitioning the four subtasks so one is much larger than the others
and watch the speedup collapse toward 1×. The lesson is that unbalanced work is
repartitioned, not parallelized harder — and it is a lesson the exam frames as
"risks of overly narrow task decomposition" in Task 1.2.

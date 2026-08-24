# Domain 5 — Context Management & Reliability (15%)

Six task statements. The lightest domain by weight, but it appears as a
*secondary* domain in five of the six exam scenarios — so it shows up far more
than 15% of your reading time would suggest.

Full task statements: [`../exam/blueprint.md`](../exam/blueprint.md#domain-5--context-management--reliability-15).

## Context (Task 5.1)

Three named effects:

**Progressive summarization loses specifics.** Numbers, percentages, dates, and
customer-stated expectations get condensed into "the customer was unhappy about
the delay". The fix is a **persistent "case facts" block** — transactional facts
extracted into their own layer and included in every prompt, *outside* the
summarized history, so summarization can never reach them.

**Lost in the middle.** Models process the beginning and end of a long input
reliably and drop things from the middle. Two mitigations: put key-findings
summaries **at the top** of aggregated inputs, and use explicit section headers
so structure survives.

**Tool results accumulate by size, not relevance.** The canonical example is an
order lookup returning 40+ fields when 5 matter. Fix it at the source when you
own the tool ([`returnRelevantView`](../../labs/01-multi-tool-agent/data/store.ts)),
or with a `PostToolUse` hook and `updatedToolOutput` when you don't
([`trim-output.ts`](../../labs/04-multi-agent-research/hooks/trim-output.ts)).

Related, for multi-agent runs: make upstream agents return **structured data**
(key facts, citations, relevance scores) rather than verbose content and
reasoning chains, when downstream agents have a limited budget.

## Escalation (Task 5.2)

**Escalate when:**
- the customer asks for a human — **immediately**, without investigating first
- policy is silent or ambiguous on their specific request
- you cannot make meaningful progress

**Do not escalate because:**
- the case is complex (complexity ≠ needing a human)
- the customer sounds frustrated (**sentiment is an unreliable proxy**)
- the model reports low confidence (**self-reported confidence is unreliable too**)

Two nuances that make good distractors:

- If the customer is frustrated but the issue is *within* your capability:
  acknowledge the frustration, **offer** resolution, and escalate only if they
  reiterate the preference for a human.
- If a tool returns **multiple matches**, ask for another identifier. Do not
  select heuristically. Both `get_customer` implementations in lab 1 return
  `multiple_matches` with an explicit "do not choose one yourself".

The policy-gap example worth remembering: a customer asks for a competitor price
match when policy only addresses own-site adjustments. That's a gap, not a
complex case — escalate.

## Error propagation (Task 5.3)

Two anti-patterns, opposite over-reactions to the same event:

- **Silently suppressing errors** — returning an empty result as success. The
  coordinator concludes the topic has no coverage and the gap never appears.
- **Terminating the whole workflow** on a single subagent failure.

The middle path: **structured error context** — failure type, attempted query,
partial results, alternative approaches — and let the coordinator decide.

`decide()` in [`failures.ts`](../../labs/04-multi-agent-research/failures.ts)
makes this structural: it cannot return "abort". Making an anti-pattern
inexpressible beats instructing against it.

Also: **subagents recover locally** from transient failures and propagate only
what they cannot resolve. A timeout escalated to the coordinator is a wasted
round trip and puts the recovery in the wrong layer.

And **synthesis output carries coverage annotations** marking which findings are
well-supported and which topic areas have gaps from unavailable sources.

## Large codebase exploration (Task 5.4)

**Context degradation in extended sessions** is the symptom to recognize: the
model starts giving inconsistent answers and referencing "typical patterns"
rather than the specific classes it discovered earlier.

Four responses:

1. **Scratchpad files** recording key findings, referenced for later questions.
2. **Subagent delegation** to isolate verbose exploration while the main agent
   keeps high-level coordination.
3. **Summarize between phases** and inject the summary into the next phase's
   initial context — rather than replaying raw transcripts.
4. **Structured state exports (manifests)** the coordinator loads on resume.

All four in [`scratchpad.ts`](../../labs/04-multi-agent-research/scratchpad.ts).

`/compact` is the fifth, for when context has already filled with discovery
output.

## Human review and confidence (Task 5.5)

> Aggregate accuracy metrics (e.g., 97% overall) may mask poor performance on
> specific document types or fields.

So: **report accuracy by document type and by field**, and validate every
segment before reducing human review.
[`review-routing.ts`](../../labs/03-extraction-pipeline/review-routing.ts)
refuses to report a single number.

**Stratified random sampling** of *high-confidence* extractions is the other
half. Without it you only ever measure errors your threshold already catches,
and never find the new error pattern that scores confidently.

**Field-level confidence calibrated on a labeled validation set.** Note
"calibrated" — the threshold is a property of your documents and your model, not
a constant. Route low-confidence and ambiguous/contradictory extractions to
review, prioritizing limited reviewer capacity.

## Provenance (Task 5.6)

**Attribution is lost during summarization** when findings are compressed
without preserving claim-source mappings. The fix is to make the unit of
transfer between agents a **record**, not prose: claim, evidence excerpt,
source, publication date.
[`findings.ts`](../../labs/04-multi-agent-research/findings.ts).

**Conflicting statistics from credible sources: annotate with attribution
rather than arbitrarily selecting one value.** Never average, never pick the
higher-confidence one, never drop the outlier.

**Require publication or collection dates** in structured outputs — otherwise
two sources measuring different periods look like a contradiction, and a
synthesis agent will "resolve" a disagreement that was never one. The
[research corpus](../../labs/04-multi-agent-research/corpus/) contains exactly
this trap alongside a genuine disagreement, so the two can be told apart.

**Structure reports with explicit sections** separating well-established from
contested findings, and **preserve how each source characterized itself** — a
source that called its estimate provisional must not be reported as definitive.

**Render content types appropriately**: financial data as tables, news as prose,
technical findings as structured lists. Forcing everything into one uniform
format loses information in both directions.

## Drills

```
/exam-drill 5 6
/domain-review labs/04-multi-agent-research 5
bun run lab4
```

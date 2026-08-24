# Lab 3 — Structured data extraction pipeline

**Official Exercise 3.** Domains reinforced: **4** (Prompt Engineering &
Structured Output, 20%), **5** (Context Management & Reliability).

Maps to **Scenario 6 — Structured Data Extraction**.

This is the one lab built on `@anthropic-ai/sdk` rather than the Agent SDK.
Domain 4 is written against raw Messages API concepts — `tool_use` with JSON
schemas, the three `tool_choice` modes, `output_config.format`, Message Batches
— and the Agent SDK abstracts all of them away.

```bash
bun test labs/03-extraction-pipeline   # offline
bun run lab3                           # extraction + validation + retry
bun run lab3:batch                     # Batches API — may take up to 24h
```

## Files

| File | Task | What it shows |
|---|---|---|
| `schema.ts` | 4.3 | Nullable fields, `"other"` + detail, `"unclear"`, `calculated` vs `stated` totals |
| `fixtures/index.ts` | 4.2 | Eight documents in four layout families, each provoking one specific failure |
| `fewshot.ts` | 4.2 | Three examples covering the ambiguous cases, plus normalization rules |
| `extract.ts` | 4.3, 2.3 | All three `tool_choice` modes, with prompt caching |
| `validate.ts` | 4.4 | Semantic checks a schema cannot express |
| `retry.ts` | 4.4 | Recoverable vs. not, and the feedback prompt |
| `review-routing.ts` | 5.5 | Confidence routing, stratified sampling, per-segment accuracy |
| `pipeline.ts` | — | The whole loop, reporting against each fixture's expectations |
| `batch.ts` | 4.5 | Batches, `custom_id` correlation, chunked resubmission, SLA arithmetic |

## The central point: strict schemas solve half the problem

`tool_use` with a JSON schema, or `output_config.format`, **eliminates syntax
errors**. You will never again parse a truncated brace. It does nothing at all
about:

- line items that don't sum to the printed total
- a value in the wrong field
- a due date before the issue date
- a fabricated VAT number that happens to be well-formed

Those are *semantic*, and they need `validate.ts`. The `sum-mismatch` fixture
exists to make the distinction concrete: its extraction is perfectly
schema-valid and arithmetically wrong.

The schema's job is to make the *right answer expressible*. `statedTotalUsd` and
`calculatedTotalUsd` as separate fields is what makes the check possible at all
— extract one number and there is nothing to compare it to.

## Why nullable beats required

A field marked `required` that the document doesn't contain gives the model two
options: fabricate, or fail the schema. It fabricates — and a hallucinated
`"IE9834721K"` is indistinguishable from a real one downstream.

Making it nullable adds a third option that is *correct*. The `missing-tax-id`
fixture is a coffee-shop receipt with no VAT line, no invoice number, and no
payment terms. The run passes if all three come back `null`.

Same reasoning behind `"unclear"` in the enums. Without it, "the document
doesn't state terms" has to be rounded to `net_30`, and the uncertainty that
should have routed the document to review disappears.

## When a retry cannot help

Task 4.4's real content. `retry.ts` classifies by **where the missing
information lives**:

| Situation | Retry? | Because |
|---|---|---|
| Total mismatch | ✅ | The right numbers are in the document; the model misread one |
| Due date before issue date | ✅ | Derivable from the issue date and the terms |
| Bad date format | ✅ | A normalization miss, not a knowledge gap |
| VAT number absent from the source | ❌ | No re-reading produces what isn't there |
| Source contradicts itself | ❌ | Both values are real. A human decides |
| Still failing after 3 attempts | ❌ | Repeated failure is itself the signal |

`auditNullFields()` makes this answerable from the *input*: it scans the source
for the markers a field would appear under. A null whose marker is absent is the
model doing the right thing; a null whose marker is present is a miss worth
retrying. Without that split you either retry every null — expensive, and it
pressures the model into inventing something to make the error stop — or accept
every null and lose data silently.

## The three `tool_choice` modes

| Mode | Guarantee | Used for |
|---|---|---|
| `"auto"` | none — the model may reply with prose | not used here; it's the failure mode the other two fix |
| `"any"` | a tool is called; the model picks which | unknown document type across several schemas |
| `{type:"tool", name}` | *that* tool is called | ordering — metadata before enrichment |

`pipeline.ts` demonstrates the last two. `"any"` gets the statement and the
invoice fixtures and should route each to a different tool. The forced mode
guarantees `extract_metadata` runs first, which is the only way to get
*ordering* — `"any"` gets you a tool call, not a particular one.

## Prompt caching

`SYSTEM_PROMPT` carries the normalization rules and three few-shot examples, is
byte-identical on every request, and sits behind a `cache_control` breakpoint.
The document varies and goes after it.

Caching is **prefix**-based: any byte change before the breakpoint invalidates
everything after. Watch `cache hits` in the run output — if it stays at zero
across fixtures, something is varying in the prefix.

## Batch processing

`bun run lab3:batch` submits every fixture, polls, validates client-side, then
resubmits only the failures **keyed by `custom_id`**. Results come back in
arbitrary order; never key by position.

Note what the batch *can't* do: no multi-turn tool calling within a request, so
the validation-retry loop cannot run inside it. The pattern is batch → validate
locally → resubmit failures as a second batch.

`submissionIntervalHours()` is the guide's SLA arithmetic. A 30-hour end-to-end
SLA against a 24-hour worst case leaves 6 hours of slack, so submit every ~4
hours. A 20-hour SLA is not achievable by batch at all, and the function throws
rather than returning a number that looks fine.

## Segment accuracy

`pipeline.ts` ends with accuracy **by document type** and **by field**, never as
one aggregate. Task 5.5's whole content is that "97% overall" can hide receipts
at 71%, and automating on the headline number ships that failure.

The run prints a warning when the worst segment is more than 15 points below the
aggregate. `stratifiedSample()` handles the other half: sampling *passed*
high-confidence extractions per stratum, so you can find error patterns that
score confidently — the ones your threshold will never catch by construction.

## Exercise steps not yet done

The guide asks you to calibrate confidence thresholds **on a labeled validation
set**. `CONFIDENCE_THRESHOLD` is 0.75 by assertion, not by evidence. Hand-label
the correct extraction for each fixture, sweep the threshold, and plot caught
errors against review volume. The right number is a property of your documents
and your model, and finding it is the actual skill.

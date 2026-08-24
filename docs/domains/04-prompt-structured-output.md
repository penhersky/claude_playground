# Domain 4 — Prompt Engineering & Structured Output (20%)

Six task statements. This is the Claude API domain — `tool_use`, JSON schemas,
`tool_choice`, Batches — plus the prompting techniques that go with them.

The Agent SDK hides most of this, which is why
[`labs/03-extraction-pipeline/`](../../labs/03-extraction-pipeline/) is built on
`@anthropic-ai/sdk` instead.

Full task statements: [`../exam/blueprint.md`](../exam/blueprint.md#domain-4--prompt-engineering--structured-output-20).

## Explicit criteria beat confidence filters (Task 4.1)

The single most repeated point in this domain:

> General instructions like "be conservative" or "only report high-confidence
> findings" fail to improve precision compared to specific categorical criteria.

Vague: "check that comments are accurate."
Explicit: "flag comments only when claimed behavior contradicts actual code behavior."

So when an item offers "instruct the model to be more conservative" alongside
"define which categories to report and which to skip", the second wins. Every
time.

Two related moves:

- **Temporarily disable a high-false-positive category** while you improve its
  prompt. A noisy category poisons trust in the accurate ones — developers stop
  reading all of them.
- **Define severity with concrete code examples per level**, not adjectives.

## Few-shot (Task 4.2)

> The most effective technique for achieving consistently formatted, actionable
> output when detailed instructions alone produce inconsistent results.

Use 2–4 examples, and pick them for the **ambiguous** cases rather than the easy
ones. Crucially, show the *reasoning* for why one reading beat a plausible
alternative — that's what lets the model generalize to a case you didn't
anticipate, instead of pattern-matching the ones you did.

What they're specifically good for:

- demonstrating ambiguous-case handling
- a consistent output format (location, issue, severity, suggested fix)
- separating acceptable patterns from genuine issues, cutting false positives
- varied document structures — inline citations vs. bibliographies
- **reducing hallucination in extraction**, especially empty/null fields

Worked set: [`labs/03-extraction-pipeline/fewshot.ts`](../../labs/03-extraction-pipeline/fewshot.ts).

**Discriminator against Task 4.1:** few-shot fixes *inconsistency*; explicit
criteria fix *wrong scope*. If the output format varies run to run, examples. If
it reports the wrong things consistently, criteria.

## Structured output (Task 4.3)

`tool_use` with a JSON schema, or `output_config.format`, is the most reliable
route. It eliminates **syntax** errors completely.

It does nothing about **semantics**: line items that don't sum, values in the
wrong field, a fabricated-but-well-formed tax ID. That distinction is the whole
of Task 4.3 and half of Task 4.4.

Schema design rules that appear as items:

| Rule | Why |
|---|---|
| Nullable for anything the source may lack | A `required` field the document lacks forces a choice between fabricating and failing the schema. It fabricates |
| Enum + `"other"` + detail string | A closed enum forces unanticipated cases into the nearest wrong bucket |
| An `"unclear"` member | Distinct from `"other"`: "the document doesn't say" vs. "a real category I lack a name for" |
| Extract `calculated` alongside `stated` | Gives you two numbers to compare. One number cannot be cross-checked |
| Add `conflict_detected` | Lets the model report a contradiction instead of resolving it silently |

Plus: **format-normalization rules in the prompt** alongside the strict schema.
The schema constrains shape; only the prompt can say "1 March 2026 and
03/01/2026 are the same date".

Implementation: [`schema.ts`](../../labs/03-extraction-pipeline/schema.ts).

## `tool_choice`

| Mode | Guarantee | Use for |
|---|---|---|
| `"auto"` | none — may return prose | when a tool call is genuinely optional |
| `"any"` | a tool is called; model picks | several schemas, unknown document type |
| `{type:"tool", name}` | *that* tool | ordering — metadata before enrichment |

## Validation and retry (Task 4.4)

**Retry with the specific errors quoted back**, along with the original document
and the failed extraction. All three, or the model is guessing at what went
wrong.

**Know when retry cannot help.** This is the exam's real interest:

| Situation | Retry? |
|---|---|
| Format mismatch, structural error | ✅ the information is there |
| Wrong arithmetic | ✅ the numbers are there |
| Information absent from the source | ❌ nothing to re-read |
| Source contradicts itself | ❌ both values are real |

[`retry.ts`](../../labs/03-extraction-pipeline/retry.ts) makes this answerable
from the input: `fieldIsRecoverable()` scans the source for the markers a field
would appear under, so "is it worth retrying?" is decided by looking at the
document, not by re-running and hoping.

Also named: **`detected_pattern`** on structured findings, so when developers
dismiss a finding you can analyze *which code constructs* trigger false
positives, rather than just counting them.

## Batches (Task 4.5)

| Fact | Consequence |
|---|---|
| 50% cost reduction | worth restructuring a workload for |
| up to 24h, **no latency SLA** | never for anything blocking |
| no multi-turn tool calling in a request | the validation-retry loop runs client-side, between batches |
| `custom_id` correlates pairs | results arrive in **any order** — never key by position |

**Right:** overnight reports, weekly audits, nightly test generation.
**Wrong:** pre-merge checks. A check that might take 24 hours is not a check.

SLA arithmetic: a 30-hour end-to-end SLA against a 24-hour worst case leaves 6
hours of slack, so submit every ~4 hours.
[`batch.ts`](../../labs/03-extraction-pipeline/batch.ts) implements it and
throws when the SLA is unachievable rather than returning a plausible number.

Failure handling: resubmit **only** the failures, by `custom_id`, **with
modifications** — chunk the document that blew the context window, because
resubmitting it unchanged fails identically.

And: refine the prompt on a **sample** before batching large volumes.

## Multi-instance review (Task 4.6)

> A model retains reasoning context from generation, making it less likely to
> question its own decisions in the same session.

So: a **second independent instance** beats self-review instructions, and beats
extended thinking. This is a structural fix, not a prompting one — which is why
"add 'review your work critically' to the prompt" is always the wrong option.

Multi-pass: split large multi-file reviews into **per-file local passes** plus a
**separate cross-file integration pass**. One pass over everything suffers
attention dilution and produces contradictory findings.

Verification passes where the model **self-reports confidence per finding**
enable calibrated routing — which is Task 5.5's territory.

## Drills

```
/exam-drill 4 8
/domain-review labs/03-extraction-pipeline 4
bun run lab3
```

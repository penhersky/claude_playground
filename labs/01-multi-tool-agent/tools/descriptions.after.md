# The "after" descriptions — what changed and why

These are the descriptions live in `support-server.ts`. Compare with
`descriptions.before.md`.

Task 2.1 lists four things a description needs. Each rewrite below adds all
four, and the diff is the lesson.

| Ingredient | Where you can see it |
|---|---|
| Input formats | "Accepts an order number in the form ORD-4417. It does NOT accept a customer ID…" |
| Example queries | "'Okafor' matches several accounts" |
| Edge cases | multiple matches; transient timeouts; the return window |
| Boundaries vs. similar tools | "Use this for questions about the PERSON… For a specific purchase, use lookup_order instead" |

## The rewrites

### `get_customer`

Added, in order of impact:

1. **The negative boundary.** "An order number is not a customer identifier and
   will not resolve here." A positive description of what a tool does still
   leaves the model guessing at the edges; naming what it *doesn't* handle, and
   which tool does, is what separates two similar tools.
2. **The ordering claim, with its consequence.** "Call this FIRST… Downstream
   tools are blocked until it returns exactly one verified match." Stating the
   enforcement, not just the preference, tells the model that skipping ahead
   will fail rather than merely be discouraged.
3. **The ambiguity edge case.** "Names are ambiguous — 'Okafor' matches several
   accounts — so when this returns multiple matches, ask for an order number or
   email rather than choosing one." This is Task 5.2 written into the tool
   surface: the guidance sits where the model reads it, not in a system prompt
   that competes with everything else.

### `lookup_order`

1. **Input format, stated twice.** Once in the description, once in
   `.describe()` on the Zod field. The field description ships in the JSON
   schema, so it's visible even when the model is skimming.
2. **The mirrored boundary.** `get_customer` points here; this points back.
   Both directions, so whichever tool the model considers first, it finds the
   handoff.
3. **What the result contains.** "Returns only the fields relevant to returns
   and refunds" pre-empts a second call hunting for a field that was trimmed.
4. **The transient-failure contract.** "Retry those once before telling the
   customer anything" — the tool teaches its own error handling.

### `process_refund`

1. **The policy ceiling, as a number.** "$500" beats "large refunds", because
   the model can compare against it.
2. **The prerequisite, restated.** Belt and braces with the hook: the hook
   guarantees compliance, the description prevents the wasted turn.
3. **Business vs. transient, called out by name.** "errorCategory 'business'
   and isRetryable false. That is a policy outcome, not a fault" stops the
   retry loop that a bare "refund failed" would start.

### `escalate_to_human`

1. **Explicit triggers**, from Task 5.2: explicit request, policy gap, no
   progress.
2. **Explicit non-triggers.** "Do NOT escalate merely because a case is complex,
   because the customer sounds frustrated, or because you feel unsure — sentiment
   and self-reported confidence are unreliable proxies." The guide names both
   of those as anti-patterns; the tool description is the cheapest place to
   block them.
3. **Why the fields are structured.** "The receiving agent cannot see this
   conversation" explains the schema rather than just imposing it — the model
   fills the fields more completely when it knows who reads them.

## What descriptions still can't do

They raise the probability of correct selection. They do not make it certain.

The exam's framing is consistent about this: description quality is the fix for
*selection* problems (calling the wrong tool), and programmatic enforcement is
the fix for *ordering* problems where the consequence is irreversible. Lab 1
ships both — `descriptions.after.md` for the first, `hooks/prerequisite-gate.ts`
for the second — because the exam will ask you to tell them apart.

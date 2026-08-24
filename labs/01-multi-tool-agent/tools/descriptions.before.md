# The "before" descriptions — deliberately bad

**Do not fix these.** They exist to be swapped into `support-server.ts` so you
can watch tool selection degrade, then swap back. Task 2.1 is the exam's most
concrete lesson and it lands better as an experiment than as a paragraph.

These are close to the descriptions in the exam guide's own sample question,
where "production logs show the agent frequently calls `get_customer` when users
ask about orders (e.g. 'check my order #12345'), instead of calling
`lookup_order`. Both tools have minimal descriptions and accept similar
identifier formats."

```ts
const getCustomer = tool(
  "get_customer",
  "Retrieves customer information",
  { identifier: z.string() },
  handler,
);

const lookupOrder = tool(
  "lookup_order",
  "Retrieves order details",
  { orderId: z.string() },
  handler,
);

const processRefund = tool(
  "process_refund",
  "Processes a refund",
  { customerId: z.string(), orderId: z.string(), amountUsd: z.number(), reason: z.string() },
  handler,
);

const escalateToHuman = tool(
  "escalate_to_human",
  "Escalates to a human agent",
  { customerId: z.string(), orderId: z.string().nullable(), rootCause: z.string(), /* … */ },
  handler,
);
```

## Why this misroutes

Every one of these is *true*. None of them is *discriminating*.

- **No boundary statement.** Nothing says "use this instead of that when…", so
  the model has only the tool names and two near-identical sentences to separate
  `get_customer` from `lookup_order`.
- **No input format.** Both parameters are bare strings. `ORD-4417` and
  `CUS-1001` look equally plausible in either. `.describe()` on the Zod field is
  where that gets fixed.
- **No example queries.** "Check my order #12345" mentions a customer *and* an
  order; without examples the model has no anchor for which noun drives the call.
- **No edge cases.** Nothing warns that a name can match several customers, so
  the model picks one and proceeds — which is how you get a refund on the wrong
  account.
- **No ordering.** Nothing says `get_customer` comes first, so it gets skipped
  when the customer volunteers an order number.

## The exam's framing

The sample question offers four fixes. Ranked as the guide ranks them:

| Option | Verdict |
|---|---|
| Expand each description with input formats, example queries, edge cases, and explicit boundaries | ✅ **Correct.** Descriptions are the primary selection mechanism; fix the mechanism first. |
| Add 5–8 few-shot examples showing order queries routing to `lookup_order` | Helps, but it patches the symptom while the defect stays in the schema every request carries. |
| Add a routing layer that pre-selects tools from detected keywords | Replaces model reasoning with brittle string matching, and breaks on phrasings you didn't anticipate. |
| Consolidate into one `lookup_entity` that accepts any identifier | Moves the ambiguity from the model into your backend, and gives up the boundary you actually wanted. |

Note that the ordering defect (`get_customer` being skipped entirely) is a
*different* problem with a *different* fix. Better descriptions raise compliance;
they don't guarantee it. When the consequence is financial, you need
`hooks/prerequisite-gate.ts`. Two symptoms that look alike, two layers.

## Running the experiment

1. Copy the descriptions above over the ones in `support-server.ts`.
2. `bun run lab1` and watch the tool calls in the trace.
3. Try `"check my order ORD-5150"` and `"what's on file for Okafor"`.
4. Restore from `descriptions.after.md` and compare.

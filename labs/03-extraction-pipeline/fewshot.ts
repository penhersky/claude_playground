/**
 * Few-shot examples — Task 4.2.
 *
 * Detailed instructions alone produce inconsistent output on documents whose
 * *structure* varies. These three examples exist to show handling of the
 * ambiguous cases, not the easy ones:
 *
 *   1. amounts written in prose rather than a table
 *   2. a field the document genuinely lacks → null, not a plausible invention
 *   3. a document that contradicts itself → keep both, flag it
 *
 * Each shows the reasoning for why one reading was chosen over a plausible
 * alternative. That's what lets the model generalize to a fourth layout it has
 * never seen, rather than pattern-matching the three it has.
 *
 * These are compact on purpose — they ride in every request and share the
 * cached prefix with the system prompt.
 */

export interface FewShotExample {
  label: string;
  document: string;
  reasoning: string;
  output: Record<string, unknown>;
}

export const EXAMPLES: FewShotExample[] = [
  {
    label: "prose amounts, no table",
    document:
      "Our retainer for the period is two thousand dollars ($2,000.00), plus " +
      "courier charges of $47.50 recharged at cost. Total due $2,047.50 within thirty days.",
    reasoning:
      "No table, so line items come from the sentence structure: each recharged item is " +
      'its own line. "within thirty days" maps to net_30. The written-out amount and the ' +
      "parenthesized figure agree, so this is not a conflict — it is one value stated twice.",
    output: {
      lineItems: [
        { description: "Retainer for the period", quantity: 1, unitPriceUsd: 2000, amountUsd: 2000 },
        { description: "Courier charges", quantity: 1, unitPriceUsd: 47.5, amountUsd: 47.5 },
      ],
      statedTotalUsd: 2047.5,
      calculatedTotalUsd: 2047.5,
      paymentTerms: "net_30",
      conflictDetected: false,
      conflictNote: null,
    },
  },

  {
    label: "field absent from source",
    document:
      "corner press coffee\n2026-05-19 14:02\nflat white x2 7.00\ntotal 11.25\ncard ****4417",
    reasoning:
      "There is no VAT number, no invoice number, and no payment terms anywhere in this " +
      "text. Each is null. A card number is not an invoice number and a timestamp is not " +
      "a reference — resist the pull to populate a field with the nearest-looking token. " +
      'paymentTerms is "unclear" because the document does not state terms, not because ' +
      "they are ambiguous.",
    output: {
      vendorTaxId: null,
      invoiceNumber: null,
      dueDate: null,
      paymentTerms: "unclear",
      fieldConfidence: { invoiceNumber: 0.95, vendor: 0.8, issueDate: 0.9 },
    },
  },

  {
    label: "self-contradictory source",
    document:
      "Invoice MW-5150. Maintenance 8hrs @ $145/hr = $1,160.00, surcharge $220.00. " +
      "The amount payable is $1,380.00. Note: our portal still shows $1,160.00.",
    reasoning:
      "The document states two different totals. Both are real; choosing one and " +
      "discarding the other destroys the evidence a reviewer needs. Extract the " +
      "authoritative figure into statedTotalUsd, set conflictDetected, and quote both " +
      "values in conflictNote. Lower the confidence on that field to route it for review.",
    output: {
      statedTotalUsd: 1380,
      calculatedTotalUsd: 1380,
      conflictDetected: true,
      conflictNote:
        'Document states "The amount payable is $1,380.00" but also "our portal still ' +
        'shows $1,160.00". The $1,380.00 figure is presented as the correction.',
      fieldConfidence: { statedTotalUsd: 0.55 },
    },
  },
];

/** Render the examples as a prompt block. */
export function renderExamples(): string {
  return EXAMPLES.map(
    (ex, i) =>
      [
        `### Example ${i + 1} — ${ex.label}`,
        "",
        "Document:",
        "```",
        ex.document,
        "```",
        "",
        `Reasoning: ${ex.reasoning}`,
        "",
        "Relevant output fields:",
        "```json",
        JSON.stringify(ex.output, null, 2),
        "```",
      ].join("\n"),
  ).join("\n\n");
}

/**
 * The system prompt.
 *
 * Format-normalization rules sit alongside the strict schema deliberately: the
 * schema constrains the *shape*, and these constrain the *values* going into
 * it. A schema cannot say "1 March 2026 and 03/01/2026 are the same date".
 */
export const SYSTEM_PROMPT = [
  "You extract structured data from business documents.",
  "",
  "Normalization rules:",
  "  - Dates: always YYYY-MM-DD. '12 March 2026', '03/12/2026', and 'Mar 12 2026' all",
  "    become 2026-03-12. Where day/month order is ambiguous, prefer the reading",
  "    consistent with other dates in the same document.",
  "  - Amounts: numbers only, no symbols or thousands separators. $1,160.00 → 1160.",
  "    Amounts written in words become numerals.",
  "  - Currency: ISO 4217. A bare $ with no other indication is USD.",
  "  - Payment terms: map to the enum. 'within sixty days' → net_60, 'payable on",
  "    receipt' → due_on_receipt. If the document does not state terms, 'unclear'.",
  "",
  "Rules that override any pull toward completeness:",
  "  - A field the document does not contain is null. Null is a correct answer.",
  "    Never populate a field with the nearest similar-looking token.",
  "  - calculatedTotalUsd is YOUR sum of the line amounts. Never copy the printed",
  "    total into it — the two fields exist so they can be compared.",
  "  - When the document contradicts itself, keep both values: set conflictDetected",
  "    and quote both in conflictNote. Do not silently pick one.",
  "  - Score fieldConfidence on what the document supports, not on how sure you feel.",
  "    A value you inferred from layout scores low even when you believe it is right.",
  "",
  "Worked examples:",
  "",
  renderExamples(),
].join("\n");

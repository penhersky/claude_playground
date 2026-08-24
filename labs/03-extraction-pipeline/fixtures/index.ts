/**
 * Synthetic source documents, deliberately varied.
 *
 * Each fixture isolates one failure the exam names. `expect` records what
 * *should* happen, so `pipeline.ts` can report whether the run got it right,
 * and so the offline tests can assert on the classifier without an API call.
 *
 * All content is invented. Do not replace it with real invoices.
 */

export interface Fixture {
  id: string;
  /** What this document is here to break. */
  purpose: string;
  /** The layout family, for the accuracy-by-document-type breakdown (Task 5.5). */
  docType: "tabular" | "narrative" | "receipt" | "email";
  text: string;
  expect: {
    /** Semantic validation should flag these, by code. */
    validationCodes: string[];
    /** Fields the source genuinely does not contain — must extract as null. */
    absentFields: string[];
    /** Whether a retry could fix what validation finds. */
    retryCanFix: boolean;
  };
}

export const FIXTURES: Fixture[] = [
  {
    id: "clean-tabular",
    purpose: "Baseline. Well-formed table, everything present and consistent.",
    docType: "tabular",
    text: `
NORTHWIND SUPPLY CO.
VAT: IE9834721K
Invoice #INV-2026-0412
Issued: 12 March 2026        Due: 11 April 2026
Terms: Net 30

Description                 Qty   Unit      Amount
---------------------------------------------------
Rolled steel bracket         12   $18.50    $222.00
Neoprene gasket, 40mm        30   $ 3.20    $ 96.00
Freight                       1   $45.00    $ 45.00
---------------------------------------------------
                                  TOTAL     $363.00
`.trim(),
    expect: { validationCodes: [], absentFields: [], retryCanFix: false },
  },

  {
    id: "sum-mismatch",
    purpose:
      "Line items do not sum to the printed total. Schema syntax is perfect; " +
      "the defect is semantic, which is exactly what strict schemas cannot catch.",
    docType: "tabular",
    text: `
HALCYON INSTRUMENTS LTD
Invoice HAL-88214
Date: 2026-04-02
Payment due on receipt

Item                        Qty   Unit       Amount
---------------------------------------------------
Calibration service           2   $340.00    $680.00
Replacement probe             1   $ 92.50    $ 92.50
Expedited handling            1   $ 30.00    $ 30.00
---------------------------------------------------
                                  TOTAL      $ 792.50
`.trim(),
    expect: {
      validationCodes: ["TOTAL_MISMATCH"],
      absentFields: [],
      // 680 + 92.50 + 30 = 802.50, printed 792.50. The model may have misread a
      // digit, so a retry with the discrepancy quoted back can plausibly fix it.
      retryCanFix: true,
    },
  },

  {
    id: "missing-tax-id",
    purpose:
      "A nullable field the document genuinely lacks. Tests that the model " +
      "returns null instead of fabricating a plausible VAT number.",
    docType: "receipt",
    text: `
      corner press coffee
      —————————————
      2026-05-19  14:02
      counter 3

      flat white x2          7.00
      almond croissant       4.25
      —————————————
      total                 11.25
      card ****4417   approved

      thanks! no receipts by email yet
`.trim(),
    expect: {
      validationCodes: [],
      // No VAT/tax id, no invoice number, no payment terms anywhere in the text.
      absentFields: ["vendorTaxId", "invoiceNumber"],
      // Retrying cannot conjure information that is not in the source.
      retryCanFix: false,
    },
  },

  {
    id: "narrative-prose",
    purpose:
      "No table at all — the amounts are embedded in sentences. Tests format " +
      "generalization, which few-shot examples are for (Task 4.2).",
    docType: "narrative",
    text: `
Dear Ms. Okafor,

Further to our engagement letter, please find our fee note for the quarter
ending 31 March 2026, reference FN/2026/Q1/338.

Our advisory retainer for the period amounts to four thousand two hundred
dollars ($4,200.00). In addition we incurred filing fees of $315.00 on your
behalf, and travel to the Cork site of $186.40, both of which are recharged at
cost. The total now due is therefore $4,701.40, payable within sixty days of
this notice.

Kind regards,
Mervyn Slate
Slate & Partners
Tax registration 4471-BB
`.trim(),
    expect: { validationCodes: [], absentFields: [], retryCanFix: false },
  },

  {
    id: "self-contradictory",
    purpose:
      "The document states two different totals. Neither is 'wrong' — the " +
      "source is inconsistent. Must set conflictDetected rather than silently " +
      "picking one (Task 4.4).",
    docType: "email",
    text: `
From: billing@meridianworks.example
Subject: Invoice MW-5150 — amended

Hi,

Attached is invoice MW-5150 dated 2026-06-08 for the June maintenance window.

  Scheduled maintenance, 8 hrs @ $145/hr ......... $1,160.00
  Out-of-hours surcharge ........................ $  220.00

The amount payable is $1,380.00.

Please note the summary line in our portal still shows $1,160.00 as we have not
yet pushed the amendment. The correct figure is the one above.

Terms: net 15.
`.trim(),
    expect: {
      validationCodes: ["SOURCE_CONFLICT"],
      absentFields: [],
      // The conflict is real and in the source. No retry resolves it; a human does.
      retryCanFix: false,
    },
  },

  {
    id: "no-total-printed",
    purpose:
      "Line items but no printed total. statedTotalUsd must be null while " +
      "calculatedTotalUsd is computed — the pair that makes the check possible.",
    docType: "tabular",
    text: `
RIDGELINE OUTFITTERS — PACKING SLIP
Order ORD-6001 · 14 Aug 2026

  1 x Ridgeline 45L backpack .......... $120.00
  1 x Rain cover, large ...............  $24.00
  2 x Compression strap ...............  $ 9.00 ea

(No invoice enclosed — billed separately to the account on file.)
`.trim(),
    expect: {
      validationCodes: [],
      absentFields: ["statedTotalUsd", "vendorTaxId"],
      retryCanFix: false,
    },
  },

  {
    id: "unlisted-category",
    purpose:
      'Not an invoice, receipt, PO, or credit note. Tests the "other" + detail ' +
      "escape hatch instead of forcing it into the nearest wrong bucket.",
    docType: "narrative",
    text: `
STATEMENT OF ACCOUNT
Trellis Logistics — account 88213-XQ
Period: 1 July – 31 July 2026

Opening balance                        $ 2,140.00
Invoices raised this period            $ 1,884.50
Payments received                     ($ 3,000.00)
Credit applied                        ($   124.00)
                                      -----------
Closing balance                        $   900.50

This is a statement, not a request for payment. Individual invoices are
itemized separately.
`.trim(),
    expect: { validationCodes: [], absentFields: ["invoiceNumber"], retryCanFix: false },
  },

  {
    id: "impossible-dates",
    purpose:
      "Due date precedes the issue date. A structural error the model can " +
      "correct once the contradiction is quoted back to it.",
    docType: "tabular",
    text: `
AURORA DISPLAYS
Invoice AUR-4417
Issue date: 2026-07-02
Payment due: 2026-06-02
Terms: Net 30

  Aurora 27" monitor, refurbished unit    1   $780.00   $780.00
                                              TOTAL     $780.00
`.trim(),
    expect: {
      validationCodes: ["DUE_BEFORE_ISSUE"],
      absentFields: ["vendorTaxId"],
      // Net 30 from 2026-07-02 is 2026-08-01; the model can derive the right
      // answer from information already in the document.
      retryCanFix: true,
    },
  },
];

export function fixtureById(id: string): Fixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}

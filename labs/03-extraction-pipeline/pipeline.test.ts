/**
 * Offline tests for lab 3.
 *
 * The whole pipeline's judgment — what counts as a semantic error, whether a
 * retry can help, who gets human review — is pure functions over plain data.
 * Everything below runs with no API key and no network.
 */

import { describe, expect, test } from "bun:test";
import { validate, sourceConflicts } from "./validate.ts";
import { auditNullFields, classify, fieldIsRecoverable, MAX_ATTEMPTS } from "./retry.ts";
import {
  accuracyByDocType,
  accuracyByField,
  CONFIDENCE_THRESHOLD,
  prioritize,
  route,
} from "./review-routing.ts";
import { submissionIntervalHours } from "./batch.ts";
import { FIXTURES, fixtureById } from "./fixtures/index.ts";
import type { Extraction } from "./schema.ts";

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    documentType: "invoice",
    documentTypeDetail: null,
    vendor: "Northwind Supply Co.",
    vendorTaxId: "IE9834721K",
    invoiceNumber: "INV-2026-0412",
    issueDate: "2026-03-12",
    dueDate: "2026-04-11",
    currency: "USD",
    lineItems: [
      { description: "Rolled steel bracket", quantity: 12, unitPriceUsd: 18.5, amountUsd: 222 },
      { description: "Neoprene gasket", quantity: 30, unitPriceUsd: 3.2, amountUsd: 96 },
      { description: "Freight", quantity: 1, unitPriceUsd: 45, amountUsd: 45 },
    ],
    statedTotalUsd: 363,
    calculatedTotalUsd: 363,
    paymentTerms: "net_30",
    conflictDetected: false,
    conflictNote: null,
    fieldConfidence: {
      vendor: 0.98,
      invoiceNumber: 0.97,
      issueDate: 0.95,
      lineItems: 0.93,
      statedTotalUsd: 0.99,
    },
    ...overrides,
  };
}

describe("semantic validation (Task 4.3, 4.4)", () => {
  test("a consistent extraction produces no issues", () => {
    expect(validate(extraction())).toEqual([]);
  });

  test("catches line items that do not sum to the stated total", () => {
    const issues = validate(
      extraction({ statedTotalUsd: 792.5, calculatedTotalUsd: 363 }),
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("TOTAL_MISMATCH");

    // The message must quote both numbers, or the retry has nothing to act on.
    const mismatch = issues.find((i) => i.code === "TOTAL_MISMATCH")!;
    expect(mismatch.message).toContain("792.50");
    expect(mismatch.message).toContain("363.00");
  });

  test("catches calculatedTotalUsd copied from statedTotalUsd", () => {
    // Both set to the printed total. The lines sum to 363, so the cross-check
    // that this field exists for has been destroyed.
    const issues = validate(extraction({ statedTotalUsd: 500, calculatedTotalUsd: 500 }));
    expect(issues.map((i) => i.code)).toContain("CALCULATED_TOTAL_COPIED");
  });

  test("catches per-line arithmetic errors", () => {
    const issues = validate(
      extraction({
        lineItems: [
          { description: "Widget", quantity: 3, unitPriceUsd: 10, amountUsd: 40 },
        ],
        statedTotalUsd: 40,
        calculatedTotalUsd: 40,
      }),
    );
    expect(issues.map((i) => i.code)).toContain("LINE_ARITHMETIC");
  });

  test("skips per-line arithmetic when no unit price was printed", () => {
    const issues = validate(
      extraction({
        lineItems: [
          { description: "Consulting", quantity: 1, unitPriceUsd: null, amountUsd: 4200 },
        ],
        statedTotalUsd: 4200,
        calculatedTotalUsd: 4200,
      }),
    );
    expect(issues.map((i) => i.code)).not.toContain("LINE_ARITHMETIC");
  });

  test("catches a due date before the issue date", () => {
    const issues = validate(extraction({ issueDate: "2026-07-02", dueDate: "2026-06-02" }));
    expect(issues.map((i) => i.code)).toContain("DUE_BEFORE_ISSUE");
  });

  test("catches non-ISO dates", () => {
    const issues = validate(extraction({ issueDate: "12 March 2026" }));
    expect(issues.map((i) => i.code)).toContain("BAD_DATE_FORMAT");
  });

  test("a flagged conflict without a note is itself an issue", () => {
    const issues = validate(extraction({ conflictDetected: true, conflictNote: null }));
    expect(issues.map((i) => i.code)).toContain("CONFLICT_UNDESCRIBED");
  });

  test('documentType "other" requires a detail string', () => {
    const issues = validate(extraction({ documentType: "other", documentTypeDetail: null }));
    expect(issues.map((i) => i.code)).toContain("MISSING_TYPE_DETAIL");

    const ok = validate(
      extraction({ documentType: "other", documentTypeDetail: "statement of account" }),
    );
    expect(ok.map((i) => i.code)).not.toContain("MISSING_TYPE_DETAIL");
  });

  test("a null stated total is not a mismatch", () => {
    // No total was printed. calculatedTotalUsd still has to be the line sum.
    expect(validate(extraction({ statedTotalUsd: null }))).toEqual([]);
  });

  test("sourceConflicts reports separately from validation failures", () => {
    const conflicted = extraction({
      conflictDetected: true,
      conflictNote: "Portal shows $1,160.00; letter says $1,380.00.",
    });
    expect(validate(conflicted)).toEqual([]);
    expect(sourceConflicts(conflicted).map((i) => i.code)).toEqual(["SOURCE_CONFLICT"]);
  });
});

describe("retry classification (Task 4.4)", () => {
  test("no issues means accept, not retry", () => {
    const verdict = classify([], 1);
    expect(verdict.retry).toBe(false);
    if (!verdict.retry) expect(verdict.route).toBe("accept");
  });

  test("recoverable issues retry", () => {
    const issues = validate(extraction({ statedTotalUsd: 400 }));
    expect(classify(issues, 1).retry).toBe(true);
  });

  test("a source conflict never retries — it routes to a human", () => {
    // The information the retry would need does not exist: the document
    // genuinely says two things.
    const verdict = classify(sourceConflicts(extraction({ conflictDetected: true })), 1);
    expect(verdict.retry).toBe(false);
    if (!verdict.retry) expect(verdict.route).toBe("human_review");
  });

  test("stops retrying at the attempt ceiling", () => {
    const issues = validate(extraction({ statedTotalUsd: 400 }));
    const verdict = classify(issues, MAX_ATTEMPTS);
    expect(verdict.retry).toBe(false);
    if (!verdict.retry) expect(verdict.route).toBe("human_review");
  });

  test("mixed recoverable and unrecoverable does not retry", () => {
    const mixed = [
      ...validate(extraction({ statedTotalUsd: 400 })),
      ...sourceConflicts(extraction({ conflictDetected: true })),
    ];
    expect(classify(mixed, 1).retry).toBe(false);
  });
});

describe("null field audit — is the information even there?", () => {
  test("a receipt with no VAT line makes vendorTaxId unrecoverable", () => {
    const receipt = fixtureById("missing-tax-id")!;
    expect(fieldIsRecoverable(receipt.text, "vendorTaxId")).toBe(false);
    expect(fieldIsRecoverable(receipt.text, "statedTotalUsd")).toBe(true);
  });

  test("an invoice that prints a VAT number makes it recoverable", () => {
    const invoice = fixtureById("clean-tabular")!;
    expect(fieldIsRecoverable(invoice.text, "vendorTaxId")).toBe(true);
  });

  test("auditNullFields separates correct nulls from misses", () => {
    const receipt = fixtureById("missing-tax-id")!;
    const audit = auditNullFields(
      receipt.text,
      extraction({ vendorTaxId: null, invoiceNumber: null, statedTotalUsd: null }),
    );

    const taxId = audit.find((a) => a.field === "vendorTaxId")!;
    const total = audit.find((a) => a.field === "statedTotalUsd")!;

    expect(taxId.recoverable).toBe(false); // correctly null
    expect(total.recoverable).toBe(true); // the document prints a total — a miss
  });
});

describe("review routing (Task 5.5)", () => {
  test("a clean high-confidence extraction is not reviewed", () => {
    const decision = route({
      documentId: "clean",
      extraction: extraction(),
      issues: [],
      recoverableNulls: [],
    });
    expect(decision.needsReview).toBe(false);
  });

  test("a low-confidence field routes to review", () => {
    const decision = route({
      documentId: "shaky",
      extraction: extraction({
        fieldConfidence: {
          vendor: 0.98,
          invoiceNumber: 0.4,
          issueDate: 0.9,
          lineItems: 0.9,
          statedTotalUsd: 0.9,
        },
      }),
      issues: [],
      recoverableNulls: [],
    });

    expect(decision.needsReview).toBe(true);
    expect(decision.reasons).toContain("low_confidence");
    expect(decision.lowestField).toEqual({ field: "invoiceNumber", confidence: 0.4 });
  });

  test("a source conflict outranks a merely low-confidence document", () => {
    const conflicted = route({
      documentId: "conflict",
      extraction: extraction({ conflictDetected: true, conflictNote: "two totals" }),
      issues: [],
      recoverableNulls: [],
    });
    const shaky = route({
      documentId: "shaky",
      extraction: extraction({
        fieldConfidence: {
          vendor: 0.7,
          invoiceNumber: 0.7,
          issueDate: 0.7,
          lineItems: 0.7,
          statedTotalUsd: 0.7,
        },
      }),
      issues: [],
      recoverableNulls: [],
    });

    expect(conflicted.priority).toBeGreaterThan(shaky.priority);
    expect(prioritize([shaky, conflicted])[0]!.documentId).toBe("conflict");
  });

  test("prioritize drops documents that need no review", () => {
    const clean = route({
      documentId: "clean",
      extraction: extraction(),
      issues: [],
      recoverableNulls: [],
    });
    expect(prioritize([clean])).toHaveLength(0);
  });
});

describe("segment accuracy — the aggregate hides the failure (Task 5.5)", () => {
  test("reports the worst segment, not just the overall number", () => {
    // 90% overall, but receipts are at 25%. Automating on "90%" ships that.
    const results = [
      ...Array.from({ length: 16 }, () => ({ docType: "tabular", passed: true })),
      ...Array.from({ length: 3 }, () => ({ docType: "receipt", passed: false })),
      { docType: "receipt", passed: true },
    ];

    const report = accuracyByDocType(results);
    expect(report.overall).toBeCloseTo(0.85, 2);
    expect(report.worst?.segment).toBe("receipt");
    expect(report.worst?.accuracy).toBeCloseTo(0.25, 2);
  });

  test("field accuracy sorts worst-first", () => {
    const report = accuracyByField([
      extraction({
        fieldConfidence: {
          vendor: 0.99,
          invoiceNumber: 0.3,
          issueDate: 0.99,
          lineItems: 0.99,
          statedTotalUsd: 0.99,
        },
      }),
    ]);
    expect(report[0]!.segment).toBe("invoiceNumber");
    expect(report[0]!.accuracy).toBe(0);
  });

  test("the confidence threshold is a tunable, not a constant", () => {
    // Documented as a starting point to calibrate on labeled data. Asserted so
    // a change is a deliberate edit rather than a silent drift.
    expect(CONFIDENCE_THRESHOLD).toBe(0.75);
  });
});

describe("batch SLA arithmetic (Task 4.5)", () => {
  test("a 30h SLA against a 24h window allows ~4h submission intervals", () => {
    expect(submissionIntervalHours(30)).toBe(4);
  });

  test("an SLA at or below the batch window is impossible", () => {
    expect(() => submissionIntervalHours(24)).toThrow(/cannot be met/);
    expect(() => submissionIntervalHours(20)).toThrow(/synchronous/);
  });
});

describe("fixtures", () => {
  test("every fixture declares what it is meant to provoke", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.purpose.length).toBeGreaterThan(20);
      expect(fixture.docType).toBeTruthy();
    }
  });

  test("the corpus covers all four layout families", () => {
    const types = new Set(FIXTURES.map((f) => f.docType));
    expect([...types].sort()).toEqual(["email", "narrative", "receipt", "tabular"]);
  });

  test("at least one fixture is unfixable by retry", () => {
    expect(FIXTURES.some((f) => !f.expect.retryCanFix && f.expect.validationCodes.length > 0)).toBe(
      true,
    );
  });
});

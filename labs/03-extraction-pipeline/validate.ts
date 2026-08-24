/**
 * Semantic validation — Task 4.4.
 *
 * Strict schemas and `tool_use` guarantee the JSON parses and matches the
 * shape. They guarantee nothing about whether the numbers are *right*. Every
 * check here is one a schema cannot express:
 *
 *   - line items that don't sum to the printed total
 *   - a line whose amount doesn't equal quantity × unit price
 *   - a due date before the issue date
 *   - a value in the wrong field (`calculatedTotalUsd` copied from `statedTotalUsd`)
 *   - a self-contradictory source the model flagged but didn't describe
 *
 * Pure functions throughout, so `bun test` covers them with no API key.
 */

import type { Extraction } from "./schema.ts";

export type ValidationCode =
  | "TOTAL_MISMATCH"
  | "LINE_ARITHMETIC"
  | "DUE_BEFORE_ISSUE"
  | "CALCULATED_TOTAL_COPIED"
  | "SOURCE_CONFLICT"
  | "CONFLICT_UNDESCRIBED"
  | "MISSING_TYPE_DETAIL"
  | "BAD_DATE_FORMAT";

export interface ValidationIssue {
  code: ValidationCode;
  /** Written for the model to act on, quoting both sides of the discrepancy. */
  message: string;
  field: string;
}

/** Currency comparison tolerance, to absorb float representation noise. */
const EPSILON = 0.005;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validate(extraction: Extraction): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const lineSum = round2(
    extraction.lineItems.reduce((total, item) => total + item.amountUsd, 0),
  );

  // 1. calculatedTotalUsd must be what it claims: the sum of the lines.
  //    A model under pressure to satisfy the schema will sometimes copy
  //    statedTotalUsd here, which destroys the cross-check the field exists for.
  if (Math.abs(extraction.calculatedTotalUsd - lineSum) > EPSILON) {
    issues.push({
      code: "CALCULATED_TOTAL_COPIED",
      field: "calculatedTotalUsd",
      message:
        `calculatedTotalUsd is ${fmt(extraction.calculatedTotalUsd)} but the line items ` +
        `sum to ${fmt(lineSum)}. This field must be YOUR sum of lineItems[].amountUsd, ` +
        "not the total printed on the document.",
    });
  }

  // 2. The actual cross-check: does the document's own total match its lines?
  if (extraction.statedTotalUsd !== null) {
    const delta = round2(Math.abs(extraction.statedTotalUsd - lineSum));
    if (delta > EPSILON) {
      issues.push({
        code: "TOTAL_MISMATCH",
        field: "statedTotalUsd",
        message:
          `The document states a total of ${fmt(extraction.statedTotalUsd)}, but the ` +
          `line items you extracted sum to ${fmt(lineSum)} — a difference of ${fmt(delta)}. ` +
          "Re-read the line amounts; if they are correct as extracted, the document " +
          "itself is inconsistent, so set conflictDetected and explain in conflictNote.",
      });
    }
  }

  // 3. Per-line arithmetic. Only checkable when a unit price was printed.
  extraction.lineItems.forEach((item, index) => {
    if (item.unitPriceUsd === null) return;
    const expected = round2(item.quantity * item.unitPriceUsd);
    if (Math.abs(expected - item.amountUsd) > EPSILON) {
      issues.push({
        code: "LINE_ARITHMETIC",
        field: `lineItems[${index}]`,
        message:
          `Line ${index + 1} ("${item.description}"): ${item.quantity} × ` +
          `${fmt(item.unitPriceUsd)} = ${fmt(expected)}, but amountUsd is ` +
          `${fmt(item.amountUsd)}. One of the three numbers was misread.`,
      });
    }
  });

  // 4. Dates.
  for (const [field, value] of [
    ["issueDate", extraction.issueDate],
    ["dueDate", extraction.dueDate],
  ] as const) {
    if (value !== null && !ISO_DATE.test(value)) {
      issues.push({
        code: "BAD_DATE_FORMAT",
        field,
        message: `${field} is "${value}". Normalize every date to YYYY-MM-DD.`,
      });
    }
  }

  if (
    extraction.issueDate !== null &&
    extraction.dueDate !== null &&
    ISO_DATE.test(extraction.issueDate) &&
    ISO_DATE.test(extraction.dueDate) &&
    extraction.dueDate < extraction.issueDate
  ) {
    issues.push({
      code: "DUE_BEFORE_ISSUE",
      field: "dueDate",
      message:
        `dueDate ${extraction.dueDate} precedes issueDate ${extraction.issueDate}. ` +
        "If the document prints both, set conflictDetected. If the due date was " +
        "inferred from payment terms, recompute it from the issue date.",
    });
  }

  // 5. A flagged conflict with no description is useless downstream — the
  //    reviewer gets a boolean and no way to act on it.
  if (extraction.conflictDetected && !extraction.conflictNote?.trim()) {
    issues.push({
      code: "CONFLICT_UNDESCRIBED",
      field: "conflictNote",
      message:
        "conflictDetected is true but conflictNote is empty. State what contradicts " +
        "what, quoting both values as they appear in the document.",
    });
  }

  // 6. The "other" escape hatch only works if the detail comes with it.
  if (extraction.documentType === "other" && !extraction.documentTypeDetail?.trim()) {
    issues.push({
      code: "MISSING_TYPE_DETAIL",
      field: "documentTypeDetail",
      message:
        'documentType is "other" but documentTypeDetail is empty. Name the category, ' +
        'e.g. "statement of account".',
    });
  }

  return issues;
}

/**
 * A source-level conflict the model correctly identified.
 *
 * Reported separately from validation failures because it is **not** a defect
 * in the extraction. The document contradicts itself; the extraction faithfully
 * says so. Retrying cannot help — this routes to a human.
 */
export function sourceConflicts(extraction: Extraction): ValidationIssue[] {
  if (!extraction.conflictDetected) return [];
  return [
    {
      code: "SOURCE_CONFLICT",
      field: "conflictNote",
      message: extraction.conflictNote ?? "Source conflict flagged without detail.",
    },
  ];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return `$${value.toFixed(2)}`;
}

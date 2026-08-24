/**
 * Retry classification and the feedback loop — Task 4.4.
 *
 * The judgment the exam tests is *when not to retry*. A retry with the error
 * quoted back fixes format and structural mistakes, because the information is
 * in the document and the model misread it. It cannot fix a field that isn't
 * in the document at all — retrying that burns tokens and, worse, pressures
 * the model into inventing something to make the error go away.
 *
 * So the classification below is by *where the missing information lives*, not
 * by how the failure looked.
 */

import type { ValidationCode, ValidationIssue } from "./validate.ts";
import type { Extraction } from "./schema.ts";

export type RetryVerdict =
  | { retry: true; reason: string }
  | { retry: false; reason: string; route: "human_review" | "accept" };

/**
 * Codes a retry can plausibly resolve: everything the document already
 * contains and the model got wrong on the way out.
 */
const RECOVERABLE: ReadonlySet<ValidationCode> = new Set<ValidationCode>([
  "TOTAL_MISMATCH",
  "LINE_ARITHMETIC",
  "DUE_BEFORE_ISSUE",
  "CALCULATED_TOTAL_COPIED",
  "BAD_DATE_FORMAT",
  "CONFLICT_UNDESCRIBED",
  "MISSING_TYPE_DETAIL",
]);

/**
 * Codes no retry resolves, because the problem is in the source.
 * `SOURCE_CONFLICT` is the canonical case: the document says two things.
 */
const UNRECOVERABLE: ReadonlySet<ValidationCode> = new Set<ValidationCode>(["SOURCE_CONFLICT"]);

export const MAX_ATTEMPTS = 3;

export function classify(issues: ValidationIssue[], attempt: number): RetryVerdict {
  if (issues.length === 0) {
    return { retry: false, reason: "Extraction passed validation.", route: "accept" };
  }

  const unrecoverable = issues.filter((i) => UNRECOVERABLE.has(i.code));
  if (unrecoverable.length > 0) {
    return {
      retry: false,
      route: "human_review",
      reason:
        "The source document is internally inconsistent. No re-extraction resolves a " +
        `contradiction that is in the input: ${unrecoverable.map((i) => i.code).join(", ")}.`,
    };
  }

  if (attempt >= MAX_ATTEMPTS) {
    return {
      retry: false,
      route: "human_review",
      reason:
        `Still failing after ${attempt} attempts on ${issues.map((i) => i.code).join(", ")}. ` +
        "Repeated failure on recoverable codes usually means the document is harder to " +
        "read than the classifier assumed — send it to a human rather than looping.",
    };
  }

  const recoverable = issues.filter((i) => RECOVERABLE.has(i.code));
  if (recoverable.length === issues.length) {
    return {
      retry: true,
      reason:
        `All ${issues.length} issue(s) are recoverable from the document as supplied: ` +
        `${recoverable.map((i) => i.code).join(", ")}.`,
    };
  }

  return {
    retry: false,
    route: "human_review",
    reason: "Mixed recoverable and unrecoverable issues; a partial retry would mask the rest.",
  };
}

/**
 * Build the retry turn.
 *
 * Three things go back, and all three matter: the **original document** (the
 * model no longer has it), the **failed extraction** (so it can see what it
 * produced rather than starting blind), and the **specific validation errors**
 * (not "that was wrong" — the actual discrepancy with both numbers quoted).
 *
 * Also states the null rule again. The strongest pull toward fabrication is a
 * retry prompt that reads as "you failed, try harder".
 */
export function buildRetryPrompt(input: {
  documentText: string;
  failedExtraction: Extraction;
  issues: ValidationIssue[];
  attempt: number;
}): string {
  return [
    `Your previous extraction (attempt ${input.attempt}) failed validation.`,
    "",
    "SOURCE DOCUMENT",
    "---",
    input.documentText,
    "---",
    "",
    "YOUR PREVIOUS EXTRACTION",
    "---",
    JSON.stringify(input.failedExtraction, null, 2),
    "---",
    "",
    "VALIDATION ERRORS",
    ...input.issues.map((issue, i) => `${i + 1}. [${issue.code}] ${issue.field}: ${issue.message}`),
    "",
    "Re-extract the document, correcting these errors specifically.",
    "",
    "Do not invent values to make an error disappear. If the document does not contain",
    "a field, it stays null — that is a correct answer, not a failure. If the document",
    "genuinely contradicts itself, keep both values, set conflictDetected to true, and",
    "quote both in conflictNote.",
  ].join("\n");
}

/**
 * Whether a field could be recovered by re-reading the document.
 *
 * Scans the source for the markers a field would appear under. Crude on
 * purpose — the point is that "can a retry help?" is answerable by looking at
 * the *input*, not by re-running the model and hoping.
 */
const FIELD_MARKERS: Record<string, RegExp> = {
  vendorTaxId: /\b(vat|tax\s*(id|registration|no)|ein|abn)\b/i,
  invoiceNumber: /\b(invoice|inv|ref(erence)?|fee note|bill)\s*#?\s*[:\-]?\s*[A-Z0-9/-]{3,}/i,
  issueDate: /\b(issued?|date[d]?|dated)\b/i,
  dueDate: /\b(due|payable (by|within)|net\s*\d+)\b/i,
  statedTotalUsd: /\b(total|amount (due|now due|payable)|balance)\b/i,
  paymentTerms: /\b(terms|net\s*\d+|due on receipt|payable within)\b/i,
};

export function fieldIsRecoverable(documentText: string, field: string): boolean {
  const marker = FIELD_MARKERS[field];
  if (!marker) return true; // Unknown field: don't claim it's absent.
  return marker.test(documentText);
}

/**
 * Split null fields into "correctly null" and "worth another look".
 *
 * A null whose marker never appears in the source is the model doing the right
 * thing. A null whose marker *is* present is a miss a retry can fix. Without
 * this split you either retry every null (expensive, and it invites
 * fabrication) or accept every null (silently lossy).
 */
export function auditNullFields(
  documentText: string,
  extraction: Extraction,
): { field: string; recoverable: boolean }[] {
  const nullable = [
    "vendorTaxId",
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "statedTotalUsd",
  ] as const;

  return nullable
    .filter((field) => extraction[field] === null)
    .map((field) => ({ field, recoverable: fieldIsRecoverable(documentText, field) }));
}

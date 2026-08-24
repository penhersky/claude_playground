/**
 * Extraction schema — Task 4.3.
 *
 * Four design decisions here are the exam objective, not incidental:
 *
 * 1. **Nullable, not required, for anything the source may omit.** A field
 *    marked `required` that the document doesn't contain leaves the model with
 *    two options: fabricate a value or fail the schema. It fabricates. Making
 *    it nullable gives it a third, correct option.
 *
 * 2. **An enum with `"other"` plus a detail string.** A closed enum forces
 *    every unanticipated case into the nearest wrong bucket. `"other"` +
 *    `documentTypeDetail` keeps the category extensible without reopening the
 *    schema.
 *
 * 3. **An `"unclear"` member for genuine ambiguity.** Distinct from `"other"`:
 *    `"other"` means "a real category I don't have a name for", `"unclear"`
 *    means "the document doesn't say". Collapsing them loses the signal that
 *    routes a document to human review.
 *
 * 4. **`calculatedTotalUsd` alongside `statedTotalUsd`.** Strict schemas
 *    eliminate JSON *syntax* errors. They do nothing about *semantic* ones —
 *    line items that don't sum, values in the wrong field. Extracting both
 *    numbers lets `validate.ts` catch the mismatch instead of trusting it.
 */

import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string().describe("What was billed, as written on the document."),
  quantity: z.number().describe("Units billed. Use 1 when the document doesn't say."),
  unitPriceUsd: z
    .number()
    .nullable()
    .describe("Price per unit, or null when the document only shows a line total."),
  amountUsd: z.number().describe("Line total as printed on the document."),
});

export const DOCUMENT_TYPES = [
  "invoice",
  "receipt",
  "purchase_order",
  "credit_note",
  "other",
  "unclear",
] as const;

export const PAYMENT_TERMS = [
  "due_on_receipt",
  "net_15",
  "net_30",
  "net_60",
  "unclear",
] as const;

export const ExtractionSchema = z.object({
  documentType: z
    .enum(DOCUMENT_TYPES)
    .describe(
      'Kind of document. Use "other" for a real category not listed and fill in ' +
        'documentTypeDetail. Use "unclear" when the document does not identify itself.',
    ),
  documentTypeDetail: z
    .string()
    .nullable()
    .describe('Required when documentType is "other". Null otherwise.'),

  vendor: z.string().nullable().describe("Issuing organization. Null if not stated."),
  vendorTaxId: z
    .string()
    .nullable()
    .describe("Tax or VAT identifier. Frequently absent — return null, never invent one."),

  invoiceNumber: z.string().nullable().describe("Document reference number, or null."),
  issueDate: z
    .string()
    .nullable()
    .describe("Issue date normalized to YYYY-MM-DD. Null if the document has no date."),
  dueDate: z.string().nullable().describe("Due date as YYYY-MM-DD, or null."),

  currency: z
    .string()
    .describe('ISO 4217 code. Use "USD" when a bare $ appears with no other indication.'),

  lineItems: z.array(LineItemSchema).describe("Every billed line, in document order."),

  statedTotalUsd: z
    .number()
    .nullable()
    .describe("The total as PRINTED on the document. Null if no total is printed."),
  calculatedTotalUsd: z
    .number()
    .describe("The sum of lineItems[].amountUsd, computed by you. Never copy statedTotalUsd here."),

  paymentTerms: z
    .enum(PAYMENT_TERMS)
    .describe('Payment terms. "unclear" when the document does not state them.'),

  conflictDetected: z
    .boolean()
    .describe(
      "True when the document contradicts itself — two different totals, a due date " +
        "before the issue date, a quantity that does not match its line total.",
    ),
  conflictNote: z
    .string()
    .nullable()
    .describe("What the contradiction is, quoting both conflicting values. Null if none."),

  fieldConfidence: z
    .object({
      vendor: z.number().min(0).max(1),
      invoiceNumber: z.number().min(0).max(1),
      issueDate: z.number().min(0).max(1),
      lineItems: z.number().min(0).max(1),
      statedTotalUsd: z.number().min(0).max(1),
    })
    .describe(
      "Per-field confidence 0–1. Score what the DOCUMENT supports, not how sure you " +
        "feel: a field you had to infer from layout scores low even when you believe it.",
    ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * The same schema as raw JSON Schema, for the `strict: true` tool-use path.
 *
 * `strict` requires `additionalProperties: false` and an explicit `required`
 * array. Kept deliberately smaller than the Zod version: `extract.ts` uses it
 * to demonstrate `tool_choice` forcing a specific tool before enrichment
 * (Task 2.3), where you want the minimum viable payload, not the full record.
 */
export const METADATA_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    documentType: { type: "string", enum: [...DOCUMENT_TYPES] },
    vendor: { type: ["string", "null"] },
    invoiceNumber: { type: ["string", "null"] },
    issueDate: {
      type: ["string", "null"],
      description: "YYYY-MM-DD, or null when the document has no date.",
    },
  },
  required: ["documentType", "vendor", "invoiceNumber", "issueDate"],
  additionalProperties: false,
};

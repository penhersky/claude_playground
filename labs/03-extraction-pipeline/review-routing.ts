/**
 * Human review routing and confidence calibration — Task 5.5.
 *
 * The failure this prevents: reporting 97% overall accuracy, automating on the
 * strength of it, and discovering later that receipts were at 71% while
 * tabular invoices carried the average. Aggregate metrics hide segment
 * failures, so every number here is reported **by document type and by field**.
 *
 * All pure functions — reviewer capacity math should not need an API key.
 */

import type { Extraction } from "./schema.ts";
import type { ValidationIssue } from "./validate.ts";

export type ReviewReason =
  | "low_confidence"
  | "source_conflict"
  | "validation_failed"
  | "unrecoverable_null"
  | "sampled";

export interface RoutingDecision {
  documentId: string;
  needsReview: boolean;
  reasons: ReviewReason[];
  /** Higher first, so limited reviewer capacity goes to the worst cases. */
  priority: number;
  lowestField: { field: string; confidence: number } | null;
}

/**
 * Below this, a field goes to review.
 *
 * Calibrate it on a labeled validation set rather than picking it by feel: the
 * threshold that catches most errors at acceptable review volume is a property
 * of your documents and your model, not a universal constant. 0.75 is a
 * starting point to move, not a default to keep.
 */
export const CONFIDENCE_THRESHOLD = 0.75;

export function route(input: {
  documentId: string;
  extraction: Extraction;
  issues: ValidationIssue[];
  /** Nulls a retry could have recovered — from `auditNullFields`. */
  recoverableNulls: string[];
  /** True when this document was drawn for stratified sampling. */
  sampled?: boolean;
}): RoutingDecision {
  const reasons: ReviewReason[] = [];
  let priority = 0;

  const confidences = Object.entries(input.extraction.fieldConfidence) as [string, number][];
  const lowest = confidences.reduce<{ field: string; confidence: number } | null>(
    (min, [field, confidence]) =>
      min === null || confidence < min.confidence ? { field, confidence } : min,
    null,
  );

  if (lowest && lowest.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push("low_confidence");
    // Scale with distance below the threshold: 0.2 confidence outranks 0.74.
    priority += Math.round((CONFIDENCE_THRESHOLD - lowest.confidence) * 100);
  }

  if (input.extraction.conflictDetected) {
    // The document disagrees with itself. Highest priority: no amount of
    // re-extraction settles it, and quietly picking a side loses money.
    reasons.push("source_conflict");
    priority += 60;
  }

  if (input.issues.length > 0) {
    reasons.push("validation_failed");
    priority += 40 + input.issues.length * 5;
  }

  if (input.recoverableNulls.length > 0) {
    // The marker is in the document but the field came back null — a miss,
    // not a correct absence.
    reasons.push("unrecoverable_null");
    priority += 20 * input.recoverableNulls.length;
  }

  if (input.sampled) {
    // Stratified sampling of *high-confidence* extractions. Without it you
    // only ever measure the errors your threshold already catches, and never
    // discover a new error pattern that scores confidently.
    reasons.push("sampled");
  }

  return {
    documentId: input.documentId,
    needsReview: reasons.length > 0,
    reasons,
    priority,
    lowestField: lowest,
  };
}

/** Sort a batch so limited reviewer capacity goes to the worst cases first. */
export function prioritize(decisions: RoutingDecision[]): RoutingDecision[] {
  return [...decisions].filter((d) => d.needsReview).sort((a, b) => b.priority - a.priority);
}

/**
 * Draw a stratified sample of extractions that passed automatically.
 *
 * Deterministic given a seed, so a lab run is reproducible. Stratifying by
 * document type is the point: a uniform random sample over a corpus that is
 * 80% invoices will mostly re-check invoices and rarely surface the receipt
 * failure mode.
 */
export function stratifiedSample<T extends { documentId: string; docType: string }>(
  passed: T[],
  ratePerStratum: number,
  seed = 1,
): T[] {
  const strata = new Map<string, T[]>();
  for (const item of passed) {
    const bucket = strata.get(item.docType) ?? [];
    bucket.push(item);
    strata.set(item.docType, bucket);
  }

  const sample: T[] = [];
  let counter = seed;
  for (const [, items] of [...strata].sort(([a], [b]) => a.localeCompare(b))) {
    const take = Math.max(1, Math.round(items.length * ratePerStratum));
    for (let i = 0; i < take && i < items.length; i++) {
      counter = (counter * 1103515245 + 12345) % 2147483648;
      sample.push(items[counter % items.length]!);
    }
  }
  return dedupe(sample);
}

function dedupe<T extends { documentId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.documentId)) return false;
    seen.add(item.documentId);
    return true;
  });
}

export interface SegmentAccuracy {
  segment: string;
  total: number;
  passed: number;
  accuracy: number;
}

/**
 * Accuracy per segment, never as one aggregate.
 *
 * Task 5.5's whole content: validate by document type **and** by field before
 * reducing human review. `overall` is included only so a run can show how far
 * the aggregate is from the worst segment.
 */
export function accuracyByDocType(
  results: { docType: string; passed: boolean }[],
): { segments: SegmentAccuracy[]; overall: number; worst: SegmentAccuracy | null } {
  const buckets = new Map<string, { total: number; passed: number }>();
  for (const result of results) {
    const bucket = buckets.get(result.docType) ?? { total: 0, passed: 0 };
    bucket.total++;
    if (result.passed) bucket.passed++;
    buckets.set(result.docType, bucket);
  }

  const segments = [...buckets]
    .map(([segment, { total, passed }]) => ({
      segment,
      total,
      passed,
      accuracy: total === 0 ? 0 : passed / total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  return {
    segments,
    overall: total === 0 ? 0 : passed / total,
    worst: segments[0] ?? null,
  };
}

/** The same breakdown, per field, from the confidence scores. */
export function accuracyByField(
  extractions: Extraction[],
  threshold = CONFIDENCE_THRESHOLD,
): SegmentAccuracy[] {
  const fields = new Map<string, { total: number; passed: number }>();

  for (const extraction of extractions) {
    for (const [field, confidence] of Object.entries(extraction.fieldConfidence)) {
      const bucket = fields.get(field) ?? { total: 0, passed: 0 };
      bucket.total++;
      if (confidence >= threshold) bucket.passed++;
      fields.set(field, bucket);
    }
  }

  return [...fields]
    .map(([segment, { total, passed }]) => ({
      segment,
      total,
      passed,
      accuracy: total === 0 ? 0 : passed / total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

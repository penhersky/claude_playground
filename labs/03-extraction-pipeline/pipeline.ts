/**
 * Lab 3 — extraction, validation, retry, routing.
 *
 *   bun run lab3
 *
 * Runs every fixture through the full loop and reports where the run agreed
 * with what each fixture was designed to provoke.
 */

import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "../../src/config/env.ts";
import { startRunLog } from "../../src/runtime/log.ts";
import { extract, extractMetadataForced, extractViaAnyTool } from "./extract.ts";
import { FIXTURES, type Fixture } from "./fixtures/index.ts";
import { auditNullFields, buildRetryPrompt, classify, MAX_ATTEMPTS } from "./retry.ts";
import {
  accuracyByDocType,
  accuracyByField,
  CONFIDENCE_THRESHOLD,
  prioritize,
  route,
  type RoutingDecision,
} from "./review-routing.ts";
import { sourceConflicts, validate, type ValidationIssue } from "./validate.ts";
import type { Extraction } from "./schema.ts";

interface Outcome {
  fixture: Fixture;
  extraction: Extraction;
  issues: ValidationIssue[];
  attempts: number;
  routing: RoutingDecision;
  passed: boolean;
  cacheReadTokens: number;
}

async function processFixture(client: Anthropic, fixture: Fixture): Promise<Outcome> {
  let attempt = 1;
  let result = await extract(client, fixture.text);
  let extraction = result.extraction;
  let issues = [...validate(extraction), ...sourceConflicts(extraction)];
  let cacheReadTokens = result.cacheReadTokens;

  // The retry loop. It stops for one of three reasons, and which one matters:
  // validation passed, the issues aren't recoverable from this document, or
  // we've spent enough attempts that repeated failure is itself the signal.
  while (attempt < MAX_ATTEMPTS) {
    const verdict = classify(issues, attempt);
    if (!verdict.retry) {
      console.log(`    stop: ${verdict.reason}`);
      break;
    }

    console.log(`    retry ${attempt + 1}: ${verdict.reason}`);
    attempt++;

    result = await extract(
      client,
      fixture.text,
      buildRetryPrompt({
        documentText: fixture.text,
        failedExtraction: extraction,
        issues,
        attempt: attempt - 1,
      }),
    );
    extraction = result.extraction;
    issues = [...validate(extraction), ...sourceConflicts(extraction)];
    cacheReadTokens += result.cacheReadTokens;
  }

  const nullAudit = auditNullFields(fixture.text, extraction);
  const recoverableNulls = nullAudit.filter((n) => n.recoverable).map((n) => n.field);

  const routing = route({
    documentId: fixture.id,
    extraction,
    issues,
    recoverableNulls,
  });

  return {
    fixture,
    extraction,
    issues,
    attempts: attempt,
    routing,
    passed: issues.length === 0,
    cacheReadTokens,
  };
}

async function main() {
  const log = startRunLog({ dir: import.meta.dir, label: "pipeline" });
  requireApiKey();
  const client = new Anthropic();
  const outcomes: Outcome[] = [];

  console.log(`Processing ${FIXTURES.length} fixtures\n`);

  for (const fixture of FIXTURES) {
    console.log(`── ${fixture.id} (${fixture.docType})`);
    console.log(`   ${fixture.purpose}`);

    const outcome = await processFixture(client, fixture);
    outcomes.push(outcome);

    const codes: string[] = outcome.issues.map((i) => i.code);
    const expected = fixture.expect.validationCodes;
    const matched =
      expected.every((c) => codes.includes(c)) && codes.length === expected.length;

    console.log(
      `   validation: ${codes.length ? codes.join(", ") : "clean"}` +
        `  (expected ${expected.length ? expected.join(", ") : "clean"})` +
        `  ${matched ? "✓" : "✗"}`,
    );

    // Did the model return null where the source genuinely lacks the field,
    // rather than inventing something plausible?
    const nulls = auditNullFields(fixture.text, outcome.extraction);
    const correctlyNull = fixture.expect.absentFields.filter((f) =>
      nulls.some((n) => n.field === f && !n.recoverable),
    );
    if (fixture.expect.absentFields.length > 0) {
      console.log(
        `   absent fields returned null: ${correctlyNull.length}/${fixture.expect.absentFields.length}` +
          ` (${fixture.expect.absentFields.join(", ")})` +
          `  ${correctlyNull.length === fixture.expect.absentFields.length ? "✓" : "✗ fabricated"}`,
      );
    }

    console.log(
      `   attempts: ${outcome.attempts}` +
        `  review: ${outcome.routing.needsReview ? outcome.routing.reasons.join("+") : "no"}` +
        `  cache hits: ${outcome.cacheReadTokens} tok`,
    );
    console.log();

    log.record({
      id: fixture.id,
      docType: fixture.docType,
      attempts: outcome.attempts,
      codes,
      expectedCodes: expected,
      matched,
      passed: outcome.passed,
      absentFieldsExpected: fixture.expect.absentFields,
      absentFieldsCorrect: correctlyNull.length,
      routing: outcome.routing,
      cacheReadTokens: outcome.cacheReadTokens,
    });
  }

  // ── Segment accuracy (Task 5.5) ─────────────────────────────────────────
  const byType = accuracyByDocType(
    outcomes.map((o) => ({ docType: o.fixture.docType, passed: o.passed })),
  );

  console.log("═".repeat(72));
  console.log(`Overall accuracy: ${pct(byType.overall)}`);
  console.log("\nBy document type — the number that actually matters:");
  for (const segment of byType.segments) {
    console.log(
      `  ${segment.segment.padEnd(12)} ${pct(segment.accuracy).padStart(6)}  (${segment.passed}/${segment.total})`,
    );
  }
  if (byType.worst && byType.worst.accuracy < byType.overall - 0.15) {
    console.log(
      `\n  ⚠ "${byType.worst.segment}" is ${pct(byType.overall - byType.worst.accuracy)} below ` +
        "the aggregate. This is the segment failure an overall metric hides —\n" +
        "    do not reduce human review on the strength of the headline number.",
    );
  }

  console.log("\nBy field confidence:");
  const byField = accuracyByField(outcomes.map((o) => o.extraction));
  for (const segment of byField) {
    console.log(
      `  ${segment.segment.padEnd(18)} ${pct(segment.accuracy).padStart(6)}  (${segment.passed}/${segment.total} above threshold)`,
    );
  }

  // ── Review queue ────────────────────────────────────────────────────────
  const queue = prioritize(outcomes.map((o) => o.routing));
  console.log(`\nHuman review queue (${queue.length} of ${outcomes.length}), worst first:`);
  for (const item of queue) {
    console.log(
      `  ${String(item.priority).padStart(4)}  ${item.documentId.padEnd(22)} ${item.reasons.join(", ")}` +
        (item.lowestField
          ? `  [lowest: ${item.lowestField.field}=${item.lowestField.confidence.toFixed(2)}]`
          : ""),
    );
  }

  // ── The other two tool_choice modes ─────────────────────────────────────
  console.log(`\n${"═".repeat(72)}`);
  console.log("tool_choice demonstrations\n");

  const statement = FIXTURES.find((f) => f.id === "unlisted-category")!;
  const invoice = FIXTURES.find((f) => f.id === "clean-tabular")!;

  for (const [label, fixture] of [
    ["statement", statement],
    ["invoice", invoice],
  ] as const) {
    const chosen = await extractViaAnyTool(client, fixture.text);
    console.log(
      `  tool_choice "any" on the ${label} → ${chosen.toolName}` +
        `  ${chosen.toolName === (label === "statement" ? "extract_statement" : "extract_invoice") ? "✓" : "✗"}`,
    );
  }

  const forced = await extractMetadataForced(client, statement.text);
  console.log(`  forced extract_metadata → ${JSON.stringify(forced)}`);

  // The threshold goes in the file so each run is self-describing. Comparing
  // `byField` across two runs at different thresholds *is* the caught-errors
  // against review-volume curve the decision note asks for.
  log.metric("confidenceThreshold", CONFIDENCE_THRESHOLD);
  log.metric("overallAccuracy", byType.overall);
  log.metric("byDocType", byType.segments);
  log.metric("worstSegment", byType.worst);
  log.metric("byField", byField);
  log.metric("reviewQueue", queue);
  log.close({ status: "ok" });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();

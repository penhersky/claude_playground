/**
 * Lab 3b — Message Batches API.
 *
 *   bun run lab3:batch
 *
 * Task 4.5. Three facts drive every decision here:
 *   - 50% cost reduction on all token usage
 *   - up to a 24-hour processing window, **no latency SLA**
 *   - no multi-turn tool calling within a single request
 *
 * That last one is why the validation-retry loop from `pipeline.ts` cannot run
 * inside a batch. The pattern is: batch the extraction, validate the results
 * locally, then resubmit only the failures as a second batch.
 *
 * Batches suit overnight reports, weekly audits, nightly test generation.
 * They are wrong for anything blocking — a pre-merge check that might take
 * 24 hours is not a check.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, requireApiKey } from "../../src/config/env.ts";
import { startRunLog } from "../../src/runtime/log.ts";
import { SYSTEM_PROMPT } from "./fewshot.ts";
import { FIXTURES, fixtureById } from "./fixtures/index.ts";
import { ExtractionSchema, type Extraction } from "./schema.ts";
import { sourceConflicts, validate } from "./validate.ts";
import { classify } from "./retry.ts";

/** Poll interval. Most batches finish inside an hour; none is guaranteed to. */
const POLL_MS = 30_000;

/**
 * Documents longer than this get split before resubmission.
 *
 * The guide's own example of "resubmit failed documents with modifications":
 * a document that blew the context window will do it again unless you change
 * something, and chunking is the change.
 */
const CHUNK_THRESHOLD_CHARS = 8_000;

function buildRequest(customId: string, documentText: string) {
  return {
    // The ONLY reliable way to pair a response with its request. Results come
    // back in arbitrary order — never key by position.
    custom_id: customId,
    params: {
      model: MODEL,
      max_tokens: 16000,
      system: [
        { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [
        {
          role: "user" as const,
          content: `Extract this document:\n\n---\n${documentText}\n---`,
        },
      ],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    },
  };
}

async function submitAndWait(client: Anthropic, requests: ReturnType<typeof buildRequest>[]) {
  const batch = await client.messages.batches.create({ requests: requests as never });
  console.log(`  batch ${batch.id} submitted with ${requests.length} requests`);

  const startedAt = Date.now();
  let current = batch;
  while (current.processing_status !== "ended") {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `  [${elapsed}s] ${current.processing_status} — ` +
        `processing ${current.request_counts.processing}, ` +
        `succeeded ${current.request_counts.succeeded}, ` +
        `errored ${current.request_counts.errored}`,
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    current = await client.messages.batches.retrieve(batch.id);
  }

  console.log(
    `  ended after ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
      `${current.request_counts.succeeded} ok, ${current.request_counts.errored} errored, ` +
      `${current.request_counts.expired} expired`,
  );
  return current;
}

interface BatchOutcome {
  customId: string;
  status: "succeeded" | "errored" | "expired" | "canceled";
  extraction?: Extraction;
  /** Whether the failure is worth resubmitting, and how to modify it. */
  resubmit: false | "as_is" | "chunked";
  note: string;
}

async function collectResults(client: Anthropic, batchId: string): Promise<BatchOutcome[]> {
  const outcomes: BatchOutcome[] = [];

  for await (const result of await client.messages.batches.results(batchId)) {
    const customId = result.custom_id;

    switch (result.result.type) {
      case "succeeded": {
        // Parse the structured output back out of the message content.
        const block = result.result.message.content.find((b) => b.type === "text");
        let extraction: Extraction | undefined;
        try {
          extraction = block && "text" in block ? JSON.parse(block.text) : undefined;
        } catch {
          extraction = undefined;
        }

        if (!extraction) {
          outcomes.push({
            customId,
            status: "succeeded",
            resubmit: "as_is",
            note: "Response did not parse as the extraction schema.",
          });
          break;
        }

        // Validation happens HERE, client-side. The batch API cannot run a
        // multi-turn tool loop, so there is no in-batch self-correction.
        const issues = [...validate(extraction), ...sourceConflicts(extraction)];
        const verdict = classify(issues, 1);

        outcomes.push({
          customId,
          status: "succeeded",
          extraction,
          resubmit: verdict.retry ? "as_is" : false,
          note: verdict.retry
            ? `Validation failed (${issues.map((i) => i.code).join(", ")}); recoverable.`
            : issues.length === 0
              ? "Clean."
              : `Not resubmitting: ${verdict.reason}`,
        });
        break;
      }

      case "errored": {
        // invalid_request is a defect in the request — resubmitting it
        // unchanged fails identically. Everything else is server-side and
        // safe to retry as is.
        const isInvalid = result.result.error.error.type === "invalid_request_error";
        const fixture = fixtureById(customId);
        const oversized = (fixture?.text.length ?? 0) > CHUNK_THRESHOLD_CHARS;

        outcomes.push({
          customId,
          status: "errored",
          resubmit: isInvalid ? (oversized ? "chunked" : false) : "as_is",
          note: isInvalid
            ? oversized
              ? "Invalid request on an oversized document — chunk before resubmitting."
              : "Invalid request. Fix the request before resubmitting; a retry as-is fails identically."
            : "Server-side error. Safe to resubmit unchanged.",
        });
        break;
      }

      case "expired":
        outcomes.push({
          customId,
          status: "expired",
          resubmit: "as_is",
          note: "Not processed within the 24h window. Resubmit.",
        });
        break;

      default:
        outcomes.push({
          customId,
          status: "canceled",
          resubmit: false,
          note: "Canceled.",
        });
    }
  }

  return outcomes;
}

/**
 * How often to submit, given an end-to-end SLA.
 *
 * The guide's worked example: a 30-hour SLA against a 24-hour worst-case batch
 * window leaves 6 hours of slack, so submitting every 4 hours keeps the oldest
 * document inside the SLA even if its batch takes the full 24.
 */
export function submissionIntervalHours(slaHours: number, batchWorstCaseHours = 24): number {
  const slack = slaHours - batchWorstCaseHours;
  if (slack <= 0) {
    throw new Error(
      `An SLA of ${slaHours}h cannot be met by an API whose worst case is ` +
        `${batchWorstCaseHours}h. Use the synchronous API for this workload.`,
    );
  }
  // Leave a margin rather than submitting exactly at the boundary.
  return Math.max(1, Math.floor(slack * 0.75));
}

async function main() {
  // Inside main(), never at module scope: pipeline.test.ts imports
  // submissionIntervalHours from this file, and `bun test` must stay free of
  // filesystem side effects.
  const log = startRunLog({ dir: import.meta.dir, label: "batch" });
  requireApiKey();
  const client = new Anthropic();

  console.log("Message Batches — 50% cost, up to 24h, no latency SLA.\n");
  console.log(`SLA planning: a 30h end-to-end SLA → submit every ${submissionIntervalHours(30)}h.`);
  console.log("  (24h worst case + margin. A 20h SLA is not achievable by batch at all.)\n");

  // Pass 1 — everything.
  console.log("Pass 1: all fixtures");
  const first = await submitAndWait(
    client,
    FIXTURES.map((f) => buildRequest(f.id, f.text)),
  );
  const outcomes = await collectResults(client, first.id);

  console.log();
  for (const outcome of outcomes) {
    console.log(`  ${outcome.customId.padEnd(22)} ${outcome.status.padEnd(10)} ${outcome.note}`);
  }

  log.record({ pass: 1, batchId: first.id, outcomes });

  // Pass 2 — only the failures, keyed by custom_id, with modifications.
  const toResubmit = outcomes.filter((o) => o.resubmit !== false);
  if (toResubmit.length === 0) {
    console.log("\nNothing to resubmit.");
    log.close({ status: "ok" });
    return;
  }

  console.log(`\nPass 2: resubmitting ${toResubmit.length} of ${outcomes.length} by custom_id`);
  const retryRequests = toResubmit.flatMap((outcome) => {
    const fixture = fixtureById(outcome.customId);
    if (!fixture) return [];

    if (outcome.resubmit === "chunked") {
      return chunk(fixture.text, CHUNK_THRESHOLD_CHARS).map((part, i) =>
        buildRequest(`${fixture.id}#chunk${i}`, part),
      );
    }
    return [buildRequest(`${fixture.id}#retry`, fixture.text)];
  });

  const second = await submitAndWait(client, retryRequests);
  const retryOutcomes = await collectResults(client, second.id);

  console.log();
  for (const outcome of retryOutcomes) {
    console.log(`  ${outcome.customId.padEnd(22)} ${outcome.status.padEnd(10)} ${outcome.note}`);
  }

  const stillFailing = retryOutcomes.filter((o) => o.resubmit !== false);
  console.log(
    `\n${retryOutcomes.length - stillFailing.length}/${retryOutcomes.length} resolved on the second pass.`,
  );
  if (stillFailing.length > 0) {
    console.log(
      "Remaining failures go to human review, not a third batch — repeated failure on\n" +
        "the same document means the problem is the document, not the attempt.",
    );
  }

  log.record({ pass: 2, batchId: second.id, outcomes: retryOutcomes });
  log.metric("resolvedOnSecondPass", retryOutcomes.length - stillFailing.length);
  log.metric("stillFailing", stillFailing.map((o) => o.customId));
  log.close({ status: stillFailing.length === 0 ? "ok" : "failed" });
}

function chunk(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();

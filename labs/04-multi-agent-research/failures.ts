/**
 * Error propagation across a multi-agent system — Task 5.3.
 *
 * Four behaviours the exam guide names, two of them anti-patterns:
 *
 *   ✗ swallowing an error into an empty success ("no results found")
 *   ✗ terminating the whole workflow because one subagent failed
 *   ✓ structured error context: failure type, what was attempted, partial
 *     results, alternatives — enough for the coordinator to decide
 *   ✓ local recovery inside the subagent for transient failures, propagating
 *     upward only what it could not resolve
 *
 * The two anti-patterns are opposite over-reactions to the same event, and
 * both destroy information the coordinator needs. The middle path is to report
 * precisely what happened and let the coordinator choose.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toolEmpty, toolError, toolOk } from "../../src/mcp/errors.ts";

const CORPUS_DIR = join(import.meta.dir, "corpus");

/**
 * Documents rigged to fail, and how.
 *
 * `helios-institute-2026.md` times out on its first read and succeeds after,
 * so a run demonstrates **local recovery**: the subagent retries a transient
 * failure itself rather than escalating it.
 *
 * `restricted-annex.md` does not exist and never will, so a request for it
 * demonstrates a **permanent** failure propagating upward with context — and
 * the coordinator continuing with partial results plus a coverage gap.
 */
const TRANSIENT_ONCE = new Set(["helios-institute-2026.md"]);
const served = new Set<string>();

export function resetFailures(): void {
  served.clear();
}

const listDocuments = tool(
  "list_documents",
  [
    "List every document in the research corpus with its size.",
    "",
    "Call this before load_document so you know what exists. Returns file names only —",
    "use load_document to read one.",
    "",
    "This is a catalog, exposed so agents can see what data is available without",
    "probing for it one guess at a time.",
  ].join("\n"),
  {},
  async () => {
    const files = readdirSync(CORPUS_DIR).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
    return toolOk({
      count: files.length,
      documents: files.map((name) => ({
        name,
        bytes: readFileSync(join(CORPUS_DIR, name), "utf8").length,
      })),
    });
  },
  { annotations: { readOnlyHint: true } },
);

const loadDocument = tool(
  "load_document",
  [
    "Read one document from the research corpus by its exact file name.",
    "",
    "Accepts a file name from list_documents, e.g. 'ardenne-grid-2026.md'. It does NOT",
    "accept URLs, search queries, or partial names — this reads a known local file, it",
    "does not find one.",
    "",
    "Distinguish the two failure shapes it returns:",
    "  errorCategory 'transient'  — the store was briefly unavailable. Retry once",
    "                               yourself before reporting anything upward.",
    "  errorCategory 'permission' — the document exists but you cannot read it. Do",
    "                               not retry. Report it upward with what you were",
    "                               trying to find, so the coordinator can annotate",
    "                               a coverage gap.",
    "",
    "A name that does not exist returns a successful empty result, not an error.",
  ].join("\n"),
  {
    name: z.string().min(1).describe("Exact file name from list_documents."),
  },
  async (args) => {
    // Simulated permanent failure: exists in the catalog's world, unreadable.
    if (args.name === "restricted-annex.md") {
      return toolError({
        category: "permission",
        message:
          "Annex C is restricted and cannot be read by this agent. It contains the " +
          "network-constrained curtailment breakdown.",
        attempted: `load_document(${args.name})`,
        partialResults: {
          knownFromOtherSources:
            "Helios estimates the network-constrained component at 2.6 percentage points.",
        },
        alternatives: [
          "Use the Helios estimate and attribute it to Helios, not to the operator.",
          "Report the operator's own breakdown as a coverage gap.",
        ],
      });
    }

    // Simulated transient failure: fails once, then works.
    if (TRANSIENT_ONCE.has(args.name) && !served.has(args.name)) {
      served.add(args.name);
      return toolError({
        category: "transient",
        message: "Document store timed out after 5000ms. The document exists.",
        attempted: `load_document(${args.name})`,
        alternatives: ["Retry the same call once before reporting upward."],
      });
    }

    try {
      const text = readFileSync(join(CORPUS_DIR, args.name), "utf8");
      return toolOk({ name: args.name, text });
    } catch {
      // Not found. A *successful* query with no match — deliberately not an
      // error, so the coordinator does not read "missing file" as "search
      // broken" and does not trigger a pointless retry.
      return toolEmpty("document", { name: args.name });
    }
  },
  { annotations: { readOnlyHint: true } },
);

export const corpusServer = createSdkMcpServer({
  name: "corpus",
  version: "1.0.0",
  tools: [listDocuments, loadDocument],
});

export const CORPUS_TOOLS = [
  "mcp__corpus__list_documents",
  "mcp__corpus__load_document",
] as const;

// ── The pure logic the coordinator applies, testable offline ────────────────

export type FailureKind = "transient" | "permission" | "validation" | "business";

export interface SubagentReport {
  agent: string;
  topic: string;
  ok: boolean;
  failure?: {
    kind: FailureKind;
    attempted: string;
    partialResults?: unknown;
    alternatives?: string[];
  };
}

export type CoordinatorAction =
  | { action: "accept" }
  | { action: "retry_locally"; reason: string }
  | { action: "proceed_with_gap"; reason: string; gapNote: string }
  | { action: "reassign"; reason: string };

/**
 * What the coordinator does about one subagent report.
 *
 * Note what is absent: no branch aborts the run. A single subagent failure
 * degrades coverage; it does not end the workflow. That is the anti-pattern
 * the guide names, and it is a *structural* choice — the function cannot
 * express "abort", so no prompt wording can talk it into one.
 */
export function decide(report: SubagentReport): CoordinatorAction {
  if (report.ok) return { action: "accept" };

  const failure = report.failure;
  if (!failure) {
    return {
      action: "proceed_with_gap",
      reason: "Subagent reported failure with no structured context.",
      gapNote:
        `${report.topic}: the ${report.agent} agent failed without saying why. ` +
        "Nothing can be recovered from this report — treat the topic as uncovered.",
    };
  }

  switch (failure.kind) {
    case "transient":
      // Belongs to the subagent, not the coordinator. Escalating a timeout
      // wastes a round trip and buries the recovery in the wrong layer.
      return {
        action: "retry_locally",
        reason: `Transient failure on ${failure.attempted}; the subagent should retry.`,
      };

    case "permission":
      return {
        action: "proceed_with_gap",
        reason: `Permanent access failure on ${failure.attempted}. No retry helps.`,
        gapNote:
          `${report.topic}: source inaccessible (${failure.attempted}).` +
          (failure.alternatives?.length
            ? ` Alternatives considered: ${failure.alternatives.join("; ")}.`
            : ""),
      };

    case "validation":
      // The request was malformed. A different agent, or the same one with
      // corrected arguments, can still cover the topic.
      return {
        action: "reassign",
        reason: `Malformed request on ${failure.attempted}; re-delegate with corrected input.`,
      };

    case "business":
      return {
        action: "proceed_with_gap",
        reason: `Policy refusal on ${failure.attempted}.`,
        gapNote: `${report.topic}: excluded by policy.`,
      };
  }
}

/**
 * Distinguish an access failure from a valid empty result.
 *
 * The guide calls out conflating these in both directions. An empty result
 * reported as an error triggers retries against a topic that genuinely has no
 * sources; an access failure reported as empty tells the coordinator the topic
 * was covered and found nothing, which is the more dangerous of the two — the
 * gap never appears in the report.
 */
export function interpretResult(result: {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: { text: string }[];
}): { kind: "success" | "empty" | "failure"; detail: string } {
  if (result.isError) {
    const structured = result.structuredContent ?? {};
    return {
      kind: "failure",
      detail: `${structured["errorCategory"] ?? "unknown"} (retryable=${structured["isRetryable"] ?? "?"})`,
    };
  }

  const text = result.content?.[0]?.text ?? "";
  if (text.includes('"reason": "no_matches"') || text.includes('"found": false')) {
    return {
      kind: "empty",
      detail: "Query succeeded, nothing matched. Not a failure — do not retry.",
    };
  }

  return { kind: "success", detail: "Result returned." };
}

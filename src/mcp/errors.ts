/**
 * Structured MCP tool errors — exam Task 2.2 and Task 5.3.
 *
 * The failure mode this exists to prevent: every tool returning a uniform
 * `"Operation failed"`. An agent reading that cannot tell a timeout it should
 * retry from a policy violation it should explain from a validation error it
 * should correct, so it either retries forever or gives up on all three.
 *
 * The fix is metadata, not prose. Each error carries a category, an explicit
 * retryability flag, and — where the tool got partway — what it did manage to
 * collect, so a coordinator can proceed with partial results.
 */

/**
 * The four kinds the exam guide names. Each implies a different agent response:
 *
 * | Category     | Cause                          | The agent should            |
 * |--------------|--------------------------------|-----------------------------|
 * | `transient`  | timeout, service unavailable   | retry, possibly with backoff |
 * | `validation` | malformed or impossible input  | fix the arguments and re-call |
 * | `business`   | policy violation, rule blocked | explain to the user; escalate |
 * | `permission` | not authorized for this action | escalate; never retry         |
 */
export type ErrorCategory = "transient" | "validation" | "business" | "permission";

/** Whether retrying could plausibly succeed. Derived, not guessed per call site. */
export function isRetryable(category: ErrorCategory): boolean {
  return category === "transient";
}

export interface ToolErrorInput {
  category: ErrorCategory;
  /** Human-readable, addressed to the agent and ultimately the user. */
  message: string;
  /** What the tool was trying to do, for coordinator-side recovery decisions. */
  attempted?: string;
  /** Anything the tool did collect before failing. */
  partialResults?: unknown;
  /** Concrete alternatives the agent could try instead. */
  alternatives?: string[];
}

/** The machine-readable half of an error, mirrored into `structuredContent`. */
export interface StructuredToolError {
  errorCategory: ErrorCategory;
  isRetryable: boolean;
  message: string;
  attempted?: string;
  partialResults?: unknown;
  alternatives?: string[];
}

export interface ToolResultShape {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  /**
   * MCP's `CallToolResult` is open — it permits `_meta` and other extensions.
   * The SDK's handler signature reflects that, so without an index signature
   * this interface is not assignable to it.
   */
  [key: string]: unknown;
}

/**
 * Build an error result an agent can actually act on.
 *
 * Note `isError: true`. An uncaught throw would also reach Claude — the SDK's
 * in-process MCP server converts exceptions into error results — but as a bare
 * exception string with no category and no context. Catching and composing is
 * the difference between "the agent knows to retry" and "the agent guesses".
 */
export function toolError(input: ToolErrorInput): ToolResultShape {
  const structured: StructuredToolError = {
    errorCategory: input.category,
    isRetryable: isRetryable(input.category),
    message: input.message,
    ...(input.attempted !== undefined && { attempted: input.attempted }),
    ...(input.partialResults !== undefined && { partialResults: input.partialResults }),
    ...(input.alternatives !== undefined && { alternatives: input.alternatives }),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured as unknown as Record<string, unknown>,
    isError: true,
  };
}

/** Plain success result. */
export function toolOk(payload: unknown): ToolResultShape {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * A successful query that matched nothing.
 *
 * Deliberately **not** an error. Task 5.3 calls out conflating the two as an
 * anti-pattern in both directions: an access failure reported as an empty
 * result makes the coordinator think the topic has no coverage, while a genuine
 * empty result reported as an error triggers pointless retries. The explicit
 * `found: false` plus `reason: "no_matches"` says which one this is.
 */
export function toolEmpty(what: string, criteria: unknown): ToolResultShape {
  return toolOk({
    found: false,
    reason: "no_matches",
    what,
    criteria,
    note: "Query succeeded. Nothing matched — this is not a failure, do not retry.",
  });
}

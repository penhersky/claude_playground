/**
 * Offline tests for lab 1's decision logic.
 *
 * No API key, no network. Everything asserted here is a pure function, which is
 * exactly why the gate lives in one — a permission rule you cannot test without
 * spending money is a permission rule nobody re-tests after changing it.
 */

import { describe, expect, test } from "bun:test";
import {
  evaluateGate,
  newGateState,
  recordToolResult,
} from "./hooks/prerequisite-gate.ts";
import {
  daysSinceDelivery,
  findCustomers,
  findOrder,
  isWithinReturnWindow,
  REFUND_CEILING_USD,
  resetTransientFailures,
  returnRelevantView,
  shouldFailTransiently,
} from "./data/store.ts";
import { isRetryable, toolEmpty, toolError } from "../../src/mcp/errors.ts";

const REFUND = "mcp__support__process_refund";
const GET_CUSTOMER = "mcp__support__get_customer";

describe("prerequisite gate (Task 1.4)", () => {
  test("denies process_refund before any customer is verified", () => {
    const state = newGateState();
    const verdict = evaluateGate(REFUND, { customerId: "CUS-1001", amountUsd: 149 }, state);

    expect(verdict.decision).toBe("deny");
    if (verdict.decision === "deny") {
      // The reason has to tell the model what to do next, or it retries the
      // same call and burns turns.
      expect(verdict.reason).toContain("get_customer");
    }
  });

  test("allows process_refund once a customer is verified", () => {
    const state = newGateState();
    recordToolResult(
      GET_CUSTOMER,
      { content: [{ text: JSON.stringify({ verified: true, customerId: "CUS-1001" }) }] },
      state,
    );

    expect(state.verifiedCustomerId).toBe("CUS-1001");
    expect(evaluateGate(REFUND, { customerId: "CUS-1001", amountUsd: 149 }, state).decision).toBe(
      "allow",
    );
  });

  test("denies a refund for a customer other than the verified one", () => {
    const state = newGateState();
    state.verifiedCustomerId = "CUS-1001";

    const verdict = evaluateGate(REFUND, { customerId: "CUS-1002", amountUsd: 50 }, state);
    expect(verdict.decision).toBe("deny");
  });

  test("an ambiguous get_customer result does NOT verify anyone", () => {
    const state = newGateState();
    recordToolResult(
      GET_CUSTOMER,
      {
        content: [
          {
            text: JSON.stringify({
              verified: false,
              reason: "multiple_matches",
              matches: [{ customerId: "CUS-1001" }, { customerId: "CUS-1002" }],
            }),
          },
        ],
      },
      state,
    );

    expect(state.verifiedCustomerId).toBeNull();
    expect(evaluateGate(REFUND, { customerId: "CUS-1001", amountUsd: 10 }, state).decision).toBe(
      "deny",
    );
  });

  test("leaves non-gated tools alone", () => {
    const state = newGateState();
    expect(evaluateGate("mcp__support__lookup_order", { orderId: "ORD-5150" }, state).decision).toBe(
      "allow",
    );
    expect(evaluateGate(GET_CUSTOMER, { identifier: "Okafor" }, state).decision).toBe("allow");
  });
});

describe("policy ceiling (Task 1.5)", () => {
  test("blocks a refund above the ceiling even for a verified customer", () => {
    const state = newGateState();
    state.verifiedCustomerId = "CUS-1001";

    const verdict = evaluateGate(
      REFUND,
      { customerId: "CUS-1001", amountUsd: REFUND_CEILING_USD + 1 },
      state,
    );

    expect(verdict.decision).toBe("deny");
    if (verdict.decision === "deny") {
      // Redirect, not a dead end — and it must name the handoff fields, since
      // the human agent can't see the conversation.
      expect(verdict.reason).toContain("escalate_to_human");
      expect(verdict.reason).toContain("root cause");
    }
  });

  test("allows a refund exactly at the ceiling", () => {
    const state = newGateState();
    state.verifiedCustomerId = "CUS-1001";
    expect(
      evaluateGate(REFUND, { customerId: "CUS-1001", amountUsd: REFUND_CEILING_USD }, state)
        .decision,
    ).toBe("allow");
  });
});

describe("structured errors (Task 2.2)", () => {
  test("only transient errors are retryable", () => {
    expect(isRetryable("transient")).toBe(true);
    expect(isRetryable("validation")).toBe(false);
    expect(isRetryable("business")).toBe(false);
    expect(isRetryable("permission")).toBe(false);
  });

  test("toolError carries category, retryability and context", () => {
    const result = toolError({
      category: "transient",
      message: "Order service timed out.",
      attempted: "lookup_order(ORD-5150)",
      alternatives: ["Retry once."],
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      errorCategory: "transient",
      isRetryable: true,
      attempted: "lookup_order(ORD-5150)",
    });
  });

  test("an empty result is a success, not an error (Task 5.3)", () => {
    const result = toolEmpty("order", { orderId: "ORD-0000" });

    // Conflating these is the anti-pattern: reported as an error it triggers
    // pointless retries; a real access failure reported as empty makes the
    // coordinator believe the topic has no coverage.
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("no_matches");
    expect(result.content[0]!.text).toContain("do not retry");
  });
});

describe("store fixtures", () => {
  test("a surname matches several customers, forcing a clarifying question", () => {
    expect(findCustomers("Okafor")).toHaveLength(2);
    expect(findCustomers("ada@example.com")).toHaveLength(1);
  });

  test("ORD-3902 is outside its return window; ORD-5150 is inside", () => {
    expect(isWithinReturnWindow(findOrder("ORD-3902")!)).toBe(false);
    expect(isWithinReturnWindow(findOrder("ORD-5150")!)).toBe(true);
  });

  test("an in-transit order has no delivery date and no window", () => {
    const order = findOrder("ORD-6001")!;
    expect(daysSinceDelivery(order)).toBeNull();
    expect(isWithinReturnWindow(order)).toBe(false);
  });

  test("the return-relevant view drops the metadata bulk (Task 5.1)", () => {
    const order = findOrder("ORD-4417")!;
    const view = returnRelevantView(order);

    expect(Object.keys(order.metadata).length).toBeGreaterThan(10);
    expect(view).not.toHaveProperty("metadata");
    expect(Object.keys(view)).toHaveLength(8);
  });

  test("ORD-5150 fails transiently exactly once", () => {
    resetTransientFailures();
    expect(shouldFailTransiently("ORD-5150")).toBe(true);
    expect(shouldFailTransiently("ORD-5150")).toBe(false);
    expect(shouldFailTransiently("ORD-4417")).toBe(false);
  });
});

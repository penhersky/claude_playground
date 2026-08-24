/**
 * Lab 1b — the same scenario on the raw Messages API.
 *
 *   bun run lab1:loop
 *
 * Task 1.1 is written against `stop_reason`, which `query()` hides. This file
 * exists so those literal strings are visible: the loop continues while
 * `stop_reason` is `"tool_use"` and terminates on `"end_turn"`.
 *
 * Three anti-patterns the exam guide names explicitly, all avoided here:
 *   ✗ parsing natural-language signals to decide termination
 *   ✗ an arbitrary iteration cap as the PRIMARY stopping mechanism
 *   ✗ treating the presence of assistant text as a completion indicator
 *
 * `MAX_ITERATIONS` below is a runaway guard, not the stopping condition. It is
 * the difference between a circuit breaker and a control flow: if it fires,
 * something is wrong, and the code says so rather than reporting success.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MODEL, requireApiKey } from "../../src/config/env.ts";
import {
  findCustomers,
  findOrder,
  isWithinReturnWindow,
  REFUND_CEILING_USD,
  resetTransientFailures,
  returnRelevantView,
  shouldFailTransiently,
} from "./data/store.ts";

/** Runaway guard. Never the reason a healthy run stops. */
const MAX_ITERATIONS = 12;

const tools: Anthropic.Tool[] = [
  {
    name: "get_customer",
    description:
      "Verify a customer's identity and return their account record. Call this first. " +
      "Accepts a customer ID (CUS-1001), an email, or a name. Names are ambiguous — on " +
      "multiple matches, ask for another identifier instead of choosing. Not for order " +
      "numbers; use lookup_order for those.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Customer ID, email, or name." },
      },
      required: ["identifier"],
      additionalProperties: false,
    },
    // Guarantees `input` validates against the schema exactly. It does not
    // guarantee the values are *sensible* — that is still semantic validation's job.
    strict: true,
  },
  {
    name: "lookup_order",
    description:
      "Retrieve one order by number (ORD-4417), with delivery status and return-window " +
      "eligibility. Does not accept customer IDs. Transient failures are marked " +
      "isRetryable — retry those once.",
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order number, e.g. ORD-4417." },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "process_refund",
    description:
      `Refund a delivered order. Refunds above $${REFUND_CEILING_USD} are refused by ` +
      "policy — escalate those instead. Requires a customer ID already verified by " +
      "get_customer in this conversation.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        orderId: { type: "string" },
        amountUsd: { type: "number" },
        reason: { type: "string" },
      },
      required: ["customerId", "orderId", "amountUsd", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** Session state the gate reads. Mirrors what the SDK hook does in `agent.ts`. */
interface LoopState {
  verifiedCustomerId: string | null;
}

/**
 * The prerequisite gate, again — but here it is a plain `if` in the executor.
 *
 * That is the honest comparison the exam is drawing. With the raw API you own
 * the loop, so enforcement is just code you write before dispatching. With the
 * Agent SDK you do not own the loop, so the equivalent lives in a `PreToolUse`
 * hook. Same guarantee, different seam. Neither is a prompt.
 */
function executeTool(
  name: string,
  input: Record<string, any>,
  state: LoopState,
): { payload: unknown; isError: boolean } {
  if (name === "process_refund" && state.verifiedCustomerId === null) {
    return {
      isError: true,
      payload: {
        errorCategory: "permission",
        isRetryable: false,
        message:
          "Blocked: no verified customer in this conversation. Call get_customer first.",
      },
    };
  }

  if (name === "process_refund" && Number(input["amountUsd"]) > REFUND_CEILING_USD) {
    return {
      isError: true,
      payload: {
        errorCategory: "business",
        isRetryable: false,
        message:
          `Blocked: $${input["amountUsd"]} exceeds the $${REFUND_CEILING_USD} automatic ` +
          "ceiling. This case needs a human agent.",
      },
    };
  }

  switch (name) {
    case "get_customer": {
      const matches = findCustomers(String(input["identifier"] ?? ""));
      if (matches.length === 0) {
        return { isError: false, payload: { found: false, reason: "no_matches" } };
      }
      if (matches.length > 1) {
        return {
          isError: false,
          payload: {
            verified: false,
            reason: "multiple_matches",
            matches: matches.map((c) => ({ customerId: c.customerId, name: c.name })),
            note: "Ask for an order number or email. Do not choose one yourself.",
          },
        };
      }
      const customer = matches[0]!;
      state.verifiedCustomerId = customer.customerId;
      return {
        isError: false,
        payload: { verified: true, ...customer },
      };
    }

    case "lookup_order": {
      const orderId = String(input["orderId"] ?? "");
      if (shouldFailTransiently(orderId)) {
        return {
          isError: true,
          payload: {
            errorCategory: "transient",
            isRetryable: true,
            message: "Order service timed out after 5000ms. Retry once.",
          },
        };
      }
      const order = findOrder(orderId);
      if (!order) return { isError: false, payload: { found: false, reason: "no_matches" } };
      return { isError: false, payload: returnRelevantView(order) };
    }

    case "process_refund": {
      const order = findOrder(String(input["orderId"] ?? ""));
      if (!order) {
        return {
          isError: true,
          payload: {
            errorCategory: "validation",
            isRetryable: false,
            message: "No such order.",
          },
        };
      }
      if (!isWithinReturnWindow(order)) {
        return {
          isError: true,
          payload: {
            errorCategory: "business",
            isRetryable: false,
            message: `Delivered ${order.deliveredAt}, past its return window. Policy refusal.`,
          },
        };
      }
      return {
        isError: false,
        payload: { refundId: `RFD-${order.orderId.slice(-4)}`, status: "processed" },
      };
    }

    default:
      return {
        isError: true,
        payload: {
          errorCategory: "validation",
          isRetryable: false,
          message: `Unknown tool ${name}.`,
        },
      };
  }
}

async function main() {
  requireApiKey();
  resetTransientFailures();

  const client = new Anthropic();
  const state: LoopState = { verifiedCustomerId: null };

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Hi, I want to return the keyboard from order ORD-5150 — I don't like the " +
        "switches. Can you refund the $149? I'm ada@example.com.",
    },
  ];

  let iterations = 0;

  while (true) {
    if (++iterations > MAX_ITERATIONS) {
      // Reached only when something is wrong. Reporting it as a failure rather
      // than returning the last message is the point: an iteration cap that
      // silently ends the loop is indistinguishable from success.
      throw new Error(
        `Loop exceeded ${MAX_ITERATIONS} iterations without reaching end_turn. ` +
          "This is a runaway guard, not a normal exit — investigate.",
      );
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools,
      messages,
    });

    console.log(
      `\n[iteration ${iterations}] stop_reason=${response.stop_reason}` +
        `  in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(`  assistant: ${block.text.trim()}`);
      }
    }

    // THE stopping condition. Not "did it produce text", not "have we looped enough".
    if (response.stop_reason === "end_turn") {
      console.log("\n── end_turn: the model considers the task complete ──");
      break;
    }

    // A server-side tool hit its iteration limit mid-turn. Append the partial
    // assistant turn and re-send to let it continue. Not an error, and not a
    // reason to stop.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use") {
      console.log(`\n── stopped early: ${response.stop_reason} ──`);
      break;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    messages.push({ role: "assistant", content: response.content });

    // Every tool_use block gets a tool_result, and they all go back in ONE user
    // message. Splitting them across messages trains the model out of parallel
    // tool calls; dropping one for a failed tool breaks the pairing entirely.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const { payload, isError } = executeTool(
        use.name,
        use.input as Record<string, any>,
        state,
      );
      console.log(
        `  → ${use.name}(${JSON.stringify(use.input)})` + (isError ? "  [error]" : ""),
      );
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(payload),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: results });
  }

  console.log(`\nverified customer: ${state.verifiedCustomerId ?? "none"}`);
  console.log(`iterations: ${iterations}`);
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();

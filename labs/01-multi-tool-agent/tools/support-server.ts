/**
 * The support MCP server — four tools, in-process.
 *
 * `createSdkMcpServer` runs the server inside this process rather than
 * spawning a subprocess, so tools are plain async functions with a Zod schema.
 *
 * Descriptions here are the **"after"** versions. `descriptions.before.md`
 * holds the thin ones that cause misrouting, and `descriptions.after.md`
 * explains what changed and why. Swap them in to watch tool selection degrade
 * — that is Task 2.1's whole point, and it is more convincing to see than to
 * read.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { toolEmpty, toolError, toolOk } from "../../../src/mcp/errors.ts";
import {
  findCustomers,
  findOrder,
  isWithinReturnWindow,
  REFUND_CEILING_USD,
  returnRelevantView,
  shouldFailTransiently,
} from "../data/store.ts";

const getCustomer = tool(
  "get_customer",
  [
    "Verify a customer's identity and return their account record.",
    "",
    "Call this FIRST, before any order or refund operation. Downstream tools are",
    "blocked until it returns exactly one verified match.",
    "",
    "Accepts one identifier: a customer ID (CUS-1001), an email address, or a full",
    "or partial name. Names are ambiguous — 'Okafor' matches several accounts — so",
    "when this returns multiple matches, ask the customer for an order number or",
    "email rather than choosing one.",
    "",
    "Use this for questions about the PERSON: who they are, their contact details,",
    "their service tier. For questions about a specific purchase, shipment, or",
    "return eligibility, use lookup_order instead — an order number is not a",
    "customer identifier and will not resolve here.",
  ].join("\n"),
  {
    identifier: z
      .string()
      .min(1)
      .describe("Customer ID (CUS-1001), email address, or name. Not an order number."),
  },
  async (args) => {
    const matches = findCustomers(args.identifier);

    if (matches.length === 0) {
      return toolEmpty("customer", { identifier: args.identifier });
    }

    if (matches.length > 1) {
      // Not an error — the query worked. It is an ambiguity the agent must
      // resolve by asking, not by picking (Task 5.2).
      return toolOk({
        verified: false,
        reason: "multiple_matches",
        matchCount: matches.length,
        matches: matches.map((c) => ({ customerId: c.customerId, name: c.name })),
        note:
          "Ambiguous identifier. Ask the customer for an order number or their email " +
          "address, then call get_customer again. Do not select a match yourself.",
      });
    }

    const customer = matches[0]!;
    return toolOk({
      verified: true,
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      tier: customer.tier,
    });
  },
  { annotations: { readOnlyHint: true } },
);

const lookupOrder = tool(
  "lookup_order",
  [
    "Retrieve one order by its order number, including delivery status and whether",
    "it is still inside its return window.",
    "",
    "Accepts an order number in the form ORD-4417. It does NOT accept a customer ID,",
    "an email, or a name — resolve the person with get_customer first, then use the",
    "order number they give you.",
    "",
    "Use this for anything about a specific purchase: what was bought, what it cost,",
    "where it is, whether it can still be returned. Use get_customer instead for",
    "questions about the account holder.",
    "",
    "Returns only the fields relevant to returns and refunds. Transient backend",
    "failures are reported with errorCategory 'transient' and isRetryable true —",
    "retry those once before telling the customer anything.",
  ].join("\n"),
  {
    orderId: z.string().min(1).describe("Order number, e.g. ORD-4417. Not a customer ID."),
  },
  async (args) => {
    if (shouldFailTransiently(args.orderId)) {
      return toolError({
        category: "transient",
        message:
          "Order service timed out after 5000ms. The order almost certainly exists; " +
          "this is a backend timeout, not a missing record.",
        attempted: `lookup_order(${args.orderId})`,
        alternatives: ["Retry the same call once."],
      });
    }

    const order = findOrder(args.orderId);
    if (!order) return toolEmpty("order", { orderId: args.orderId });

    return toolOk(returnRelevantView(order));
  },
  { annotations: { readOnlyHint: true } },
);

const processRefund = tool(
  "process_refund",
  [
    "Issue a refund against a delivered order.",
    "",
    `Refunds at or below $${REFUND_CEILING_USD} are processed immediately. Above that`,
    "ceiling the call is blocked by policy — use escalate_to_human instead.",
    "",
    "Requires a customer ID that get_customer has already verified in this session.",
    "Calls without one are refused before they reach the payment system.",
    "",
    "Refuses orders outside their return window with errorCategory 'business' and",
    "isRetryable false. That is a policy outcome, not a fault: explain it to the",
    "customer, and escalate only if they have grounds for an exception.",
  ].join("\n"),
  {
    customerId: z.string().describe("Verified customer ID from get_customer."),
    orderId: z.string().describe("Order number to refund."),
    amountUsd: z.number().positive().describe("Refund amount in USD."),
    reason: z.string().min(1).describe("Why the customer is being refunded."),
  },
  async (args) => {
    const order = findOrder(args.orderId);
    if (!order) {
      return toolError({
        category: "validation",
        message: `No order ${args.orderId} exists. Confirm the order number with the customer.`,
        attempted: `process_refund(${args.orderId})`,
      });
    }

    if (order.customerId !== args.customerId) {
      return toolError({
        category: "permission",
        message:
          `Order ${args.orderId} belongs to a different account than ${args.customerId}. ` +
          "Refusing to refund across accounts.",
        attempted: `process_refund(${args.orderId}, ${args.customerId})`,
      });
    }

    if (!isWithinReturnWindow(order)) {
      return toolError({
        category: "business",
        message:
          `Order ${args.orderId} was delivered on ${order.deliveredAt}, past its ` +
          `${order.returnWindowDays}-day return window. Policy does not permit an ` +
          "automatic refund. Explain this to the customer; escalate if they have " +
          "grounds for an exception.",
        attempted: `process_refund(${args.orderId})`,
        alternatives: [
          "Offer store credit if the customer is on the priority tier.",
          "escalate_to_human for a policy exception.",
        ],
      });
    }

    if (args.amountUsd > order.totalUsd) {
      return toolError({
        category: "validation",
        message:
          `Refund of $${args.amountUsd} exceeds the order total of $${order.totalUsd}. ` +
          "Re-call with an amount at or below the order total.",
        attempted: `process_refund(${args.orderId}, $${args.amountUsd})`,
      });
    }

    return toolOk({
      refundId: `RFD-${args.orderId.slice(-4)}`,
      orderId: args.orderId,
      customerId: args.customerId,
      amountUsd: args.amountUsd,
      status: "processed",
      settlesInDays: 5,
    });
  },
);

const escalateToHuman = tool(
  "escalate_to_human",
  [
    "Hand the case to a human agent with a structured summary.",
    "",
    "Escalate when: the customer asks for a human (do this immediately, without",
    "investigating first); policy is silent or ambiguous on their request; a refund",
    "exceeds the automatic ceiling; or you cannot make meaningful progress.",
    "",
    "Do NOT escalate merely because a case is complex, because the customer sounds",
    "frustrated, or because you feel unsure — sentiment and self-reported confidence",
    "are unreliable proxies for whether a human is actually needed.",
    "",
    "The receiving agent cannot see this conversation. Everything they need must be",
    "in the fields below: who the customer is, what actually went wrong, what you",
    "already tried, and what you recommend.",
  ].join("\n"),
  {
    customerId: z.string().describe("Verified customer ID."),
    orderId: z.string().nullable().describe("Related order number, or null if none."),
    rootCause: z.string().min(1).describe("What is actually wrong, not what the customer said."),
    attempted: z.string().min(1).describe("What you already tried and what happened."),
    recommendedAction: z.string().min(1).describe("What you think the human should do."),
    amountUsd: z.number().nullable().describe("Amount at stake, or null."),
  },
  async (args) => {
    return toolOk({
      ticketId: `ESC-${Math.abs(hash(args.customerId + args.rootCause)) % 100000}`,
      queue: "tier-2-resolutions",
      handoff: {
        customerId: args.customerId,
        orderId: args.orderId,
        rootCause: args.rootCause,
        attempted: args.attempted,
        recommendedAction: args.recommendedAction,
        amountUsd: args.amountUsd,
      },
      status: "queued",
    });
  },
);

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return h;
}

export const supportServer = createSdkMcpServer({
  name: "support",
  version: "1.0.0",
  tools: [getCustomer, lookupOrder, processRefund, escalateToHuman],
});

/**
 * Fully-qualified names, as `allowedTools` needs them.
 *
 * The `{server}` segment is the **key** under `options.mcpServers`, not the
 * `name` passed to `createSdkMcpServer`. They match here; when they don't, the
 * key wins.
 */
export const SUPPORT_TOOLS = [
  "mcp__support__get_customer",
  "mcp__support__lookup_order",
  "mcp__support__process_refund",
  "mcp__support__escalate_to_human",
] as const;

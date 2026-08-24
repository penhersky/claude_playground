/**
 * Programmatic enforcement of tool ordering and policy — Tasks 1.4 and 1.5.
 *
 * The exam guide's own sample question describes this exact symptom: "in 12% of
 * cases your agent skips get_customer entirely and calls lookup_order using
 * only the customer's stated name, occasionally leading to misidentified
 * accounts and incorrect refunds." Its four options are all real techniques —
 * a stronger system prompt, few-shot examples, a routing classifier, and a
 * programmatic prerequisite. The prerequisite wins, because prompt-based
 * compliance is probabilistic and this failure has financial consequences.
 *
 * Two rules live here:
 *   1. `process_refund` is blocked until `get_customer` has returned a single
 *      verified customer ID (Task 1.4 — prerequisite gate).
 *   2. A refund above the ceiling is blocked and redirected to escalation
 *      (Task 1.5 — interception with an alternative workflow).
 *
 * A `PreToolUse` hook is the right layer because it runs before *every* tool
 * call, ahead of deny rules, ask rules, the permission mode, and allow rules.
 * A tool auto-approved by a bare `allowedTools` entry never reaches
 * `canUseTool`, so putting the check there would silently do nothing.
 *
 * The decision logic is a pure function so `bun test` can cover it without an
 * API key; the hook callback is a thin adapter over it.
 */

import type { HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { REFUND_CEILING_USD } from "../data/store.ts";

/**
 * What a hook callback returns.
 *
 * Declared structurally rather than imported, because the SDK's exported name
 * for this shape has moved between releases while the wire format has not.
 * `{}` means "no opinion, continue"; `hookSpecificOutput` carries the decision.
 */
type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse" | "PostToolUse";
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
  };
};

/** What the gate remembers across tool calls within one session. */
export interface GateState {
  /** Set once `get_customer` resolves to exactly one customer. */
  verifiedCustomerId: string | null;
  /** Refunds blocked by the ceiling, for the handoff summary. */
  blockedRefunds: { orderId: string; amountUsd: number }[];
}

export function newGateState(): GateState {
  return { verifiedCustomerId: null, blockedRefunds: [] };
}

export type GateDecision =
  | { decision: "allow" }
  | { decision: "deny"; reason: string };

const GATED_TOOLS = new Set(["mcp__support__process_refund"]);

/**
 * Decide whether a tool call may proceed.
 *
 * Pure: takes the tool name, its input, and the current state; returns a
 * decision and mutates nothing. The caller records blocked refunds.
 */
export function evaluateGate(
  toolName: string,
  toolInput: Record<string, unknown>,
  state: GateState,
): GateDecision {
  if (!GATED_TOOLS.has(toolName)) return { decision: "allow" };

  // Rule 1 — identity must be verified first.
  if (state.verifiedCustomerId === null) {
    return {
      decision: "deny",
      reason:
        "Refunds require a verified customer. Call get_customer first and confirm it " +
        "returns exactly one match. If it returns several, ask the customer for another " +
        "identifier (order number or email) before continuing — do not guess.",
    };
  }

  // Rule 1b — and it must be the *same* customer this refund is for.
  const claimed = toolInput["customerId"];
  if (typeof claimed === "string" && claimed !== state.verifiedCustomerId) {
    return {
      decision: "deny",
      reason:
        `This session verified ${state.verifiedCustomerId}, but the refund names ` +
        `${claimed}. Re-verify with get_customer before refunding a different account.`,
    };
  }

  // Rule 2 — policy ceiling, redirected rather than merely refused.
  const amount = Number(toolInput["amountUsd"] ?? 0);
  if (amount > REFUND_CEILING_USD) {
    return {
      decision: "deny",
      reason:
        `Refunds above $${REFUND_CEILING_USD} cannot be processed automatically ` +
        `(this one is $${amount.toFixed(2)}). Call escalate_to_human instead, with a ` +
        "structured handoff: the verified customer ID, the order ID, the amount, the " +
        "root cause, and your recommended action. The human agent cannot see this " +
        "conversation, so the summary has to stand alone.",
    };
  }

  return { decision: "allow" };
}

/**
 * Record what a completed tool call means for the gate.
 *
 * Called from a `PostToolUse` hook: `get_customer` returning exactly one match
 * is what flips the session to verified. Reading it out of the *result* rather
 * than trusting the agent's word is the whole point — the agent could claim to
 * have verified someone without having called anything.
 */
export function recordToolResult(
  toolName: string,
  result: unknown,
  state: GateState,
): void {
  if (toolName !== "mcp__support__get_customer") return;

  const parsed = coerceResult(result);
  if (parsed && parsed["verified"] === true && typeof parsed["customerId"] === "string") {
    state.verifiedCustomerId = parsed["customerId"];
  }
}

function coerceResult(result: unknown): Record<string, any> | null {
  if (result && typeof result === "object") {
    const obj = result as Record<string, any>;
    // MCP results arrive as a content array; the JSON is in the first text block.
    const text = obj["content"]?.[0]?.text;
    if (typeof text === "string") return safeParse(text);
    return obj;
  }
  if (typeof result === "string") return safeParse(result);
  return null;
}

function safeParse(text: string): Record<string, any> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Build the hook matchers for `options.hooks`.
 *
 * The matcher is a regex tested against the tool name, so `mcp__support__.*`
 * covers every tool on this server and nothing else.
 */
export function gateHooks(state: GateState): {
  PreToolUse: HookCallbackMatcher[];
  PostToolUse: HookCallbackMatcher[];
} {
  return {
    PreToolUse: [
      {
        matcher: "mcp__support__.*",
        hooks: [
          async (input): Promise<HookOutput> => {
            const hookInput = input as unknown as Record<string, any>;
            const toolName = String(hookInput["tool_name"] ?? "");
            const toolInput = (hookInput["tool_input"] ?? {}) as Record<string, unknown>;

            const verdict = evaluateGate(toolName, toolInput, state);
            if (verdict.decision === "allow") return {};

            if (toolName === "mcp__support__process_refund") {
              state.blockedRefunds.push({
                orderId: String(toolInput["orderId"] ?? "unknown"),
                amountUsd: Number(toolInput["amountUsd"] ?? 0),
              });
            }

            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: verdict.reason,
              },
            };
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "mcp__support__get_customer",
        hooks: [
          async (input): Promise<HookOutput> => {
            const hookInput = input as unknown as Record<string, any>;
            recordToolResult(
              String(hookInput["tool_name"] ?? ""),
              hookInput["tool_response"] ?? hookInput["tool_result"],
              state,
            );
            return {};
          },
        ],
      },
    ],
  };
}

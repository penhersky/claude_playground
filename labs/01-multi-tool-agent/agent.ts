/**
 * Lab 1 — multi-tool support agent with a prerequisite gate.
 *
 *   bun run lab1
 *
 * Runs three scenarios in sequence, each isolating one exam concept. Watch the
 * printed tool trace; the interesting parts are the denials.
 */

import { runAgent, SPAWN_TOOLS } from "../../src/runtime/run.ts";
import { gateHooks, newGateState } from "./hooks/prerequisite-gate.ts";
import { supportServer, SUPPORT_TOOLS } from "./tools/support-server.ts";
import { resetTransientFailures } from "./data/store.ts";

const SYSTEM_PROMPT = [
  "You are a customer support resolution agent. Your goal is to resolve issues on",
  "first contact, escalating only when you should.",
  "",
  "Always verify identity with get_customer before acting on an account.",
  "",
  "When a tool returns an error, read its errorCategory before deciding what to do:",
  "  transient  — retry once.",
  "  validation — fix your arguments and call again.",
  "  business   — a policy outcome. Explain it to the customer; do not retry.",
  "  permission — stop and escalate; never retry.",
  "",
  "Escalate when the customer asks for a human, when policy is silent on their",
  "request, or when you cannot make progress. Do not escalate because a case feels",
  "complex or the customer sounds annoyed.",
  "",
  "When a request raises several separate concerns, address each one, then give a",
  "single unified response rather than a list of disconnected answers.",
].join("\n");

/**
 * Scenario A — the gate fires.
 *
 * The customer volunteers an order number, which is exactly the shape that
 * tempts the model to skip verification. The hook denies `process_refund`
 * until `get_customer` has resolved a single account, and the denial reason
 * tells the model what to do about it. Expect: a denial in the trace, then a
 * `get_customer` call, then a successful refund.
 */
const scenarioA = [
  "Hi, I want to return the keyboard from order ORD-5150. It arrived fine, I just",
  "don't like the switches. Can you refund me the $149? I'm Ada Okafor.",
].join(" ");

/**
 * Scenario B — the policy ceiling redirects to escalation.
 *
 * ORD-4417 is $780, above the $500 automatic ceiling. The gate denies the
 * refund and the reason names the alternative workflow *and* the fields the
 * handoff needs (Task 1.4). Expect: denial, then `escalate_to_human` with a
 * complete structured summary — not a bare "escalating this".
 */
const scenarioB = [
  "This is ada@example.com. The Aurora monitor from ORD-4417 has a dead pixel",
  "column. I want the full $780 back.",
].join(" ");

/**
 * Scenario C — multi-concern decomposition and an unretryable business error.
 *
 * Three concerns in one message: a stale order (business error, past its
 * window), an in-transit order belonging to a *different* customer, and an
 * ambiguous identifier. Expect the agent to decompose, handle each, and
 * synthesize one answer — and specifically not to retry the return-window
 * refusal, because it is `business`, not `transient`.
 */
const scenarioC = [
  "Two things. First, the desk lamp from ORD-3902 broke — I'd like money back.",
  "Second, where is ORD-6001? Also I think you have two accounts under Okafor,",
  "which one am I?",
].join(" ");

async function main() {
  const scenarios: [string, string][] = [
    ["A — prerequisite gate", scenarioA],
    ["B — policy ceiling → escalation", scenarioB],
    ["C — multi-concern + business error", scenarioC],
  ];

  for (const [label, prompt] of scenarios) {
    console.log(`\n${"═".repeat(72)}\n${label}\n${"═".repeat(72)}\n`);
    console.log(`user: ${prompt}\n`);

    // Fresh gate state per scenario: verification does not carry across
    // conversations, and neither should the lab's memory of it.
    const state = newGateState();
    resetTransientFailures();

    const trace = await runAgent({
      prompt,
      print: { showInit: label.startsWith("A") },
      options: {
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: { support: supportServer },
        allowedTools: [...SUPPORT_TOOLS, ...SPAWN_TOOLS],
        hooks: gateHooks(state),
        // Nothing here should touch the filesystem or the shell. Removing the
        // built-ins keeps them out of context entirely rather than merely
        // unapproved, so the model never wastes a turn attempting one.
        tools: [],
        // Anything not pre-approved above is denied outright instead of
        // prompting — there is no human at this terminal to answer.
        permissionMode: "dontAsk",
        maxTurns: 20,
      },
    });

    console.log(
      `\n  gate: verified=${state.verifiedCustomerId ?? "none"}` +
        `  blocked refunds=${state.blockedRefunds.length}`,
    );
    console.log(
      `  tools called: ${trace.toolCalls.map((c) => short(c.name)).join(" → ") || "(none)"}`,
    );
  }
}

function short(toolName: string): string {
  return toolName.replace(/^mcp__support__/, "");
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();

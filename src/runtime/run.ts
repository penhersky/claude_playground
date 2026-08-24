/**
 * Thin wrapper around `query()` so labs show their own concept rather than
 * boilerplate, and so every run gets the same guardrails.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { MAX_BUDGET_USD, MODEL, requireApiKey, subprocessEnv } from "../config/env.ts";
import { emptyTrace, printMessage, type PrintOptions, type RunTrace } from "./print.ts";

export interface RunAgentInput {
  prompt: string;
  options?: Options;
  print?: PrintOptions;
  /** Override the default spend cap for this run. */
  maxBudgetUsd?: number;
}

/**
 * Run one agent turn to completion and return what happened.
 *
 * Two things this handles that are easy to get wrong:
 *
 * 1. **A one-shot `query()` throws after yielding its error result.** The loop
 *    below already folded that result into `trace`, so the catch reports it
 *    rather than losing it. Writing `for await (...) {}` without a try/catch
 *    means a budget-capped or max-turns run looks like an unhandled crash.
 *
 * 2. **`options.env` replaces the subprocess environment** in the TypeScript
 *    SDK (Python merges). `subprocessEnv()` spreads `process.env` so `PATH` and
 *    `ANTHROPIC_API_KEY` survive.
 */
export async function runAgent(input: RunAgentInput): Promise<RunTrace> {
  requireApiKey();

  const trace = emptyTrace();
  const options: Options = {
    model: MODEL,
    maxBudgetUsd: input.maxBudgetUsd ?? MAX_BUDGET_USD,
    env: subprocessEnv(),
    ...input.options,
  };

  try {
    for await (const message of query({ prompt: input.prompt, options })) {
      printMessage(message, trace, input.print);
    }
  } catch (error) {
    // The result message (with its subtype and cost) already reached `trace`.
    // Report the throw without discarding it.
    if (trace.resultSubtype) {
      console.error(`\nQuery ended as "${trace.resultSubtype}": ${describe(error)}`);
    } else {
      console.error(`\nQuery failed before producing a result: ${describe(error)}`);
      throw error;
    }
  }

  return trace;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Tool names that must be allowed for a coordinator to spawn subagents.
 *
 * Renamed `Task` → `Agent` in Claude Code v2.1.63; the exam guide is written
 * against `"Task"`. Allow both so the same code works across SDK versions.
 */
export const SPAWN_TOOLS = ["Agent", "Task"] as const;

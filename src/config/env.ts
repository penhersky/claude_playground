/**
 * Environment and model configuration.
 *
 * Bun auto-loads `.env`, and the Agent SDK's subprocess inherits `process.env`,
 * so nothing here parses a dotenv file. Under plain Node you would need
 * `node --env-file=.env` or the `dotenv` package — neither SDK reads `.env`
 * on its own.
 */

/**
 * Default model for every lab.
 *
 * Current-generation facts worth remembering (they are exam-adjacent and they
 * changed recently):
 *  - Thinking is on by default. `thinking: { type: "adaptive" }` is the on-mode.
 *  - `budget_tokens` is removed and returns 400.
 *  - Assistant-message prefill is removed and returns 400.
 *  - Depth is controlled with `output_config.effort`, not a token budget.
 */
export const MODEL = "claude-opus-5";

/** Cheap model for high-volume, low-stakes subagent work. */
export const CHEAP_MODEL = "claude-haiku-4-5";

/**
 * Spend ceiling applied by {@link runAgent}. The SDK compares this against
 * `total_cost_usd`, which includes subagent requests, and ends the query with
 * an `error_max_budget_usd` result subtype rather than throwing mid-run.
 */
export const MAX_BUDGET_USD = Number(process.env["LAB_MAX_BUDGET_USD"] ?? "2.00");

/**
 * Whether lab runs persist a transcript and sidecar to `labs/<lab>/out/`.
 *
 * On by default: every live run costs real money, and a log you have to
 * remember to enable is the one you don't have on the day you needed it. Set
 * `LAB_LOG=0` for a throwaway run. Anything else — unset included — means on.
 */
export const LOG_RUNS = process.env["LAB_LOG"] !== "0";

/**
 * Directory name for run logs, resolved against the lab's own directory.
 *
 * Already covered by `.gitignore`, and the `/study-plan` command probes each
 * lab's `out` directory to detect which labs have actually been exercised. An
 * absolute path works too, if you'd rather every lab wrote to one place.
 */
export const LOG_DIR_NAME = process.env["LAB_LOG_DIR"] ?? "out";

/**
 * Assert an API key is present and return it.
 *
 * Called at the top of every lab entrypoint so a missing key fails immediately
 * with an actionable message, rather than surfacing as an opaque subprocess
 * error several seconds in.
 */
export function requireApiKey(): string {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "  cp .env.example .env   # then add your key from https://platform.claude.com/\n" +
        "Bun loads .env automatically; plain Node needs --env-file=.env.",
    );
  }
  return key;
}

/**
 * Environment for the Agent SDK subprocess.
 *
 * The TypeScript SDK **replaces** the subprocess environment with whatever you
 * pass as `options.env` (the Python SDK merges instead). Spreading
 * `process.env` is not optional — omit it and you lose `PATH` and
 * `ANTHROPIC_API_KEY`.
 *
 * The two caps below bound how far a delegating run can grow. Opus 5 delegates
 * to subagents readily, so a single prompt can otherwise become a tree of them.
 *   - depth 1: subagents cannot spawn subagents of their own.
 *   - concurrency 5: at most five running at once.
 */
export function subprocessEnv(
  overrides: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    ...process.env,
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
    CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "5",
    ...overrides,
  };
}

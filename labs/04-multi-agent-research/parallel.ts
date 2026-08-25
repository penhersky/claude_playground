/**
 * Lab 4b — parallel vs. sequential delegation.
 *
 *   bun run lab4:parallel
 *
 * Task 1.3: "Spawning parallel subagents by emitting multiple Task tool calls
 * in a single coordinator response rather than across separate turns."
 *
 * Both runs below do identical work with identical subagents. The only
 * difference is the instruction about *when* to emit the Agent calls. Sequential
 * costs the sum of the subagent durations; parallel costs the maximum.
 *
 * This is worth measuring rather than assuming, because the gap depends on how
 * balanced the subtasks are. Four evenly-sized subtasks approach a 4× speedup;
 * one slow subtask and three fast ones approach none, and the right response is
 * to repartition the work, not to add more agents.
 */

import { startRunLog } from "../../src/runtime/log.ts";
import { summarizeTrace } from "../../src/runtime/print.ts";
import { runAgent, SPAWN_TOOLS } from "../../src/runtime/run.ts";
import { RESEARCH_AGENTS } from "./agents.ts";
import { CORPUS_TOOLS, corpusServer, resetFailures } from "./failures.ts";
import { newTrimStats, trimHooks } from "./hooks/trim-output.ts";

/** Four independent extraction subtasks — no ordering constraint between them. */
const SUBTASKS = [
  {
    topic: "deployed capacity",
    doc: "ardenne-grid-2026.md",
    ask: "deployed capacity, site count, and growth rate",
  },
  {
    topic: "operator curtailment",
    doc: "ardenne-grid-2026.md",
    ask: "the curtailment figure and exactly what its methodology includes and excludes",
  },
  {
    topic: "independent curtailment",
    doc: "helios-institute-2026.md",
    ask: "the curtailment figure, its methodology, and any comment on the operator's number",
  },
  {
    topic: "policy context",
    doc: "regulator-note-2025.md",
    ask: "the rule change, its rationale, its effective date, and expected effects",
  },
];

const SHARED_RULES = [
  "Use the corpus-analyst agent for each subtask. Each subagent prompt must name the",
  "exact document file name and the exact question — subagents inherit nothing from",
  "this conversation, so a prompt that refers to 'the document above' gives them",
  "nothing.",
  "",
  "Report each subagent's findings verbatim as it returns them. Do not synthesize.",
].join("\n");

function buildPrompt(mode: "sequential" | "parallel"): string {
  const instruction =
    mode === "parallel"
      ? [
          "Emit ALL FOUR Agent tool calls in a SINGLE response, so the four subagents run",
          "concurrently. Do not wait for one to finish before starting the next — these",
          "subtasks are independent and nothing about them requires ordering.",
        ].join("\n")
      : [
          "Run the four subtasks STRICTLY ONE AT A TIME. Emit exactly one Agent tool call",
          "per response, wait for its result, and only then emit the next. This is a",
          "deliberately slow baseline for comparison — do not batch them.",
        ].join("\n");

  return [
    "Extract findings from the local research corpus for these four subtasks:",
    "",
    ...SUBTASKS.map((task, i) => `${i + 1}. [${task.topic}] From ${task.doc}: ${task.ask}`),
    "",
    instruction,
    "",
    SHARED_RULES,
  ].join("\n");
}

async function runMode(mode: "sequential" | "parallel") {
  resetFailures();
  const trimStats = newTrimStats();
  const started = Date.now();

  const trace = await runAgent({
    prompt: buildPrompt(mode),
    print: { maxInputChars: 100 },
    options: {
      mcpServers: { corpus: corpusServer },
      agents: RESEARCH_AGENTS,
      allowedTools: [...CORPUS_TOOLS, ...SPAWN_TOOLS],
      hooks: trimHooks(trimStats),
      tools: [],
      permissionMode: "dontAsk",
      maxTurns: 30,
      maxBudgetUsd: 1.5,
    },
  });

  return {
    mode,
    seconds: (Date.now() - started) / 1000,
    costUsd: trace.costUsd,
    subagents: trace.subagentInvocations.length,
    // Agent calls the coordinator issued without waiting. In the parallel run
    // this should be one turn holding four; sequentially, four turns of one.
    spawnTurns: countSpawnTurns(trace.toolCalls),
    trace: summarizeTrace(trace),
  };
}

function countSpawnTurns(calls: { name: string; insideSubagent: boolean }[]): number {
  // The printer records calls in stream order, so consecutive spawn calls that
  // arrived in one assistant message appear adjacent. Counting runs of them
  // approximates how many turns the coordinator spent delegating.
  let turns = 0;
  let inRun = false;
  for (const call of calls) {
    if (call.insideSubagent) continue;
    const isSpawn = call.name === "Agent" || call.name === "Task";
    if (isSpawn && !inRun) {
      turns++;
      inRun = true;
    } else if (!isSpawn) {
      inRun = false;
    }
  }
  return turns;
}

async function main() {
  const log = startRunLog({ dir: import.meta.dir, label: "parallel" });

  console.log("Measuring sequential vs. parallel subagent delegation.\n");
  console.log("Both runs do identical work. Only the delegation instruction differs.\n");

  console.log(`${"═".repeat(72)}\nSEQUENTIAL\n${"═".repeat(72)}\n`);
  const sequential = await runMode("sequential");
  log.record(sequential);

  console.log(`\n${"═".repeat(72)}\nPARALLEL\n${"═".repeat(72)}\n`);
  const parallel = await runMode("parallel");
  log.record(parallel);

  console.log(`\n${"═".repeat(72)}\nRESULTS\n${"═".repeat(72)}\n`);
  console.log("  mode        elapsed    cost      subagents   delegating turns");
  for (const result of [sequential, parallel]) {
    console.log(
      `  ${result.mode.padEnd(11)} ${result.seconds.toFixed(1).padStart(6)}s  ` +
        `$${result.costUsd.toFixed(4)}  ${String(result.subagents).padStart(9)}   ` +
        `${result.spawnTurns}`,
    );
  }

  if (sequential.seconds > 0) {
    const speedup = sequential.seconds / parallel.seconds;
    // The number the decision note asks for by name. Recording it means a run
    // three weeks old still answers "what speedup did parallel delegation give".
    log.metric("speedup", speedup);
    console.log(`\n  speedup: ${speedup.toFixed(2)}×`);
    console.log(
      speedup > 1.5
        ? "  Parallel delegation is working — the coordinator batched its Agent calls."
        : "  Little or no speedup. Either the coordinator still delegated one at a time\n" +
            "  (check 'delegating turns' — parallel should be 1), or the subtasks are\n" +
            "  unbalanced enough that one dominates. Unbalanced work is repartitioned,\n" +
            "  not parallelized harder.",
    );
  }

  console.log(
    "\n  Note: cost is roughly unchanged. Parallelism buys latency, not tokens —\n" +
      "  the same four subagents make the same four sets of requests either way.",
  );

  log.close({ status: "ok" });
}

if (import.meta.main) await main();

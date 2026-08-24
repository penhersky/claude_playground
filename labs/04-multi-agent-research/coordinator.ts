/**
 * Lab 4 — coordinator over four specialist subagents.
 *
 *   bun run lab4
 *
 * Hub-and-spoke: every subagent reports to the coordinator, and the coordinator
 * routes. Nothing talks sideways, which is what makes one place responsible for
 * error handling and information flow.
 */

import { runAgent, SPAWN_TOOLS } from "../../src/runtime/run.ts";
import { RESEARCH_AGENTS, AGENT_TOPICS } from "./agents.ts";
import { CORPUS_TOOLS, corpusServer, resetFailures } from "./failures.ts";
import { FINDING_CONTRACT } from "./findings.ts";
import { newTrimStats, trimHooks } from "./hooks/trim-output.ts";
import {
  loadAllStates,
  loadManifest,
  resumePlan,
  saveManifest,
  SCRATCH_DIR,
} from "./scratchpad.ts";

const QUESTION =
  "What is the state of grid-scale battery storage in Ardenne: deployed capacity, " +
  "curtailment, and the policy context? Where do sources disagree?";

const COORDINATOR_PROMPT = [
  `Research question: ${QUESTION}`,
  "",
  "You coordinate specialist subagents. You do not do the research yourself.",
  "",
  "## How to delegate",
  "",
  "Start by calling list_documents so you know what the corpus contains. Then decide",
  "which subagents the question actually needs — do not run the whole pipeline out of",
  "habit. A question answerable from the corpus alone does not need the web researcher.",
  "",
  "Spawn subagents that can run at the same time by emitting **multiple Agent tool",
  "calls in a single response**. Sequential calls across separate turns take the sum",
  "of their durations instead of the maximum.",
  "",
  "## What subagents know",
  "",
  "Nothing, except what you put in their prompt. They do not inherit this conversation.",
  "So when you delegate to the synthesizer, its prompt must contain the actual findings",
  "— every claim, with its source reference, publication date, and evidence excerpt.",
  "A prompt that says 'synthesize the findings above' gives it nothing to work with.",
  "",
  "Partition scope explicitly so two agents do not cover the same ground. Assign",
  "distinct source types or subtopics and say so in each prompt.",
  "",
  "## Handling failures",
  "",
  "A subagent failure degrades coverage. It does not end the run.",
  "",
  "  transient   the subagent should have retried it. If it reports one anyway,",
  "              re-delegate once with the same scope.",
  "  permission  permanent. Proceed without it and record a coverage gap saying",
  "              what was inaccessible and what was attempted.",
  "  validation  your delegation was malformed. Fix the prompt and re-delegate.",
  "",
  "Distinguish an access failure from a valid empty result. 'The search failed' and",
  "'the search worked and found nothing' lead to different decisions, and reporting",
  "the first as the second silently removes a gap from the final report.",
  "",
  "## Reconciling",
  "",
  "When findings disagree, check dates and methodology before calling it a",
  "contradiction. Sources measuring different periods are not in conflict, and a",
  "difference in what was counted explains most apparent disputes.",
  "",
  "Where a genuine disagreement remains, both values go into the report with their",
  "attributions. Do not pick one and do not average them.",
  "",
  "## Refining",
  "",
  "When the synthesis comes back, read it for gaps before accepting it. If a topic is",
  "thin, re-delegate to research with a targeted query and re-synthesize. Do not accept",
  "the first synthesis just because it arrived.",
  "",
  "## Output",
  "",
  "End with the finished report. Reproduce the report-writer's output verbatim rather",
  "than summarizing it — a summary of a report that carefully preserved its citations",
  "is a report without citations.",
  "",
  FINDING_CONTRACT,
].join("\n");

async function main() {
  resetFailures();
  const trimStats = newTrimStats();

  // Crash recovery (Task 5.4). A manifest on disk means a previous run died
  // partway; report what can be carried forward rather than silently redoing it.
  const previous = loadManifest();
  if (previous) {
    const plan = resumePlan(previous, loadAllStates());
    console.log(`Found a previous run (${previous.runId}) in ${SCRATCH_DIR}`);
    console.log(`  complete: ${plan.done.join(", ") || "none"}`);
    for (const item of plan.todo) {
      console.log(`  redo ${item.agent}: ${item.reason}`);
    }
    console.log();
  }

  const runId = `run-${Date.now()}`;
  saveManifest({
    runId,
    startedAt: new Date().toISOString(),
    question: QUESTION,
    agents: Object.entries(AGENT_TOPICS).map(([agent, topic]) => ({
      agent,
      topic,
      status: "running" as const,
      file: `${agent}.json`,
    })),
  });

  const started = Date.now();

  const trace = await runAgent({
    prompt: COORDINATOR_PROMPT,
    print: { showInit: true, maxInputChars: 160 },
    options: {
      mcpServers: { corpus: corpusServer },
      agents: RESEARCH_AGENTS,
      // Both spawn-tool names: renamed Task → Agent in Claude Code v2.1.63,
      // and the exam guide is written against "Task".
      allowedTools: [...CORPUS_TOOLS, ...SPAWN_TOOLS],
      hooks: trimHooks(trimStats),
      // No filesystem or shell for the coordinator — the corpus server is the
      // only way in. Removing the built-ins keeps them out of context entirely.
      tools: [],
      permissionMode: "dontAsk",
      maxTurns: 40,
      maxBudgetUsd: 3,
    },
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(72)}`);
  console.log(`elapsed: ${elapsed}s   cost: $${trace.costUsd.toFixed(4)}`);
  console.log(
    `subagents spawned: ${trace.subagentInvocations.length}` +
      (trace.subagentInvocations.length
        ? ` (${trace.subagentInvocations.join(", ")})`
        : "  ← none: check that Agent/Task is in allowedTools"),
  );
  console.log(
    `context trimming: ${trimStats.calls} document loads, ` +
      `${trimStats.charsBefore} → ${trimStats.charsAfter} chars` +
      (trimStats.charsBefore > 0
        ? ` (${Math.round((1 - trimStats.charsAfter / trimStats.charsBefore) * 100)}% saved)`
        : ""),
  );

  // The specific checks this corpus was built to make observable.
  const report = trace.resultText ?? "";
  console.log("\nSynthesis checks:");
  check(report, "both curtailment figures present", /4\.1/.test(report) && /6\.8/.test(report));
  check(report, "the 2024/2026 capacity pair kept as a trend", /1,?240/.test(report) && /2,?870/.test(report));
  check(report, "methodology difference explained", /methodolog|network-constrained|scope/i.test(report));
  check(report, "sources attributed inline", /Helios/i.test(report) && /Transmission Authority|Grid Operator/i.test(report));
  check(report, "contested section distinct from established", /contest|disput|disagree/i.test(report));
}

function check(_report: string, label: string, passed: boolean): void {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();

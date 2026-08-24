/**
 * Scratchpad persistence and crash recovery — Task 5.4.
 *
 * Two problems, one mechanism.
 *
 * **Context degradation.** In a long session a model starts answering from
 * "typical patterns" rather than the specific things it discovered an hour ago.
 * A scratchpad on disk is the counter: findings are written down and re-read,
 * so the answer comes from a record instead of a fading memory.
 *
 * **Crash recovery.** Each agent exports its state to a known location and the
 * coordinator loads a manifest on resume. Without it, a crash three subagents
 * in means redoing all three.
 *
 * Files live under `.scratch/`, which is gitignored. Contents are the agents'
 * working notes, not a deliverable.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CoverageGap, Finding } from "./findings.ts";

export const SCRATCH_DIR = join(import.meta.dir, ".scratch");

export interface AgentState {
  agent: string;
  topic: string;
  status: "running" | "complete" | "failed";
  findings: Finding[];
  gaps: CoverageGap[];
  /** What this agent tried, so a resumed run does not repeat it. */
  attempted: string[];
  updatedAt: string;
}

export interface Manifest {
  runId: string;
  startedAt: string;
  question: string;
  agents: { agent: string; topic: string; status: AgentState["status"]; file: string }[];
}

function ensureDir(): void {
  if (!existsSync(SCRATCH_DIR)) mkdirSync(SCRATCH_DIR, { recursive: true });
}

/**
 * Write one agent's state.
 *
 * Called after each phase, not only at the end. State written only on success
 * is state you don't have when it matters — the crash you're recovering from
 * is precisely the run that didn't finish.
 */
export function saveAgentState(state: AgentState): string {
  ensureDir();
  const file = join(SCRATCH_DIR, `${slug(state.agent)}.json`);
  writeFileSync(
    file,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
  );
  return file;
}

export function loadAgentState(agent: string): AgentState | null {
  const file = join(SCRATCH_DIR, `${slug(agent)}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AgentState;
  } catch {
    return null;
  }
}

export function saveManifest(manifest: Manifest): void {
  ensureDir();
  writeFileSync(join(SCRATCH_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function loadManifest(): Manifest | null {
  const file = join(SCRATCH_DIR, "manifest.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** Every agent state currently on disk, for a resumed coordinator. */
export function loadAllStates(): AgentState[] {
  if (!existsSync(SCRATCH_DIR)) return [];
  return readdirSync(SCRATCH_DIR)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(SCRATCH_DIR, f), "utf8")) as AgentState;
      } catch {
        return null;
      }
    })
    .filter((s): s is AgentState => s !== null);
}

/**
 * What a resumed coordinator still has to do.
 *
 * `complete` agents are skipped, `failed` and `running` are redone — a
 * `running` state means the process died mid-flight, and its findings may be
 * partial.
 */
export function resumePlan(manifest: Manifest, states: AgentState[]) {
  const byAgent = new Map(states.map((s) => [s.agent, s]));

  const done: string[] = [];
  const todo: { agent: string; topic: string; reason: string }[] = [];
  const carriedFindings: Finding[] = [];

  for (const entry of manifest.agents) {
    const state = byAgent.get(entry.agent);

    if (state?.status === "complete") {
      done.push(entry.agent);
      carriedFindings.push(...state.findings);
      continue;
    }

    todo.push({
      agent: entry.agent,
      topic: entry.topic,
      reason: !state
        ? "no state on disk — never started"
        : state.status === "running"
          ? "state says running — the process died mid-flight, findings may be partial"
          : "state says failed",
    });
  }

  return { done, todo, carriedFindings };
}

/**
 * The summary injected into a resumed agent's prompt.
 *
 * Two jobs at once: it carries forward what earlier phases established (so the
 * new agent doesn't rediscover it), and it lists what was already attempted (so
 * it doesn't repeat a search that came back empty). Summarizing between phases
 * rather than replaying raw transcripts is what keeps context bounded across a
 * long run.
 */
export function buildResumeContext(states: AgentState[]): string {
  const complete = states.filter((s) => s.status === "complete");
  if (complete.length === 0) return "No prior findings. This is a fresh run.";

  const lines: string[] = ["Findings already established by earlier agents:", ""];

  for (const state of complete) {
    lines.push(`## ${state.agent} — ${state.topic}`);
    for (const finding of state.findings) {
      lines.push(
        `- ${finding.claim}` +
          (finding.value !== null ? ` [${finding.value}${finding.unit ?? ""}]` : "") +
          ` — ${finding.source.ref}` +
          (finding.source.publishedAt ? ` (${finding.source.publishedAt})` : " (undated)"),
      );
    }
    if (state.gaps.length > 0) {
      lines.push(`  Gaps: ${state.gaps.map((g) => g.topic).join(", ")}`);
    }
    lines.push("");
  }

  const attempted = [...new Set(complete.flatMap((s) => s.attempted))];
  if (attempted.length > 0) {
    lines.push("Already attempted — do not repeat these:", ...attempted.map((a) => `  - ${a}`));
  }

  return lines.join("\n");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

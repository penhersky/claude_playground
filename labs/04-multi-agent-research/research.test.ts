/**
 * Offline tests for lab 4.
 *
 * Conflict detection, error routing, trimming, and crash recovery are all pure
 * functions over plain data. No API key, no network.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { synthesize, renderReport, type Finding } from "./findings.ts";
import { decide, interpretResult, type SubagentReport } from "./failures.ts";
import { normalizeDates, trimDocument, TRIM_THRESHOLD_CHARS } from "./hooks/trim-output.ts";
import {
  buildResumeContext,
  loadAllStates,
  resumePlan,
  saveAgentState,
  SCRATCH_DIR,
  type AgentState,
  type Manifest,
} from "./scratchpad.ts";
import { toolEmpty, toolError, toolOk } from "../../src/mcp/errors.ts";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    claim: "Deployed storage capacity reached 2,870 MW.",
    evidence: "grid-connected battery storage in the Ardenne control area stood at 2,870 MW",
    source: {
      ref: "ardenne-grid-2026.md",
      publishedAt: "2026-05-30",
      methodology: "Measured at the transmission interface.",
    },
    topic: "deployed capacity",
    value: 2870,
    unit: "MW",
    confidence: 0.95,
    ...overrides,
  };
}

describe("conflict detection (Task 5.6)", () => {
  test("a single finding per topic is established", () => {
    const result = synthesize([finding()]);
    expect(result.established).toHaveLength(1);
    expect(result.contested).toHaveLength(0);
  });

  test("values within tolerance are not a conflict", () => {
    const result = synthesize([
      finding({ value: 2870 }),
      finding({ value: 2880, source: { ref: "helios-institute-2026.md", publishedAt: "2026-06-12", methodology: null } }),
    ]);
    expect(result.contested).toHaveLength(0);
    expect(result.established).toHaveLength(1);
  });

  test("a genuine disagreement on the same period is contested, with BOTH values kept", () => {
    const result = synthesize([
      finding({
        topic: "curtailment",
        value: 4.1,
        unit: "%",
        source: { ref: "ardenne-grid-2026.md", publishedAt: "2026-05-30", methodology: "Economic curtailment only." },
      }),
      finding({
        topic: "curtailment",
        value: 6.8,
        unit: "%",
        source: { ref: "helios-institute-2026.md", publishedAt: "2026-06-12", methodology: "All curtailment events." },
      }),
    ]);

    expect(result.contested).toHaveLength(1);
    const group = result.contested[0]!;

    // The whole point: nothing was picked, nothing was averaged.
    expect(group.findings).toHaveLength(2);
    expect(group.findings.map((f) => f.value).sort()).toEqual([4.1, 6.8]);
    expect(group.likelyTemporal).toBe(false);
    expect(result.established.some((f) => f.topic === "curtailment")).toBe(false);
  });

  test("sources more than a year apart are flagged temporal, not contradictory", () => {
    const result = synthesize([
      finding({ value: 1240, source: { ref: "ardenne-grid-2024.md", publishedAt: "2024-11-18", methodology: null } }),
      finding({ value: 2870, source: { ref: "ardenne-grid-2026.md", publishedAt: "2026-05-30", methodology: null } }),
    ]);

    const group = result.contested[0]!;
    expect(group.likelyTemporal).toBe(true);
    // The note must say so, or a reader treats a trend as a dispute.
    expect(group.note).toMatch(/year apart|different periods/i);
  });

  test("qualitative claims on one topic corroborate rather than conflict", () => {
    const result = synthesize([
      finding({ topic: "policy", value: null, unit: null, claim: "Threshold removed for aggregated portfolios." }),
      finding({ topic: "policy", value: null, unit: null, claim: "Rules take effect 1 April 2026." }),
    ]);
    expect(result.contested).toHaveLength(0);
    expect(result.established).toHaveLength(2);
  });

  test("a dated source outranks an undated one when values agree", () => {
    const result = synthesize([
      finding({ source: { ref: "vendor-brief-2026.md", publishedAt: null, methodology: null }, confidence: 0.99 }),
      finding({ source: { ref: "ardenne-grid-2026.md", publishedAt: "2026-05-30", methodology: null }, confidence: 0.9 }),
    ]);
    expect(result.established[0]!.source.ref).toBe("ardenne-grid-2026.md");
  });
});

describe("report rendering (Task 5.6)", () => {
  const synthesis = synthesize(
    [
      finding(),
      finding({ topic: "policy", value: null, unit: null, claim: "Aggregation threshold removed." }),
      finding({ topic: "curtailment", value: 4.1, unit: "%", source: { ref: "ardenne-grid-2026.md", publishedAt: "2026-05-30", methodology: "Economic only." } }),
      finding({ topic: "curtailment", value: 6.8, unit: "%", source: { ref: "helios-institute-2026.md", publishedAt: "2026-06-12", methodology: "All events." } }),
    ],
    [{ topic: "network-constrained breakdown", reason: "Annex C restricted.", attempted: "load_document(restricted-annex.md)" }],
  );

  const report = renderReport(synthesis, "Ardenne storage");

  test("established and contested get separate sections", () => {
    expect(report).toContain("## Established");
    expect(report).toContain("## Contested");
  });

  test("both contested values survive into the report", () => {
    expect(report).toContain("4.1");
    expect(report).toContain("6.8");
  });

  test("methodology accompanies contested figures", () => {
    expect(report).toContain("Economic only.");
    expect(report).toContain("All events.");
  });

  test("quantitative renders as a table, qualitative as prose", () => {
    expect(report).toContain("| Topic | Value | Source | Published |");
    expect(report).toContain("- Aggregation threshold removed.");
  });

  test("coverage gaps are stated, not omitted", () => {
    expect(report).toContain("## Coverage gaps");
    expect(report).toContain("Annex C restricted.");
    expect(report).toContain("restricted-annex.md");
  });
});

describe("error propagation (Task 5.3)", () => {
  const report = (overrides: Partial<SubagentReport>): SubagentReport => ({
    agent: "corpus-analyst",
    topic: "curtailment",
    ok: false,
    ...overrides,
  });

  test("a transient failure is retried by the subagent, not escalated", () => {
    const action = decide(
      report({ failure: { kind: "transient", attempted: "load_document(helios-institute-2026.md)" } }),
    );
    expect(action.action).toBe("retry_locally");
  });

  test("a permission failure proceeds with a coverage gap", () => {
    const action = decide(
      report({
        failure: {
          kind: "permission",
          attempted: "load_document(restricted-annex.md)",
          alternatives: ["Use the Helios estimate."],
        },
      }),
    );
    expect(action.action).toBe("proceed_with_gap");
    if (action.action === "proceed_with_gap") {
      expect(action.gapNote).toContain("curtailment");
      expect(action.gapNote).toContain("Helios");
    }
  });

  test("a validation failure is re-delegated with corrected input", () => {
    const action = decide(report({ failure: { kind: "validation", attempted: "load_document()" } }));
    expect(action.action).toBe("reassign");
  });

  test("NO failure kind aborts the run", () => {
    // The structural guarantee. "Terminating the entire workflow on a single
    // failure" is a named anti-pattern, and this function cannot express it.
    const kinds = ["transient", "permission", "validation", "business"] as const;
    for (const kind of kinds) {
      const action = decide(report({ failure: { kind, attempted: "x" } }));
      expect(["retry_locally", "proceed_with_gap", "reassign"]).toContain(action.action);
    }
  });

  test("a failure with no structured context still yields a gap, not a crash", () => {
    const action = decide(report({}));
    expect(action.action).toBe("proceed_with_gap");
  });
});

describe("access failure vs. valid empty result (Task 5.3)", () => {
  test("an error is a failure", () => {
    const result = interpretResult(toolError({ category: "transient", message: "timeout" }));
    expect(result.kind).toBe("failure");
    expect(result.detail).toContain("transient");
    expect(result.detail).toContain("retryable=true");
  });

  test("no matches is a success, not a failure", () => {
    const result = interpretResult(toolEmpty("document", { name: "nope.md" }));
    expect(result.kind).toBe("empty");
    expect(result.detail).toContain("do not retry");
  });

  test("a real result is a success", () => {
    expect(interpretResult(toolOk({ name: "x.md", text: "hello" })).kind).toBe("success");
  });
});

describe("context trimming (Task 5.1, 1.5)", () => {
  const document = [
    "# Ardenne Grid Operator — Annual Storage Report 2026",
    "",
    "Published: 2026-05-30",
    "",
    "This report has been prepared in accordance with our statutory obligations and",
    "represents the considered view of the Network Planning Division following an",
    "extensive period of consultation with stakeholders across the sector.",
    "",
    "## Curtailment",
    "",
    "Renewable curtailment for the first half of 2026 was 4.1% of available generation.",
    "Methodology: economic curtailment only.",
  ].join("\n");

  test("keeps headings, numeric lines, and methodology notes", () => {
    const trimmed = trimDocument(document);
    expect(trimmed).toContain("# Ardenne Grid Operator");
    expect(trimmed).toContain("4.1%");
    expect(trimmed).toContain("Methodology: economic curtailment only.");
    expect(trimmed).toContain("Published: 2026-05-30");
  });

  test("drops narrative connective tissue", () => {
    expect(trimDocument(document)).not.toContain("statutory obligations");
  });

  test("trimming never removes provenance", () => {
    // A trim that dropped dates or sources would break the whole chain that
    // Task 5.6 depends on. Losing prose is fine; losing attribution is not.
    const trimmed = trimDocument(document);
    expect(trimmed).toMatch(/2026-05-30/);
  });

  test("normalizes date formats", () => {
    expect(normalizeDates("Published: 18 November 2024")).toContain("2024-11-18");
    expect(normalizeDates("Issued 2 July 2026 in Ardenne")).toContain("2026-07-02");
    expect(normalizeDates("no date here")).toBe("no date here");
  });

  test("the threshold is a documented tunable", () => {
    expect(TRIM_THRESHOLD_CHARS).toBe(1200);
  });
});

describe("crash recovery (Task 5.4)", () => {
  const manifest: Manifest = {
    runId: "run-test",
    startedAt: "2026-08-20T00:00:00.000Z",
    question: "test",
    agents: [
      { agent: "corpus-analyst", topic: "corpus", status: "complete", file: "corpus-analyst.json" },
      { agent: "web-researcher", topic: "web", status: "running", file: "web-researcher.json" },
      { agent: "synthesizer", topic: "reconciliation", status: "running", file: "synthesizer.json" },
    ],
  };

  const completeState: AgentState = {
    agent: "corpus-analyst",
    topic: "corpus",
    status: "complete",
    findings: [finding()],
    gaps: [],
    attempted: ["load_document(ardenne-grid-2026.md)", "load_document(restricted-annex.md)"],
    updatedAt: "2026-08-20T00:01:00.000Z",
  };

  test("completed agents are carried forward, unfinished ones redone", () => {
    const plan = resumePlan(manifest, [
      completeState,
      { ...completeState, agent: "web-researcher", status: "running", findings: [] },
    ]);

    expect(plan.done).toEqual(["corpus-analyst"]);
    expect(plan.todo.map((t) => t.agent)).toEqual(["web-researcher", "synthesizer"]);
    expect(plan.carriedFindings).toHaveLength(1);
  });

  test('a "running" state is treated as suspect, not complete', () => {
    const plan = resumePlan(manifest, [{ ...completeState, agent: "web-researcher", status: "running" }]);
    const entry = plan.todo.find((t) => t.agent === "web-researcher")!;
    expect(entry.reason).toContain("died mid-flight");
  });

  test("a missing state file is 'never started'", () => {
    const plan = resumePlan(manifest, []);
    expect(plan.todo.find((t) => t.agent === "corpus-analyst")!.reason).toContain("never started");
  });

  test("the resume context carries findings AND what was already attempted", () => {
    const context = buildResumeContext([completeState]);
    expect(context).toContain("2,870 MW");
    expect(context).toContain("ardenne-grid-2026.md");
    // Without this, a resumed agent re-runs the search that already failed.
    expect(context).toContain("Already attempted");
    expect(context).toContain("restricted-annex.md");
  });

  test("a fresh run says so rather than returning an empty string", () => {
    expect(buildResumeContext([])).toContain("fresh run");
  });

  test("state round-trips through disk", () => {
    saveAgentState(completeState);
    const loaded = loadAllStates().find((s) => s.agent === "corpus-analyst");
    expect(loaded?.findings[0]?.value).toBe(2870);
  });

  afterAll(() => {
    if (existsSync(SCRATCH_DIR)) rmSync(SCRATCH_DIR, { recursive: true, force: true });
  });
});

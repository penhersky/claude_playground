/**
 * Offline tests for the run-log helpers.
 *
 * Only the pure parts are covered — filename derivation, ANSI stripping, and
 * trace flattening. The descriptor and console-tee path is deliberately not
 * exercised, so `bun test` writes nothing to disk at all. That is stricter than
 * `research.test.ts`, which writes and then wipes, and it is the point: the
 * logger must never fire during a test run.
 */

import { describe, expect, test } from "bun:test";
import { runLogBasename, stripAnsi } from "./log.ts";
import { emptyTrace, summarizeTrace } from "./print.ts";

describe("runLogBasename", () => {
  test("contains no characters that are illegal in Windows filenames", () => {
    const name = runLogBasename(new Date("2026-08-25T14:03:11.482Z"), "pipeline");

    // Colons come out of toISOString and are the failure that only shows up on
    // win32 — where this repo is actually used.
    expect(name).not.toContain(":");
    for (const illegal of ['<', '>', '"', "/", "\\", "|", "?", "*"]) {
      expect(name).not.toContain(illegal);
    }
  });

  test("puts the timestamp first so a directory listing sorts chronologically", () => {
    const earlier = runLogBasename(new Date("2026-08-25T09:00:00Z"), "coordinator");
    const later = runLogBasename(new Date("2026-08-25T14:00:00Z"), "agent");

    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  test("keeps the label so runs from different entrypoints stay distinguishable", () => {
    expect(runLogBasename(new Date("2026-08-25T14:03:11Z"), "parallel")).toBe(
      "2026-08-25T14-03-11-parallel",
    );
  });
});

describe("stripAnsi", () => {
  test("removes every colour helper print.ts applies", () => {
    // The six wrappers at the top of print.ts, in one line.
    const painted =
      "\x1b[1m── \x1b[0m\x1b[32msuccess\x1b[0m\x1b[1m ──\x1b[0m\x1b[2m  $0.0123\x1b[0m";

    expect(stripAnsi(painted)).toBe("── success ──  $0.0123");
    expect(stripAnsi(painted)).not.toContain("\x1b");
  });

  test("leaves the box-drawing and status glyphs intact", () => {
    // These are plain UTF-8, not escapes, and they carry the meaning in every
    // lab's report table.
    const line = "  ✓ skills discovered → ═══ … ✗";

    expect(stripAnsi(line)).toBe(line);
  });

  test("is a no-op on text that was never coloured", () => {
    expect(stripAnsi("[iteration 1] stop_reason=tool_use")).toBe(
      "[iteration 1] stop_reason=tool_use",
    );
  });
});

describe("summarizeTrace", () => {
  test("reports the coordinator's own tool chain, not its subagents'", () => {
    const trace = emptyTrace();
    trace.toolCalls.push(
      { name: "mcp__support__get_customer", input: {}, insideSubagent: false },
      { name: "WebSearch", input: {}, insideSubagent: true },
      { name: "mcp__support__process_refund", input: {}, insideSubagent: false },
    );

    const summary = summarizeTrace(trace);

    // toolCallCount counts everything; toolChain answers "what did the
    // coordinator itself do", which is what re-reading a run is for.
    expect(summary.toolCallCount).toBe(3);
    expect(summary.toolChain).toEqual([
      "mcp__support__get_customer",
      "mcp__support__process_refund",
    ]);
  });

  test("copies the arrays so later mutation of the trace cannot rewrite history", () => {
    const trace = emptyTrace();
    trace.subagentInvocations.push("web-researcher");

    const summary = summarizeTrace(trace);
    trace.subagentInvocations.push("synthesizer");

    expect(summary.subagentInvocations).toEqual(["web-researcher"]);
  });

  test("survives a run that produced no result message", () => {
    const summary = summarizeTrace(emptyTrace());

    expect(summary.resultSubtype).toBeUndefined();
    expect(summary.costUsd).toBe(0);
    expect(summary.toolChain).toEqual([]);
  });
});

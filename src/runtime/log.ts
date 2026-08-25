/**
 * Run-log persistence: every lab run leaves a transcript and a sidecar behind.
 *
 * **This is not a second message printer.** `print.ts` remains the only thing
 * that formats or decides anything; this module is a sink attached underneath
 * it. It tees whatever already reached `console` into a file, verbatim minus
 * colour. A `lab-reviewer` pass should read it that way.
 *
 * Two artifacts per run, in `labs/<lab>/out/`:
 *
 *   2026-08-25T14-03-11-pipeline.log    the console transcript, ANSI stripped
 *   2026-08-25T14-03-11-pipeline.json   structured record for diffing runs
 *
 * The transcript is what you read; the sidecar is what you compare. Three weeks
 * later a decision note citing a cost or a speedup is only meaningful if the
 * run recorded which model and which budget cap produced it, so the envelope
 * carries both.
 *
 * ## Everything here is lazy
 *
 * Nothing happens at import: no `mkdirSync`, no open descriptor, no patched
 * console. `startRunLog()` is called from inside `main()`, which every lab
 * guards with `import.meta.main`. This matters because
 * `labs/03-extraction-pipeline/pipeline.test.ts` imports a pure helper out of
 * `batch.ts`, so that entrypoint *is* loaded during `bun test` — and `bun test`
 * must stay offline and free of filesystem side effects.
 *
 * ## Writes are synchronous, on purpose
 *
 * One `writeSync` per console line, no buffering. The runs most worth reading
 * back are the ones that ended badly: `verify.ts` calls `process.exit()`, which
 * does not flush async writes; `batch.ts` polls for minutes and invites a
 * Ctrl-C; any lab can throw mid-run. A syscall per line is unmeasurable next to
 * one HTTP round trip. `scratchpad.ts` made the same call for the same reason.
 *
 * ## Known gap
 *
 * The Agent SDK runs the Claude Code binary as a subprocess whose stderr goes
 * to an inherited descriptor, not through our `console`. Those lines appear on
 * the terminal but not in the transcript. Catching them needs a descriptor-level
 * tee, which breaks TTY colour detection and behaves badly on Windows — not a
 * trade worth making for a study log.
 */

import { closeSync, existsSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { format } from "node:util";

import { LOG_DIR_NAME, LOG_RUNS, MAX_BUDGET_USD, MODEL } from "../config/env.ts";

export type RunStatus = "ok" | "failed" | "incomplete";

export interface RunLog {
  /** Absolute path to the transcript, or `""` when logging is off. */
  transcriptPath: string;
  /** Absolute path to the JSON sidecar, or `""` when logging is off. */
  sidecarPath: string;
  /** Delimit one phase of a multi-run lab in the transcript. */
  section(title: string): void;
  /** Append one entry to the sidecar's `runs[]`. */
  record(entry: Record<string, unknown>): void;
  /** Set one top-level key under the sidecar's `metrics`. */
  metric(key: string, value: unknown): void;
  /** Restore console, close the descriptor, write the sidecar. Idempotent. */
  close(final?: { status?: RunStatus }): void;
}

export interface StartRunLogInput {
  /** The calling lab's own `import.meta.dir`. Never `process.cwd()`. */
  dir: string;
  /** Short entrypoint name, e.g. `"pipeline"`. Becomes part of the filename. */
  label: string;
}

/**
 * ANSI SGR escapes only — the six colour helpers at the top of `print.ts` and
 * nothing else. Deliberately not a general CSI eater: if anyone adds cursor
 * movement or screen clears to the printer, widen this to match.
 */
const SGR = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(SGR, "");
}

/**
 * Timestamp first so `ls out/` sorts chronologically and `ls out/ | tail -1` is
 * the most recent run.
 *
 * `toISOString()` contains colons, which are illegal in Windows filenames, and
 * a dot before the milliseconds. Both become hyphens.
 */
export function runLogBasename(at: Date, label: string): string {
  const stamp = at.toISOString().replace(/\.\d+Z$/, "").replace(/[:.]/g, "-");
  return `${stamp}-${label}`;
}

/** Handed back when `LAB_LOG=0`, so call sites never need an `if`. */
function inertLog(): RunLog {
  return {
    transcriptPath: "",
    sidecarPath: "",
    section: () => {},
    record: () => {},
    metric: () => {},
    close: () => {},
  };
}

export function startRunLog(input: StartRunLogInput): RunLog {
  if (!LOG_RUNS) return inertLog();

  const outDir = isAbsolute(LOG_DIR_NAME)
    ? LOG_DIR_NAME
    : join(input.dir, LOG_DIR_NAME);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const startedAt = new Date();
  const stem = runLogBasename(startedAt, input.label);
  const transcriptPath = join(outDir, `${stem}.log`);
  const sidecarPath = join(outDir, `${stem}.json`);

  const fd = openSync(transcriptPath, "a");
  const runs: Record<string, unknown>[] = [];
  const metrics: Record<string, unknown> = {};
  let status: RunStatus = "incomplete";
  let closed = false;

  const originalLog = console.log;
  const originalError = console.error;

  // `format` so multi-argument and object arguments render exactly as console
  // would. A bare `console.log()` must still emit a blank line.
  const tee = (passthrough: (...args: unknown[]) => void) => {
    return (...args: unknown[]): void => {
      passthrough(...args);
      try {
        writeSync(fd, `${stripAnsi(format(...args))}\n`, null, "utf8");
      } catch {
        // A failed log write must never take down the lab it is observing.
      }
    };
  };

  console.log = tee(originalLog.bind(console));
  console.error = tee(originalError.bind(console));

  const log: RunLog = {
    transcriptPath,
    sidecarPath,

    section(title: string): void {
      console.log(`\n${"─".repeat(72)}\n${title}\n${"─".repeat(72)}`);
    },

    record(entry: Record<string, unknown>): void {
      runs.push(entry);
    },

    metric(key: string, value: unknown): void {
      metrics[key] = value;
    },

    close(final?: { status?: RunStatus }): void {
      if (closed) return;
      closed = true;
      if (final?.status) status = final.status;

      console.log = originalLog;
      console.error = originalError;
      try {
        closeSync(fd);
      } catch {
        // Already closed.
      }

      const finishedAt = new Date();
      writeFileSync(
        sidecarPath,
        `${JSON.stringify(
          {
            schema: 1,
            lab: basename(input.dir),
            entrypoint: input.label,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            model: MODEL,
            maxBudgetUsd: MAX_BUDGET_USD,
            status,
            transcript: basename(transcriptPath),
            runs,
            metrics,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    },
  };

  // Safety net for every exit path, including `verify.ts`'s two `process.exit`
  // calls. Sync-only work is legal in an `exit` handler; `close()` is
  // idempotent, so an explicit call earlier still wins on `status`.
  process.on("exit", () => log.close());

  // Bun's crash reporter bypasses `console.error`, so without these a crashed
  // run's transcript just stops mid-sentence with no reason recorded. Having
  // taken over crash printing, exit explicitly to preserve the exit code.
  process.on("uncaughtException", (error) => {
    console.error(`\nUncaught exception: ${error?.stack ?? String(error)}`);
    log.close({ status: "failed" });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error(`\nUnhandled rejection: ${String(reason)}`);
    log.close({ status: "failed" });
    process.exit(1);
  });

  return log;
}

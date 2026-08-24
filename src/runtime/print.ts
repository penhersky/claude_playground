/**
 * Pretty-printer for the `query()` message stream.
 *
 * Without filtering you see raw message objects including system init and
 * internal state — useful for debugging, noise otherwise. This renders the
 * three things that matter when studying an agent's behaviour: what it said,
 * what it called, and what the run cost.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

export interface PrintOptions {
  /** Show the `system:init` banner (loaded skills, commands, MCP servers). */
  showInit?: boolean;
  /** Truncate tool inputs to this many characters. */
  maxInputChars?: number;
}

/** Accumulated across a run so a lab can assert on what happened. */
export interface RunTrace {
  toolCalls: { name: string; input: unknown; insideSubagent: boolean }[];
  subagentInvocations: string[];
  deniedTools: string[];
  costUsd: number;
  resultSubtype: string | undefined;
  resultText: string | undefined;
}

export function emptyTrace(): RunTrace {
  return {
    toolCalls: [],
    subagentInvocations: [],
    deniedTools: [],
    costUsd: 0,
    resultSubtype: undefined,
    resultText: undefined,
  };
}

/**
 * The subagent-spawning tool was renamed `Task` → `Agent` in Claude Code
 * v2.1.63. Current SDKs emit `"Agent"` in `tool_use` blocks but still use
 * `"Task"` in the `system:init` tool list and in `permission_denials`.
 * Matching both keeps this working across versions.
 */
const SPAWN_TOOL_NAMES = new Set(["Agent", "Task"]);

export function isSpawnTool(name: string): boolean {
  return SPAWN_TOOL_NAMES.has(name);
}

/**
 * Render one streamed message and fold it into `trace`.
 *
 * Typed loosely on purpose: the SDK's message union gains members regularly,
 * and a lab shouldn't fail to compile because a new one appeared.
 */
export function printMessage(
  message: SDKMessage,
  trace: RunTrace,
  options: PrintOptions = {},
): void {
  const { showInit = false, maxInputChars = 240 } = options;
  const msg = message as unknown as Record<string, any>;
  const nested = Boolean(msg["parent_tool_use_id"]);
  const indent = nested ? "    " : "";

  switch (message.type) {
    case "system": {
      if (msg["subtype"] === "init" && showInit) {
        console.log(bold("── session init ──"));
        console.log(`  model:    ${msg["model"] ?? "(default)"}`);
        console.log(`  skills:   ${fmtList(msg["skills"])}`);
        console.log(`  commands: ${fmtList(msg["slash_commands"])}`);
        console.log(`  mcp:      ${fmtServers(msg["mcp_servers"])}`);
        console.log();
      }
      if (msg["subtype"] === "compact_boundary") {
        const meta = msg["compact_metadata"] ?? {};
        console.log(dim(`  [compacted at ${meta.pre_tokens} tokens, ${meta.trigger}]`));
      }
      return;
    }

    case "assistant": {
      for (const block of msg["message"]?.content ?? []) {
        if (block.type === "text" && block.text.trim()) {
          console.log(indent + block.text.trim());
        } else if (block.type === "tool_use") {
          trace.toolCalls.push({
            name: block.name,
            input: block.input,
            insideSubagent: nested,
          });
          if (isSpawnTool(block.name)) {
            const kind = block.input?.subagent_type ?? "general-purpose";
            trace.subagentInvocations.push(kind);
            console.log(indent + yellow(`→ spawn ${kind}`));
          } else {
            console.log(
              indent + cyan(`→ ${block.name}`) + " " + dim(preview(block.input, maxInputChars)),
            );
          }
        }
      }
      return;
    }

    case "result": {
      const subtype = String(msg["subtype"]);
      trace.resultSubtype = subtype;
      trace.costUsd = Number(msg["total_cost_usd"] ?? 0);
      if (typeof msg["result"] === "string") trace.resultText = msg["result"];

      for (const denial of msg["permission_denials"] ?? []) {
        trace.deniedTools.push(String(denial.tool_name));
      }

      console.log();
      const ok = subtype === "success";
      console.log(
        bold("── ") +
          (ok ? green(subtype) : red(subtype)) +
          bold(" ──") +
          dim(`  $${trace.costUsd.toFixed(4)}  ${msg["num_turns"] ?? "?"} turns`),
      );
      if (trace.deniedTools.length > 0) {
        console.log(red(`  denied: ${trace.deniedTools.join(", ")}`));
      }
      return;
    }

    default:
      return;
  }
}

function preview(value: unknown, max: number): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function fmtList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "(none)";
  return value.join(", ");
}

function fmtServers(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "(none)";
  return value
    .map((s: any) => `${s.name}=${s.status}`)
    .join(", ");
}

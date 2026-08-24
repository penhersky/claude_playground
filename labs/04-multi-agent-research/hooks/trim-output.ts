/**
 * `PostToolUse` output trimming — Task 5.1.
 *
 * Tool results accumulate in context in proportion to their **size**, not their
 * relevance. A research run that loads five documents is carrying five full
 * documents in the coordinator's window for the rest of the session, when what
 * it needs from each is a handful of dated claims.
 *
 * When you own the tool, trim at the source (see `returnRelevantView` in lab 1).
 * When you don't — a third-party MCP server, a built-in — a `PostToolUse` hook
 * with `updatedToolOutput` is the seam: it replaces the result *before Claude
 * sees it*, so the full text never enters context at all.
 *
 * The same hook normalizes heterogeneous formats (Task 1.5): different sources
 * write dates differently, and reconciling that in the hook means every
 * downstream agent sees one format.
 */

import type { HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";

type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: "PostToolUse";
    updatedToolOutput?: string;
    additionalContext?: string;
  };
};

/** Beyond this many characters, a document gets summarized instead of passed through. */
export const TRIM_THRESHOLD_CHARS = 1_200;

export interface TrimStats {
  calls: number;
  charsBefore: number;
  charsAfter: number;
}

export function newTrimStats(): TrimStats {
  return { calls: 0, charsBefore: 0, charsAfter: 0 };
}

/**
 * Reduce a document to the lines that carry extractable claims.
 *
 * Keeps headings (structure), any line with a number or a date (the claims and
 * their provenance), and any line mentioning methodology (the caveat that
 * explains conflicts). Drops narrative connective tissue.
 *
 * Deliberately lossy, and deliberately conservative about *what* it drops: a
 * trim that discards dates or methodology notes would break the provenance
 * chain that Task 5.6 is about. Trimming and losing attribution are different
 * things, and it is easy to do the second while intending the first.
 */
export function trimDocument(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeading = trimmed.startsWith("#");
    const hasNumber = /\d/.test(trimmed);
    const isMethodology = /methodolog|scope|comparab|caveat|note:|excluded|published/i.test(
      trimmed,
    );

    if (isHeading || hasNumber || isMethodology) kept.push(trimmed);
  }

  return kept.join("\n");
}

/** Normalize the date formats different sources use (Task 1.5). */
export function normalizeDates(text: string): string {
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };

  return text.replace(
    /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/g,
    (match, day: string, month: string, year: string) => {
      const mm = months[month.toLowerCase()];
      if (!mm) return match;
      return `${year}-${mm}-${day.padStart(2, "0")}`;
    },
  );
}

/**
 * Build the trimming hook.
 *
 * Matches only `load_document`. A hook with no matcher runs on every tool call,
 * including ones whose output is already small — that is wasted work and a
 * chance to corrupt something that didn't need touching.
 */
export function trimHooks(stats: TrimStats): { PostToolUse: HookCallbackMatcher[] } {
  return {
    PostToolUse: [
      {
        matcher: "mcp__corpus__load_document",
        hooks: [
          async (input): Promise<HookOutput> => {
            const hookInput = input as unknown as Record<string, any>;
            const response = hookInput["tool_response"] ?? hookInput["tool_result"];
            const original = extractText(response);
            if (original === null) return {};

            stats.calls++;
            stats.charsBefore += original.length;

            if (original.length <= TRIM_THRESHOLD_CHARS) {
              stats.charsAfter += original.length;
              return {};
            }

            const trimmed = normalizeDates(trimDocument(original));
            stats.charsAfter += trimmed.length;

            return {
              hookSpecificOutput: {
                hookEventName: "PostToolUse",
                // Replaces what Claude sees. The full text never enters context.
                updatedToolOutput: trimmed,
                additionalContext:
                  `[trimmed ${original.length} → ${trimmed.length} chars: headings, ` +
                  "numeric lines, and methodology notes kept; narrative dropped]",
              },
            };
          },
        ],
      },
    ],
  };
}

function extractText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const obj = response as Record<string, any>;
    const text = obj["content"]?.[0]?.text;
    if (typeof text === "string") return text;
  }
  return null;
}

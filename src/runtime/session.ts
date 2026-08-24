/**
 * Session resumption and forking — exam Task 1.7.
 *
 * The judgment the exam tests is *when* to resume rather than how:
 *
 *   resume  — prior context is mostly still valid, and you can tell the agent
 *             exactly which files changed since. Cheap, keeps the analysis.
 *   fork    — you want two divergent branches from one shared baseline
 *             (comparing two refactoring strategies, two test approaches).
 *   fresh   — prior tool results are stale. Starting over with an injected
 *             structured summary is more reliable than resuming with results
 *             that no longer describe the code.
 */

import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";

export interface SessionSummary {
  sessionId: string;
  title: string | undefined;
  messageCount: number | undefined;
  updatedAt: string | undefined;
}

/** List recent sessions for the current project, newest first. */
export async function recentSessions(limit = 10): Promise<SessionSummary[]> {
  const sessions = await listSessions({ limit });
  return sessions.map((s) => {
    const raw = s as unknown as Record<string, any>;
    return {
      sessionId: String(raw["sessionId"] ?? raw["session_id"] ?? raw["id"]),
      title: raw["title"],
      messageCount: raw["messageCount"] ?? raw["message_count"],
      updatedAt: raw["updatedAt"] ?? raw["updated_at"],
    };
  });
}

/**
 * Options that continue an existing session in place.
 *
 * Pair this with an explicit changed-files note in the prompt. A resumed agent
 * has no idea the working tree moved under it, and re-analyzing everything
 * defeats the point of resuming.
 */
export function resumeOptions(sessionId: string, extra: Options = {}): Options {
  return { resume: sessionId, ...extra };
}

/**
 * Options that branch a new session off an existing one.
 *
 * `forkSession: true` is what separates this from {@link resumeOptions}: the
 * parent transcript stays intact and usable, so you can fork it again for a
 * third approach. Without the flag, `resume` continues the same session and
 * both branches would trample each other.
 */
export function forkOptions(sessionId: string, extra: Options = {}): Options {
  return { resume: sessionId, forkSession: true, ...extra };
}

/**
 * Build the "here is what changed" preamble for a resumed session.
 *
 * Pure and exported so it can be unit-tested without an API key.
 */
export function changedFilesPreamble(changed: string[]): string {
  if (changed.length === 0) {
    return "No files have changed since your previous analysis. Prior findings still hold.";
  }
  return [
    "These files changed since your previous analysis:",
    ...changed.map((f) => `  - ${f}`),
    "",
    "Re-analyze only those files and anything that depends on them.",
    "Everything else from your earlier findings still holds — do not re-explore it.",
  ].join("\n");
}

/**
 * Decide between resuming and starting fresh.
 *
 * The heuristic the guide describes: resume while the prior analysis is mostly
 * intact; start fresh with an injected summary once enough of it is stale that
 * you would be reasoning over results that no longer describe reality.
 */
export function shouldResume(input: {
  filesAnalyzed: number;
  filesChanged: number;
  /** Whether the earlier session's tool results are still trustworthy. */
  toolResultsStale: boolean;
}): { resume: boolean; reason: string } {
  if (input.toolResultsStale) {
    return {
      resume: false,
      reason: "Prior tool results are stale; start fresh with a structured summary.",
    };
  }
  if (input.filesAnalyzed === 0) {
    return { resume: false, reason: "Nothing was analyzed; there is no context worth keeping." };
  }
  const churn = input.filesChanged / input.filesAnalyzed;
  if (churn > 0.5) {
    return {
      resume: false,
      reason: `${Math.round(churn * 100)}% of analyzed files changed; the baseline no longer describes the code.`,
    };
  }
  return {
    resume: true,
    reason: `Only ${input.filesChanged}/${input.filesAnalyzed} files changed; resume and re-analyze those.`,
  };
}

/** Read back a session's transcript, e.g. to build a summary for a fresh run. */
export async function transcript(sessionId: string, limit = 200): Promise<unknown[]> {
  const info = await getSessionInfo(sessionId);
  if (!info) return [];
  return getSessionMessages(sessionId, { limit });
}

/**
 * A file that exists to be read.
 *
 * Reading it is what triggers on-demand loading of `sandbox/CLAUDE.md` (a
 * directory-level memory file) and of `.claude/rules/typescript.md` (a rule
 * scoped to `**\/*.ts`). Neither is in context at launch; both should be after.
 *
 * The check, in a Claude Code session at the repo root:
 *
 *   1. /context      → note what's under "Memory files"
 *   2. read this file
 *   3. /context      → sandbox/CLAUDE.md is now listed
 *
 * If nothing changed, work through the README's troubleshooting section. The
 * usual causes are a `paths:` glob that doesn't match, or `project` being
 * excluded from the active setting sources.
 */

/** Mirrors the error envelope described in standards/api-conventions.md. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /**
     * Same distinction as `isRetryable` in `src/mcp/errors.ts`. An HTTP client
     * and an agent need the same thing from an error: whether trying again
     * could plausibly work.
     */
    retryable: boolean;
  };
}

export function apiError(code: string, message: string, retryable = false): ApiError {
  return { error: { code, message, retryable } };
}

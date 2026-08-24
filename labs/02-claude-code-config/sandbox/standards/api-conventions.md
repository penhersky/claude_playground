# API conventions (imported)

Reached via `@./standards/api-conventions.md` from `sandbox/CLAUDE.md`. It has
no `paths:` frontmatter and is not in `.claude/rules/` — it is a plain file that
the import expands inline.

The content is deliberately mundane. What matters for the exercise is *where it
came from*: if you can see these rules in a session, the import chain resolved;
if you can't, it didn't, and `/memory` will tell you which files actually loaded.

## Conventions

- Handlers live in `src/api/handlers/`, one file per resource.
- Every endpoint validates its input at the boundary. No handler trusts its caller.
- Errors use the shared envelope: `{ error: { code, message, retryable } }`.
  The `retryable` flag mirrors `isRetryable` in `src/mcp/errors.ts` on purpose —
  the same distinction matters to an HTTP client and to an agent.
- Responses are versioned by path (`/v1/…`), never by header.
- Every endpoint carries an OpenAPI docstring; the spec is generated, not written.

## The exercise

Confirm the import resolved:

1. Open a Claude Code session at the repo root.
2. Ask Claude to read `labs/02-claude-code-config/sandbox/notes.ts`.
3. Run `/context` and look under **Memory files**. `sandbox/CLAUDE.md` should now
   be listed — it was not there at launch.
4. Ask "what's the error envelope for API handlers?". Answering from these rules
   means the import expanded.
5. Run `/memory` to see every memory file location across user and project scope.

Then try it the other way: start a session **inside** `sandbox/` and check
`/context` immediately. This file is present from the start, because the
directory is now on the path from the root down to the working directory.

---
paths:
  - "**/*.test.ts"
---

# Testing conventions

- `bun:test` only — `import { describe, expect, test } from "bun:test"`.
- **Tests never call the Claude API.** `bun test` must run green with no
  `ANTHROPIC_API_KEY` set and no network. Anything that needs the API belongs in
  a `bun run labN` entrypoint, not a test.
- That constraint is a design forcing function: keep decision logic (permission
  gates, error classification, validators, routing, conflict merging) in pure
  functions that take plain data, and keep the model call at the edge.
- Tests live next to the code they cover: `foo.ts` → `foo.test.ts`.
- Name tests after the behaviour under test, not the function:
  `test("denies process_refund before the customer is verified")`.

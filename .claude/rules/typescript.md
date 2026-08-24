---
paths:
  - "**/*.ts"
---

# TypeScript conventions

- Bun runs `.ts` directly. There is no build step; `bun run typecheck` (`tsc --noEmit`) is the only compile gate.
- `verbatimModuleSyntax` is on: import types with `import type { X } from "..."`, never a bare `import { X }` for a type-only symbol.
- Relative imports inside this repo carry the `.ts` extension (`allowImportingTsExtensions`), e.g. `import { MODEL } from "../../src/config/env.ts"`.
- `noUncheckedIndexedAccess` is on: `arr[0]` is `T | undefined`. Narrow it, don't assert it away.
- Prefer `satisfies` over `as` when you want a literal checked against a type without widening it.
- No default exports. Named exports only, so renames are greppable.

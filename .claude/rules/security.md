---
paths:
  - "**/*"
---

# Security and secrets

Loaded unconditionally — it has no narrowing `paths` beyond `**/*` on purpose,
because these apply to every file in the repo.

- Never write a credential into a tracked file. `.env` is gitignored, denied in
  `.claude/settings.json`, and blocked by the `block-env-writes.sh` PreToolUse hook.
  New variables get a documented placeholder in `.env.example` and nothing else.
- `.mcp.json` references secrets only through `${VAR}` expansion. Never inline a token.
- Lab fixtures and the research corpus are **synthetic**. Do not paste real
  customer data, order IDs, or internal documents into `labs/*/fixtures/` or
  `labs/*/corpus/`.
- Every agent entrypoint sets a `maxBudgetUsd` cap. Don't remove it to "let it finish";
  raise it deliberately and say why.
- Don't add `permissionMode: "bypassPermissions"` to a lab. If a lab needs broad
  access, widen `allowedTools` explicitly so the grant is reviewable in the diff.

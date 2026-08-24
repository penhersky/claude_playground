---
paths:
  - "src/**/*.ts"
  - "labs/**/*.ts"
---

# Agent SDK conventions

Facts that are easy to get wrong from memory. Check here before writing SDK code.

## `query()`

- A one-shot `query()` **throws after** yielding its error result. Always wrap the
  `for await` loop in `try`/`catch`, or you lose the result you already streamed.
- `options.env` **replaces** the subprocess environment in the TypeScript SDK
  (Python merges). Spread `process.env` or you drop `PATH` and `ANTHROPIC_API_KEY`.
- Go through `runAgent()` in `src/runtime/run.ts` rather than calling `query()`
  directly — it applies the budget cap, the subagent caps, and the printer.

## Tools and permissions

- SDK MCP tool names are `mcp__<serverKey>__<toolName>`, where `serverKey` is the
  key in `options.mcpServers`, not the `name` passed to `createSdkMcpServer`.
- Wildcards in `allowedTools` are only legal after a literal `mcp__<server>__`
  prefix. `"*"` and `"mcp__*"` are ignored with a startup warning.
- `allowedTools` does **not** constrain `bypassPermissions`. To block something
  under that mode, use `disallowedTools` or a `PreToolUse` hook.
- Evaluation order is: hooks → deny → ask → mode → allow → `canUseTool`.
  A tool auto-approved by a bare `allowedTools` entry never reaches `canUseTool`;
  a `PreToolUse` hook is the only thing that runs on *every* call.

## Subagents

- The spawning tool was renamed `Task` → `Agent` in Claude Code v2.1.63. Put
  **both** names in `allowedTools`; `tool_use` blocks emit `"Agent"` while the
  `system:init` tool list still says `"Task"`.
- Subagents inherit **no** parent conversation. Everything they need goes in the
  Agent tool's prompt string.
- Parallelism comes from emitting multiple Agent calls in **one** assistant
  response, not from separate turns.

## Skills

- Skills load from the filesystem via `settingSources`. If you set
  `settingSources` explicitly, include `"user"` and `"project"` or discovery breaks.
- In SDK sessions the `allowed-tools` frontmatter field does **not** apply to
  project/personal skills — grant tools through `options.allowedTools`.

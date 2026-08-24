---
name: sdk-doc
description: Fetch the authoritative Claude Agent SDK or Claude Code documentation page for a topic and answer from it, instead of answering an SDK question from memory. Use whenever an option name, type field, frontmatter key, or config shape needs to be exact.
argument-hint: "[topic or doc slug]"
allowed-tools: WebFetch Read
---

# Authoritative SDK lookup — $ARGUMENTS

The SDK moves faster than any model's training data. Option names, hook payload
shapes, and frontmatter fields are exactly the things that drift. **Fetch, don't
recall.**

## Steps

1. Map `$ARGUMENTS` to a doc slug using the table below. If nothing matches,
   fetch `https://code.claude.com/docs/llms.txt` and find the right page there.
2. WebFetch `https://code.claude.com/docs/en/<slug>.md` — the `.md` suffix
   returns source markdown rather than the rendered page.
3. Answer **only** from the fetched page. Quote the literal field names.
4. If the answer contradicts something in `.claude/rules/agent-sdk.md`, say so
   explicitly and propose the correction to that rule file.

## Slug map

| Topic | Slug |
|---|---|
| query options, types, message union | `agent-sdk/typescript` |
| the agent loop, stop conditions, budget | `agent-sdk/agent-loop` |
| custom tools, `tool()`, `createSdkMcpServer` | `agent-sdk/custom-tools` |
| external MCP servers, `.mcp.json` | `agent-sdk/mcp` |
| hooks, `PreToolUse`, `hookSpecificOutput` | `agent-sdk/hooks` |
| permission modes, allow/deny/ask evaluation | `agent-sdk/permissions` |
| `canUseTool`, approvals, clarifying questions | `agent-sdk/user-input` |
| subagents, `AgentDefinition` | `agent-sdk/subagents` |
| skills in SDK sessions, command dispatch | `agent-sdk/skills` |
| structured output from an agent | `agent-sdk/structured-outputs` |
| sessions, resume, fork | `agent-sdk/sessions` |
| cost and usage tracking | `agent-sdk/cost-tracking` |
| — | — |
| `settings.json` reference | `settings` |
| permission rule syntax, path anchors | `permissions` |
| hooks in settings files, matchers | `hooks` |
| `SKILL.md` frontmatter | `skills` |
| CLAUDE.md hierarchy, `.claude/rules/`, `@import` | `memory` |
| filesystem subagent files | `sub-agents` |
| built-in tool names and inputs | `tools-reference` |

For **Claude API** questions (Messages API, `tool_use`, structured outputs,
Batches, prompt caching, model IDs) invoke the bundled `claude-api` skill
instead — it carries a cached, versioned reference for those.

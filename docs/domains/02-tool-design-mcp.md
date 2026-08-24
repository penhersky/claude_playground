# Domain 2 — Tool Design & MCP Integration (18%)

Five task statements. The lightest of the four technical domains, and the most
mechanical — most items reduce to one of three claims.

Full task statements: [`../exam/blueprint.md`](../exam/blueprint.md#domain-2--tool-design--mcp-integration-18).

## The three claims

1. **Tool descriptions are the primary mechanism LLMs use for tool selection.**
   Not the tool name, not the system prompt, not few-shot examples. When
   selection is unreliable, fix the descriptions *first*.
2. **Errors need structure, not prose.** Category, retryability, context.
3. **Fewer tools per agent beats more.** Selection reliability degrades with
   decision complexity.

Nearly every Domain 2 item is one of these three with different surface details.

## Tool descriptions (Task 2.1)

A description needs four things. The guide lists them, and an item that offers
"expand the description" as an option almost always means all four:

| Ingredient | Example |
|---|---|
| Input formats | "Accepts an order number in the form ORD-4417. Not a customer ID." |
| Example queries | "'Okafor' matches several accounts" |
| Edge cases | "when this returns multiple matches, ask for another identifier" |
| Boundaries vs. similar tools | "For questions about the PERSON, use `get_customer` instead" |

Worked before/after, with commentary on each ingredient:
[`labs/01-multi-tool-agent/tools/descriptions.before.md`](../../labs/01-multi-tool-agent/tools/descriptions.before.md)
and [`descriptions.after.md`](../../labs/01-multi-tool-agent/tools/descriptions.after.md).

Two moves the guide names for overlapping tools:

- **Rename and re-scope.** `analyze_content` → `extract_web_results`, with a
  web-specific description. The overlap disappears because the names no longer
  compete.
- **Split a generic tool.** `analyze_document` → `extract_data_points`,
  `summarize_content`, `verify_claim_against_source`. Each with a defined
  input/output contract.

And a subtle one: **check the system prompt for keyword-sensitive instructions
that override good descriptions.** A prompt saying "always analyze customer
context first" creates a pull toward any tool with "customer" in its name,
regardless of what its description says.

## Structured errors (Task 2.2)

Four categories, each implying a different agent response:

| Category | Cause | Agent should | Retryable |
|---|---|---|---|
| `transient` | timeout, service unavailable | retry | ✅ |
| `validation` | invalid input | fix arguments, re-call | ❌ |
| `business` | policy violation | explain to the user; maybe escalate | ❌ |
| `permission` | not authorized | escalate | ❌ |

Implementation: [`src/mcp/errors.ts`](../../src/mcp/errors.ts).

Three things the guide is specific about:

- Include `isRetryable` explicitly. Making the agent infer it from the message
  is how retry loops start.
- **Local recovery in subagents** for transient failures. Propagate upward only
  what cannot be resolved locally, with what was attempted and any partial
  results.
- **An access failure and a valid empty result are different.** `toolEmpty()`
  exists for this: `found: false, reason: "no_matches"` plus an explicit "do not
  retry". Reporting a failure as empty is the more dangerous direction — the
  coordinator concludes the topic has no coverage and the gap never surfaces.

## Tool distribution and `tool_choice` (Task 2.3)

> Giving an agent access to too many tools (e.g., 18 instead of 4-5) degrades
> tool selection reliability by increasing decision complexity.

Corollaries:

- Scope each subagent's tools to its role. In
  [`labs/04-multi-agent-research/agents.ts`](../../labs/04-multi-agent-research/agents.ts)
  the synthesizer has **none** — a synthesis agent that can search will search,
  and a coverage gap becomes an unsourced assertion.
- Replace a generic tool with a constrained one: `fetch_url` →
  `load_document`, which validates that the URL is a document.
- Give a **scoped cross-role tool** for a genuine high-frequency need — a
  `verify_fact` for the synthesis agent — and route the complex cases through
  the coordinator. This is the escape hatch, not a licence to widen everything.

`tool_choice`:

| Mode | Guarantee |
|---|---|
| `"auto"` | none — the model may return text instead |
| `"any"` | a tool is called; the model picks which |
| `{type:"tool", name}` | *that* tool is called |

Only the third gives you **ordering**. Demonstrated in
[`labs/03-extraction-pipeline/extract.ts`](../../labs/03-extraction-pipeline/extract.ts).

## MCP integration (Task 2.4)

| Scope | File | For |
|---|---|---|
| Project | `.mcp.json` | shared team tooling, committed |
| User | `~/.claude.json` | personal/experimental |

Scopes **compose** — tools from every configured server are discovered at
connection time and available simultaneously.

`${GITHUB_TOKEN}` expansion is how a credential-needing server gets committed
without the credential. [`.mcp.json`](../../.mcp.json) does both.

Two judgment calls the guide asks about:

- **Enhance MCP tool descriptions** or the agent falls back to a built-in.
  Faced with a thin `search_issues` and a well-described `Grep`, it picks `Grep`.
- **Prefer community servers for standard integrations** (Jira, GitHub);
  reserve custom servers for team-specific workflows.

**MCP resources** are the underused half: exposing a content catalog — issue
summaries, doc hierarchies, database schemas — lets an agent see what data
exists instead of probing for it one call at a time.
[`labs/04-multi-agent-research/failures.ts`](../../labs/04-multi-agent-research/failures.ts)
does the catalog idea with a `list_documents` tool.

## Built-in tools (Task 2.5)

| Tool | For |
|---|---|
| `Grep` | file **contents** — function names, error messages, imports |
| `Glob` | file **paths** — `**/*.test.tsx` |
| `Read`/`Write` | whole files |
| `Edit` | targeted change via unique text match |

Two specifics that show up as items:

- When `Edit` fails on a **non-unique** match, fall back to `Read` + `Write`.
- Build understanding **incrementally**: `Grep` for entry points, then `Read` to
  follow imports and trace flows. Reading everything up front exhausts context
  before you learn anything.

To trace a function across wrapper modules: first identify all exported names,
then search for each name — the wrapper re-exports under a different identifier,
so searching for the original finds nothing.

## Drills

```
/exam-drill 2 6
/domain-review labs/01-multi-tool-agent/tools 2
```

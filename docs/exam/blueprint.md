# CCAR-F exam blueprint

Transcribed from the official **Claude Certified Architect – Foundations Exam
Guide, Version 1.0, effective July 2026** (exam code `CCAR-F`), published on the
Anthropic Partner Academy. This file is the ground truth for everything in this
repo. If it disagrees with a blog post or a practice-test site, this wins — and
if the official guide has since been revised, re-download it and update here.

> Source: <https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification>

## Exam details

| | |
|---|---|
| Exam code | `CCAR-F` |
| Items | 60 |
| Format | Multiple-choice and multiple-response; each item states how many to select |
| Structure | 4 scenarios, drawn at random from a bank of 6 |
| Time limit | 120 minutes |
| Delivery | Proctored — online and/or test center |
| Passing score | Scaled **720** on a 100–1,000 scale |
| Fee | $125 USD |
| Validity | 12 months from award |
| Reporting | Pass/fail with scaled score, plus **percent-correct by domain** |

Scoring is **domain-weighted**, not raw percent-correct. A weak heavy domain
costs more than a weak light one, so allocate study time by weight.

## Domain weights

| Domain | Content | Weight | Drilled by |
|---|---|---|---|
| 1 | Agentic Architecture & Orchestration | **27%** | [Lab 1](../../labs/01-multi-tool-agent/), [Lab 4](../../labs/04-multi-agent-research/) |
| 2 | Tool Design & MCP Integration | **18%** | [Lab 1](../../labs/01-multi-tool-agent/), [Lab 2](../../labs/02-claude-code-config/) |
| 3 | Claude Code Configuration & Workflows | **20%** | [Lab 2](../../labs/02-claude-code-config/) |
| 4 | Prompt Engineering & Structured Output | **20%** | [Lab 3](../../labs/03-extraction-pipeline/) |
| 5 | Context Management & Reliability | **15%** | [Lab 1](../../labs/01-multi-tool-agent/), [Lab 3](../../labs/03-extraction-pipeline/), [Lab 4](../../labs/04-multi-agent-research/) |

Domains 1 and 5 together are 42% — nearly half the exam is orchestration and
reliability, not API surface knowledge.

## Intended audience

A solution architect who designs and implements production applications with
Claude, with hands-on experience in: building agentic applications with the
Agent SDK (multi-agent orchestration, subagent delegation, tool integration,
lifecycle hooks); configuring Claude Code for team workflows (CLAUDE.md, Agent
Skills, MCP servers, plan mode); designing MCP tool and resource interfaces;
and engineering prompts for reliable structured output.

Items test **practical judgment about architecture, configuration, and
tradeoffs**, not recall. Every question is "which of these four real techniques
fits *this* symptom".

---

# Domain 1 — Agentic Architecture & Orchestration (27%)

## Task 1.1 — Design and implement agentic loops for autonomous task execution

**Knowledge of**
- The agentic loop lifecycle: send request → inspect `stop_reason` (`"tool_use"` vs `"end_turn"`) → execute requested tools → return results for the next iteration.
- How tool results are appended to conversation history so the model can reason about the next action.
- Model-driven decision-making (Claude reasons about which tool to call next from context) vs. pre-configured decision trees or fixed tool sequences.

**Skills in**
- Loop control flow that continues while `stop_reason` is `"tool_use"` and terminates on `"end_turn"`.
- Adding tool results to context between iterations.
- Avoiding these anti-patterns: parsing natural-language signals to decide termination; using an arbitrary iteration cap as the *primary* stopping mechanism; treating the presence of assistant text as a completion indicator.

> Implemented in [`labs/01-multi-tool-agent/manual-loop.ts`](../../labs/01-multi-tool-agent/manual-loop.ts).

## Task 1.2 — Orchestrate multi-agent systems with coordinator-subagent patterns

**Knowledge of**
- Hub-and-spoke architecture: a coordinator manages all inter-subagent communication, error handling, and information routing.
- Subagents operate with isolated context — they do **not** inherit the coordinator's conversation history.
- The coordinator's role: task decomposition, delegation, result aggregation, and deciding which subagents to invoke based on query complexity.
- The risk of overly narrow decomposition, which leaves broad topics under-covered.

**Skills in**
- Coordinators that analyze query requirements and dynamically select subagents rather than always running the full pipeline.
- Partitioning scope across subagents to minimize duplication (distinct subtopics or source types per agent).
- Iterative refinement loops: evaluate synthesis output for gaps, re-delegate with targeted queries, re-synthesize until coverage suffices.
- Routing all subagent communication through the coordinator for observability, consistent error handling, and controlled information flow.

## Task 1.3 — Configure subagent invocation, context passing, and spawning

**Knowledge of**
- The Task tool as the spawning mechanism, and the requirement that `allowedTools` include `"Task"` for a coordinator to invoke subagents.
- Subagent context must be **explicitly provided in the prompt** — no automatic inheritance, no shared memory between invocations.
- `AgentDefinition` configuration: descriptions, system prompts, tool restrictions per subagent type.
- Fork-based session management for exploring divergent approaches from a shared baseline.

**Skills in**
- Including complete findings from prior agents directly in the next subagent's prompt.
- Using structured data formats that separate content from metadata (source URLs, document names, page numbers) so attribution survives the handoff.
- Spawning parallel subagents by emitting **multiple Task tool calls in a single coordinator response**, not across separate turns.
- Writing coordinator prompts that specify research goals and quality criteria rather than step-by-step procedure, so subagents can adapt.

> ⚠️ **Version note.** Claude Code renamed the spawning tool `Task` → `Agent` in
> v2.1.63. Current SDKs emit `"Agent"` in `tool_use` blocks but still report
> `"Task"` in the `system:init` tool list and in `result.permission_denials[].tool_name`.
> The exam guide is written against `"Task"`. Put **both** in `allowedTools`.

## Task 1.4 — Implement multi-step workflows with enforcement and handoff patterns

**Knowledge of**
- Programmatic enforcement (hooks, prerequisite gates) vs. prompt-based guidance for workflow ordering.
- Where deterministic compliance is required — e.g. identity verification before financial operations — **prompt instructions alone have a non-zero failure rate**.
- Structured handoff protocols for mid-process escalation, carrying customer details, root cause analysis, and recommended actions.

**Skills in**
- Programmatic prerequisites that block downstream tool calls until prerequisites complete (blocking `process_refund` until `get_customer` returns a verified customer ID).
- Decomposing multi-concern requests into distinct items, investigating each in parallel against shared context, then synthesizing one unified resolution.
- Compiling structured handoff summaries (customer ID, root cause, refund amount, recommended action) for human agents who cannot see the transcript.

> Implemented in [`labs/01-multi-tool-agent/hooks/prerequisite-gate.ts`](../../labs/01-multi-tool-agent/hooks/prerequisite-gate.ts).

## Task 1.5 — Apply Agent SDK hooks for tool call interception and data normalization

**Knowledge of**
- `PostToolUse` patterns that intercept tool results for transformation before the model processes them.
- Patterns that intercept outgoing tool calls to enforce compliance rules (blocking refunds above a threshold).
- Hooks for deterministic guarantees vs. prompt instructions for probabilistic compliance.

**Skills in**
- `PostToolUse` hooks that normalize heterogeneous formats (Unix timestamps, ISO 8601, numeric status codes) coming from different MCP tools.
- Interception hooks that block policy-violating actions (refunds over $500) and redirect to an alternative workflow such as human escalation.
- Choosing hooks over prompt-based enforcement when business rules require guaranteed compliance.

## Task 1.6 — Design task decomposition strategies for complex workflows

**Knowledge of**
- Fixed sequential pipelines (prompt chaining) vs. dynamic adaptive decomposition driven by intermediate findings.
- Prompt chaining patterns: analyze each file individually, then run a cross-file integration pass.
- The value of adaptive investigation plans that generate subtasks from what each step discovers.

**Skills in**
- Selecting the pattern to fit the workflow: chaining for predictable multi-aspect reviews, dynamic decomposition for open-ended investigation.
- Splitting large code reviews into per-file local passes plus a separate cross-file integration pass, to avoid attention dilution.
- Decomposing open-ended tasks ("add comprehensive tests to a legacy codebase") by mapping structure first, identifying high-impact areas, then producing a prioritized plan that adapts as dependencies surface.

## Task 1.7 — Manage session state, resumption, and forking

**Knowledge of**
- Named session resumption with `--resume <session-name>`.
- `fork_session` for independent branches from a shared analysis baseline.
- The need to tell a resumed agent which previously analyzed files have changed.
- Why starting fresh with a structured summary beats resuming with stale tool results.

**Skills in**
- Using `--resume` with session names to continue named investigations across work sessions.
- Using `fork_session` for parallel exploration branches (comparing two testing strategies from one shared codebase analysis).
- Choosing resumption (prior context mostly valid) vs. a fresh session with injected summaries (prior tool results stale).
- Informing a resumed session about specific file changes for targeted re-analysis instead of full re-exploration.

> Implemented in [`src/runtime/session.ts`](../../src/runtime/session.ts).

---

# Domain 2 — Tool Design & MCP Integration (18%)

## Task 2.1 — Design effective tool interfaces with clear descriptions and boundaries

**Knowledge of**
- **Tool descriptions are the primary mechanism LLMs use for tool selection.** Minimal descriptions produce unreliable selection among similar tools.
- Descriptions should include input formats, example queries, edge cases, and boundary explanations.
- Ambiguous or overlapping descriptions cause misrouting (`analyze_content` vs. `analyze_document` with near-identical text).
- System prompt wording affects tool selection: keyword-sensitive instructions can create unintended tool associations.

**Skills in**
- Writing descriptions that differentiate purpose, expected inputs, outputs, and when to use this tool *versus* similar alternatives.
- Renaming tools and rewriting descriptions to eliminate functional overlap (`analyze_content` → `extract_web_results`, with web-specific wording).
- Splitting a generic tool into purpose-specific tools with defined I/O contracts (`analyze_document` → `extract_data_points`, `summarize_content`, `verify_claim_against_source`).
- Reviewing system prompts for keyword-sensitive instructions that might override well-written descriptions.

> Demonstrated by the before/after pair in [`labs/01-multi-tool-agent/tools/`](../../labs/01-multi-tool-agent/tools/).

## Task 2.2 — Implement structured error responses for MCP tools

**Knowledge of**
- The MCP `isError` flag pattern for communicating failures back to the agent.
- Four error kinds: **transient** (timeout, service unavailable), **validation** (invalid input), **business** (policy violation), **permission**.
- Why uniform errors ("Operation failed") prevent appropriate recovery decisions.
- Retryable vs. non-retryable, and how structured metadata prevents wasted retries.

**Skills in**
- Returning `errorCategory` (transient/validation/permission), an `isRetryable` boolean, and a human-readable description.
- Including `retriable: false` and customer-friendly explanations for business rule violations.
- Local recovery inside subagents for transient failures, propagating to the coordinator only what cannot be resolved locally — along with partial results and what was attempted.
- Distinguishing **access failures** (need a retry decision) from **valid empty results** (a successful query with no matches).

> Implemented in [`src/mcp/errors.ts`](../../src/mcp/errors.ts).

## Task 2.3 — Distribute tools appropriately across agents and configure tool choice

**Knowledge of**
- Too many tools degrades selection reliability — 18 instead of 4–5 increases decision complexity.
- Agents holding tools outside their specialization tend to misuse them (a synthesis agent attempting web searches).
- Scoped tool access: only what the role needs, plus limited cross-role tools for specific high-frequency needs.
- `tool_choice` options: `"auto"`, `"any"`, and forced (`{"type": "tool", "name": "..."}`).

**Skills in**
- Restricting each subagent's tool set to its role.
- Replacing generic tools with constrained alternatives (`fetch_url` → `load_document` that validates document URLs).
- Providing scoped cross-role tools for high-frequency needs (a `verify_fact` tool for the synthesis agent) while routing complex cases through the coordinator.
- Forcing a specific tool first (`extract_metadata` before enrichment), then handling subsequent steps in follow-up turns.
- `tool_choice: "any"` to guarantee a tool call rather than conversational text.

## Task 2.4 — Integrate MCP servers into Claude Code and agent workflows

**Knowledge of**
- Scoping: project-level `.mcp.json` for shared team tooling vs. user-level `~/.claude.json` for personal/experimental servers.
- Environment variable expansion in `.mcp.json` (`${GITHUB_TOKEN}`) for credentials without committing secrets.
- Tools from all configured servers are discovered at connection time and available simultaneously.
- **MCP resources** as a way to expose content catalogs (issue summaries, doc hierarchies, DB schemas) to reduce exploratory tool calls.

**Skills in**
- Configuring shared servers in project-scoped `.mcp.json` with env expansion for auth tokens.
- Configuring personal/experimental servers in user-scoped `~/.claude.json`.
- Enhancing MCP tool descriptions so the agent doesn't fall back to a built-in like `Grep` over a more capable MCP tool.
- Choosing existing community servers for standard integrations (Jira), reserving custom servers for team-specific workflows.
- Exposing content catalogs as MCP resources so agents can see what data exists without exploring for it.

> Demonstrated by [`.mcp.json`](../../.mcp.json) and verified by [`labs/02-claude-code-config/verify.ts`](../../labs/02-claude-code-config/verify.ts).

## Task 2.5 — Select and apply built-in tools effectively

**Knowledge of**
- `Grep` for content search (function names, error messages, import statements).
- `Glob` for file path pattern matching.
- `Read`/`Write` for full file operations; `Edit` for targeted modification via unique text matching.
- When `Edit` fails on a non-unique match, `Read` + `Write` is the reliable fallback.

**Skills in**
- Picking `Grep` for content across a codebase, `Glob` for name patterns (`**/*.test.tsx`).
- `Read` then `Write` when `Edit` can't find unique anchor text.
- Building understanding incrementally: `Grep` for entry points, then `Read` to follow imports and trace flows — rather than reading everything up front.
- Tracing usage across wrapper modules by first identifying all exported names, then searching each name.

---

# Domain 3 — Claude Code Configuration & Workflows (20%)

## Task 3.1 — Configure CLAUDE.md files with hierarchy, scoping, and modular organization

**Knowledge of**
- The hierarchy: user-level `~/.claude/CLAUDE.md`, project-level `.claude/CLAUDE.md` or root `CLAUDE.md`, directory-level `CLAUDE.md` in subdirectories.
- User-level settings apply only to that user — `~/.claude/CLAUDE.md` is **not** shared with teammates via version control.
- `@import` syntax for referencing external files to keep CLAUDE.md modular.
- `.claude/rules/` for topic-specific rule files as an alternative to a monolithic CLAUDE.md.

**Skills in**
- Diagnosing hierarchy issues — e.g. a new teammate not receiving instructions because they live in user-level rather than project-level config.
- Using `@import` to include the standards files relevant to each package.
- Splitting a large CLAUDE.md into focused files in `.claude/rules/` (`testing.md`, `api-conventions.md`, `deployment.md`).
- Using `/memory` to verify which memory files are loaded and diagnose inconsistent behavior across sessions.

## Task 3.2 — Create and configure custom slash commands and skills

**Knowledge of**
- Project-scoped commands in `.claude/commands/` (shared via VCS) vs. user-scoped in `~/.claude/commands/`.
- Skills in `.claude/skills/` with `SKILL.md` supporting frontmatter including `context: fork`, `allowed-tools`, and `argument-hint`.
- `context: fork` runs the skill in an isolated subagent context, keeping its output out of the main conversation.
- Personal customization: a variant in `~/.claude/skills/` under a different name, so teammates are unaffected.

**Skills in**
- Creating project-scoped commands in `.claude/commands/` for team-wide availability.
- Using `context: fork` to isolate skills with verbose output (codebase analysis) or exploratory context (brainstorming).
- Configuring `allowed-tools` in skill frontmatter to restrict tool access during execution.
- Using `argument-hint` to prompt for required parameters.
- Choosing between skills (on-demand, task-specific) and CLAUDE.md (always-loaded, universal standards).

> Compare [`.claude/skills/exam-drill/SKILL.md`](../../.claude/skills/exam-drill/SKILL.md) (`context: fork`) with [`.claude/commands/study-plan.md`](../../.claude/commands/study-plan.md) (legacy flat form).

## Task 3.3 — Apply path-specific rules for conditional convention loading

**Knowledge of**
- `.claude/rules/` files with YAML frontmatter `paths` fields containing glob patterns for conditional activation.
- Path-scoped rules load only when editing matching files, reducing irrelevant context and token usage.
- Glob-pattern rules beat directory-level CLAUDE.md for conventions that span multiple directories (test files spread through a codebase).

**Skills in**
- Creating `.claude/rules/` files with `paths: ["terraform/**/*"]`-style scoping.
- Using glob patterns to apply conventions by file type regardless of directory (`**/*.test.tsx`).
- Choosing path-specific rules over subdirectory CLAUDE.md when conventions apply to files spread across the codebase.

> Implemented in [`.claude/rules/`](../../.claude/rules/).

## Task 3.4 — Determine when to use plan mode vs. direct execution

**Knowledge of**
- Plan mode is for complex tasks: large-scale changes, multiple valid approaches, architectural decisions, multi-file modifications.
- Direct execution suits simple, well-scoped changes (one validation check in one function).
- Plan mode enables safe exploration and design before committing, preventing costly rework.
- The `Explore` subagent isolates verbose discovery output and returns summaries, preserving main conversation context.

**Skills in**
- Choosing plan mode for architectural implications (microservice restructuring, a library migration touching 45+ files, choosing between integration approaches with different infra requirements).
- Choosing direct execution for well-understood changes (a single-file bug fix with a clear stack trace).
- Using `Explore` for verbose discovery phases to prevent context exhaustion in multi-phase tasks.
- Combining plan mode for investigation with direct execution for implementation.

## Task 3.5 — Apply iterative refinement techniques

**Knowledge of**
- Concrete input/output examples are the most effective way to communicate expected transformations when prose is interpreted inconsistently.
- Test-driven iteration: write the suite first, then iterate by sharing failures.
- The **interview pattern**: have Claude ask questions to surface considerations you hadn't anticipated, before implementing.
- Single message for interacting problems; sequential fixes for independent ones.

**Skills in**
- Providing 2–3 concrete input/output examples when natural language produces inconsistent results.
- Writing suites covering expected behavior, edge cases, and performance up front, then iterating on failures.
- Using the interview pattern to surface design considerations (cache invalidation, failure modes) in unfamiliar domains.
- Providing specific test cases with input and expected output to fix edge cases (nulls in migration scripts).
- Addressing multiple interacting issues in one detailed message; sequential iteration for independent ones.

## Task 3.6 — Integrate Claude Code into CI/CD pipelines

**Knowledge of**
- The `-p` / `--print` flag for non-interactive mode in automated pipelines.
- `--output-format json` and `--json-schema` for enforcing structured output in CI.
- CLAUDE.md as the mechanism for supplying project context (testing standards, fixture conventions, review criteria) to CI-invoked Claude Code.
- **Session context isolation**: the same session that generated code is less effective at reviewing its own changes than an independent instance.

**Skills in**
- Running with `-p` to prevent interactive input hangs.
- `--output-format json` with `--json-schema` to produce machine-parseable findings for inline PR comments.
- Including prior review findings in context on re-runs, instructing Claude to report only new or still-unaddressed issues, to avoid duplicate comments.
- Providing existing test files in context so generated tests don't duplicate covered scenarios.
- Documenting testing standards, valuable-test criteria, and available fixtures in CLAUDE.md to improve test generation quality.

---

# Domain 4 — Prompt Engineering & Structured Output (20%)

## Task 4.1 — Design prompts with explicit criteria to improve precision

**Knowledge of**
- Explicit criteria beat vague instructions: "flag comments only when claimed behavior contradicts actual code behavior" vs. "check that comments are accurate".
- General instructions like "be conservative" or "only report high-confidence findings" **do not** improve precision compared to specific categorical criteria.
- False positive rates erode developer trust: a high-FP category undermines confidence in the accurate ones.

**Skills in**
- Writing review criteria that define which issues to report (bugs, security) versus skip (minor style, local patterns), rather than confidence-based filtering.
- Temporarily disabling high-FP categories to restore trust while improving those prompts.
- Defining explicit severity criteria with concrete code examples per level, for consistent classification.

## Task 4.2 — Apply few-shot prompting

**Knowledge of**
- Few-shot examples are the most effective technique for consistently formatted, actionable output when detailed instructions alone fall short.
- Their role in demonstrating ambiguous-case handling (tool selection for ambiguous requests, branch-level coverage gaps).
- They enable generalization to novel patterns, rather than matching only pre-specified cases.
- They reduce hallucination in extraction tasks (informal measurements, varied document structures).

**Skills in**
- 2–4 targeted examples for ambiguous scenarios, showing the reasoning for why one action beat plausible alternatives.
- Examples demonstrating the desired output format (location, issue, severity, suggested fix).
- Examples distinguishing acceptable patterns from genuine issues, reducing false positives while still generalizing.
- Examples covering varied document structures (inline citations vs. bibliographies, methodology sections vs. embedded details).
- Examples addressing empty/null extraction of required fields.

## Task 4.3 — Enforce structured output using tool use and JSON schemas

**Knowledge of**
- `tool_use` with JSON schemas is the most reliable route to guaranteed schema-compliant output, eliminating JSON syntax errors.
- `tool_choice: "auto"` (model may return text), `"any"` (must call a tool, its choice), forced (must call the named tool).
- Strict schemas eliminate **syntax** errors but not **semantic** ones — line items that don't sum, values in the wrong field.
- Schema design: required vs. optional fields; enums with an `"other"` + detail-string pattern for extensible categories.

**Skills in**
- Defining extraction tools with JSON schemas as input parameters and reading the structured data from the `tool_use` response.
- `tool_choice: "any"` to guarantee structured output when several extraction schemas exist and the document type is unknown.
- Forcing `{"type": "tool", "name": "extract_metadata"}` so a particular extraction runs before enrichment steps.
- Making fields optional/nullable when sources may not contain the information, so the model does not fabricate values to satisfy `required`.
- Adding `"unclear"` enum values for ambiguity, and `"other"` + detail fields for extensibility.
- Including format-normalization rules in the prompt alongside a strict output schema.

## Task 4.4 — Implement validation, retry, and feedback loops

**Knowledge of**
- Retry-with-error-feedback: append the specific validation errors to the retry prompt.
- Retry is ineffective when the information is simply **absent from the source** (as opposed to format or structural errors).
- Feedback loop design: track which code constructs triggered findings (a `detected_pattern` field) to analyze dismissal patterns.
- Semantic validation errors vs. schema syntax errors (the latter already eliminated by tool use).

**Skills in**
- Follow-up requests carrying the original document, the failed extraction, and the specific validation errors.
- Identifying when retries will fail (information exists only in an external document) vs. succeed (format mismatch, structural error).
- Adding `detected_pattern` to findings to enable false-positive pattern analysis when developers dismiss them.
- Self-correction validation flows: extract `calculated_total` alongside `stated_total` to flag discrepancies; add a `conflict_detected` boolean for inconsistent source data.

## Task 4.5 — Design efficient batch processing strategies

**Knowledge of**
- Message Batches API: **50% cost savings**, up to a **24-hour** processing window, **no latency SLA**.
- Appropriate for non-blocking, latency-tolerant workloads (overnight reports, weekly audits, nightly test generation); inappropriate for blocking workflows (pre-merge checks).
- The batch API does **not** support multi-turn tool calling within a single request.
- `custom_id` for correlating request/response pairs.

**Skills in**
- Matching API to latency requirements: synchronous for blocking pre-merge checks, batch for overnight/weekly analysis.
- Calculating submission frequency from SLA constraints (4-hour windows to guarantee a 30-hour SLA against 24-hour batch processing).
- Handling failures: resubmit only failed documents identified by `custom_id`, with modifications such as chunking oversized inputs.
- Refining the prompt on a sample set before batch-processing large volumes.

> Implemented in [`labs/03-extraction-pipeline/batch.ts`](../../labs/03-extraction-pipeline/batch.ts).

## Task 4.6 — Design multi-instance and multi-pass review architectures

**Knowledge of**
- Self-review limitations: a model retains its generation reasoning and is less likely to question its own decisions in the same session.
- Independent review instances beat self-review instructions or extended thinking for catching subtle issues.
- Multi-pass review: per-file local analysis plus cross-file integration passes, avoiding attention dilution and contradictory findings.

**Skills in**
- Using a second independent Claude instance to review generated code without the generator's reasoning context.
- Splitting large multi-file reviews into per-file passes for local issues plus separate integration passes for cross-file data flow.
- Verification passes where the model self-reports confidence per finding, enabling calibrated review routing.

---

# Domain 5 — Context Management & Reliability (15%)

## Task 5.1 — Manage conversation context across long interactions

**Knowledge of**
- Progressive summarization risks: numerical values, percentages, dates, and customer-stated expectations condensed into vague summaries.
- The **"lost in the middle"** effect: models reliably process the beginning and end of long inputs but may omit findings from the middle.
- Tool results accumulate and consume tokens disproportionately to their relevance (40+ fields per order lookup when 5 matter).
- The need to pass complete conversation history in subsequent requests to maintain coherence.

**Skills in**
- Extracting transactional facts (amounts, dates, order numbers, statuses) into a persistent "case facts" block included in each prompt, outside the summarized history.
- Persisting structured issue data into a separate context layer for multi-issue sessions.
- Trimming verbose tool outputs to relevant fields **before** they accumulate.
- Placing key-findings summaries at the beginning of aggregated inputs, with explicit section headers, to mitigate position effects.
- Requiring subagents to include metadata (dates, source locations, methodological context) in structured outputs.
- Making upstream agents return structured data (key facts, citations, relevance scores) instead of verbose content and reasoning chains when downstream agents have limited budget.

> Implemented in [`labs/04-multi-agent-research/hooks/trim-output.ts`](../../labs/04-multi-agent-research/hooks/trim-output.ts).

## Task 5.2 — Design escalation and ambiguity resolution patterns

**Knowledge of**
- Appropriate escalation triggers: the customer asks for a human; a policy exception or gap (not merely a complex case); inability to make meaningful progress.
- Escalate immediately when a customer explicitly demands it, versus offering to resolve when the issue is straightforward.
- Sentiment-based escalation and self-reported confidence scores are **unreliable** proxies for case complexity.
- Multiple customer matches require clarification (ask for additional identifiers), not heuristic selection.

**Skills in**
- Explicit escalation criteria with few-shot examples in the system prompt.
- Honoring explicit requests for a human immediately, without first investigating.
- Acknowledging frustration while offering resolution when within capability; escalating if the customer reiterates.
- Escalating when policy is ambiguous or silent on the request (competitor price matching when policy only covers own-site adjustments).
- Asking for additional identifiers when a tool returns multiple matches.

## Task 5.3 — Implement error propagation across multi-agent systems

**Knowledge of**
- Structured error context (failure type, attempted query, partial results, alternative approaches) enables intelligent coordinator recovery.
- Access failures (timeouts needing a retry decision) vs. valid empty results (successful query, no matches).
- Generic error statuses ("search unavailable") hide valuable context from the coordinator.
- Two anti-patterns: silently suppressing errors as empty successes, and terminating the whole workflow on a single failure.

**Skills in**
- Returning structured error context: failure type, what was attempted, partial results, potential alternatives.
- Distinguishing access failures from valid empty results.
- Subagents implementing local recovery for transient failures, propagating only what they can't resolve, with what was attempted and any partial results.
- Structuring synthesis output with **coverage annotations** marking which findings are well-supported and which topic areas have gaps from unavailable sources.

> Implemented in [`labs/04-multi-agent-research/failures.ts`](../../labs/04-multi-agent-research/failures.ts).

## Task 5.4 — Manage context in large codebase exploration

**Knowledge of**
- Context degradation in extended sessions: inconsistent answers, references to "typical patterns" rather than the specific classes discovered earlier.
- Scratchpad files for persisting key findings across context boundaries.
- Subagent delegation to isolate verbose exploration while the main agent coordinates high-level understanding.
- Structured state persistence for crash recovery: each agent exports state to a known location; the coordinator loads a manifest on resume.

**Skills in**
- Spawning subagents for specific questions ("find all test files", "trace refund flow dependencies") while the main agent preserves coordination.
- Maintaining scratchpad files of key findings and referencing them for later questions.
- Summarizing findings from one exploration phase before spawning the next, injecting summaries into initial context.
- Crash recovery via structured state exports (manifests) the coordinator loads on resume and injects into agent prompts.
- Using `/compact` when context fills with verbose discovery output.

> Implemented in [`labs/04-multi-agent-research/scratchpad.ts`](../../labs/04-multi-agent-research/scratchpad.ts).

## Task 5.5 — Design human review workflows and confidence calibration

**Knowledge of**
- Aggregate accuracy (97% overall) can mask poor performance on specific document types or fields.
- Stratified random sampling for measuring error rates in high-confidence extractions and detecting novel error patterns.
- Field-level confidence scores calibrated against labeled validation sets, for routing review attention.
- Validating accuracy by document type and field segment before automating high-confidence extractions.

**Skills in**
- Stratified random sampling of high-confidence extractions for ongoing error-rate measurement.
- Analyzing accuracy by document type and field before reducing human review.
- Having models output field-level confidence, then calibrating thresholds on labeled validation sets.
- Routing low-confidence or ambiguous/contradictory extractions to human review, prioritizing limited reviewer capacity.

> Implemented in [`labs/03-extraction-pipeline/review-routing.ts`](../../labs/03-extraction-pipeline/review-routing.ts).

## Task 5.6 — Preserve provenance and handle uncertainty in multi-source synthesis

**Knowledge of**
- Source attribution is lost during summarization when findings are compressed without preserving claim-source mappings.
- Structured claim-source mappings the synthesis agent must preserve and merge.
- Conflicting statistics from credible sources: **annotate the conflict with source attribution** rather than arbitrarily selecting one value.
- Temporal data: require publication/collection dates so temporal differences are not misread as contradictions.

**Skills in**
- Requiring subagents to output structured claim-source mappings (source URLs, document names, relevant excerpts) preserved through synthesis.
- Structuring reports with explicit sections separating well-established from contested findings, preserving original characterizations and methodological context.
- Completing document analysis with conflicting values included and explicitly annotated, letting the coordinator decide how to reconcile.
- Requiring publication or collection dates in structured outputs.
- Rendering content types appropriately in synthesis — financial data as tables, news as prose, technical findings as structured lists — rather than forcing one uniform format.

> Implemented in [`labs/04-multi-agent-research/findings.ts`](../../labs/04-multi-agent-research/findings.ts).

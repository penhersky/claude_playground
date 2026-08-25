# CCAR-F study plan — 21 days

**Built:** 2026-08-24 · **Exam:** 2026-09-14 (Mon) · **Mode:** live API, labs actually run

Starting state at build time: no lab had been run (`labs/*/.scratch` and
`labs/*/out` absent), `docs/decisions/` held only its README, `.env` missing.
This plan therefore front-loads building over reading — the exam is
scenario-based, and task statements read without having built the thing don't
transfer.

## Logistics

| | |
|---|---|
| Code | `CCAR-F` |
| Items | 60, multiple-choice and multiple-response (each item states how many to pick) |
| Structure | 4 scenarios drawn at random from the [6 known ones](exam/scenarios.md) |
| Time | 120 minutes → **2 min/item** |
| Pass | Scaled **720** of 100–1,000, domain-weighted |
| Fee | $125 USD · **Proctored** (online or test center) |
| Validity | 12 months |
| Report | Pass/fail + scaled score + **percent-correct by domain** |

Book the proctored slot by **2026-09-07** (day 15) — don't leave it to the final week.

---

## Week 1 — build all four labs

| Day | Date | Domain | Artifact | Done when |
|---|---|---|---|---|
| 1 | Aug 24 Mon | Setup + **D1** | `.env` from `.env.example`; `bun install` (**no `--omit=optional`**); `bun run typecheck`; `bun test`; then [manual-loop.ts](../labs/01-multi-tool-agent/manual-loop.ts) via `bun run lab1:loop` | `bun test` green with no network. You can point at the line where `stop_reason` decides continue-vs-stop, and you've watched `"tool_use"` → `"end_turn"` in real output |
| 2 | Aug 25 Tue | **D2** | [tools/](../labs/01-multi-tool-agent/tools/) — `descriptions.before.md` vs `.after.md`; swap the thin descriptions into `support-server.ts` and re-run | You have logged **which prompt** misrouted `get_customer` vs `lookup_order` under the thin descriptions. Decision note `001-*.md` written |
| 3 | Aug 26 Wed | **D1** | [hooks/prerequisite-gate.ts](../labs/01-multi-tool-agent/hooks/prerequisite-gate.ts); `bun run lab1`; the `multiConcern` prompt in [agent.ts](../labs/01-multi-tool-agent/agent.ts) | Refund blocked until `get_customer` returns a verified ID; an over-threshold refund redirects to escalation; a multi-concern message decomposes into one unified reply |
| 4 | Aug 27 Thu | **D3** | [.claude/rules/](../.claude/rules/) — all four files; edit a file under `src/**` and confirm `agent-sdk.md` loads; `/memory` to see what's loaded | You can state why glob-scoped rules beat a subdirectory `CLAUDE.md` for `**/*.test.tsx`, and why user-level `~/.claude/CLAUDE.md` never reaches a teammate |
| 5 | Aug 28 Fri | **D3 + D2** | `bun run lab2:verify`; add a personal server to `~/.claude.json`; compare [commands/study-plan.md](../.claude/commands/study-plan.md) against [skills/exam-drill/SKILL.md](../.claude/skills/exam-drill/SKILL.md) | `verify.ts` lists project **and** user servers. You can name what `context: fork`, `allowed-tools`, and `argument-hint` add over the flat command form |
| 6 | Aug 29 Sat | **D4** | [schema.ts](../labs/03-extraction-pipeline/schema.ts) + the `missing-field` fixture; `bun run lab3` | Model returns `null` rather than fabricating. You can explain why strict schemas kill **syntax** errors but not line-items-don't-sum |
| 7 | Aug 30 Sun | **D4 + D5** | [retry.ts](../labs/03-extraction-pipeline/retry.ts), [fewshot.ts](../labs/03-extraction-pipeline/fewshot.ts), [review-routing.ts](../labs/03-extraction-pipeline/review-routing.ts); kick off `bun run lab3:batch` (settles ≤24h) | You've classified two retry cases: format error (fixable) vs information absent from source (never fixable). Confidence threshold picked and written down |

## Week 2 — orchestration depth

| Day | Date | Domain | Artifact | Done when |
|---|---|---|---|---|
| 8 | Aug 31 Mon | **D1** | [coordinator.ts](../labs/04-multi-agent-research/coordinator.ts) + [agents.ts](../labs/04-multi-agent-research/agents.ts); `bun run lab4` | `allowedTools` carries **both** `"Task"` and `"Agent"`. You've deliberately removed a finding from a subagent prompt and watched the next subagent fail — context is not inherited |
| 9 | Sep 1 Tue | **D1** | `bun run lab4:parallel` | You have the measured speedup number, and a note on what happened when you unbalanced the subtasks |
| 10 | Sep 2 Wed | **D5** | [findings.ts](../labs/04-multi-agent-research/findings.ts), [failures.ts](../labs/04-multi-agent-research/failures.ts), [hooks/trim-output.ts](../labs/04-multi-agent-research/hooks/trim-output.ts), the conflicting docs in [corpus/](../labs/04-multi-agent-research/corpus/) | A timeout yields structured error context + partial results + coverage-gap annotation — not a dead run. Conflicting values both survive synthesis **with attribution** |
| 11 | Sep 3 Thu | **D1** | Blueprint Tasks 1.6 (decomposition) and 1.7 (sessions); [src/runtime/session.ts](../src/runtime/session.ts) | You can say when `--resume` beats a fresh session with an injected summary, and when `fork_session` is the right tool |
| 12 | Sep 4 Fri | **D1** | `/domain-review src/ 1` then `/exam-drill 1` | Domain 1 drill ≥ 80%. Every miss traced back to a task statement, not shrugged off |
| 13 | Sep 5 Sat | **D3** | Task 3.5 — run the three graded tasks in [tasks.md](../labs/02-claude-code-config/tasks.md); use the interview pattern on one | You have a calibration point on **when plan mode earned its cost** and roughly how much rework it prevented. Decision note written |
| 14 | Sep 6 Sun | **D3** | Task 3.6 — `-p`, `--output-format json`, `--json-schema`; then `/domain-review .claude/ 3` | You can sketch the CI invocation from memory and explain why the generating session shouldn't review its own diff |

## Week 3 — thin domains, scenarios, drills

| Day | Date | Domain | Artifact | Done when |
|---|---|---|---|---|
| 15 | Sep 7 Mon | **D4** | Tasks 4.1 and 4.6 — rewrite one review prompt from "be conservative" into explicit categorical criteria | You can articulate why "only report high-confidence findings" does **not** improve precision. **Exam slot booked today.** |
| 16 | Sep 8 Tue | **D4** | `/domain-review labs/03 4` then `/exam-drill 4`; check the `lab3:batch` results | Domain 4 drill ≥ 80%. Failed batch items resubmitted by `custom_id` with chunking |
| 17 | Sep 9 Wed | **D2** | Tasks 2.3 (`tool_choice` auto/any/forced) and 2.5 (built-ins); then [Scenario 4](exam/scenarios.md) — **the one with no lab** | You can pick `Grep` vs `Glob` vs `Read`+`Write` from the symptom alone, and you have written answers for Scenario 4's failure modes |
| 18 | Sep 10 Thu | **D2 + D5** | `/domain-review src/mcp 2`; Tasks 5.1, 5.2, 5.4 | Four error kinds named cold (transient / validation / business / permission). You can list the three legitimate escalation triggers and why sentiment and self-reported confidence are not among them |
| 19 | Sep 11 Fri | **D5** | Tasks 5.5, 5.6; `/domain-review labs/04 5`; then **rehearse all six** [scenarios](exam/scenarios.md) | For each of the 6 scenarios you have written down: what breaks, what you reach for, and the plausible alternative you reject and why |
| 20 | Sep 12 Sat | **All** | `/exam-drill all` — round 1, timed at 2 min/item | Scored per domain. Weakest domain identified by number, not by feel |
| 21 | Sep 13 Sun | **Weakest** | Re-read that domain's task statements in [blueprint.md](exam/blueprint.md); `/exam-drill all` round 2; skim your own [decisions/](decisions/) notes | Round 2 ≥ 80% in every domain. Then stop — the last evening is not for new material |

---

## Time allocation vs. blueprint weight

Blocks are counted in both domains where a day serves two.

| Domain | Weight | Blocks | Share | Days |
|---|---|---|---|---|
| 1 — Agentic Architecture | 27% | 6 | 30% | 1, 3, 8, 9, 11, 12 |
| 3 — Claude Code Config | 20% | 4 | 20% | 4, 5, 13, 14 |
| 4 — Prompt & Structured Output | 20% | 4 | 20% | 6, 7, 15, 16 |
| 2 — Tool Design & MCP | 18% | 4 | 20% | 2, 5, 17, 18 |
| 5 — Context & Reliability | 15% | 4 | 20% | 7, 10, 18, 19 |

Domain 1 is deliberately over-weighted: it is the heaviest single domain and,
together with Domain 5, accounts for 42% of the exam. Domains 2 and 5 look
over-allocated only because their blocks are shared with a co-taught domain.

## Non-negotiables

- **A decision note per lab day**, in `docs/decisions/NNN-slug.md`. Three of
  your own calibration points beat ten re-readings of a task statement — the
  exam asks which technique fits a symptom, not what a feature does.
- **Never recall SDK field names.** Use `/sdk-doc` or the `sdk-researcher`
  subagent. Names drift; the habit is what saves you.
- **Every entrypoint keeps `maxBudgetUsd`.** Live runs cost real money.
- Deliberate anti-patterns (e.g. `tools/descriptions.before.md`) are labelled.
  Don't fix them — they're half the lesson.

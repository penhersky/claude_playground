---
name: new-lab
description: Scaffold a new practice lab under labs/ with the repo's standard shape - an entrypoint wired to runAgent, a tools module, an offline test file, and a README that states which exam task statements the lab drills.
argument-hint: "[lab-name] [domain 1-5]"
allowed-tools: Read Glob Grep Write Edit
---

# Scaffold lab — $ARGUMENTS

Create `labs/NN-$1/` following the conventions the four existing labs share.

## Steps

1. `Glob labs/*` to find the highest existing `NN` prefix; the new lab is `NN+1`,
   zero-padded to two digits.
2. Read the closest existing lab for shape. Pick by domain:
   - Domain 1/2 agent with tools → `labs/01-multi-tool-agent/`
   - Domain 3 configuration → `labs/02-claude-code-config/`
   - Domain 4 raw Messages API → `labs/03-extraction-pipeline/`
   - Domain 1/5 orchestration → `labs/04-multi-agent-research/`
3. Write these files:

   | File | Contents |
   |---|---|
   | `README.md` | Objective, the exercise steps, and the exact task statement ids from `docs/exam/blueprint.md` that the lab drills |
   | `<entry>.ts` | Entrypoint. Agent labs call `runAgent()` from `src/runtime/run.ts`; API labs construct `new Anthropic()` directly |
   | `tools/*.ts` | `createSdkMcpServer` + `tool()` definitions, errors built with `toolError()` from `src/mcp/errors.ts` |
   | `*.test.ts` | Offline `bun:test` covering the lab's pure decision logic |

4. Add a `bun run` script for the entrypoint to `package.json`. That file is in
   the `ask` list in `.claude/settings.json`, so expect an approval prompt.
5. Link the new lab from the domain notes in `docs/domains/` and from `README.md`.

## Constraints

- Reuse `src/runtime/run.ts`, `src/runtime/print.ts`, and `src/mcp/errors.ts`.
  Do not write a second message printer or a second error-shape helper.
- Tests must pass with no API key and no network (`.claude/rules/testing.md`).
- Set a `maxBudgetUsd` on every agent entrypoint.

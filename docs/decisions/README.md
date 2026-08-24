# Decision notes

Short records of tradeoffs taken in this repo, and of what you observed when
running the labs.

This directory exists because **the exam is tradeoff-shaped**. Items don't ask
what a feature does; they present a production symptom and four real techniques,
and ask which one fits. Writing down your own calls — with the alternative you
rejected and why — builds the exact judgment that transfers.

## Format

One file per decision, named `NNN-short-slug.md`:

```markdown
# 003 — Trim tool output in a hook, not in the tool

**Date:** 2026-08-22
**Domain:** 5 (Task 5.1)

## Context
The corpus documents are 1–3 KB each. Five of them in the coordinator's
context for the rest of the run, when what it needs is a dozen dated claims.

## Decision
A `PostToolUse` hook with `updatedToolOutput`.

## Alternatives rejected
- **Trim inside the tool handler.** Correct when you own the tool — lab 1 does
  exactly this. Not available for a third-party MCP server or a built-in, and
  the lab is there to show the seam that works either way.
- **Ask the coordinator to summarize before passing on.** Probabilistic, and it
  happens *after* the full text is already in context.

## Consequence
Full documents never enter context. Risk: a trim that dropped dates would break
the provenance chain, so `research.test.ts` asserts dates survive.
```

## What to record

**Design decisions** as you build — especially where you picked one of two
defensible options.

**Lab observations**, which are the more valuable half:

- Lab 1: did swapping in the thin descriptions actually cause misrouting? On
  which prompts?
- Lab 2: which of the three tasks in `tasks.md` did plan mode earn its cost on?
  How much rework did it prevent?
- Lab 3: what confidence threshold did you calibrate to, and what did the
  caught-errors/review-volume curve look like?
- Lab 4: what speedup did parallel delegation give? What happened when you
  unbalanced the subtasks?

## Why this beats re-reading

The blueprint's task statements are already transcribed in
[`../exam/blueprint.md`](../exam/blueprint.md). Re-reading them is cheap and
mostly ineffective — they're written as competency descriptions, not as the
scenarios you'll actually face.

Three of your own calibration points on "when is plan mode worth it" beat ten
re-readings of Task 3.4.

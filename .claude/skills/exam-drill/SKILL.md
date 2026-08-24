---
name: exam-drill
description: Quiz the user on one CCAR-F exam domain with scenario-based multiple-choice questions in the style of the official exam, then grade the answers and explain why each distractor is wrong.
argument-hint: "[domain 1-5 | all] [count]"
context: fork
background: false
allowed-tools: Read Grep Glob
---

# Exam drill — $ARGUMENTS

Run a practice drill for the **Claude Certified Architect – Foundations** exam.

`context: fork` puts this whole drill in a forked subagent, so the question bank,
the user's wrong turns, and your grading rationale never land in the main
session's context. That is the point of the field — a drill is verbose and
single-purpose. `background: false` means the main thread waits for the result.

## Inputs

`$1` — domain number `1`–`5`, or `all`. Default `all`.
`$2` — how many questions. Default `5`.

## Steps

1. Read `docs/exam/blueprint.md` for the task statements of the selected domain.
   Read `docs/exam/scenarios.md` for the six official scenario framings.
2. Pick one scenario that lists the selected domain among its primary domains.
   Every question must be framed inside that production scenario — the real exam
   never asks context-free trivia.
3. Write `$2` questions. Follow the official item style:
   - Each stem describes an observed production symptom with a concrete number
     ("in 12% of cases the agent skips `get_customer`"), not an abstract question.
   - Four options. Exactly one is best. **Every distractor must be a real
     technique that is wrong *here*** — usually right-idea-wrong-layer:
     prompt guidance where deterministic enforcement is required, tool
     availability where tool *ordering* is the problem, more few-shot examples
     where the tool description is the actual defect.
   - State how many responses to select.
4. Present all questions first. Do not reveal answers until the user has answered.
5. Grade. For each item give: the correct answer, one sentence on why it wins,
   and one sentence per distractor on why it loses. Cite the task statement id
   (e.g. `Task 2.1`) that the item tests.
6. Close with a weighted score and the two task statements to review next.

## Calibration

Weight your question mix by the real blueprint when the user asks for `all`:
Domain 1 27%, Domain 3 20%, Domain 4 20%, Domain 2 18%, Domain 5 15%.

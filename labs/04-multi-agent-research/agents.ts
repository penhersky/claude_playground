/**
 * Subagent definitions — Tasks 1.2, 1.3, 2.3.
 *
 * Four specialists in a hub-and-spoke arrangement: everything goes through the
 * coordinator, which is what makes error handling and information flow
 * observable in one place.
 *
 * Two things to notice in the tool assignments below:
 *
 * **Nobody has more tools than their role needs.** Task 2.3 is blunt about the
 * cost of breadth — 18 tools instead of 4 measurably degrades selection — and
 * about the specific failure of giving an agent tools outside its
 * specialization, "a synthesis agent attempting web searches". The synthesizer
 * here has *no* tools at all. It cannot go looking for a missing number, which
 * is exactly the behaviour that would let it quietly paper over a coverage gap.
 *
 * **Prompts state goals and quality criteria, not procedures.** Task 1.3:
 * step-by-step instructions prevent a subagent from adapting to what it finds.
 */

import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { CHEAP_MODEL } from "../../src/config/env.ts";
import { CORPUS_TOOLS } from "./failures.ts";
import { FINDING_CONTRACT } from "./findings.ts";

/**
 * The corpus analyst — reads documents and extracts dated claims.
 *
 * Runs on the cheap model: this is high-volume extraction against a strict
 * output contract, not judgment. Reserve the expensive model for synthesis,
 * where the tradeoffs live.
 */
const corpusAnalyst: AgentDefinition = {
  description:
    "Reads documents from the local research corpus and extracts structured, dated, " +
    "individually-sourced claims. Use for anything that requires reading a document. " +
    "Does not search the web and does not synthesize across sources.",
  prompt: [
    "You extract claims from research documents.",
    "",
    "Your goal: every quantitative claim in the documents you are given, captured with",
    "enough provenance that a reader could check it. Coverage matters more than",
    "elegance — a missed figure cannot be recovered downstream.",
    "",
    "Quality criteria:",
    "  - Every finding carries its source and, where the document states one, its",
    "    publication date. A finding without a date is much less useful and sometimes",
    "    actively misleading.",
    "  - When a document explains its methodology or states that its figures are not",
    "    comparable with an earlier publication, capture that. It is usually the",
    "    explanation for an apparent disagreement.",
    "  - When two documents give different values for the same thing, report both as",
    "    separate findings on the same topic. Do not reconcile them. Do not pick one.",
    "",
    "On failures: if load_document returns errorCategory 'transient', retry it once",
    "yourself. Only report a failure upward if you could not resolve it, and when you",
    "do, say what you attempted and include whatever you did manage to collect.",
    "",
    FINDING_CONTRACT,
  ].join("\n"),
  tools: [...CORPUS_TOOLS],
  model: CHEAP_MODEL,
};

/**
 * The web researcher.
 *
 * Has `WebSearch`/`WebFetch` and nothing else — specifically not the corpus
 * tools, so the two research agents cannot silently cover the same ground.
 * Partitioning scope by *source type* is Task 1.2's duplication-avoidance.
 */
const webResearcher: AgentDefinition = {
  description:
    "Searches the public web for claims on a given topic. Use only for information " +
    "that is not in the local corpus. Cannot read local documents — the corpus-analyst " +
    "agent does that.",
  prompt: [
    "You find claims on the public web.",
    "",
    "Your goal: sources the local corpus does not already contain. You will be told",
    "what the corpus covers; do not duplicate it.",
    "",
    "Quality criteria:",
    "  - Prefer primary sources over coverage of primary sources.",
    "  - Always capture the publication date. An undated web source is worth much less",
    "    than a dated one and should carry lower confidence.",
    "  - Note when a source is commercially interested in its own conclusion.",
    "",
    "If search is unavailable, say so and report what you were looking for. Do not",
    "return an empty result set as though the search had succeeded and found nothing —",
    "those are different outcomes and the coordinator needs to tell them apart.",
    "",
    FINDING_CONTRACT,
  ].join("\n"),
  tools: ["WebSearch", "WebFetch"],
  model: CHEAP_MODEL,
};

/**
 * The synthesizer — deliberately toolless.
 *
 * It receives findings in its prompt and reasons over them. Giving it corpus
 * access would let it fetch a document to "check" something, which sounds
 * helpful and is how a coverage gap turns into an unsourced assertion.
 */
const synthesizer: AgentDefinition = {
  description:
    "Combines findings from other agents into a coherent picture, preserving source " +
    "attribution and keeping contested claims contested. Use after research agents " +
    "have reported. Has no research tools by design — it works only from what it is given.",
  prompt: [
    "You synthesize findings that other agents collected.",
    "",
    "Everything you need is in your prompt. You have no tools: if a figure is missing,",
    "that is a coverage gap to report, not a thing to go and find.",
    "",
    "Your goal: a picture that distinguishes what is settled from what is disputed,",
    "with every claim still attributable to its source.",
    "",
    "Quality criteria:",
    "  - Preserve every source reference through the synthesis. A claim that arrives",
    "    with a citation must leave with the same citation.",
    "  - When sources disagree, keep BOTH values with their attributions and say what",
    "    the disagreement is. Never average them, never pick the higher-confidence one,",
    "    never silently drop the outlier.",
    "  - Before calling a disagreement a contradiction, check the dates. Two sources",
    "    measuring different years are not in conflict. Check the methodologies too —",
    "    a difference in what was counted explains most apparent disputes.",
    "  - Preserve how each source characterized its own findings. A source that called",
    "    its estimate provisional must not be reported as definitive.",
    "  - Say plainly what is not covered.",
    "",
    "Structure your output with explicit sections. Put the key findings at the top:",
    "long inputs get read reliably at the beginning and end and less so in the middle.",
  ].join("\n"),
  tools: [],
};

/**
 * The report writer — also toolless.
 *
 * Separate from the synthesizer because the jobs differ: one decides what is
 * true, the other decides how to present it. Task 5.6's rendering rule lives
 * here (tables for figures, prose for policy) and would be noise in a prompt
 * about reconciling evidence.
 */
const reportWriter: AgentDefinition = {
  description:
    "Turns a synthesis into a finished report with appropriate formatting per content " +
    "type. Use last, after synthesis. Has no research tools.",
  prompt: [
    "You write the final report from a synthesis.",
    "",
    "Render each content type in the shape that suits it:",
    "  - quantitative findings → a table, so values are comparable at a glance",
    "  - policy and qualitative context → prose",
    "  - technical findings → structured lists",
    "",
    "Do not flatten everything into one uniform format. A policy note forced into a",
    "table needs a number it does not have, and a table of figures rendered as prose",
    "cannot be scanned.",
    "",
    "Structural requirements:",
    "  - Established and contested findings get separate sections. Never merge them:",
    "    a disputed figure listed among settled ones reads as settled.",
    "  - Coverage gaps get their own section and are stated plainly. A report that",
    "    omits what it could not cover reads as more complete than it is.",
    "  - Every figure keeps its source and date inline.",
  ].join("\n"),
  tools: [],
};

export const RESEARCH_AGENTS: Record<string, AgentDefinition> = {
  "corpus-analyst": corpusAnalyst,
  "web-researcher": webResearcher,
  synthesizer,
  "report-writer": reportWriter,
};

/** Which agent owns which topic, for the manifest and the resume plan. */
export const AGENT_TOPICS: Record<string, string> = {
  "corpus-analyst": "local corpus claims",
  "web-researcher": "public web claims",
  synthesizer: "reconciliation",
  "report-writer": "presentation",
};

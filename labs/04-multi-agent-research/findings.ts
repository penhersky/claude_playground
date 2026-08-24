/**
 * Structured findings with provenance — Tasks 1.3 and 5.6.
 *
 * The failure this prevents: a subagent reads three sources, writes a fluent
 * paragraph, and the synthesis agent merges three fluent paragraphs into one.
 * Every claim survives; every citation, date, and methodological caveat is gone.
 * Nobody notices, because the output reads well.
 *
 * The fix is to make the *unit of transfer* between agents a record, not prose.
 * Separating content (`claim`) from metadata (`source`, `publishedAt`) is what
 * lets attribution survive an arbitrary number of summarization hops.
 */

export interface Source {
  /** Document name or URL. What a reader would need to find it again. */
  ref: string;
  /**
   * Publication or collection date, ISO.
   *
   * Task 5.6 singles this out: without dates, two sources measuring different
   * years look like a contradiction, and a synthesis agent will "resolve" a
   * disagreement that was never one.
   */
  publishedAt: string | null;
  /** How the source arrived at its numbers, where it says. */
  methodology: string | null;
}

export interface Finding {
  /** One assertion. Not a paragraph — a paragraph cannot be conflict-checked. */
  claim: string;
  /** Verbatim excerpt supporting the claim. Quoted, not paraphrased. */
  evidence: string;
  source: Source;
  /** The subject this claim is about, used to detect conflicts. */
  topic: string;
  /** Numeric value where the claim is quantitative, for direct comparison. */
  value: number | null;
  unit: string | null;
  /** 0–1, from the reporting subagent. */
  confidence: number;
}

export interface ConflictGroup {
  topic: string;
  findings: Finding[];
  /** Whether the values differ because the sources measured different periods. */
  likelyTemporal: boolean;
  note: string;
}

export interface Synthesis {
  /** Claims with no contradiction anywhere in the set. */
  established: Finding[];
  /** Claims that disagree. Both values kept, with attribution. */
  contested: ConflictGroup[];
  /** Topics nothing covered, because a subagent failed or found nothing. */
  coverageGaps: CoverageGap[];
}

export interface CoverageGap {
  topic: string;
  reason: string;
  /** What was attempted, so a re-run does not repeat it. */
  attempted: string;
}

/** Relative difference beyond which two numbers count as disagreeing. */
const CONFLICT_TOLERANCE = 0.05;

/** Years apart before a difference is more likely temporal than contradictory. */
const TEMPORAL_GAP_DAYS = 365;

/**
 * Group findings by topic and separate the settled from the contested.
 *
 * The rule the exam states plainly: when credible sources disagree, **annotate
 * the conflict with attribution rather than arbitrarily selecting one value**.
 * Nothing here picks a winner. Picking is the coordinator's call, and often the
 * reader's.
 */
export function synthesize(findings: Finding[], gaps: CoverageGap[] = []): Synthesis {
  const byTopic = new Map<string, Finding[]>();
  for (const finding of findings) {
    const bucket = byTopic.get(finding.topic) ?? [];
    bucket.push(finding);
    byTopic.set(finding.topic, bucket);
  }

  const established: Finding[] = [];
  const contested: ConflictGroup[] = [];

  for (const [topic, group] of byTopic) {
    if (group.length === 1) {
      established.push(group[0]!);
      continue;
    }

    const numeric = group.filter((f) => f.value !== null);
    if (numeric.length < 2) {
      // Several qualitative claims about one topic — corroboration, not conflict.
      established.push(...group);
      continue;
    }

    const values = numeric.map((f) => f.value!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max === 0 ? 0 : (max - min) / Math.abs(max);

    if (spread <= CONFLICT_TOLERANCE) {
      // Agreement within tolerance. Keep the best-sourced one.
      established.push(bestSourced(group));
      continue;
    }

    const temporal = isLikelyTemporal(numeric);
    contested.push({
      topic,
      findings: group,
      likelyTemporal: temporal,
      note: temporal
        ? `Values differ by ${(spread * 100).toFixed(0)}%, but the sources are more than ` +
          "a year apart. This is probably measurement of different periods rather than " +
          "a contradiction — report both with their dates, do not reconcile."
        : `Sources disagree by ${(spread * 100).toFixed(0)}% on comparable periods. ` +
          "Report every value with its attribution and let the reader weigh them.",
    });
  }

  return { established, contested, coverageGaps: gaps };
}

function bestSourced(findings: Finding[]): Finding {
  return [...findings].sort((a, b) => {
    // Dated beats undated, then higher confidence.
    const dated = Number(Boolean(b.source.publishedAt)) - Number(Boolean(a.source.publishedAt));
    if (dated !== 0) return dated;
    return b.confidence - a.confidence;
  })[0]!;
}

function isLikelyTemporal(findings: Finding[]): boolean {
  const dates = findings
    .map((f) => f.source.publishedAt)
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  if (dates.length < 2) return false;
  const span = Math.max(...dates) - Math.min(...dates);
  return span > TEMPORAL_GAP_DAYS * 86_400_000;
}

/**
 * Render a synthesis as a report.
 *
 * Two structural choices are the objective, not styling:
 *
 *  1. **Established and contested get their own sections.** Flattening them
 *     into one list is how a contested figure gets read as settled.
 *  2. **Coverage gaps are stated, not omitted.** A report that silently drops
 *     what it couldn't cover reads as more complete than it is.
 *
 * Task 5.6 also asks for content-appropriate rendering: quantitative claims as
 * a table, qualitative ones as prose. Forcing everything into one uniform shape
 * loses information either way.
 */
export function renderReport(synthesis: Synthesis, title: string): string {
  const lines: string[] = [`# ${title}`, ""];

  // Key findings first. "Lost in the middle" is real: models process the start
  // and end of a long input reliably and drop things from the middle.
  lines.push("## Summary", "");
  lines.push(
    `${synthesis.established.length} well-supported findings, ` +
      `${synthesis.contested.length} contested, ` +
      `${synthesis.coverageGaps.length} coverage gaps.`,
    "",
  );

  const quantitative = synthesis.established.filter((f) => f.value !== null);
  const qualitative = synthesis.established.filter((f) => f.value === null);

  if (quantitative.length > 0) {
    lines.push("## Established — quantitative", "");
    lines.push("| Topic | Value | Source | Published |");
    lines.push("|---|---|---|---|");
    for (const f of quantitative) {
      lines.push(
        `| ${f.topic} | ${f.value}${f.unit ? ` ${f.unit}` : ""} | ${f.source.ref} | ${f.source.publishedAt ?? "undated"} |`,
      );
    }
    lines.push("");
  }

  if (qualitative.length > 0) {
    lines.push("## Established — qualitative", "");
    for (const f of qualitative) {
      lines.push(`- ${f.claim} — *${f.source.ref}*${dateSuffix(f.source)}`);
    }
    lines.push("");
  }

  if (synthesis.contested.length > 0) {
    lines.push("## Contested", "");
    for (const group of synthesis.contested) {
      lines.push(`### ${group.topic}`, "", group.note, "");
      for (const f of group.findings) {
        lines.push(
          `- **${f.value !== null ? `${f.value}${f.unit ? ` ${f.unit}` : ""}` : f.claim}** ` +
            `— ${f.source.ref}${dateSuffix(f.source)}`,
        );
        lines.push(`  > ${f.evidence}`);
        if (f.source.methodology) lines.push(`  Methodology: ${f.source.methodology}`);
      }
      lines.push("");
    }
  }

  if (synthesis.coverageGaps.length > 0) {
    lines.push("## Coverage gaps", "");
    lines.push(
      "These topics are not covered. The absence is reported rather than omitted, so",
      "the report is not read as more complete than it is.",
      "",
    );
    for (const gap of synthesis.coverageGaps) {
      lines.push(`- **${gap.topic}** — ${gap.reason} (attempted: ${gap.attempted})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function dateSuffix(source: Source): string {
  return source.publishedAt ? ` (${source.publishedAt})` : " (undated)";
}

/**
 * The instruction block every subagent gets, appended to its prompt.
 *
 * Lives here rather than in each agent definition so the output contract has
 * exactly one definition. A synthesis agent can only preserve attribution the
 * upstream agents actually emitted.
 */
export const FINDING_CONTRACT = [
  "Report every finding as a JSON object with these fields, and nothing else:",
  "",
  "  claim       one assertion, not a paragraph",
  "  evidence    a verbatim excerpt from the source supporting it",
  "  source      { ref, publishedAt (ISO or null), methodology (or null) }",
  "  topic       the subject the claim is about, so conflicting claims can be grouped",
  "  value       the number, when the claim is quantitative; null otherwise",
  "  unit        the unit for that number; null otherwise",
  "  confidence  0-1, based on what the source supports",
  "",
  "Rules:",
  "  - Never merge two sources into one finding. One finding, one source.",
  "  - Always include publishedAt when the source states a date. Without it,",
  "    two sources measuring different years look like a contradiction.",
  "  - When two sources disagree, report BOTH as separate findings on the same",
  "    topic. Do not reconcile them and do not pick one — that decision belongs",
  "    to the coordinator, with both values in front of it.",
  "  - Quote evidence verbatim. A paraphrase cannot be checked against the source.",
].join("\n");

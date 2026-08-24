# Research corpus

Five synthetic documents about the same fictional subject: grid-scale battery
storage in the fictional region of **Ardenne**. All content is invented. Do not
replace it with real research.

The corpus is built to make specific synthesis failures observable rather than
theoretical:

| File | What it plants |
|---|---|
| `ardenne-grid-2024.md` | Baseline figures, clearly dated 2024 |
| `ardenne-grid-2026.md` | **Different figures for the same metrics**, dated 2026. Not a contradiction — a *temporal* difference, which a naive synthesis will report as one |
| `helios-institute-2026.md` | A **genuine** disagreement with `ardenne-grid-2026.md` on curtailment, same period, different methodology |
| `vendor-brief-2026.md` | Confident marketing figures with **no methodology and no date**. Should be down-weighted, not silently dropped |
| `regulator-note-2025.md` | Qualitative policy context with no numbers, which the report should render as prose rather than force into a table |

## What a correct synthesis does

**The 2024/2026 pair is not a conflict.** Deployed capacity differs because the
years differ. `synthesize()` detects the >365-day gap and marks the group
`likelyTemporal`, and the report says so. A synthesis that "resolves" this by
picking the newer number has thrown away the trend, which was the interesting
part.

**The curtailment pair is a real conflict.** Both cover 2026 H1. The grid
operator says 4.1%, Helios says 6.8%, and they measure differently — one counts
economic curtailment, the other counts all curtailment. Both values belong in
the report, with attribution and with the methodology note that explains the
gap. Averaging them produces a number that is true of nothing.

**The vendor brief is undated and unmethodical.** `bestSourced()` ranks dated
sources above undated ones, so it loses ties. It does not disappear — a reader
weighing the evidence should be able to see that the optimistic figure came from
a vendor.

**The regulator note has no numbers.** It should end up under "Established —
qualitative" as prose. Forcing it into the quantitative table would require
inventing a value.

## The exercise

Run `bun run lab4` and check the report against those four expectations. The
common failure is the second one: a synthesis agent that has been asked for "a
clear answer" will pick 4.1% or 6.8% and never mention the other. That is the
behaviour Task 5.6 is about, and it is very easy to reproduce — try removing
the conflict rules from `FINDING_CONTRACT` and re-running.

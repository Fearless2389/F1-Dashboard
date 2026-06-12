# Design decisions

Eight short architecture decision records (ADRs) covering the
non-obvious calls that shape Paddock Dashboard. Each entry: the
choice, why it was made, what alternatives were rejected, and the
trade-off it carries.

---

## 1. Time-aware train split — 2018–2024 + 2026 in train, 2025 validation

**Decision.** Train the six models on 2018–2024 plus 2026 races; hold
2025 out as validation. Predict on 2026 going forward.

**Why.** F1 regulations change every 2–4 seasons. The 2022 regs (ground
effect), 2024 regs (front-wing flex), and the 2026 regs (active aero +
new power units) each materially shift driver/car form. A naive
last-N-races holdout would mix regulatory eras in training and
validation, leaking future signal backwards.

**Why 2026 is in train.** The 2026 regs reshape the field. If we
validated against 2026, every 2026 race we ingest would shift the
calibration. Treating 2026 as part of training and using 2025 (the
last full season under the previous regs) as validation gives a stable
out-of-time check that doesn't move when we ingest a new 2026 round.

**Alternatives rejected.** Random k-fold (would leak future
information); last-30-races holdout (mixes eras); single-season
holdout (under-samples).

**Trade-off.** When 2025 was a slow season for a given driver/team,
their 2026 prediction inherits the pessimism. Mitigated by per-season
features that let the model down-weight prior signal.

---

## 2. Plackett-Luce simulator over independent samples

**Decision.** Sample race outcomes from a **Plackett-Luce** distribution
over `prob_win` rather than drawing each driver's finish position
independently.

**Why.** Independent sampling lets the same driver "finish 1st in
three places at once" across positions — physically impossible.
Plackett-Luce draws an ordering, removes the sampled driver from the
pool, then draws the next, preserving the no-duplicate constraint
that any real race has.

**Why it matters for the distribution matrix.** Independent sampling
would show VER's row as ~70% P1 / 30% spread elsewhere. Plackett-Luce
shows ~70% P1 / 18% P2 / 7% P3 with the rest of the mass spreading
toward the bottom of the field — accurate even when the top is
dominant.

**Alternatives rejected.** Independent Bernoulli per position (breaks
the no-duplicate constraint); Bradley-Terry pairwise (doesn't scale to
22 drivers cleanly); deterministic ranking (no uncertainty).

**Trade-off.** Plackett-Luce assumes ranking utilities are
proportional to log-odds, which is approximate but better than the
alternatives.

---

## 3. Apex + Forecast merged into one page

**Decision.** The Predictor page (`/apex`) shows BOTH the model's
editorial pick (winner card with SHAP-driven prose) and the simulator's
probabilistic output (podium probabilities, P4–P10 confidence ladder,
22×22 distribution matrix) on a single route.

**Why.** Earlier these were two routes — `/apex` for the editorial pick
and `/forecast` for the probabilistic surface. Visitors would land on
one, miss the other, and walk away with half the story. Merging the
two means the page tells a single arc: "here's who wins, here's how
sure we are, here's why."

**Why the order matters.** Editorial first (humans read top-down),
probabilistic second. A hiring manager skims the winner card; an F1
fan scrolls down for the distribution matrix.

**Trade-off.** The page is long. Mitigated by collapsing the matrix
behind a Show/Hide toggle (it's the heaviest single block).

---

## 4. Round-aware standings

**Decision.** The `/standings` page exposes a "After round N" dropdown
in addition to the season selector. Jolpica is the source of truth —
queried with `?season={S}&round={R}` for any historical snapshot.

**Why.** "What were the standings at the end of round 12?" is a
non-trivial question that every F1 newcomer asks at some point.
Round-aware lookup makes it a one-click answer.

**Why championship-development is round-aware too.** The cumulative
points line chart respects the round filter, so the X-axis ends where
the user selected. Lets you compare two intra-season snapshots.

**Trade-off.** Pre-2018 rounds are unreliable in Jolpica (sprint
weekends in 2021 cause column mismatches). Mitigated by trimming the
season selector to 2025 + 2026.

---

## 5. Trimmed FastF1 cache — only two "hero" races

**Decision.** Ship the 2026 Bahrain and 2025 Spa caches at full
fidelity (timing + telemetry + car_data). Every other replayable race
ships with timing only.

**Why.** The full FastF1 cache for one race weekend is ~75 MB. A
season is 22–24 weekends. Carrying the full cache for every replayable
race would blow the Space's 50 GB persistent disk limit.

**Why these two races.** Bahrain is the season opener and a Red Bull
stronghold (good for showing dominant-driver UX). Spa rain races
generate the most overtake events (good for the OvertakeFeed).

**Trade-off.** Non-hero races still have the timing tower, track map,
and overtake feed, but the driver telemetry side-panel shows a "not
cached" empty state. Documented in the panel.

---

## 6. Team-mate H2H performance metrics over absolute formulas

**Decision.** The driver-profile performance strip uses team-mate
head-to-head percentages, not absolute-position averages, for
qualifying / race pace / consistency / overtaking / tyre management.

**Why.** Absolute formulas penalize good drivers in bad cars. A 2024
Hülkenberg avg-finish of P14 reads as "mid-pack driver." His H2H
against Magnussen (84% out-qualified) reads as "veteran punching above
his car's weight." Same data, very different conclusions.

**Why this matters for the visualisation.** The performance STRIP plots
each metric as a signed delta from team-mate parity (50%). Bar to the
right = ahead, bar to the left = behind. Zero-centred comparison is
~10× more readable than the radar polygon it replaced.

**Fallback for rookies.** Drivers with fewer than 3 races (rookies in
the early season) still see the original radar — there's no stable H2H
baseline for them yet. PerformanceRadar is kept in the tree
specifically for this graceful degradation.

**Trade-off.** The H2H metric can mislead when team-mates rotate
mid-season (e.g. Sargeant → Colapinto at Williams 2024). Mitigated by
weighting matchups linearly.

---

## 7. Coral + cream over coral + cyan

**Decision.** The palette is coral (`#ff5e6c`) as the only true brand
colour, cream (`#ede4d3`) as the editorial neutral, mint (`#7fc9a4`)
for semantic positive, amber (`#f5b800`) for semantic warning. No
second saturated colour.

**Why.** The original duo was coral + cyan (`#22e8c9`). It's the exact
palette Midjourney spits out for "modern dashboard 2024" — bright
pink/coral + bright teal. Two saturated colours both pulling for
attention reads as AI-generated portfolio.

**Why mint + amber as separate tokens.** Cyan was overloaded — it
meant "secondary brand," "good/up/hit," "at risk," AND "comparison"
all at the same time. The fastest-lap pill and the at-risk row used
the same colour. Splitting into mint (positive) and amber (warning)
fixes the semantic collision; cream takes the "editorial neutral" job
cyan was doing badly.

**Trade-off.** Lost the "bright complementary duo" look — some
visitors will read the new palette as monochromatic. Compensated by
the warm graphite background (`#0c0e17` shifted from `#0b0e1a`) which
gives the surface a slightly editorial warmth.

---

## 8. FIA-screen aesthetic for data-dense surfaces

**Decision.** The 22×22 distribution matrix, the standings tables, and
the replay timing tower all use a hard-edged "FIA timing screen"
visual register: no border-radius, character-cell column widths (ch
units, not pixels), 1px cream-rule column gutters, ALLCAPS 9px
monospace headers with wide letter-spacing, and a single coral
left-edge flash on row hover (no row-background tint).

**Why.** The real FIA timing screens broadcast during F1 sessions are
opinionated, dense, monospaced, and unmistakably motorsport. A
generic Tailwind admin table looks like every other SaaS dashboard.

**Why the same register across three surfaces.** Surface consistency.
The matrix, standings, and timing tower are the three places where
the visitor reads dense data on this site. They should look like one
visual system, not three experiments.

**Trade-off.** Information density is high. The earlier version of the
timing tower had a usability bug (9 px team names, 8 px compound
chips) that made M vs H unreadable — fixed by bumping sizes and
adopting a broadcast-style colour ring around the compound disc, but
that's the kind of detail this aesthetic forces you to get right.

---

For the system architecture behind these decisions, see
[ARCHITECTURE.md](ARCHITECTURE.md).

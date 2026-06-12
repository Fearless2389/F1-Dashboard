import { ReactNode } from "react";

import { Tooltip } from "@/components/Tooltip";

/**
 * Single source of truth for jargon definitions surfaced via `<GlossaryTerm>`.
 *
 * Why this matters: the primary visitor profile includes hiring managers
 * and F1 newcomers, and the dashboard freely uses terms like SHAP,
 * Plackett-Luce, conformal interval, DNF, pole, podium probability,
 * fastest lap point, etc. Without a glossary, a first-time visitor either
 * googles them (drop-off) or scrolls past (silent confusion). With it,
 * any underlined term shows a 1-2 sentence plain-English definition on
 * hover/focus.
 *
 * Each term has:
 *   - `label`: a short display version (e.g. "DNF")
 *   - `def`:   the 1-2 sentence plain-English explanation
 *
 * To wrap inline text, use:
 *   <GlossaryTerm term="shap">SHAP attributions</GlossaryTerm>
 */

export interface GlossaryEntry {
  label: string;
  def: ReactNode;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  shap: {
    label: "SHAP",
    def: "SHapley Additive exPlanations — a way of attributing each model prediction to the features that drove it. We use it to explain WHY the model picks each podium driver (qualifying gap, recent form, track history, etc.).",
  },
  "plackett-luce": {
    label: "Plackett-Luce",
    def: "A statistical model for sampling rankings — given per-driver win-prob scores, it draws a finishing order by repeatedly picking the next driver weighted by their score. We run 10,000 such samples per race to build the distribution matrix.",
  },
  "monte-carlo": {
    label: "Monte Carlo simulation",
    def: "Running a stochastic process many times (here: 10,000 race samples) and counting how often each outcome occurs. Turns a single point prediction into a probability distribution.",
  },
  "conformal-interval": {
    label: "Conformal interval",
    def: "A statistically calibrated uncertainty range — gives a real `[lower, upper]` band around the point prediction with a coverage guarantee, instead of a hand-waved error bar.",
  },
  dnf: {
    label: "DNF",
    def: "Did Not Finish — a driver who started the race but didn't reach the chequered flag (engine failure, accident, hydraulics, etc.). Counts as a retirement in the standings.",
  },
  dns: {
    label: "DNS",
    def: "Did Not Start — a driver who qualified but couldn't start the race (mechanical failure on the formation lap, illness, etc.).",
  },
  dsq: {
    label: "DSQ",
    def: "Disqualified — a driver whose result was struck after the race (technical infringement, illegal car setup, etc.).",
  },
  pole: {
    label: "Pole position",
    def: "The driver who qualified fastest, awarded P1 on the starting grid for the race.",
  },
  podium: {
    label: "Podium",
    def: "Finishing in the top 3. The traditional post-race celebration only includes P1, P2, P3.",
  },
  "fastest-lap": {
    label: "Fastest lap",
    def: "The driver who set the single fastest lap of the race. Awards 1 bonus championship point if the driver also finished in the top 10.",
  },
  constructor: {
    label: "Constructor",
    def: "F1's term for a team — a constructor enters 2 drivers per race. The Constructors' Championship sums points from both cars.",
  },
  sprint: {
    label: "Sprint",
    def: "A shorter ~100-km race held on Saturdays at select rounds. Awards points to the top 8, sets the grid for itself (not the main race), and has no mandatory pit stop.",
  },
  quali: {
    label: "Qualifying",
    def: "The Saturday session that sets the grid for the main race. Three rounds (Q1, Q2, Q3) progressively eliminate drivers; the fastest time in Q3 wins pole.",
  },
  drs: {
    label: "DRS",
    def: "Drag Reduction System — a rear-wing flap a driver can open when they're within 1 second of the car ahead in designated zones, giving a temporary straight-line speed boost.",
  },
  "expected-position": {
    label: "Expected position",
    def: "The mean finishing position across the 10,000 Monte Carlo simulations, conditional on the driver finishing (DNFs are tracked in their own column so reliability doesn't drag the number toward P22).",
  },
  "win-prob": {
    label: "Win probability",
    def: "The share of Monte Carlo simulations in which this driver finished P1 — accounts for both race pace AND retirement risk.",
  },
  "podium-prob": {
    label: "Podium probability",
    def: "The share of Monte Carlo simulations in which this driver finished in the top 3.",
  },
  "top10-model": {
    label: "Top-10 model",
    def: "A binary XGBoost classifier trained on ~160K historical race-driver rows; outputs the probability of finishing inside the top 10 (points-paying positions in modern F1).",
  },
  "podium-model": {
    label: "Podium model",
    def: "A binary XGBoost classifier outputting the probability of finishing P1, P2, or P3.",
  },
  "winner-model": {
    label: "Winner model",
    def: "A LightGBM ranker that scores every driver's chance of winning. Used as the input to the Monte Carlo simulator's per-step weights.",
  },
  "dnf-model": {
    label: "DNF model",
    def: "A binary XGBoost classifier outputting the probability of retiring before the chequered flag (any cause — mechanical, contact, weather).",
  },
  "quali-model": {
    label: "Quali model",
    def: "A LightGBM regressor that predicts the starting grid when actual qualifying times aren't yet on file. Used as the input to the simulator's pole pick before a race weekend.",
  },
  "time-aware-split": {
    label: "Time-aware split",
    def: "Splitting train / validation / test by season instead of randomly — prevents the model from peeking at the future. We train on 2018-2024 + 2026, validate on 2025, test on 2026.",
  },
  "championship-position": {
    label: "Championship position",
    def: "A driver's rank in the current standings by total points scored across all races so far this season.",
  },
};

interface GlossaryTermProps {
  term: keyof typeof GLOSSARY;
  children: ReactNode;
}

/**
 * Inline jargon wrapper. The wrapped text gets a dotted underline so the
 * reader knows there's more on hover; the tooltip shows the entry's
 * `def`. Lookup is keyed by `term`; the children are the visible text so
 * the wrapping is invisible if you read straight through.
 */
export function GlossaryTerm({ term, children }: GlossaryTermProps) {
  const entry = GLOSSARY[term];
  if (!entry) return <>{children}</>;

  return (
    <Tooltip content={entry.def} side="top">
      <span
        className="underline decoration-dotted decoration-paddock-coral/50 underline-offset-2 cursor-help"
        tabIndex={0}
      >
        {children}
      </span>
    </Tooltip>
  );
}

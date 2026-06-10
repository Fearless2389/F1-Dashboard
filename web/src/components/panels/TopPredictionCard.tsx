import { m } from "framer-motion";

import { teamColorFallback } from "@/lib/teams";
import type { TopPrediction } from "@/lib/types";

interface Props {
  top: TopPrediction;
  qualiSource?: string;       // "actual" | "predicted"
}

/**
 * Editorial hero card — italic Playfair driver name on team-gradient backdrop,
 * Top Prediction pill, reasoning paragraph, big win-prob % + progress bar.
 *
 * Two small affordances under the headline win-prob:
 *   1. Conformal range when present (win_low / win_high from the trained
 *      artifact's calibration). Real uncertainty bound, not a placeholder.
 *   2. The "predicted grid" pill at the top — flagged when qualifying isn't
 *      yet published so we had to use the model's own grid forecast.
 *
 * (The old "stochastic mean / vs prior" line was placeholder vapor —
 * `stochastic_mean` was always exactly `win_prob` because Monte Carlo was
 * never wired up. Removed to stop misleading the reader.)
 */
export function TopPredictionCard({ top, qualiSource }: Props) {
  const color = teamColorFallback(top.team_colour, top.team_name);
  const pct = Math.round((top.win_prob || 0) * 100);
  const lowPct = top.win_low != null ? Math.round(top.win_low * 100) : null;
  const highPct = top.win_high != null ? Math.round(top.win_high * 100) : null;
  const hasRange = lowPct != null && highPct != null && highPct > lowPct;

  return (
    <div
      className="relative overflow-hidden rounded-xl paddock-dashed-coral bg-paddock-panel"
      style={{ background: `linear-gradient(120deg, ${color}22 0%, transparent 60%), var(--color-paddock-panel)` }}
    >
      <div className="relative p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="paddock-pill">TOP PREDICTION</span>
          {qualiSource === "predicted" && (
            <span
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border"
              style={{ borderColor: "rgba(34,232,201,0.4)", color: "var(--color-paddock-cyan)" }}
              title="Quali not yet published — using predicted grid"
            >
              Predicted grid
            </span>
          )}
        </div>

        <h2 className="font-display font-black italic text-3xl md:text-5xl tracking-tight leading-[0.95] text-f1-white"
          style={{
            background: `linear-gradient(110deg, #f5f5f7 0%, ${color} 90%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {top.full_name ?? top.driver_code}
        </h2>

        <p className="mt-3 max-w-md text-sm text-f1-muted leading-relaxed">
          {top.description}
        </p>

        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">
            Win Probability
          </div>
          <div className="flex items-baseline gap-3">
            <div className="font-display font-black text-paddock-coral text-5xl md:text-6xl tabular-nums leading-none">
              {pct}
            </div>
            <div className="text-2xl text-paddock-coral leading-none">%</div>
            <div className="flex-1 ml-2">
              <div className="h-1.5 rounded-full bg-f1-edge overflow-hidden">
                <m.div
                  className="h-full"
                  style={{ background: "linear-gradient(90deg, var(--color-paddock-coral), var(--color-paddock-coral-deep))" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 110, damping: 22 }}
                />
              </div>
              {hasRange && (
                <div
                  className="mt-1 text-[10px] uppercase tracking-widest text-f1-muted"
                  title="Conformal interval — calibrated prediction range, not a placeholder"
                >
                  Range <span className="text-paddock-cyan font-semibold tabular-nums">{lowPct}%</span>
                  {" – "}
                  <span className="text-paddock-cyan font-semibold tabular-nums">{highPct}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

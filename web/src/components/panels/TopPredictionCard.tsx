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
 * "Predicted grid" pill flags races where qualifying hasn't been published,
 * so the win-prob is conditioned on the model's own grid forecast.
 *
 * (The old conformal "Range X% – Y%" strip was removed at the user's request:
 * the calibrated interval here is much wider than the win-prob itself for
 * most races, so it read as noise rather than a useful confidence cue.)
 */
export function TopPredictionCard({ top, qualiSource }: Props) {
  const color = teamColorFallback(top.team_colour, top.team_name);
  const pct = Math.round((top.win_prob || 0) * 100);

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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

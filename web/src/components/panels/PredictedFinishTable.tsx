import { Info, ListOrdered } from "lucide-react";
import { motion } from "framer-motion";

import { teamColorFallback } from "@/lib/teams";
import type { FinishRow } from "@/lib/types";

interface Props {
  rows: FinishRow[];
}

const CONFIDENCE_HINT =
  "Confidence = the model's probability the driver finishes in the top 10. " +
  "A row is flagged 'Race at Risk' when DNF probability is above 18% or " +
  "the top-10 probability falls below 40%.";

const GAP_HINT =
  "Estimated gap is a positional heuristic — 3.2 seconds × (position − 1). " +
  "It's a rough illustration of the cumulative gap to the leader, not a " +
  "per-driver pace estimate. (A real per-lap pace model would replace this.)";

/**
 * P4–P10 prediction table. Each row has a confidence bar — coral for high
 * confidence rows, cyan for "race at risk" rows (high DNF or low top-10 prob).
 *
 * The header chips include "?" affordances that surface the underlying
 * formulas on hover, so users aren't left guessing what "High Confidence"
 * actually means.
 */
export function PredictedFinishTable({ rows }: Props) {
  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ListOrdered size={14} className="text-paddock-coral" />
          <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            Predicted Finish (P4 - P10)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest text-f1-muted">
          <span className="flex items-center gap-1" title={CONFIDENCE_HINT}>
            <span className="inline-block h-2 w-2 rounded-full bg-paddock-coral" /> High Confidence
            <Info size={9} className="ml-0.5 text-f1-muted/70" />
          </span>
          <span className="flex items-center gap-1" title={CONFIDENCE_HINT}>
            <span className="inline-block h-2 w-2 rounded-full bg-paddock-cyan" /> Race at Risk
            <Info size={9} className="ml-0.5 text-f1-muted/70" />
          </span>
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[28px_1fr_72px_1fr_44px] gap-x-3 text-[9px] uppercase tracking-widest text-f1-muted px-1 pb-2 border-b border-f1-edge">
        <div>Pos</div>
        <div>Driver / Constructor</div>
        <div className="text-right flex items-center justify-end gap-1" title={GAP_HINT}>
          Est. Gap
          <Info size={9} className="text-f1-muted/70" />
        </div>
        <div className="flex items-center gap-1" title={CONFIDENCE_HINT}>
          Confidence Score
          <Info size={9} className="text-f1-muted/70" />
        </div>
        <div className="text-right">%</div>
      </div>

      <div>
        {rows.map((r, idx) => {
          const color = teamColorFallback(r.team_colour, r.team_name);
          const pct = Math.round((r.confidence_score || 0) * 100);
          const barColor = r.at_risk ? "var(--color-paddock-cyan)" : "var(--color-paddock-coral)";
          return (
            <motion.div
              key={r.position}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="grid grid-cols-[28px_1fr_72px_1fr_44px] gap-x-3 items-center border-b border-f1-edge/60 py-2.5 last:border-b-0"
            >
              <div className="font-mono font-semibold tabular-nums text-f1-white text-sm">
                {String(r.position).padStart(2, "0")}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-5 w-1 rounded-sm shrink-0" style={{ background: color }} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{r.driver_code}</div>
                  <div className="text-[10px] text-f1-muted uppercase tracking-wider truncate">
                    {r.team_name}
                  </div>
                </div>
              </div>
              <div className="text-right text-xs text-f1-muted tabular-nums font-mono">
                +{r.est_gap_s.toFixed(2)}s
              </div>
              <div className="h-1.5 rounded-full bg-f1-edge overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div className="text-right text-xs font-mono tabular-nums text-f1-white">{pct}%</div>
            </motion.div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-center text-xs text-f1-muted py-6">
            No prediction data available.
          </div>
        )}
      </div>
    </div>
  );
}

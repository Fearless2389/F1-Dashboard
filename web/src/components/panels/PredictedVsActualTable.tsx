import { Check, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { teamColor } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { AccuracyResponse } from "@/lib/types";

interface Props {
  data: AccuracyResponse;
}

/**
 * Predicted vs actual finishing-order table for a past race. Each row is
 * one position (P1..P10) with the model's pick on the left and what
 * actually happened on the right. Matching rows are tagged with a green
 * tick; misses are muted.
 *
 * Five small metric chips at the top summarise the run: P1 hit, exact
 * podium hits, podium overlap regardless of order, top-5 hits, top-10
 * hits.
 */
export function PredictedVsActualTable({ data }: Props) {
  const m = data.metrics;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Predicted vs actual · {data.race_name}</CardTitle>
        <CardDescription>
          How the model's top-10 stacked up against the real finishing order.
        </CardDescription>

        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono">
          <MetricChip
            label="P1"
            value={m.p1_hit ? "✓" : "—"}
            tone={m.p1_hit ? "hit" : "miss"}
          />
          <MetricChip
            label="Podium exact"
            value={`${m.podium_hits}/3`}
            tone={m.podium_hits >= 2 ? "hit" : m.podium_hits >= 1 ? "neutral" : "miss"}
          />
          <MetricChip
            label="Podium overlap"
            value={`${m.podium_overlap}/3`}
            tone={m.podium_overlap >= 2 ? "hit" : m.podium_overlap >= 1 ? "neutral" : "miss"}
          />
          <MetricChip
            label="Top 5"
            value={`${m.top5_hits}/5`}
            tone={m.top5_hits >= 3 ? "hit" : m.top5_hits >= 1 ? "neutral" : "miss"}
          />
          <MetricChip
            label="Top 10"
            value={`${m.top10_hits}/10`}
            tone={m.top10_hits >= 5 ? "hit" : m.top10_hits >= 2 ? "neutral" : "miss"}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-x-3 text-[9px] uppercase tracking-widest text-f1-muted px-1 pb-2 border-b border-f1-edge">
          <div>Pos</div>
          <div>Predicted</div>
          <div>Actual</div>
          <div className="text-center">Hit</div>
        </div>

        <div>
          {data.rows.map((r) => {
            const predColor = teamColor(r.predicted_team);
            const actualColor = teamColor(r.actual_team);
            return (
              <div
                key={r.position}
                className={cn(
                  "grid grid-cols-[28px_1fr_1fr_28px] gap-x-3 items-center py-2 border-b border-f1-edge/60 last:border-b-0 transition-colors",
                  r.is_hit ? "bg-paddock-cyan/5" : "",
                )}
              >
                <div className="font-mono tabular-nums text-sm text-f1-white">
                  {String(r.position).padStart(2, "0")}
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-5 w-1 rounded-sm shrink-0" style={{ background: predColor }} />
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-f1-white leading-tight">
                      {r.predicted_driver ?? "—"}
                    </div>
                    {r.predicted_team && (
                      <div className="text-[10px] text-f1-muted uppercase tracking-wider truncate">
                        {r.predicted_team}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-5 w-1 rounded-sm shrink-0" style={{ background: actualColor }} />
                  <div className="min-w-0">
                    <div className={cn(
                      "font-mono text-sm font-semibold leading-tight",
                      r.is_hit ? "text-paddock-cyan" : "text-f1-white",
                    )}>
                      {r.actual_driver ?? "—"}
                    </div>
                    {r.actual_team && (
                      <div className="text-[10px] text-f1-muted uppercase tracking-wider truncate">
                        {r.actual_team}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  {r.is_hit ? (
                    <Check size={14} className="text-paddock-cyan inline-block" />
                  ) : (
                    <X size={12} className="text-f1-muted/40 inline-block" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


function MetricChip({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: "hit" | "neutral" | "miss";
}) {
  const styles = {
    hit:     "border-paddock-cyan/40 bg-paddock-cyan/10 text-paddock-cyan",
    neutral: "border-white/15 bg-white/[0.04] text-f1-white",
    miss:    "border-paddock-coral/30 bg-paddock-coral/8 text-paddock-coral",
  }[tone];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
      styles,
    )}>
      <span className="opacity-80 uppercase tracking-widest text-[9px]">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

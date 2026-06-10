import { teamColorFallback } from "@/lib/teams";
import type { ForecastDriver } from "@/lib/types";

interface Props {
  drivers: ForecastDriver[];        // top 5 by win_prob, already sorted
  nSimulations: number;
}

/**
 * Top 5 horizontal bars showing each driver's simulated win probability.
 * Each row carries the full italic name, team · expected position subtitle,
 * a team-coloured bar (max width tied to the field's highest win prob so
 * the leader's bar is roughly full-width), and a right-aligned percentage.
 */
export function Top5WinBars({ drivers, nSimulations }: Props) {
  if (!drivers || drivers.length === 0) return null;
  const maxProb = Math.max(...drivers.map(d => d.win_prob), 0.01);

  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Top 5 · Win Probability
        </span>
        <span className="text-[10px] uppercase tracking-widest text-f1-muted">
          {(nSimulations / 1000).toFixed(0)}K Sims
        </span>
      </div>

      <div className="space-y-3">
        {drivers.map((d, i) => {
          const color = teamColorFallback(d.team_colour, d.team_name);
          const pct = (d.win_prob || 0) * 100;
          const widthPct = Math.max(2, (d.win_prob / maxProb) * 100);
          return (
            <div key={d.driver_code} className="flex items-center gap-3">
              <div className="text-[10px] text-f1-muted font-mono tabular-nums w-5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-display font-bold text-base md:text-lg italic truncate"
                    style={{
                      background: `linear-gradient(110deg, #f5f5f7 0%, ${color} 90%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {d.full_name ?? d.driver_code}
                  </span>
                  <span className="text-sm font-semibold text-f1-white tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-f1-muted mt-0.5">
                  {d.team_name ?? "—"} · EXP P{(d.expected_position ?? 0).toFixed(1)}
                </div>
                <div className="h-1 rounded-full bg-f1-edge mt-1.5 overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${widthPct}%`, background: color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

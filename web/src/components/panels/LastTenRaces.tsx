import { useState } from "react";
import { m } from "framer-motion";

interface RaceResult {
  round: number;
  race_name?: string | null;
  circuit_id?: string | null;
  grid_position?: number | null;
  finish_position?: number | null;
  points: number;
  is_dnf: boolean;
}

interface Props {
  results: RaceResult[];          // most-recent first
}

/**
 * Last-10-races strip. Each race is a colored chip showing the finish position;
 * hover gives full race name + grid → finish delta + points. Replaces the old
 * rolling-average chart which was hard to read.
 *
 *   gold / silver / bronze   — podium positions
 *   teal                     — points (P4-P10)
 *   slate                    — out of points (P11+)
 *   red                      — DNF
 */
function chipStyle(finish: number | null | undefined, dnf: boolean): { bg: string; fg: string; border?: string } {
  if (dnf) return { bg: "#3a1213", fg: "#ff6b66", border: "#5e1c1d" };
  if (finish == null) return { bg: "#1d1d36", fg: "#52525c" };
  if (finish === 1) return { bg: "linear-gradient(180deg, #ffd200 0%, #b78f00 100%)", fg: "#0e0e1a" };
  if (finish === 2) return { bg: "linear-gradient(180deg, #d4d4dc 0%, #6f7587 100%)", fg: "#0e0e1a" };
  if (finish === 3) return { bg: "linear-gradient(180deg, #cd7f32 0%, #7a4a1a 100%)", fg: "#0e0e1a" };
  if (finish <= 10)  return { bg: "rgba(127,201,164,0.16)", fg: "#7fc9a4", border: "rgba(127,201,164,0.45)" };
  return { bg: "#1f2235", fg: "#8a92ad" };
}

export function LastTenRaces({ results }: Props) {
  const [hovered, setHovered] = useState<RaceResult | null>(null);

  // results are most-recent first; reverse so we read left-to-right = oldest→newest
  const ordered = [...results].reverse();
  const wins = results.filter(r => r.finish_position === 1).length;
  const podiums = results.filter(r => r.finish_position != null && r.finish_position <= 3).length;
  const dnfs = results.filter(r => r.is_dnf).length;
  const totalPoints = results.reduce((s, r) => s + (r.points ?? 0), 0);

  return (
    <div className="rounded-xl border border-f1-edge bg-f1-panel/50 p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            Last 10 Races
          </div>
          <div className="font-display font-bold text-sm text-f1-white mt-0.5">
            {results.length > 0
              ? `${wins} wins · ${podiums} podiums · ${dnfs} DNF · ${Math.round(totalPoints)} pts`
              : "No race data yet."}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-2">
        {ordered.map((r, i) => {
          const c = chipStyle(r.finish_position, r.is_dnf);
          return (
            <m.button
              key={`${r.round}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onMouseEnter={() => setHovered(r)}
              onMouseLeave={() => setHovered(null)}
              className="aspect-square rounded-md flex flex-col items-center justify-center text-sm font-mono font-bold relative group"
              style={{
                background: c.bg, color: c.fg,
                border: c.border ? `1px solid ${c.border}` : undefined,
              }}
            >
              <span>{r.is_dnf ? "DNF" : r.finish_position ?? "—"}</span>
              <span className="text-[8px] opacity-70 mt-0.5">R{r.round}</span>
            </m.button>
          );
        })}
        {/* Pad to 10 if fewer races */}
        {Array.from({ length: Math.max(0, 10 - ordered.length) }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square rounded-md border border-dashed border-f1-edge/60" />
        ))}
      </div>

      <div className="h-8 mt-3 text-xs text-f1-muted">
        {hovered ? (
          <span>
            <span className="text-f1-white font-medium">{hovered.race_name || `Round ${hovered.round}`}</span>
            <span> · </span>
            <span>
              grid P{hovered.grid_position ?? "—"}
              {" → "}
              <span style={{ color: hovered.is_dnf ? "#ff6b66" : "#f5f5f7" }}>
                {hovered.is_dnf ? "DNF" : `finish P${hovered.finish_position}`}
              </span>
            </span>
            <span> · {Math.round(hovered.points ?? 0)} pts</span>
          </span>
        ) : (
          <span>Hover any race for details. Oldest → newest, left to right.</span>
        )}
      </div>
    </div>
  );
}

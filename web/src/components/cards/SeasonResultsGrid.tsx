import { useState } from "react";

interface SeasonResult {
  round: number;
  race_name?: string | null;
  circuit_id?: string | null;
  grid_position?: number | null;
  finish_position?: number | null;
  points: number;
  is_dnf: boolean;
}

interface Props {
  results: SeasonResult[];
  totalRounds?: number;
}

function cellColor(finish: number | null | undefined, dnf: boolean): { bg: string; text: string } {
  if (dnf) return { bg: "#3a1213", text: "#ff6b66" };
  if (finish == null) return { bg: "#1d1d36", text: "#52525c" };
  if (finish === 1) return { bg: "#ffd200", text: "#0e0e1a" };
  if (finish === 2) return { bg: "#c0c0c0", text: "#0e0e1a" };
  if (finish === 3) return { bg: "#cd7f32", text: "#0e0e1a" };
  if (finish <= 10) return { bg: "#27f4d2", text: "#0e0e1a" };
  return { bg: "#2a2a44", text: "#8a8aa3" };
}

export function SeasonResultsGrid({ results, totalRounds = 24 }: Props) {
  const [hovered, setHovered] = useState<SeasonResult | null>(null);
  const byRound = new Map(results.map(r => [r.round, r]));

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(0, 1fr))` }}>
        {Array.from({ length: totalRounds }).map((_, i) => {
          const round = i + 1;
          const r = byRound.get(round);
          const fin = r?.finish_position ?? null;
          const { bg, text } = r ? cellColor(fin, r.is_dnf) : cellColor(null, false);
          return (
            <button type="button"
              key={round}
              onMouseEnter={() => setHovered(r ?? null)}
              onMouseLeave={() => setHovered(null)}
              className="aspect-square rounded-sm flex flex-col items-center justify-center text-[10px] font-mono font-semibold relative group"
              style={{ background: bg, color: text }}
            >
              <span className="opacity-90">{r ? (r.is_dnf ? "DNF" : fin ?? "—") : ""}</span>
              <span className="text-[7px] opacity-50">R{round}</span>
            </button>
          );
        })}
      </div>
      <div className="h-8 mt-2 text-xs text-f1-muted">
        {hovered ? (
          <span>
            <span className="text-f1-white">R{hovered.round} {hovered.race_name}</span>
            {" · "}
            <span>grid P{hovered.grid_position ?? "—"} → finish {hovered.is_dnf ? "DNF" : `P${hovered.finish_position}`}</span>
            {" · "}
            <span>{hovered.points} pts</span>
          </span>
        ) : (
          <span>Hover a round for race details. Gold/silver/bronze = podium; teal = points (P4–P10); grey = no result.</span>
        )}
      </div>
    </div>
  );
}

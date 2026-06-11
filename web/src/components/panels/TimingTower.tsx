import { m, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { teamColorFallback } from "@/lib/teams";
import type { LiveDriver } from "@/lib/types";

interface TowerDriver extends LiveDriver {
  /** Tyre age in laps (replay enrichment) */
  tyre_life?: number | null;
}

interface Props {
  drivers: TowerDriver[];
  onSelectDriver?: (code: string) => void;
  selected?: string | null;
}

function compoundColor(c?: string | null) {
  switch ((c || "").toUpperCase()) {
    case "SOFT":         return "#e10600";
    case "MEDIUM":       return "#ffd200";
    case "HARD":         return "#f5f5f7";
    case "INTERMEDIATE": return "#43b02a";
    case "WET":          return "#0080ff";
    default:             return "#5a5a72";
  }
}

function compoundLabel(c?: string | null): string {
  switch ((c || "").toUpperCase()) {
    case "SOFT":         return "S";
    case "MEDIUM":       return "M";
    case "HARD":         return "H";
    case "INTERMEDIATE": return "I";
    case "WET":          return "W";
    case "SUPERSOFT":    return "SS";
    case "ULTRASOFT":    return "US";
    case "HYPERSOFT":    return "HS";
    default:             return "·";
  }
}

// Slimmer column layout — the previous 24/52/52/56/28 grid summed to 212 px
// of fixed columns, leaving only ~60 px for the driver name + team after
// CardContent's px-5 padding. Tightening Gap/Int to 44, Tyre to 48, Pit to
// 24 — plus dropping CardContent down to px-2 below — frees ~50 px for the
// driver column so "Mercedes" / "Red Bull Racing" stops truncating mid-word.
const GRID = "grid-cols-[22px_1fr_44px_44px_48px_24px]";

export function TimingTower({ drivers, onSelectDriver, selected }: Props) {
  return (
    <Card className="flex flex-col border-0 bg-transparent shadow-none">
      <CardHeader className="flex items-center justify-between pb-1 px-3 pt-2">
        <CardTitle className="text-sm">Timing Tower</CardTitle>
        <Badge tone="muted">{drivers.length}</Badge>
      </CardHeader>
      <CardContent className="pt-0 px-2 pb-2">
        <div className={`grid ${GRID} gap-x-1.5 text-[9px] uppercase tracking-wider text-f1-muted px-1.5 pb-1`}>
          <div>P</div>
          <div>Driver</div>
          <div className="text-right">Gap</div>
          <div className="text-right">Int</div>
          <div className="text-right">Tyre</div>
          <div className="text-right">Pit</div>
        </div>
        <div className="rounded-md border border-f1-edge overflow-hidden">
          <AnimatePresence initial={false}>
            {drivers.map((d) => {
              const color = teamColorFallback(d.team_colour, d.team_name);
              const isSel = selected && selected === d.driver_code;
              const compColor = compoundColor(d.compound);
              return (
                <m.div
                  key={d.driver_code || d.driver_number || Math.random()}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                  onClick={() => onSelectDriver?.(d.driver_code)}
                  className={[
                    "grid", GRID, "gap-x-1.5 items-center",
                    "border-b border-f1-edge last:border-b-0 px-1.5 py-1 cursor-pointer",
                    "hover:bg-white/[0.03] transition-colors",
                    isSel ? "bg-f1-red/10" : "",
                  ].join(" ")}
                >
                  <div className="text-xs font-mono text-f1-white tabular-nums leading-none">
                    {d.position ?? "—"}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="h-4 w-1 rounded-sm shrink-0"
                      style={{ background: color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight truncate">
                        {d.driver_code}
                      </div>
                      <div className="text-[9px] text-f1-muted truncate leading-tight">
                        {d.team_name}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-f1-muted text-right tabular-nums leading-tight">
                    {d.gap_to_leader ?? "—"}
                  </div>
                  <div className="text-[10px] text-f1-muted text-right tabular-nums leading-tight">
                    {d.interval ?? "—"}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold shrink-0"
                      style={{
                        background: compColor + "33",
                        color: compColor,
                        border: `1px solid ${compColor}55`,
                      }}
                    >
                      {compoundLabel(d.compound)}
                    </span>
                    <span className="text-f1-muted text-[9px] tabular-nums">
                      {d.tyre_life != null ? `L${d.tyre_life}` : "—"}
                    </span>
                  </div>
                  <div className="text-[10px] text-f1-muted text-right tabular-nums leading-tight">
                    {d.pit_count ?? 0}
                  </div>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

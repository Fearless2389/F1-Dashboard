import { useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, type TooltipProps, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { teamColor } from "@/lib/teams";
import type { DriverSeasonRow } from "@/lib/types";

interface Props {
  driverCode: string;
  timeline: DriverSeasonRow[];
}

interface SeasonAggregate {
  season: number;
  races: number;
  points: number;
  avg_finish: number | null;
  team_name: string | null;
  fill: string;
}

/**
 * Career trajectory — one bar per season showing points scored, plus an
 * overlaid line for average finish position on a secondary inverted axis
 * (P1 at top). Aggregated client-side from the driver-profile `timeline`,
 * so no backend round-trip needed.
 *
 * Renders nothing when the driver has fewer than 2 seasons of data —
 * a one-season "trajectory" is just a single bar and not useful.
 */
export function DriverCareerChart({ driverCode, timeline }: Props) {
  const aggregates = useMemo<SeasonAggregate[]>(() => {
    const bySeason = new Map<number, DriverSeasonRow[]>();
    for (const r of timeline) {
      if (r.season == null) continue;
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    const out: SeasonAggregate[] = [];
    for (const [season, rows] of bySeason) {
      let pts = 0;
      const finishes: number[] = [];
      const teams = new Map<string, number>();
      for (const r of rows) {
        pts += r.points ?? 0;
        if (!r.is_dnf && r.finish_position != null) finishes.push(r.finish_position);
        if (r.team_name) teams.set(r.team_name, (teams.get(r.team_name) ?? 0) + 1);
      }
      // Most-frequent team this season (drivers occasionally swap mid-year)
      const dominant = [...teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      out.push({
        season,
        races: rows.length,
        points: Math.round(pts),
        avg_finish: finishes.length > 0 ? finishes.reduce((a, b) => a + b) / finishes.length : null,
        team_name: dominant,
        fill: teamColor(dominant),
      });
    }
    return out.sort((a, b) => a.season - b.season);
  }, [timeline]);

  if (aggregates.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Career trajectory</CardTitle>
        <CardDescription>
          {driverCode} · {aggregates.length} seasons · bars = points scored · line = avg finish position
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer>
            <ComposedChart data={aggregates} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="#2a2a40" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="season"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                tickFormatter={(s) => String(s)}
              />
              <YAxis
                yAxisId="points"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                width={40}
                label={{ value: "Points", position: "insideTopLeft", fill: "#8a8aa3", fontSize: 10, dy: -4 }}
              />
              <YAxis
                yAxisId="finish"
                orientation="right"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                width={36}
                reversed
                domain={[1, 20]}
                label={{ value: "Avg P", position: "insideTopRight", fill: "#8a8aa3", fontSize: 10, dy: -4 }}
              />
              <Tooltip content={<CareerTooltip />} />
              <Bar
                dataKey="points"
                yAxisId="points"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {aggregates.map((row) => (
                  <CareerBarCell key={row.season} fill={row.fill} />
                ))}
              </Bar>
              <Line
                yAxisId="finish"
                type="monotone"
                dataKey="avg_finish"
                stroke="#ffd200"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: "#ffd200" }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Recharts pattern: <Bar> children must be `<Cell>`-ish primitives.
 * We forward `fill` from each season's aggregate so every bar gets that
 * season's team livery colour. (Cell from recharts is just a wrapper that
 * forwards props down to the bar's path.)
 */
import { Cell } from "recharts";
function CareerBarCell({ fill }: { fill: string }) {
  return <Cell fill={fill} />;
}

function CareerTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as SeasonAggregate;
  return (
    <div className="rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur p-2 text-xs shadow-2xl space-y-0.5">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted">Season {row.season}</div>
      <div className="flex items-center gap-1.5 font-mono">
        <span className="h-2 w-2 rounded-sm" style={{ background: row.fill }} />
        <span className="text-f1-white">{row.team_name ?? "—"}</span>
      </div>
      <div className="font-mono text-f1-white">{row.points} pts · {row.races} races</div>
      {row.avg_finish != null && (
        <div className="font-mono text-paddock-cyan">avg P{row.avg_finish.toFixed(1)}</div>
      )}
    </div>
  );
}

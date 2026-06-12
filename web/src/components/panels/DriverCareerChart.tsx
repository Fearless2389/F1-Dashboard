import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList,
  ResponsiveContainer, Tooltip, type TooltipProps, XAxis, YAxis,
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
 * Recharts LabelList `content` factory — closes over the row aggregates so
 * the renderer itself can stay a single function at module scope (avoids
 * re-creating a component identity per render of DriverCareerChart, which
 * React Doctor's `component-defined-inside-another-component` rule
 * correctly flagged).
 */
function makeAvgPLabelRenderer(
  aggregates: SeasonAggregate[],
): (props: { x?: string | number; y?: string | number; width?: string | number; index?: number }) => React.ReactElement | null {
  return (props) => {
    const xn = typeof props.x === "number" ? props.x : Number(props.x);
    const yn = typeof props.y === "number" ? props.y : Number(props.y);
    const wn = typeof props.width === "number" ? props.width : Number(props.width);
    if (!Number.isFinite(xn) || !Number.isFinite(yn) || !Number.isFinite(wn) || props.index == null) return null;
    const row = aggregates[props.index];
    if (!row || row.avg_finish == null) return null;
    return (
      <text
        x={xn + wn / 2}
        y={yn - 6}
        textAnchor="middle"
        fill="#a4acc4"
        fontSize={10}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontWeight={600}
      >
        P{row.avg_finish.toFixed(1)}
      </text>
    );
  };
}

/**
 * Career trajectory — one bar per season showing points scored, in that
 * season's team livery colour. The season's average finish position is
 * labelled directly above each bar as `P4.7` so points (height) and
 * finish position (label) read together for the same year instead of
 * floating on a separate inverted secondary axis.
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

  // Recharts LabelList passes `index` to a content function. We close over
  // `aggregates` via a factory so the rendering component itself lives at
  // module scope (the prior inline `function AvgPLabel(...)` triggered
  // React Doctor's "Component defined inside another component" — React
  // would recreate the component identity every render, which can cause
  // remount/state-loss in more complex children).
  const renderAvgPLabel = makeAvgPLabelRenderer(aggregates);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Career trajectory</CardTitle>
        <CardDescription>
          {driverCode} · {aggregates.length} seasons · bar height = points scored · label above each bar = average finish position
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer>
            <BarChart data={aggregates} margin={{ top: 28, right: 8, bottom: 4, left: -4 }}>
              <CartesianGrid stroke="#2a2a40" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="season"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                tickFormatter={(s) => String(s)}
              />
              <YAxis
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                width={40}
                label={{ value: "Points", position: "insideTopLeft", fill: "#8a8aa3", fontSize: 10, dy: -4 }}
              />
              <Tooltip content={<CareerTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar
                dataKey="points"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                <LabelList content={renderAvgPLabel} />
                {aggregates.map((row) => (
                  <Cell key={row.season} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
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

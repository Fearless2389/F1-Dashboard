import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, type TooltipProps, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { teamColor } from "@/lib/teams";
import type { ProgressionDriver, StandingsProgressionResponse } from "@/lib/types";

interface Props {
  data?: StandingsProgressionResponse;
  isLoading?: boolean;
}

interface ChartRow {
  round: number;
  [driverCode: string]: number;
}

const HIGHLIGHT_TOP_N = 5;
const MUTED_STROKE = "#3a3a55";

/**
 * Championship-development line chart — every driver's cumulative points
 * across the season. Top-5 (final-position) lines render in their team
 * colour with labels; the rest are drawn in muted grey so the leading
 * battle stays legible. Hover any line to highlight it + see a tooltip
 * with each driver's points + gap to the round leader.
 */
export function ChampionshipProgressionChart({ data, isLoading }: Props) {
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);

  const { chartRows, drivers, topN } = useMemo(() => {
    const empty = { chartRows: [] as ChartRow[], drivers: [] as ProgressionDriver[], topN: new Set<string>() };
    if (!data || data.rounds.length === 0) return empty;
    const rows: ChartRow[] = data.rounds.map((r, i) => {
      const row: ChartRow = { round: r.round };
      data.drivers.forEach(d => {
        row[d.driver_code] = d.cumulative_points[i] ?? 0;
      });
      return row;
    });
    const topNSet = new Set(data.drivers.slice(0, HIGHLIGHT_TOP_N).map(d => d.driver_code));
    return { chartRows: rows, drivers: data.drivers, topN: topNSet };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Championship Development</CardTitle>
          <CardDescription>Cumulative points across the season</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || drivers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Championship Development</CardTitle>
          <CardDescription>No race data available for this season yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Championship Development</CardTitle>
        <CardDescription>
          Cumulative points across {data.rounds.length} round{data.rounds.length === 1 ? "" : "s"} · top {HIGHLIGHT_TOP_N} in team colour
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer>
            <LineChart data={chartRows} margin={{ top: 8, right: 20, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="#2a2a40" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="round"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                tickFormatter={(r) => `R${r}`}
              />
              <YAxis
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                width={40}
              />
              <Tooltip content={<ProgressionTooltip drivers={drivers} />} />
              {drivers.map(d => {
                const isTop = topN.has(d.driver_code);
                const isHovered = hoveredDriver === d.driver_code;
                const isDimmedByHover = hoveredDriver != null && hoveredDriver !== d.driver_code;
                const stroke = isTop ? teamColor(d.team_name) : MUTED_STROKE;
                return (
                  <Line
                    key={d.driver_code}
                    type="monotone"
                    dataKey={d.driver_code}
                    stroke={stroke}
                    strokeWidth={isHovered ? 3 : isTop ? 2 : 1}
                    strokeOpacity={isDimmedByHover ? 0.15 : isTop ? 0.95 : 0.45}
                    dot={false}
                    activeDot={{ r: 4, onMouseEnter: () => setHoveredDriver(d.driver_code) }}
                    onMouseEnter={() => setHoveredDriver(d.driver_code)}
                    onMouseLeave={() => setHoveredDriver(null)}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top-5 legend chip row */}
        <div className="mt-3 flex flex-wrap gap-2">
          {drivers.slice(0, HIGHLIGHT_TOP_N).map(d => (
            <span
              key={d.driver_code}
              onMouseEnter={() => setHoveredDriver(d.driver_code)}
              onMouseLeave={() => setHoveredDriver(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-2 py-0.5 text-[10px] font-mono text-f1-white cursor-default transition-colors hover:bg-white/[0.08]"
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: teamColor(d.team_name) }} />
              {d.driver_code}
              <span className="text-f1-muted">
                {Math.round(d.cumulative_points[d.cumulative_points.length - 1] ?? 0)} pts
              </span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


interface ProgressionTooltipProps extends TooltipProps<number, string> {
  drivers: StandingsProgressionResponse["drivers"];
}
function ProgressionTooltip({ active, payload, label, drivers }: ProgressionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Re-rank entries at THIS round so the tooltip is ordered by championship
  // position as of that round, not season-final.
  const ranked = [...payload]
    .filter(p => typeof p.value === "number")
    .sort((a, b) => (b.value as number) - (a.value as number));
  const leaderPts = (ranked[0]?.value as number) ?? 0;

  const teamFor = (code: string) => drivers.find(d => d.driver_code === code)?.team_name ?? null;

  return (
    <div className="rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur p-2 text-xs shadow-2xl">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">Round {label}</div>
      <div className="space-y-0.5">
        {ranked.slice(0, 6).map((p, i) => {
          const code = String(p.dataKey);
          const pts = p.value as number;
          const gap = i === 0 ? "" : `−${Math.round(leaderPts - pts)}`;
          return (
            <div key={code} className="flex items-center gap-2 font-mono tabular-nums">
              <span className="h-2 w-2 rounded-sm shrink-0"
                style={{ background: teamColor(teamFor(code)) }} />
              <span className="text-f1-muted w-4 text-right">{i + 1}</span>
              <span className="text-f1-white">{code}</span>
              <span className="ml-auto text-f1-white">{Math.round(pts)}</span>
              <span className="text-f1-muted w-10 text-right">{gap}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

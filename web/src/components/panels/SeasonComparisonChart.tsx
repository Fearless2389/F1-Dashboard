import { useMemo } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, type TooltipProps, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { teamColor } from "@/lib/teams";
import type { DriverSeasonResult } from "@/lib/types";

interface SeasonInput {
  season: number;
  team_name?: string | null;
  results: DriverSeasonResult[];
}

interface Props {
  primary: SeasonInput;
  compare: SeasonInput;
}

const DNF_Y = 22;        // Render DNFs on a dedicated row below P20.
const MAX_POSITION = 20; // The lowest "real" finishing position we plot.

interface ChartRow {
  round: number;
  primary?: number;
  compare?: number;
  primaryIsDnf?: boolean;
  compareIsDnf?: boolean;
}

/**
 * Race-by-race finish-position chart for two seasons of the same driver.
 *
 * X-axis: round number across both seasons (max of either).
 * Y-axis: finish position (inverted — P1 at top, P20 near the bottom).
 * DNFs render on a dedicated row at y={DNF_Y} marked with a red ✕ so
 * they read as distinct events, not P22 finishes.
 *
 * Each season's line is coloured in that season's team livery so two
 * seasons at the same team still differ in opacity/dash; team changes
 * across seasons show the colour shift naturally.
 */
export function SeasonComparisonChart({ primary, compare }: Props) {
  const data = useMemo<ChartRow[]>(() => {
    const byRound = new Map<number, ChartRow>();
    function add(side: "primary" | "compare", results: DriverSeasonResult[]) {
      for (const r of results) {
        const row = byRound.get(r.round) ?? { round: r.round };
        if (r.is_dnf) {
          row[side] = DNF_Y;
          row[`${side}IsDnf`] = true;
        } else if (r.finish_position != null) {
          row[side] = Math.min(r.finish_position, MAX_POSITION);
          row[`${side}IsDnf`] = false;
        }
        byRound.set(r.round, row);
      }
    }
    add("primary", primary.results);
    add("compare", compare.results);
    return [...byRound.values()].sort((a, b) => a.round - b.round);
  }, [primary, compare]);

  const primaryColor = teamColor(primary.team_name);
  const compareColor = teamColor(compare.team_name);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Race-by-race comparison</CardTitle>
          <CardDescription>No completed races to compare across these two seasons.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Race-by-race · {primary.season} vs {compare.season}</CardTitle>
        <CardDescription>
          Finish position per round · ✕ on the DNF row marks a retirement
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -10 }}>
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
                width={42}
                reversed
                domain={[1, DNF_Y]}
                ticks={[1, 5, 10, 15, 20, DNF_Y]}
                tickFormatter={(v) => v === DNF_Y ? "DNF" : `P${v}`}
              />
              <ReferenceLine y={DNF_Y} stroke="#e10600" strokeOpacity={0.35} strokeDasharray="4 4" />
              <Tooltip content={<ComparisonTooltip primarySeason={primary.season} compareSeason={compare.season} />} />
              <Line
                type="monotone"
                dataKey="primary"
                name={`${primary.season}`}
                stroke={primaryColor}
                strokeWidth={2}
                dot={(p: any) => {
                  const { key, ...rest } = p;
                  return <FinishDot key={key} {...rest} color={primaryColor} />;
                }}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="compare"
                name={`${compare.season}`}
                stroke={compareColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={(p: any) => {
                  const { key, ...rest } = p;
                  return <FinishDot key={key} {...rest} color={compareColor} />;
                }}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend chip row */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="3"><line x1="0" y1="1.5" x2="16" y2="1.5" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" /></svg>
            <span className="text-f1-white">{primary.season}</span>
            <span className="text-f1-muted">{primary.team_name}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="3"><line x1="0" y1="1.5" x2="16" y2="1.5" stroke={compareColor} strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" /></svg>
            <span className="text-f1-white">{compare.season}</span>
            <span className="text-f1-muted">{compare.team_name}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Per-point dot renderer. A finish point is a small filled circle; a DNF
 * is a red ✕ at the DNF row, so retirements pop visually instead of
 * looking like a regular P22 finish.
 */
interface FinishDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  color: string;
  dataKey?: string;
}
function FinishDot(props: FinishDotProps) {
  const { cx, cy, payload, color, dataKey } = props;
  if (cx == null || cy == null || !payload) return <g />;
  const isDnf = dataKey === "primary" ? payload.primaryIsDnf : payload.compareIsDnf;
  if (isDnf) {
    return (
      <g transform={`translate(${cx} ${cy})`} pointerEvents="none">
        <circle r={6} fill="#1a0e0e" stroke="#e10600" strokeWidth={1.2} />
        <path d="M -3 -3 L 3 3 M -3 3 L 3 -3" stroke="#e10600" strokeWidth={1.5} strokeLinecap="round" />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="#0e0e1a" strokeWidth={1} />;
}

interface ComparisonTooltipProps extends TooltipProps<number, string> {
  primarySeason: number;
  compareSeason: number;
}

// Pure helper hoisted outside the component — no closure deps, doesn't need
// to be recreated each render.
const fmtPosition = (val: number | undefined, isDnf?: boolean) => {
  if (val == null) return "—";
  if (isDnf) return "DNF";
  return `P${val}`;
};

function ComparisonTooltip({ active, payload, label, primarySeason, compareSeason }: ComparisonTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <div className="rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur p-2 text-xs shadow-2xl space-y-0.5">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted">Round {label}</div>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-f1-muted w-12">{primarySeason}</span>
        <span className={row.primaryIsDnf ? "text-f1-red" : "text-f1-white"}>
          {fmtPosition(row.primary, row.primaryIsDnf)}
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-f1-muted w-12">{compareSeason}</span>
        <span className={row.compareIsDnf ? "text-f1-red" : "text-f1-white"}>
          {fmtPosition(row.compare, row.compareIsDnf)}
        </span>
      </div>
    </div>
  );
}

import { Fragment, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, type TooltipProps, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { teamColor } from "@/lib/teams";
import type { LapByLapResponse } from "@/lib/types";

interface Props {
  data: LapByLapResponse;
  /** How many drivers to highlight by colour (rest render in muted grey).
   *  Defaults to the actual final-position top 5. */
  topN?: number;
}

const MUTED = "#3a3a55";
const DNF_Y = 22;
const MAX_POSITION = 20;

interface ChartPoint {
  lap: number;
  /** Dynamic per-driver fields: actual_<code> and predicted_<code>. */
  [key: string]: number | undefined;
}

/**
 * Lap-by-lap predicted vs actual position chart for a finished race.
 *
 * X-axis: lap number (sampled every 5 laps + the final lap).
 * Y-axis: finishing position (inverted — P1 at top, DNF row at the bottom).
 *
 * Two lines per highlighted driver, both coloured in that driver's team
 * livery: solid for actual, dashed for predicted. Lines diverge where
 * the model got the race shape wrong.
 */
export function LapByLapChart({ data, topN = 5 }: Props) {
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);

  const highlightedCodes = useMemo<string[]>(() => {
    return data.drivers
      .filter(d => d.final_position != null && d.final_position <= topN)
      .sort((a, b) => (a.final_position ?? 99) - (b.final_position ?? 99))
      .map(d => d.driver_code);
  }, [data.drivers, topN]);

  const teamByCode = useMemo<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {};
    data.drivers.forEach(d => { map[d.driver_code] = d.team_name ?? null; });
    return map;
  }, [data.drivers]);

  const chartRows = useMemo<ChartPoint[]>(() => {
    return data.frames.map(frame => {
      const row: ChartPoint = { lap: frame.lap };
      frame.rows.forEach(r => {
        if (r.actual_position != null) {
          row[`actual_${r.driver_code}`] = Math.min(r.actual_position, MAX_POSITION);
        }
        if (r.predicted_position != null) {
          row[`predicted_${r.driver_code}`] = Math.min(r.predicted_position, MAX_POSITION);
        }
      });
      return row;
    });
  }, [data.frames]);

  if (chartRows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Lap-by-lap · predicted vs actual</CardTitle>
          <CardDescription>No sampled lap data available for this race.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Lap-by-lap · predicted vs actual</CardTitle>
        <CardDescription>
          {data.season} R{data.round} · sampled every 5 laps · solid = actual position · dashed = model's predicted position · top {topN} highlighted
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer>
            <LineChart data={chartRows} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="#2a2a40" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="lap"
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                tickFormatter={(l) => `L${l}`}
              />
              <YAxis
                stroke="#8a8aa3"
                tick={{ fontSize: 11 }}
                width={40}
                reversed
                domain={[1, MAX_POSITION]}
                ticks={[1, 5, 10, 15, 20]}
                tickFormatter={(v) => `P${v}`}
              />
              <ReferenceLine y={DNF_Y} stroke="#e10600" strokeOpacity={0.25} strokeDasharray="4 4" />
              <Tooltip content={
                <LapByLapTooltip
                  highlighted={highlightedCodes}
                  teamByCode={teamByCode}
                />
              } />
              {data.drivers.flatMap(d => {
                const code = d.driver_code;
                const isHighlight = highlightedCodes.includes(code);
                const color = isHighlight ? teamColor(d.team_name) : MUTED;
                const isHovered = hoveredDriver === code;
                const isDimmed = hoveredDriver != null && hoveredDriver !== code;
                if (!isHighlight && !isHovered) return [];
                const opacityActual = isDimmed ? 0.15 : isHighlight ? 0.95 : 0.5;
                const opacityPredicted = isDimmed ? 0.10 : isHighlight ? 0.7 : 0.4;
                const width = isHovered ? 2.5 : isHighlight ? 2 : 1;
                return [
                  <Line
                    key={`actual_${code}`}
                    type="monotone"
                    dataKey={`actual_${code}`}
                    stroke={color}
                    strokeWidth={width}
                    strokeOpacity={opacityActual}
                    dot={false}
                    isAnimationActive={false}
                  />,
                  <Line
                    key={`predicted_${code}`}
                    type="monotone"
                    dataKey={`predicted_${code}`}
                    stroke={color}
                    strokeWidth={width}
                    strokeOpacity={opacityPredicted}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                  />,
                ];
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend chip row — actual vs predicted line styles + the top-N drivers */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-f1-muted">
            <svg width="16" height="3" aria-hidden="true">
              <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#a4acc4" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Actual
          </span>
          <span className="inline-flex items-center gap-1.5 text-f1-muted">
            <svg width="16" height="3" aria-hidden="true">
              <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#a4acc4" strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
            Predicted
          </span>
          <span className="text-f1-muted/60">·</span>
          {highlightedCodes.map(code => (
            <span
              key={code}
              onMouseEnter={() => setHoveredDriver(code)}
              onMouseLeave={() => setHoveredDriver(null)}
              className="inline-flex items-center gap-1.5 cursor-default"
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: teamColor(teamByCode[code]) }} />
              <span className="text-f1-white">{code}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


interface LapByLapTooltipProps extends TooltipProps<number, string> {
  highlighted: string[];
  teamByCode: Record<string, string | null>;
}
function LapByLapTooltip({ active, payload, label, highlighted, teamByCode }: LapByLapTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as ChartPoint;

  const lines = highlighted.map(code => {
    const actual = row[`actual_${code}`];
    const predicted = row[`predicted_${code}`];
    const color = teamColor(teamByCode[code]);
    const fmt = (v: number | undefined) =>
      v == null ? "—" : v >= 21 ? "DNF" : `P${v}`;
    return { code, actual, predicted, color, fmt };
  });

  return (
    <div className="rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur p-2 text-xs shadow-2xl space-y-0.5">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">Lap {label}</div>
      <div className="grid grid-cols-[auto_auto_auto_auto] gap-x-2 font-mono">
        <div className="text-[9px] uppercase tracking-widest text-f1-muted"></div>
        <div className="text-[9px] uppercase tracking-widest text-f1-muted">DRV</div>
        <div className="text-[9px] uppercase tracking-widest text-f1-muted">ACTUAL</div>
        <div className="text-[9px] uppercase tracking-widest text-f1-muted">PRED</div>
        {lines.map(({ code, actual, predicted, color, fmt }) => (
          <Fragment key={code}>
            <span className="h-2 w-2 rounded-sm self-center" style={{ background: color }} />
            <span className="text-f1-white">{code}</span>
            <span className="text-f1-white">{fmt(actual)}</span>
            <span className="text-f1-muted">{fmt(predicted)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

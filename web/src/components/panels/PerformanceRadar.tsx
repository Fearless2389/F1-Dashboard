import { useMemo } from "react";
import { Info } from "lucide-react";
import {
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer,
} from "recharts";

interface RadarValues {
  qualifying: number;
  race_pace: number;
  tyre_mgmt: number;
  consistency: number;
  overtaking: number;
}

interface Props {
  driverCode: string;
  values?: RadarValues | null;
  /** Optional overlay (compare-mode). Renders a second shape behind the
   *  primary as an outline so two seasons can be eyeballed at once. */
  compareValues?: RadarValues | null;
  /** Label shown next to the primary series — usually the primary season. */
  primaryLabel?: string;
  /** Label shown next to the overlay — usually the comparison season. */
  compareLabel?: string;
}

/**
 * Pentagon-shaped performance radar. All metrics 0..100, computed server-side
 * from the aligned dataset (`compute_metrics()` in `src/live/driver_metrics.py`).
 *
 *   Qualifying    — average qualifying position over the sample (lower P = higher score)
 *   Race Pace     — average finish position over the sample
 *   Tyre Mgmt     — consistency × (1 − DNF rate); proxy for race-trim discipline
 *   Consistency   — 100 − stdev(finish_position), capped
 *   Overtaking    — median (grid − finish); positive = positions gained
 *
 *   Aggression %  — DNF rate × 4 (capped at 100). High = aggressive / unlucky
 *   Experience %  — driver's career-race percentile against all drivers in our data
 */
const METRIC_HINTS: Record<keyof RadarValues, string> = {
  qualifying:  "Average qualifying position over the sample",
  race_pace:   "Average finish position over the sample",
  tyre_mgmt:   "Race-trim discipline (consistency × non-DNF rate)",
  consistency: "How tight are finish positions vs the season mean",
  overtaking:  "Median positions gained per race (grid − finish)",
};

function asAxisRows(v?: RadarValues | null) {
  const f = v ?? { qualifying: 50, race_pace: 50, tyre_mgmt: 50, consistency: 50, overtaking: 50 };
  return [
    { axis: "Qualifying",  value: f.qualifying  },
    { axis: "Race Pace",   value: f.race_pace   },
    { axis: "Tyre Mgmt",   value: f.tyre_mgmt   },
    { axis: "Consistency", value: f.consistency },
    { axis: "Overtaking",  value: f.overtaking  },
  ];
}

export function PerformanceRadar({
  driverCode, values, compareValues, primaryLabel, compareLabel,
}: Props) {
  const data = useMemo(() => {
    const primary = asAxisRows(values);
    const compare = compareValues ? asAxisRows(compareValues) : null;
    return primary.map((p, i) => ({
      axis:    p.axis,
      primary: p.value,
      compare: compare ? compare[i].value : undefined,
    }));
  }, [values, compareValues]);

  const primaryAvg = (data.reduce((a, d) => a + d.primary, 0) / data.length).toFixed(1);
  const compareAvg = compareValues
    ? (data.reduce((a, d) => a + (d.compare ?? 0), 0) / data.length).toFixed(1)
    : null;

  return (
    <div className="rounded-xl border border-f1-edge bg-f1-panel/50 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-f1-muted flex items-center gap-1">
            Performance Radar
            <span
              className="inline-flex"
              title={
                "5 axes, 0–100 each:\n" +
                "• Qualifying: avg quali position\n" +
                "• Race Pace: avg finish position\n" +
                "• Tyre Mgmt: consistency × (1 − DNF rate)\n" +
                "• Consistency: 100 − stdev(finish position)\n" +
                "• Overtaking: median (grid − finish), positive = gained\n" +
                "All values from the selected season; falls back to last 10 across career"
              }
            >
              <Info size={11} />
            </span>
          </div>
          <div className="font-display text-sm font-semibold mt-0.5">{driverCode}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-f1-muted">Avg</div>
          <div className="font-display font-bold text-paddock-coral text-xl tabular-nums">{primaryAvg}</div>
          {compareAvg != null && (
            <div className="text-[10px] text-paddock-cyan font-mono tabular-nums">
              vs <span className="font-semibold">{compareAvg}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="78%">
            <PolarGrid stroke="#2c3149" strokeDasharray="3 4" />
            <PolarAngleAxis
              dataKey="axis"
              tick={({ payload, x, y, textAnchor }) => (
                <text
                  x={x} y={y} textAnchor={textAnchor}
                  fill="#a4acc4" fontSize={11} fontWeight={600}
                >
                  <title>{METRIC_HINTS[payload.value as keyof RadarValues] ?? ""}</title>
                  {payload.value}
                </text>
              )}
              tickLine={false}
            />
            {/* Comparison underlay — outlined, faint fill */}
            {compareValues && (
              <Radar
                dataKey="compare"
                stroke="var(--color-paddock-cyan)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="var(--color-paddock-cyan)"
                fillOpacity={0.12}
                isAnimationActive={false}
              />
            )}
            {/* Primary — solid coral */}
            <Radar
              dataKey="primary"
              stroke="var(--color-paddock-coral)"
              strokeWidth={1.5}
              fill="var(--color-paddock-coral)"
              fillOpacity={compareValues ? 0.24 : 0.32}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {compareValues && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-paddock-coral">
            <span className="inline-block w-3 h-0.5 rounded-sm bg-paddock-coral" />
            {primaryLabel ?? "Primary"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-paddock-cyan">
            <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5"
              stroke="var(--color-paddock-cyan)" strokeWidth="2" strokeDasharray="4 3" /></svg>
            {compareLabel ?? "Compare"}
          </span>
        </div>
      )}
    </div>
  );
}

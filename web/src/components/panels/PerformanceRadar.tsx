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

export function PerformanceRadar({ driverCode, values }: Props) {
  const data = useMemo(() => {
    const v = values ?? {
      qualifying: 50, race_pace: 50, tyre_mgmt: 50, consistency: 50, overtaking: 50,
    };
    return [
      { axis: "Qualifying",  value: v.qualifying  },
      { axis: "Race Pace",   value: v.race_pace   },
      { axis: "Tyre Mgmt",   value: v.tyre_mgmt   },
      { axis: "Consistency", value: v.consistency },
      { axis: "Overtaking",  value: v.overtaking  },
    ];
  }, [values]);

  const avg = (data.reduce((a, d) => a + d.value, 0) / data.length).toFixed(1);

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
          <div className="font-display font-bold text-paddock-coral text-xl tabular-nums">{avg}</div>
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
            <Radar
              dataKey="value"
              stroke="var(--color-paddock-coral)"
              strokeWidth={1.5}
              fill="var(--color-paddock-coral)"
              fillOpacity={0.32}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

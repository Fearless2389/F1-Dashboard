import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface WinProbResponse {
  season: number;
  round: number;
  n_laps: number;
  drivers: string[];
  frames: { lap: number; rows: { driver_code: string; prob: number }[] }[];
}

interface Props {
  season: number;
  roundNum: number;
  currentLap: number;
  podium?: { driver_code: string }[];
}

const PALETTE = [
  "#e10600", "#27f4d2", "#ff8000", "#3671c6", "#52e252", "#64c4ff", "#ffd200", "#ff87bc",
];

export function WinProbabilityChart({ season, roundNum, currentLap, podium }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["replay", "winprob", season, roundNum],
    queryFn: () => api.get<WinProbResponse>(
      `/api/replay/${season}/${roundNum}/win_probability`,
    ),
    enabled: !!(season && roundNum),
    staleTime: 60 * 60 * 1000,
  });

  // Pick podium finishers (top 3) + a couple of mid-pack drivers
  const focusDrivers = useMemo(() => {
    if (!data) return [] as string[];
    const podiumCodes = (podium ?? []).slice(0, 3).map(p => p.driver_code);
    const extras = data.drivers.filter(c => !podiumCodes.includes(c)).slice(0, 2);
    return [...podiumCodes, ...extras];
  }, [data, podium]);

  const series = useMemo(() => {
    if (!data) return [];
    return data.frames.map(f => {
      const row: any = { lap: f.lap };
      for (const r of f.rows) row[r.driver_code] = +(r.prob * 100).toFixed(2);
      return row;
    });
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Live Win Probability</CardTitle>
        <div className="text-xs text-f1-muted mt-1">
          Re-predicted every ~5 laps · podium finishers highlighted
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-[280px] w-full" />}
        {!isLoading && error && (
          <div className="text-xs text-f1-muted">Win-probability arc unavailable for this race.</div>
        )}
        {!isLoading && series.length > 0 && (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#232342" strokeDasharray="2 4" />
                <XAxis
                  dataKey="lap"
                  tick={{ fill: "#8a8aa3", fontSize: 11 }}
                  stroke="#3a3a5c"
                  label={{ value: "Lap", position: "insideBottom", offset: -4, fill: "#8a8aa3", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#8a8aa3", fontSize: 11 }}
                  stroke="#3a3a5c"
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#8a8aa3" }}
                  formatter={(v: any, name: any) => [`${v}%`, name]}
                />
                <Legend wrapperStyle={{ color: "#8a8aa3", fontSize: 11 }} />
                <ReferenceLine x={currentLap} stroke="#e10600" strokeDasharray="4 4" />
                {focusDrivers.map((code, i) => (
                  <Line
                    key={code}
                    dataKey={code}
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={i < 3 ? 2.2 : 1.4}
                    strokeOpacity={i < 3 ? 1 : 0.55}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

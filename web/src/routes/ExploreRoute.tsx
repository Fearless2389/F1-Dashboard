import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompare, useDrivers } from "@/hooks/useApi";
import { teamColor } from "@/lib/teams";

const COLORS = ["#e10600", "#27f4d2", "#ff8000", "#3671c6", "#52e252", "#64c4ff"];

export default function ExploreRoute() {
  const { data: allDrivers, isLoading: loadingDrivers } = useDrivers();
  const [selected, setSelected] = useState<string[]>(["VER", "LEC"]);
  const [fromSeason, setFrom] = useState(2022);
  const [toSeason, setTo] = useState(2025);

  const cmp = useCompare(selected, fromSeason, toSeason);

  // Reshape (driver-major rows) → (race-major series) with one column per driver
  const series = useMemo(() => {
    const rows = cmp.data?.rows ?? [];
    const byKey = new Map<string, any>();
    for (const r of rows) {
      const key = `${r.season}-R${String(r.round).padStart(2, "0")}`;
      if (!byKey.has(key)) byKey.set(key, { key, label: key });
      const rec = byKey.get(key);
      const code = r.driver_code;
      if (code) {
        rec[code] = r.finish_position ?? null;
        rec[`${code}_points`] = r.points ?? null;
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [cmp.data]);

  const toggleDriver = (code: string) => {
    setSelected((sel) =>
      sel.includes(code)
        ? sel.filter((s) => s !== code)
        : sel.length >= 6 ? sel : [...sel, code],
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Historical Explorer</h1>
        <p className="text-xs text-f1-muted">
          Pick drivers and a season range to compare finishing positions and points side-by-side.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Drivers</CardTitle>
          <CardDescription>Click to toggle (up to 6).</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDrivers ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(allDrivers ?? []).map((code, i) => {
                const active = selected.includes(code);
                const color = COLORS[selected.indexOf(code) % COLORS.length];
                return (
                  <button
                    key={code}
                    onClick={() => toggleDriver(code)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-mono",
                      active
                        ? "border-f1-red text-f1-white"
                        : "border-f1-edge text-f1-muted hover:text-f1-white",
                    ].join(" ")}
                    style={active ? { background: `${color}22`, borderColor: color } : {}}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 text-xs">
            <label>
              From
              <input
                type="number" value={fromSeason} onChange={(e) => setFrom(+e.target.value)}
                className="ml-2 h-8 w-20 rounded-md border border-f1-edge bg-f1-panel px-2"
              />
            </label>
            <label>
              To
              <input
                type="number" value={toSeason} onChange={(e) => setTo(+e.target.value)}
                className="ml-2 h-8 w-20 rounded-md border border-f1-edge bg-f1-panel px-2"
              />
            </label>
            <Badge tone="muted">{cmp.data?.rows.length ?? 0} rows</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Finish Position</CardTitle>
          <CardDescription>Lower is better — P1 at top.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#232342" strokeDasharray="2 4" />
                <XAxis dataKey="key" tick={{ fill: "#8a8aa3", fontSize: 10 }} interval={4} stroke="#3a3a5c" />
                <YAxis reversed domain={[1, 20]} tick={{ fill: "#8a8aa3", fontSize: 10 }} stroke="#3a3a5c" />
                <Tooltip
                  contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#8a8aa3" }}
                />
                <Legend wrapperStyle={{ color: "#8a8aa3", fontSize: 12 }} />
                {selected.map((code, i) => (
                  <Line
                    key={code}
                    dataKey={code}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

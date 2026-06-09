import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { usePredictMutation, useSimulateMutation } from "@/hooks/useApi";
import { useRaceContext } from "@/store/raceContext";
import { teamColor } from "@/lib/teams";
import type { QualiInput, PredictionResponse } from "@/lib/types";

const SAMPLE_QUALI: QualiInput[] = [
  { driver_code: "VER", team_name: "Red Bull Racing", quali_position: 1 },
  { driver_code: "LEC", team_name: "Ferrari", quali_position: 2 },
  { driver_code: "NOR", team_name: "McLaren", quali_position: 3 },
  { driver_code: "HAM", team_name: "Mercedes", quali_position: 4 },
  { driver_code: "RUS", team_name: "Mercedes", quali_position: 5 },
  { driver_code: "SAI", team_name: "Ferrari", quali_position: 6 },
  { driver_code: "PIA", team_name: "McLaren", quali_position: 7 },
  { driver_code: "PER", team_name: "Red Bull Racing", quali_position: 8 },
  { driver_code: "ALO", team_name: "Aston Martin", quali_position: 9 },
  { driver_code: "STR", team_name: "Aston Martin", quali_position: 10 },
];

export default function PredictRoute() {
  const { season, round } = useRaceContext();
  const [circuit, setCircuit] = useState("bahrain");
  const [airTemp, setAirTemp] = useState(28);
  const [trackTemp, setTrackTemp] = useState(40);
  const [wet, setWet] = useState(false);
  const [quali, setQuali] = useState<QualiInput[]>(SAMPLE_QUALI);

  const predict = usePredictMutation();
  const simulate = useSimulateMutation();

  const onRun = async () => {
    try {
      await predict.mutateAsync({
        season, round, circuit_id: circuit,
        weather: { air_temp_mean: airTemp, track_temp_mean: trackTemp, rainfall: wet },
        quali,
      });
    } catch (e: any) {
      toast.error(`Prediction failed: ${e.message ?? e}`);
    }
  };

  const onSim = async () => {
    try {
      await simulate.mutateAsync({
        season, round, circuit_id: circuit,
        weather: { air_temp_mean: airTemp, track_temp_mean: trackTemp, rainfall: wet },
        quali, n_iterations: 1000,
      });
    } catch (e: any) {
      toast.error(`Simulation failed: ${e.message ?? e}`);
    }
  };

  const result = predict.data;
  const sim = simulate.data;

  return (
    <div className="grid gap-4 grid-cols-1 xl:grid-cols-[360px_1fr]">
      {/* Sidebar form */}
      <Card className="h-fit sticky top-20">
        <CardHeader>
          <CardTitle>Race Setup</CardTitle>
          <CardDescription>Pick a circuit + weather, edit qualifying.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Labelled label="Circuit ID">
            <Input value={circuit} onChange={(e) => setCircuit(e.target.value)} />
          </Labelled>
          <div className="grid grid-cols-2 gap-2">
            <Labelled label="Air °C">
              <Input type="number" value={airTemp} onChange={(e) => setAirTemp(+e.target.value)} />
            </Labelled>
            <Labelled label="Track °C">
              <Input type="number" value={trackTemp} onChange={(e) => setTrackTemp(+e.target.value)} />
            </Labelled>
          </div>
          <label className="flex items-center gap-2 text-xs text-f1-muted">
            <input
              type="checkbox" checked={wet} onChange={(e) => setWet(e.target.checked)}
              className="h-4 w-4 rounded border-f1-edge bg-f1-panel"
            />
            Wet race
          </label>

          <div className="rounded-md border border-f1-edge bg-f1-panel/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-f1-muted">Qualifying ({quali.length})</div>
              <Button
                size="sm" variant="ghost"
                onClick={() => setQuali(SAMPLE_QUALI)}
              >
                Reset sample
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {quali.map((q, i) => (
                <div key={i} className="grid grid-cols-[20px_64px_1fr] gap-2 items-center text-xs">
                  <div className="text-f1-muted">{q.quali_position}</div>
                  <Input
                    value={q.driver_code}
                    onChange={(e) => {
                      const next = [...quali];
                      next[i] = { ...q, driver_code: e.target.value.toUpperCase() };
                      setQuali(next);
                    }}
                    className="h-7 text-[11px]"
                  />
                  <Input
                    value={q.team_name}
                    onChange={(e) => {
                      const next = [...quali];
                      next[i] = { ...q, team_name: e.target.value };
                      setQuali(next);
                    }}
                    className="h-7 text-[11px]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={onRun} disabled={predict.isPending} className="flex-1">
              {predict.isPending ? "Predicting…" : "Run prediction"}
            </Button>
            <Button onClick={onSim} disabled={simulate.isPending} variant="secondary">
              {simulate.isPending ? "Simulating…" : "Monte Carlo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-4 min-w-0">
        {!result && !predict.isPending && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-f1-muted">
              Configure the race on the left and run a prediction to see the output here.
            </CardContent>
          </Card>
        )}
        {predict.isPending && <Skeleton className="h-96 w-full" />}
        {result && <ResultPanels result={result} simulationResult={sim} />}
      </div>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">{label}</div>
      {children}
    </label>
  );
}

function ResultPanels({
  result,
  simulationResult,
}: {
  result: PredictionResponse;
  simulationResult?: ReturnType<typeof useSimulateMutation>["data"];
}) {
  const drivers = result.drivers;

  const rows = useMemo(
    () => drivers.map((d) => ({
      ...d,
      _color: teamColor(d.team_name),
    })),
    [drivers],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between pb-2">
          <CardTitle>
            Predicted Grid — Round {result.round}, {result.circuit_id}
          </CardTitle>
          <Badge tone="muted">{rows.length} drivers</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] text-f1-muted uppercase tracking-wider">
              <tr>
                <th className="text-left pb-2 pl-1">Pred</th>
                <th className="text-left pb-2">Driver</th>
                <th className="text-left pb-2">Team</th>
                <th className="text-right pb-2">Quali</th>
                <th className="text-right pb-2">Top-10</th>
                <th className="text-right pb-2">Podium</th>
                <th className="text-right pb-2">Win</th>
                <th className="text-right pb-2">DNF</th>
                <th className="text-right pb-2">FL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.driver_code} className="border-t border-f1-edge">
                  <td className="py-2 pl-1 font-mono">{d.expected_position}</td>
                  <td className="py-2 flex items-center gap-2">
                    <span className="h-3 w-1 rounded-sm" style={{ background: d._color }} />
                    {d.driver_code}
                  </td>
                  <td className="py-2 text-f1-muted text-xs truncate max-w-[160px]">
                    {d.team_name}
                  </td>
                  <td className="py-2 text-right tabular-nums">P{d.quali_position}</td>
                  <td className="py-2 text-right tabular-nums">{pct(d.prob_top10)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(d.prob_podium)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(d.prob_win)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(d.prob_dnf)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(d.prob_fastest_lap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Tabs defaultValue="top10">
        <TabsList>
          <TabsTrigger value="top10">Top-10</TabsTrigger>
          <TabsTrigger value="podium">Podium</TabsTrigger>
          <TabsTrigger value="winner">Winner</TabsTrigger>
          <TabsTrigger value="dnf">DNF</TabsTrigger>
          <TabsTrigger value="fl">Fastest Lap</TabsTrigger>
        </TabsList>
        <TabsContent value="top10"><ProbBar data={rows} dataKey="prob_top10" label="Top-10 probability" /></TabsContent>
        <TabsContent value="podium"><ProbBar data={rows} dataKey="prob_podium" label="Podium probability" /></TabsContent>
        <TabsContent value="winner"><ProbBar data={rows} dataKey="prob_win"   label="Win probability" /></TabsContent>
        <TabsContent value="dnf"><ProbBar data={rows} dataKey="prob_dnf"      label="DNF probability" /></TabsContent>
        <TabsContent value="fl"><ProbBar data={rows} dataKey="prob_fastest_lap" label="Fastest-lap probability" /></TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Most likely podium combinations</CardTitle>
          <CardDescription>
            {simulationResult
              ? `From ${simulationResult.n_iterations} Monte Carlo iterations`
              : "Approximated from podium probabilities — run Monte Carlo for precise combinations."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {((simulationResult?.podium_combinations as any) || result.podium_combinations).length === 0 ? (
            <div className="text-xs text-f1-muted">No combinations available.</div>
          ) : (
            <ul className="space-y-2">
              {((simulationResult?.podium_combinations as any) || result.podium_combinations)
                .slice(0, 5)
                .map((c: { drivers: string[]; probability: number }, i: number) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-f1-edge px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone="muted">#{i + 1}</Badge>
                    <span className="font-mono">{c.drivers.join(" · ")}</span>
                  </div>
                  <span className="tabular-nums">{(c.probability * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ProbBar({
  data, dataKey, label,
}: {
  data: any[];
  dataKey: string;
  label: string;
}) {
  const filtered = data
    .filter((d) => d[dataKey] != null)
    .sort((a, b) => (b[dataKey] - a[dataKey]));
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#232342" strokeDasharray="2 4" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fill: "#8a8aa3", fontSize: 11 }}
                stroke="#3a3a5c"
              />
              <YAxis
                type="category"
                dataKey="driver_code"
                tick={{ fill: "#f5f5f7", fontSize: 11 }}
                stroke="#3a3a5c"
                width={50}
              />
              <Tooltip
                contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#8a8aa3" }}
                formatter={(v: any) => [`${(v * 100).toFixed(1)}%`, label]}
              />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
                {filtered.map((d, i) => (
                  <Cell key={i} fill={d._color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

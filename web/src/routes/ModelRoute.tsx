import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useImportance, useManifest } from "@/hooks/useApi";
import type { TargetMetrics } from "@/lib/types";

const ALL_TARGETS = ["top10", "podium", "winner", "dnf", "fastest_lap", "quali"];

export default function ModelRoute() {
  const { data, isLoading } = useManifest();
  const targets: TargetMetrics[] = data?.targets ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Models</h1>
        <p className="text-xs text-f1-muted">
          Trained on the time-aware split (train 2018–2023, val 2024, test 2025).
          Generated {data?.generated_at?.slice(0, 19) || "—"}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Manifest</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-f1-muted tracking-wider">
                <tr>
                  <th className="text-left pb-2">Target</th>
                  <th className="text-left pb-2">Kind</th>
                  <th className="text-right pb-2">Rows</th>
                  <th className="text-right pb-2">Features</th>
                  <th className="text-right pb-2">Val metric</th>
                  <th className="text-right pb-2">Test metric</th>
                  <th className="text-right pb-2">Trained</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.target} className="border-t border-f1-edge">
                    <td className="py-2 font-mono">{t.target}</td>
                    <td className="py-2"><Badge tone="muted">{t.kind}</Badge></td>
                    <td className="py-2 text-right tabular-nums">{t.train_rows ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{t.n_features ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">
                      {t.val_metric != null ? t.val_metric.toFixed(4) : "—"}
                      {t.val_metric_name && (
                        <span className="ml-1 text-[10px] text-f1-muted">{t.val_metric_name}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.test_metric != null ? t.test_metric.toFixed(4) : "—"}
                    </td>
                    <td className="py-2 text-right text-[10px] text-f1-muted">
                      {t.train_date?.slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))}
                {!isLoading && targets.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-f1-muted text-xs">
                    No manifest found. Run <code className="text-f1-white">python -m src.models.train</code>.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="top10">
        <TabsList>
          {ALL_TARGETS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>
        {ALL_TARGETS.map((t) => (
          <TabsContent key={t} value={t}>
            <ImportancePanel target={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ImportancePanel({ target }: { target: string }) {
  const { data, isLoading, error } = useImportance(target);
  const rows = (data?.rows ?? []).slice(0, 15);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Feature importance — {target}</CardTitle>
        <CardDescription>Top 15 features by gain.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-64 w-full" />}
        {!isLoading && error && (
          <div className="text-xs text-f1-muted">No importance available — model probably not trained yet.</div>
        )}
        {!isLoading && rows.length > 0 && (
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 32, left: 16, bottom: 8 }}>
                <CartesianGrid stroke="#232342" strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8a8aa3", fontSize: 11 }} stroke="#3a3a5c" />
                <YAxis type="category" dataKey="feature" tick={{ fill: "#f5f5f7", fontSize: 11 }} stroke="#3a3a5c" width={160} />
                <Tooltip
                  contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="importance" fill="#e10600" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

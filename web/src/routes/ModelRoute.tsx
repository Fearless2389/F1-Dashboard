import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useImportance, useManifest } from "@/hooks/useApi";
import { api } from "@/lib/api";
import type { TargetMetrics } from "@/lib/types";

const ALL_TARGETS = ["top10", "podium", "winner", "dnf", "fastest_lap", "quali"] as const;

// Plain-English descriptions per target — keeps the Models page useful to a
// reader who isn't deep in the codebase. Crosslink to the prediction surface
// so the page tells a "here's the model → here's what it powers" story.
const TARGET_META: Record<string, { description: string; crosslink?: { to: string; label: string } }> = {
  top10:       {
    description: "Probability that a driver finishes inside the top 10. Drives the P4–P10 finish table on the Predictor.",
    crosslink:   { to: "/apex", label: "View P4–P10 table →" },
  },
  podium:      {
    description: "Probability that a driver finishes on the podium (P1–P3). Surfaces as the podium tiles + SHAP reasoning.",
    crosslink:   { to: "/apex", label: "View predicted podium →" },
  },
  winner:      {
    description: "Plackett-Luce ranker that scores every driver's chance of winning the race. Drives the hero pick + Top 5 win bars.",
    crosslink:   { to: "/apex", label: "View predicted winner →" },
  },
  dnf:         {
    description: "Probability that a driver retires before the chequered flag (any cause — mechanical, contact, weather). Used by the Monte Carlo simulator for the DNF column.",
    crosslink:   { to: "/apex", label: "View DNF column →" },
  },
  fastest_lap: {
    description: "Probability of taking the fastest-lap bonus point. Used inside the simulator's points totals.",
  },
  quali:       {
    description: "Predicted starting grid — used as the fallback when actual qualifying times aren't yet on file (e.g. an upcoming race).",
    crosslink:   { to: "/apex", label: "View predicted pole →" },
  },
};

// Artifact filename per target, so the page can tell a reader "this is the
// .pkl on disk that powers this prediction."
const ARTIFACT_NAME: Record<string, string> = {
  top10:       "xgb_top10.pkl",
  podium:      "xgb_podium.pkl",
  winner:      "lgbm_winner.pkl",
  dnf:         "xgb_dnf.pkl",
  fastest_lap: "lgbm_fastest_lap.pkl",
  quali:       "lgbm_quali.pkl",
};

export default function ModelRoute() {
  const { data, isLoading } = useManifest();
  const targets: TargetMetrics[] = data?.targets ?? [];
  const trainSeasons = (data as any)?.train_seasons as number[] | undefined;
  const valSeasons   = (data as any)?.val_seasons as number[] | undefined;
  const testSeasons  = (data as any)?.test_seasons as number[] | undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Models</h1>
        <p className="text-xs text-f1-muted">
          {/* Pull the actual season splits from the manifest so this line
              never goes stale when src/ingestion/config.py is edited. */}
          {formatSplit(trainSeasons, valSeasons, testSeasons)}
          {data?.generated_at && (
            <>
              {" · Generated "}
              <span className="text-f1-white font-mono">{data.generated_at.slice(0, 19)}</span>
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Manifest</CardTitle>
          <CardDescription>
            One row per trained target. Test metric is held-out; val metric is the gating score used during training.
          </CardDescription>
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
                  <th className="text-left pb-2">Artifact</th>
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
                    <td className="py-2 font-mono text-[11px] text-f1-muted">
                      {ARTIFACT_NAME[t.target] ?? "—"}
                    </td>
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
                  <tr><td colSpan={8} className="text-center py-6 text-f1-muted text-xs">
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
            <TargetDetail target={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function formatSplit(
  train?: number[], val?: number[], test?: number[],
): string {
  if (!train || !val || !test || train.length === 0) {
    return "Trained on the time-aware split.";
  }
  const range = (xs: number[]) =>
    xs.length === 1 ? `${xs[0]}` : `${Math.min(...xs)}–${Math.max(...xs)}`;
  return `Time-aware split — train ${range(train)} · val ${range(val)} · test ${range(test)}`;
}

function TargetDetail({ target }: { target: string }) {
  const meta = TARGET_META[target];
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[3fr_2fr]">
      <ImportancePanel target={target} />
      <div className="space-y-4">
        {meta && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>About this model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-f1-muted leading-relaxed">
              <p>{meta.description}</p>
              {meta.crosslink && (
                <Link
                  to={meta.crosslink.to}
                  className="inline-block text-[10px] uppercase tracking-widest text-paddock-cyan hover:text-f1-white border border-dashed border-paddock-cyan/40 rounded-full px-2.5 py-0.5"
                >
                  {meta.crosslink.label}
                </Link>
              )}
            </CardContent>
          </Card>
        )}
        <CalibrationPanel target={target} />
      </div>
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

/**
 * Reliability diagram — plots mean predicted probability vs the empirical
 * positive-class rate for each bin. The diagonal y=x is the perfectly
 * calibrated reference; bins above the diagonal mean the model is
 * under-confident, below means over-confident.
 *
 * Only available for binary models (top10/podium/dnf today; winner is a
 * ranker so the endpoint returns an empty bins list).
 */
function CalibrationPanel({ target }: { target: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["model-calibration", target],
    queryFn: () => api.get<{ target: string; bins: { mean_predicted: number; fraction_positive: number }[] }>(
      `/api/models/${target}/calibration`,
    ),
    staleTime: Infinity,
    retry: false,
  });

  const bins = data?.bins ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Calibration</CardTitle>
        <CardDescription>
          Reliability diagram. Closer to the dashed diagonal = better calibrated probabilities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-48 w-full" />}
        {!isLoading && bins.length === 0 && (
          <div className="text-xs text-f1-muted">
            No calibration data — this target is a ranker, not a binary classifier.
          </div>
        )}
        {!isLoading && bins.length > 0 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: 16, bottom: 16 }}>
                <CartesianGrid stroke="#232342" strokeDasharray="2 4" />
                <XAxis
                  type="number"
                  dataKey="mean_predicted"
                  domain={[0, 1]}
                  tick={{ fill: "#8a8aa3", fontSize: 10 }}
                  stroke="#3a3a5c"
                  label={{ value: "Predicted probability", position: "insideBottom", offset: -8, fill: "#8a8aa3", fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="fraction_positive"
                  domain={[0, 1]}
                  tick={{ fill: "#8a8aa3", fontSize: 10 }}
                  stroke="#3a3a5c"
                  label={{ value: "Observed rate", angle: -90, position: "insideLeft", fill: "#8a8aa3", fontSize: 10 }}
                />
                <ZAxis range={[60, 60]} />
                <Tooltip
                  contentStyle={{ background: "#16162a", border: "1px solid #232342", borderRadius: 6, fontSize: 11 }}
                  formatter={(value: any, name: string) => [Number(value).toFixed(3), name === "mean_predicted" ? "Predicted" : "Observed"]}
                />
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                  stroke="#5a5a7a"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
                <Scatter
                  data={bins}
                  fill="#22e8c9"
                  line={{ stroke: "#22e8c9", strokeWidth: 1.5 }}
                  shape="circle"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


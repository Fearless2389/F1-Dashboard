import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { ApexHeader } from "@/components/panels/ApexHeader";
import { TopPredictionCard } from "@/components/panels/TopPredictionCard";
import { PredictedPodiumCard } from "@/components/panels/PredictedPodiumCard";
import { ModelReasoning } from "@/components/panels/ModelReasoning";
import { PredictedFinishTable } from "@/components/panels/PredictedFinishTable";
import { PredictedVsActualTable } from "@/components/panels/PredictedVsActualTable";
import { ForecastHeroCard } from "@/components/panels/ForecastHero";
import { Top5WinBars } from "@/components/panels/Top5WinBars";
import { DistributionMatrix } from "@/components/panels/DistributionMatrix";
import { api } from "@/lib/api";
import type {
  AccuracyResponse, ApexResponse, ForecastResponse, ScheduleResponse,
} from "@/lib/types";

const SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

/**
 * Unified Race Predictor (was /apex + /forecast — merged here so all
 * predictions for a race live on one page).
 *
 * Layout, top to bottom:
 *   1. Pole + Top-Prediction heroes — pole from the quali model, winner is
 *      the editorial TopPredictionCard with SHAP-derived prose.
 *   2. Predicted Podium tiles + Top-5 win-prob bars (Monte Carlo).
 *   3. Model Reasoning (SHAP per podium driver) + P4-P10 finish table.
 *   4. Full distribution matrix + DNF column — COLLAPSED by default so the
 *      page isn't immediately overwhelming (it's a 22×22+1 grid). Click
 *      "Show full distribution" to expand inline.
 *   5. Predicted vs Actual (only renders for past races where results
 *      have been published).
 *
 * Both /apex and /forecast endpoints are fetched in parallel — they share
 * the same race_meta + quali resolution path so the underlying call costs
 * are amortised by the backend's lru_cache.
 */
export default function ApexRoute() {
  const [search, setSearch] = useSearchParams();
  const seasonParam = search.get("season");
  const roundParam = search.get("round");

  const explicitMode = seasonParam != null && roundParam != null;
  const season = seasonParam ? parseInt(seasonParam, 10) : null;
  const round = roundParam ? parseInt(roundParam, 10) : null;

  // Apex bundle — winner + podium + reasoning + P4-P10 table
  const { data, isLoading, error } = useQuery({
    queryKey: ["apex", season ?? "next", round ?? "next"],
    queryFn: () => explicitMode
      ? api.get<ApexResponse>(`/api/apex/${season}/${round}`)
      : api.get<ApexResponse>("/api/apex/next"),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // Forecast bundle — pole + winner heroes + 10K-sim distribution matrix.
  // Fetched in parallel; the matrix is hidden behind a toggle so the
  // request body never blocks the editorial sections from rendering.
  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ["forecast", season ?? "next", round ?? "next"],
    queryFn: () => explicitMode
      ? api.get<ForecastResponse>(`/api/forecast/${season}/${round}`)
      : api.get<ForecastResponse>("/api/forecast/next"),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // Schedule for the round dropdown — populated from the chosen season.
  const scheduleSeason = season ?? (data?.race_meta.season ?? 2026);
  const { data: schedule } = useQuery({
    queryKey: ["schedule", scheduleSeason],
    queryFn: () => api.get<ScheduleResponse>(`/api/schedule/${scheduleSeason}`),
    staleTime: 60 * 60_000,
  });

  // Lap-by-lap comparison — only fetched when we have a past race selected.
  const eventDate = data?.race_meta.event_date;
  const isPastRace = useMemo(() => {
    if (!eventDate) return false;
    return new Date(eventDate).getTime() < Date.now();
  }, [eventDate]);

  const { data: accuracy, isLoading: accLoading, error: accError } = useQuery({
    queryKey: ["apex-accuracy", data?.race_meta.season, data?.race_meta.round],
    queryFn: () => api.get<AccuracyResponse>(
      `/api/apex/${data!.race_meta.season}/${data!.race_meta.round}/accuracy`,
    ),
    enabled: !!data && isPastRace,
    retry: false,
    staleTime: 60 * 60_000,
  });

  function updateSeason(newSeason: number) {
    const next = new URLSearchParams(search);
    next.set("season", String(newSeason));
    setSearch(next, { replace: true });
  }
  function updateRound(newRound: number) {
    const next = new URLSearchParams(search);
    if (season == null) {
      next.set("season", String(data?.race_meta.season ?? 2026));
    }
    next.set("round", String(newRound));
    setSearch(next, { replace: true });
  }
  function clearSelection() {
    setSearch(new URLSearchParams(), { replace: true });
  }

  const events = schedule?.events ?? [];
  const top5 = (forecast?.drivers ?? []).slice(0, 5);

  // Matrix is collapsed by default — it's the heaviest block on the page
  // (22 drivers × 22 positions + DNF) and most readers don't need it
  // immediately. Toggle persists per-mount; switch races and it stays open
  // if the user already expanded once.
  const [matrixOpen, setMatrixOpen] = useState(false);

  return (
    <div className="space-y-4">
      <ApexHeader
        modelVersion={data?.reliability.model_version ?? "v1.0"}
        nextEvent={data?.race_meta.race_name?.toUpperCase() ?? "—"}
        trainDate={data?.reliability.train_date}
      />

      {/* Race selector — defaults to "next race" when nothing's pinned. */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted">View race</span>
        <Select
          value={season ?? (data?.race_meta.season ?? 2026)}
          onChange={(e) => updateSeason(parseInt(e.target.value, 10))}
          className="h-8 w-24"
        >
          {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select
          value={round ?? (data?.race_meta.round ?? 1)}
          onChange={(e) => updateRound(parseInt(e.target.value, 10))}
          className="h-8 w-56"
        >
          {events.length === 0 && (
            <option value={data?.race_meta.round ?? 1}>
              R{data?.race_meta.round ?? "—"}
            </option>
          )}
          {events.map(ev => (
            <option key={ev.round} value={ev.round}>
              R{ev.round} · {ev.race_name}
            </option>
          ))}
        </Select>
        {explicitMode && (
          <button
            onClick={clearSelection}
            className="text-[10px] uppercase tracking-widest text-paddock-cyan hover:text-f1-white border border-dashed border-paddock-cyan/40 rounded-full px-2.5 py-0.5"
            title="Return to the auto-selected next race"
          >
            Back to next race
          </button>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-sm text-f1-muted">
          Apex prediction unavailable for this race. Train the models and refresh the schedule.
        </div>
      )}

      {data && (
        <>
          {/* Hero row — Pole (Forecast) + Top Prediction (Apex). The Apex
              card carries the SHAP-derived prose so it stays the editorial
              winner surface; the Forecast pole card adds the missing
              "predicted starting grid" piece. */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
            {forecast ? (
              <ForecastHeroCard
                kicker="PREDICTED POLE"
                label="CONFIDENCE"
                pick={forecast.pole_pick}
              />
            ) : forecastLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <div className="rounded-xl border border-dashed border-f1-edge p-4 text-center text-xs text-f1-muted">
                Pole forecast unavailable.
              </div>
            )}
            <TopPredictionCard
              top={data.top_prediction}
              qualiSource={data.quali_source}
            />
          </div>

          {/* Podium tiles + Top-5 win-prob bars. The podium tiles are the
              editorial P1/P2/P3 call; the bars give the next two contenders
              and visualise probability mass against the leader. */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
            <PredictedPodiumCard
              podium={data.podium}
              reliability={data.reliability}
            />
            {forecast ? (
              <Top5WinBars drivers={top5} nSimulations={forecast.n_simulations} />
            ) : (
              <Skeleton className="h-48 w-full" />
            )}
          </div>

          {/* Reasoning + Finish table */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
            <ModelReasoning groups={data.reasoning} />
            <PredictedFinishTable rows={data.finish_p4_p10} />
          </div>

          {/* Distribution matrix — collapsed by default. The toggle keeps
              the page above-the-fold light; readers who want the full
              probabilistic surface get it on demand. */}
          {forecast && (
            <div className="rounded-xl border border-f1-edge bg-paddock-panel/40">
              <button
                onClick={() => setMatrixOpen(v => !v)}
                className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-paddock-panel/60 transition-colors"
                aria-expanded={matrixOpen}
              >
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-widest text-paddock-coral font-semibold">
                    Full Distribution Matrix
                  </div>
                  <div className="text-[11px] text-f1-muted mt-0.5">
                    Per-driver finishing-position probabilities + DNF column · {(forecast.n_simulations / 1000).toFixed(0)}K simulations
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-f1-muted">
                  {matrixOpen ? "Hide" : "Show"}
                  {matrixOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {matrixOpen && (
                <div className="px-2 pb-2">
                  <DistributionMatrix drivers={forecast.drivers} />
                </div>
              )}
            </div>
          )}

          {/* Predicted vs actual top-10 — only for past races with results published. */}
          {isPastRace && accuracy && <PredictedVsActualTable data={accuracy} />}
          {isPastRace && accLoading && <Skeleton className="h-72 w-full" />}
          {isPastRace && accError && (
            <div className="rounded-md border border-dashed border-f1-edge p-4 text-center text-xs text-f1-muted">
              Final results haven't been published for this race yet.
            </div>
          )}
          {!isPastRace && explicitMode && (
            <div className="rounded-md border border-dashed border-f1-edge p-4 text-center text-xs text-f1-muted">
              Predicted vs actual will appear here once this race has run.
            </div>
          )}

          {/* Provenance footer — model + simulation source */}
          {forecast && (
            <div className="text-[10px] uppercase tracking-widest text-f1-muted/60 text-center pt-2">
              MODEL {data.reliability.model_version ?? "v1.0"} · {(forecast.n_simulations / 1000).toFixed(0)}K SIMS · QUALI SOURCE: {forecast.quali_source.toUpperCase()}
            </div>
          )}
        </>
      )}

    </div>
  );
}

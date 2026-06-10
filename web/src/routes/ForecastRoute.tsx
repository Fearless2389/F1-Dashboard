import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { ForecastHero } from "@/components/panels/ForecastHero";
import { Top5WinBars } from "@/components/panels/Top5WinBars";
import { DistributionMatrix } from "@/components/panels/DistributionMatrix";
import { api } from "@/lib/api";
import type { ForecastResponse, ScheduleResponse } from "@/lib/types";

const SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

/**
 * Race Forecast page — Monte Carlo simulation surface.
 *
 * Mirrors the layout of the PREQ-V1.0 reference: Race Forecast header with
 * the race name + round on the right, a side-by-side Predicted Pole +
 * Predicted Winner hero, Top 5 win-prob bars, and the full 20×20
 * distribution matrix. Backed by /api/forecast/{next | season/round} which
 * runs 10,000 Plackett-Luce simulations with per-driver DNF rolls.
 */
export default function ForecastRoute() {
  const [search, setSearch] = useSearchParams();
  const seasonParam = search.get("season");
  const roundParam = search.get("round");
  const explicitMode = seasonParam != null && roundParam != null;
  const season = seasonParam ? parseInt(seasonParam, 10) : null;
  const round = roundParam ? parseInt(roundParam, 10) : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", season ?? "next", round ?? "next"],
    queryFn: () => explicitMode
      ? api.get<ForecastResponse>(`/api/forecast/${season}/${round}`)
      : api.get<ForecastResponse>("/api/forecast/next"),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // Schedule for the round dropdown
  const scheduleSeason = season ?? data?.race_meta.season ?? 2026;
  const { data: schedule } = useQuery({
    queryKey: ["schedule", scheduleSeason],
    queryFn: () => api.get<ScheduleResponse>(`/api/schedule/${scheduleSeason}`),
    staleTime: 60 * 60_000,
  });

  const events = schedule?.events ?? [];

  function updateSeason(s: number) {
    const next = new URLSearchParams(search);
    next.set("season", String(s));
    setSearch(next, { replace: true });
  }
  function updateRound(r: number) {
    const next = new URLSearchParams(search);
    if (season == null) {
      next.set("season", String(data?.race_meta.season ?? 2026));
    }
    next.set("round", String(r));
    setSearch(next, { replace: true });
  }
  function clearSelection() {
    setSearch(new URLSearchParams(), { replace: true });
  }

  const generatedAgo = useMemo<string>(() => {
    if (!data?.generated_at) return "—";
    const ms = Date.now() - new Date(data.generated_at).getTime();
    const mins = Math.max(0, Math.floor(ms / 60_000));
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }, [data?.generated_at]);

  const top5 = (data?.drivers ?? []).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Title strip */}
      <div className="flex items-end justify-between gap-4 flex-wrap border-b border-f1-edge/40 pb-3">
        <h1 className="font-display font-bold text-3xl md:text-5xl tracking-tight leading-none">
          <span className="text-f1-white">Race</span>{" "}
          <span className="italic text-paddock-coral">Forecast</span>
        </h1>
        {data && (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-f1-muted">
              {data.race_meta.race_name.toUpperCase()} · ROUND {String(data.race_meta.round).padStart(2, "0")}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-paddock-coral mt-0.5">
              {(data.n_simulations / 1000).toFixed(0)}K SIMS · UPDATED {generatedAgo}
            </div>
          </div>
        )}
      </div>

      {/* Race selector */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted">View race</span>
        <Select
          value={season ?? data?.race_meta.season ?? 2026}
          onChange={(e) => updateSeason(parseInt(e.target.value, 10))}
          className="h-8 w-24"
        >
          {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select
          value={round ?? data?.race_meta.round ?? 1}
          onChange={(e) => updateRound(parseInt(e.target.value, 10))}
          className="h-8 w-56"
        >
          {events.length === 0 && (
            <option value={data?.race_meta.round ?? 1}>R{data?.race_meta.round ?? "—"}</option>
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
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-sm text-f1-muted">
          Forecast unavailable for this race.
        </div>
      )}

      {data && (
        <>
          <ForecastHero pole={data.pole_pick} winner={data.winner_pick} />
          <Top5WinBars drivers={top5} nSimulations={data.n_simulations} />
          <DistributionMatrix drivers={data.drivers} />
          <div className="text-[10px] uppercase tracking-widest text-f1-muted/60 text-center pt-2">
            PRE-RACE · {(data.n_simulations / 1000).toFixed(0)}K SIMS · MODEL PREQ-V1.0 · UPDATED {generatedAgo}
          </div>
        </>
      )}
    </div>
  );
}

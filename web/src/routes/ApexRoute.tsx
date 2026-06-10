import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { ApexHeader } from "@/components/panels/ApexHeader";
import { TopPredictionCard } from "@/components/panels/TopPredictionCard";
import { PredictedPodiumCard } from "@/components/panels/PredictedPodiumCard";
import { ModelReasoning } from "@/components/panels/ModelReasoning";
import { PredictedFinishTable } from "@/components/panels/PredictedFinishTable";
import { PredictedVsActualTable } from "@/components/panels/PredictedVsActualTable";
import { api } from "@/lib/api";
import type { AccuracyResponse, ApexResponse, ScheduleResponse } from "@/lib/types";

const SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export default function ApexRoute() {
  const [search, setSearch] = useSearchParams();
  const seasonParam = search.get("season");
  const roundParam = search.get("round");

  const explicitMode = seasonParam != null && roundParam != null;
  const season = seasonParam ? parseInt(seasonParam, 10) : null;
  const round = roundParam ? parseInt(roundParam, 10) : null;

  // Apex bundle — next race when no params, specific race otherwise.
  const { data, isLoading, error } = useQuery({
    queryKey: ["apex", season ?? "next", round ?? "next"],
    queryFn: () => explicitMode
      ? api.get<ApexResponse>(`/api/apex/${season}/${round}`)
      : api.get<ApexResponse>("/api/apex/next"),
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
    // Round may be invalid for the new season; leave it for the user to pick.
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
          {/* Hero row: top prediction + podium */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[3fr_2fr]">
            <TopPredictionCard
              top={data.top_prediction}
              qualiSource={data.quali_source}
            />
            <PredictedPodiumCard
              podium={data.podium}
              reliability={data.reliability}
            />
          </div>

          {/* Reasoning + Finish table */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
            <ModelReasoning groups={data.reasoning} />
            <PredictedFinishTable rows={data.finish_p4_p10} />
          </div>

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
        </>
      )}
    </div>
  );
}

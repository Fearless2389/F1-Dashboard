import { useMemo, useState } from "react";
import { differenceInSeconds, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Cloud, CloudRain, MapPin, Sun, ThermometerSun, CheckCircle2, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { NextRaceHero } from "@/components/panels/NextRaceHero";
import { useSchedule } from "@/hooks/useApi";
import { useRaceContext } from "@/store/raceContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { LapRecord, RaceEvent } from "@/lib/types";

type RaceStatus = "past" | "next" | "future";

function formatCountdown(target?: string | null) {
  if (!target) return "—";
  try {
    const t = parseISO(target);
    const secs = differenceInSeconds(t, new Date());
    if (secs <= 0) return "Completed";
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  } catch {
    return target;
  }
}

function weatherIcon(ev: RaceEvent) {
  const wf = ev.weather_forecast;
  if (!wf) return <Sun size={14} />;
  if (wf.wet_race_likely) return <CloudRain size={14} />;
  if ((wf.rain_probability_max ?? 0) > 30) return <Cloud size={14} />;
  return <Sun size={14} />;
}

function RaceCard({
  ev, status, expanded, onToggle,
}: {
  ev: RaceEvent;
  status: RaceStatus;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-opacity",
        status === "past"   && "opacity-55",
        status === "next"   && "ring-2 ring-paddock-coral/40 shadow-[0_0_40px_-12px_rgba(255,94,108,0.4)]",
      )}
    >
      <button onClick={onToggle} className="w-full text-left">
        {ev.circuit_id && (
          <div
            className="aspect-[16/8] w-full border-b border-f1-edge overflow-hidden relative"
            style={{
              background:
                status === "next"
                  ? "radial-gradient(ellipse at center, rgba(255,94,108,0.18) 0%, rgba(11,14,26,0.95) 70%)"
                  : status === "past"
                    ? "linear-gradient(180deg, #11141f 0%, #0b0e1a 100%)"
                    : "linear-gradient(180deg, #161a2a 0%, #0b0e1a 100%)",
            }}
          >
            <img
              src={`/circuits/${ev.circuit_id}.svg`}
              alt={ev.race_name}
              // object-contain so the entire track outline is always visible
              // (no cropping). Slight padding keeps the path off the card edge.
              className={cn(
                "absolute inset-0 w-full h-full object-contain p-2 transition-all",
                status === "past" && "grayscale brightness-75 opacity-60",
              )}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }}
            />
            <div className="absolute top-2 right-2 flex flex-wrap items-center gap-1.5 justify-end">
              {ev.has_sprint && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-paddock-coral/20 border border-paddock-coral/50 text-paddock-coral text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 backdrop-blur"
                  title="Sprint weekend"
                >
                  <Zap size={10} />
                  Sprint
                </span>
              )}
              {status === "past" && (
                <Badge tone="muted" className="bg-f1-dark/70 backdrop-blur">
                  <CheckCircle2 size={10} />
                  Completed
                </Badge>
              )}
              {status === "next" && (
                <span className="paddock-pill paddock-glow">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-paddock-coral f1-pulse" />
                  NEXT
                </span>
              )}
            </div>
          </div>
        )}
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-f1-muted uppercase tracking-widest">
                Round {ev.round}
              </div>
              <CardTitle className="truncate mt-1">{ev.race_name}</CardTitle>
              <div className="flex items-center gap-1 mt-1 text-xs text-f1-muted">
                <MapPin size={12} /> {ev.location}, {ev.country}
              </div>
            </div>
            <Badge tone="muted" className="shrink-0">
              {weatherIcon(ev)}
              {ev.weather_forecast?.air_temp_mean != null
                ? `${ev.weather_forecast.air_temp_mean.toFixed(0)}°C`
                : "—"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 text-xs">
            <div className="rounded-md border border-f1-edge bg-f1-panel/40 px-2.5 py-1">
              <div className="text-[10px] text-f1-muted">
                {status === "past" ? "Race" : "Countdown"}
              </div>
              <div className={cn("font-mono", status === "next" ? "text-paddock-coral" : "text-f1-white")}>
                {formatCountdown(ev.event_date)}
              </div>
            </div>
            {ev.circuit_meta?.lap_length_km && (
              <div className="rounded-md border border-f1-edge bg-f1-panel/40 px-2.5 py-1">
                <div className="text-[10px] text-f1-muted">Lap</div>
                <div className="text-f1-white font-mono">
                  {ev.circuit_meta.lap_length_km.toFixed(2)} km
                </div>
              </div>
            )}
            {ev.circuit_meta?.overtake_difficulty != null && (
              <div
                className="rounded-md border border-f1-edge bg-f1-panel/40 px-2.5 py-1"
                title="More dots = more overtaking action (inverted from circuit difficulty)"
              >
                <div className="text-[10px] text-f1-muted">Overtakes</div>
                <div className="text-f1-white font-mono">
                  {/* Invert difficulty (1..5) → ease (5..1).
                      Monaco difficulty=5 → 1 filled dot (low action).
                      Spa difficulty=3 → 3 dots (moderate). */}
                  {"●".repeat(6 - (ev.circuit_meta.overtake_difficulty || 5))}
                  <span className="text-f1-muted">
                    {"○".repeat((ev.circuit_meta.overtake_difficulty || 5) - 1)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-f1-edge"
          >
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <CircuitLapRecordRow circuitId={ev.circuit_id} />
              <Detail label="Lap length" value={ev.circuit_meta?.lap_length_km ? `${ev.circuit_meta.lap_length_km.toFixed(3)} km` : "—"} />
              <Detail label="Corners" value={ev.circuit_meta?.num_corners ?? "—"} />
              <Detail label="DRS zones" value={ev.circuit_meta?.drs_zones ?? "—"} />
              <Detail label="Downforce" value={ev.circuit_meta?.downforce_level ?? "—"} />
              {/* Historical heuristic — hand-curated per-circuit rain rate */}
              <Detail
                label="Historic wet"
                value={
                  ev.circuit_meta?.wet_race_rate != null
                    ? `${(ev.circuit_meta.wet_race_rate * 100).toFixed(0)}%`
                    : "—"
                }
                hint="Share of past races at this circuit that ran in wet conditions"
              />
              {/* Forecast is meaningful only ~5 days out (Open-Meteo). For races
                  beyond that, surface a pending state rather than a fake value. */}
              <Detail
                label="Forecast rain"
                value={(() => {
                  if (!ev.event_date) return "—";
                  const daysAway = (new Date(ev.event_date).getTime() - Date.now()) / 86400_000;
                  if (daysAway > 5) return "Pending";
                  if (daysAway < -1) return "—";
                  return ev.weather_forecast?.rain_probability_max != null
                    ? `${ev.weather_forecast.rain_probability_max.toFixed(0)}%`
                    : "—";
                })()}
                hint="Live forecast (Open-Meteo); only meaningful for races within ~5 days"
              />
            </div>
            <div className="flex justify-end px-5 pb-5">
              <Button size="sm" variant="secondary">Predict this race →</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Detail({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div className="flex items-center gap-2" title={hint}>
      <ThermometerSun size={12} className="text-f1-muted shrink-0" />
      <div className="flex-1 flex items-center justify-between border-b border-dashed border-f1-edge pb-1.5">
        <span className="text-f1-muted">{label}</span>
        <span className="text-f1-white">{value}</span>
      </div>
    </div>
  );
}

/**
 * Lap record row — lazy-loaded when a calendar card is expanded. Shows the
 * all-time fastest lap recorded at this circuit (driver code, time, year).
 * Cached for an hour on both the backend and React Query side because the
 * answer rarely changes mid-session.
 */
function CircuitLapRecordRow({ circuitId }: { circuitId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lap-record", circuitId],
    queryFn: () => api.get<LapRecord>(`/api/schedule/circuits/${circuitId}/lap-record`),
    enabled: !!circuitId,
    staleTime: 60 * 60_000,
    retry: false,
  });

  const value = (() => {
    if (isLoading) return "Loading…";
    if (!data || !data.time) return "—";
    return (
      <span className="font-mono">
        <span className="font-semibold">{data.driver_code ?? "—"}</span>
        {" "}
        <span className="tabular-nums">{data.time}</span>
        {data.season != null && <span className="text-f1-muted"> ({data.season})</span>}
      </span>
    );
  })();

  return (
    <Detail
      label="Lap record"
      value={value}
      hint={
        data?.driver_name
          ? `Set by ${data.driver_name}${data.race_name ? " · " + data.race_name : ""}${data.average_speed_kph ? " · " + data.average_speed_kph.toFixed(1) + " kph avg" : ""}`
          : "All-time fastest lap recorded at this circuit"
      }
    />
  );
}

export default function CalendarRoute() {
  const { season } = useRaceContext();
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, isLoading } = useSchedule(season, true);
  const events = useMemo(() => data?.events ?? [], [data]);

  // Find the next upcoming race + classify every event
  const { nextRace, statuses } = useMemo(() => {
    const now = Date.now();
    let next: RaceEvent | null = null;
    let nextTime = Infinity;
    const map = new Map<number, RaceStatus>();
    for (const ev of events) {
      const tISO = ev.session5_date ?? ev.event_date;
      const t = tISO ? new Date(tISO).getTime() : null;
      if (t == null) {
        map.set(ev.round, "future");
        continue;
      }
      if (t < now) {
        map.set(ev.round, "past");
      } else {
        map.set(ev.round, "future");
        if (t < nextTime) {
          next = ev;
          nextTime = t;
        }
      }
    }
    if (next != null) {
      map.set(next.round, "next");
    }
    return { nextRace: next, statuses: map };
  }, [events]);

  const pastCount = useMemo(
    () => [...statuses.values()].filter(s => s === "past").length,
    [statuses],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display font-bold text-2xl">Schedule · {season}</h1>
        <div className="text-xs text-f1-muted">
          {events.length} rounds · {pastCount} completed · {events.length - pastCount} remaining
        </div>
      </div>

      {/* Next race hero */}
      {!isLoading && nextRace && <NextRaceHero next={nextRace} />}

      {isLoading && (
        <>
          <Skeleton className="h-56 w-full" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </>
      )}

      {!isLoading && events.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-f1-muted">
            No schedule data for {season}.
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {events.map((ev) => (
            <RaceCard
              key={`${ev.season}-${ev.round}`}
              ev={ev}
              status={statuses.get(ev.round) ?? "future"}
              expanded={expanded === ev.round}
              onToggle={() => setExpanded(expanded === ev.round ? null : ev.round)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

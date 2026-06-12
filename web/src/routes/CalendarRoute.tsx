import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInSeconds, parseISO } from "date-fns";
import { m, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Cloud, CloudRain, MapPin, Sun, ThermometerSun, CheckCircle2, Zap,
  LineChart as LineChartIcon, Trophy, Flag,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RouteHeader } from "@/components/RouteHeader";
import { NextRaceHero } from "@/components/panels/NextRaceHero";
import { useSchedule } from "@/hooks/useApi";
import { useRaceContext } from "@/store/raceContext";
import { api } from "@/lib/api";
import { teamColor } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { LapRecord, RaceEvent, ResultsResponse } from "@/lib/types";

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
      <button type="button" onClick={onToggle} className="w-full text-left">
        {ev.circuit_id && (
          <div
            className={cn(
              "aspect-[16/8] w-full border-b border-f1-edge overflow-hidden relative bg-paddock-dark",
              status === "next" && "ring-1 ring-inset ring-paddock-coral/25",
            )}
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
          <m.div
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
            {/* Results & sprint results — both are lazy-fetched only when
                a card is expanded so the calendar grid stays light. The
                ResultsTable hides itself for races that haven't run yet
                (Jolpica returns an empty rows array). */}
            {status === "past" && (
              <div className="px-5 pb-3 grid gap-3 grid-cols-1">
                <ResultsTable season={ev.season} round={ev.round} kind="race" />
                {ev.has_sprint && (
                  <ResultsTable season={ev.season} round={ev.round} kind="sprint" />
                )}
              </div>
            )}

            {/* Action row — predict link routes to the merged Predictor
                page with this race pre-selected. Past-race cards also get
                a quick link into the replay surface. */}
            <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5">
              {status === "past" && (
                <Link to={`/replay/${ev.season}/${ev.round}`}>
                  <Button size="sm" variant="ghost">
                    <Flag size={14} /> Watch replay
                  </Button>
                </Link>
              )}
              <Link to={`/apex?season=${ev.season}&round=${ev.round}`}>
                <Button size="sm" variant="secondary">
                  <LineChartIcon size={14} /> Predict this race →
                </Button>
              </Link>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/**
 * Inline race/sprint results table — lazy-fetched per expanded card.
 *
 * Hidden silently when the upstream returns an empty rows list (race hasn't
 * run yet, or the weekend had no sprint). Each row shows position, code,
 * team-colour stripe, points and finish status — DNF / DSQ statuses are
 * surfaced as small badges so they don't read as a finishing classification.
 */
function ResultsTable({
  season, round, kind,
}: {
  season: number;
  round: number;
  kind: "race" | "sprint";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["results", kind, season, round],
    queryFn: () => api.get<ResultsResponse>(`/api/schedule/${season}/${round}/${kind === "race" ? "results" : "sprint"}`),
    staleTime: 60 * 60_000,
    retry: false,
  });

  const rows = data?.rows ?? [];

  // Sprint section just hides when there's no data — that's the signal that
  // the weekend doesn't have a sprint, not an error.
  if (!isLoading && rows.length === 0) {
    if (kind === "sprint") return null;
    return (
      <div className="text-[11px] text-f1-muted italic px-1">
        Race results not yet published.
      </div>
    );
  }

  const title = kind === "race" ? "Race results" : "Sprint results";
  const icon = kind === "race"
    ? <Trophy size={12} className="text-paddock-coral" />
    : <Zap size={12} className="text-paddock-coral" />;

  return (
    <div className="rounded-md border border-f1-edge bg-f1-panel/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-f1-edge/60 bg-f1-panel/50">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-f1-white">
          {icon} {title}
        </div>
        <span className="text-[9px] uppercase tracking-widest text-f1-muted">
          {rows.length ? `${rows.length} cars` : ""}
        </span>
      </div>
      {isLoading ? (
        <div className="p-3"><Skeleton className="h-32 w-full" /></div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase text-f1-muted tracking-wider">
              <tr>
                <th className="text-left px-3 py-1.5 w-8">Pos</th>
                <th className="text-left px-2 py-1.5">Driver</th>
                <th className="text-left px-2 py-1.5">Team</th>
                <th className="text-right px-2 py-1.5">Grid</th>
                <th className="text-right px-2 py-1.5">Pts</th>
                <th className="text-right px-3 py-1.5">Gap / Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const color = teamColor(r.team_name);
                const finished = r.position != null;
                // Gap-or-status — preference order:
                //  1. P1: render their absolute race time (Jolpica's `time`
                //     for the leader is "1:34:21.123") in the leader colour
                //     so it reads as "this is the winning time".
                //  2. Finishers with a gap string: "+5.234" or "+1 LAP".
                //  3. Lapped finishers without a time: fall through to the
                //     status string Jolpica returns ("+1 Lap", "Lapped" etc.).
                //  4. DNF / DSQ: badge.
                const gapCell = (() => {
                  if (!finished) return <Badge tone="muted">DNF</Badge>;
                  const s = (r.status || "").toLowerCase();
                  if (s.includes("disqualified")) return <Badge tone="muted">DSQ</Badge>;
                  if (r.position === 1 && r.time) {
                    return <span className="text-paddock-coral font-semibold tabular-nums">{r.time}</span>;
                  }
                  if (r.time) {
                    return <span className="text-f1-white tabular-nums">{r.time}</span>;
                  }
                  // Jolpica's status for lapped finishers reads as e.g. "+1 Lap"
                  return <span className="text-f1-muted">{r.status ?? "—"}</span>;
                })();
                return (
                  <tr key={r.driver_code} className="border-t border-f1-edge/40">
                    <td className="px-3 py-1.5 font-mono tabular-nums">
                      {r.position ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: color }} />
                        <span className="font-mono font-semibold text-f1-white">{r.driver_code}</span>
                        {r.fastest_lap && (
                          // F1's traditional fastest-lap purple. Title
                          // surfaces the lap time so hovering tells the
                          // story without needing extra columns.
                          <span
                            className="text-[8px] font-bold uppercase tracking-widest rounded-sm px-1 py-0.5 leading-none"
                            style={{ background: "rgba(168,85,247,0.22)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.4)" }}
                            title={r.fastest_lap_time ? `Fastest lap · ${r.fastest_lap_time}` : "Fastest lap"}
                          >
                            FL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-f1-muted">{r.team_name ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-f1-muted">
                      {r.grid ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.points > 0 ? <span className="text-f1-white">{r.points}</span> : <span className="text-f1-muted">0</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{gapCell}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
      <RouteHeader
        kicker="Schedule"
        title={`${season} season`}
        subtitle="Round-by-round calendar with circuit specs, weather forecast and live countdown. Click any card to expand race + sprint results."
        controls={
          <div className="text-xs text-f1-muted">
            {events.length} rounds · {pastCount} completed · {events.length - pastCount} remaining
          </div>
        }
      />

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
        <EmptyState
          icon={<Flag size={20} />}
          title={`No schedule published for ${season}`}
          description="Race calendars typically appear ~10 months ahead of the season. Pick a different year in the global season switcher."
        />
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

import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { PodiumHero } from "@/components/panels/PodiumHero";
import { SeasonProgressionCard } from "@/components/panels/SeasonProgressionCard";
import { ChampionshipProgressionChart } from "@/components/panels/ChampionshipProgressionChart";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { teamColor } from "@/lib/teams";
import type { ScheduleResponse, StandingsProgressionResponse, StandingsResponse } from "@/lib/types";

interface RecentRaceResponse {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string | null;
  date: string | null;
  podium: { position: number; driver_code: string; team_name: string | null }[];
}

// Trimmed to the seasons we actually ship on the deployed Space (2025 + 2026).
// The /api/standings endpoint supports earlier seasons via Jolpica, but the
// Replay surface and the SHAP feature pipeline only carry 2025+2026, so
// exposing older years here just leads users to dead clicks elsewhere.
const SEASONS = [2026, 2025];

export default function StandingsRoute() {
  const [search, setSearch] = useSearchParams();
  const season = parseInt(search.get("season") ?? "2026", 10);
  // Round selector — "all" means end-of-season totals (the historic
  // behaviour). A specific round queries `?round_num=N` so the user can
  // verify e.g. HAM = VER = 369.5 going into Abu Dhabi 2021. URL-driven so
  // the snapshot is shareable.
  const roundParam = search.get("round");
  const round: number | "all" = roundParam ? parseInt(roundParam, 10) : "all";
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const onSeason = (s: number) => {
    const next = new URLSearchParams(search);
    next.set("season", String(s));
    // Different season → different schedule of rounds; reset to season-end.
    next.delete("round");
    setSearch(next, { replace: true });
    setSelectedTeam(null);
  };

  const onRound = (r: number | "all") => {
    const next = new URLSearchParams(search);
    if (r === "all") next.delete("round");
    else next.set("round", String(r));
    setSearch(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["standings", season, round],
    queryFn: () => api.get<StandingsResponse>(
      `/api/standings/${season}` + (round === "all" ? "" : `?round_num=${round}`),
    ),
  });

  const { data: progression, isLoading: progressionLoading } = useQuery({
    queryKey: ["standings", season, "progression"],
    queryFn: () => api.get<StandingsProgressionResponse>(`/api/standings/${season}/progression`),
    staleTime: 5 * 60_000,
  });

  // Most-recent finished race for the hero podium card — Jolpica-backed,
  // works for current seasons that haven't been ingested into our cache.
  const { data: recentRace } = useQuery({
    queryKey: ["recent-race", season],
    queryFn: () => api.get<RecentRaceResponse>(`/api/recent-race/${season}`),
    staleTime: 5 * 60_000,
  });

  // Schedule — used to compute "races completed" and "next race countdown"
  const { data: schedule } = useQuery({
    queryKey: ["schedule", season],
    queryFn: () => api.get<ScheduleResponse>(`/api/schedule/${season}`),
    staleTime: 60 * 60_000,
  });

  const nextRaceDate = useMemo(() => {
    const events = schedule?.events ?? [];
    if (events.length === 0) return null;
    const now = Date.now();
    const upcoming = events.find(ev => {
      const t = ev.session5_date ?? ev.event_date;
      return t ? new Date(t).getTime() > now : false;
    });
    return upcoming?.session5_date ?? upcoming?.event_date ?? null;
  }, [schedule]);

  const driverRows = useMemo(
    () => (data?.drivers ?? []).map(d => ({
      ...d,
      _color: teamColor(d.team_name),
    })),
    [data],
  );

  const constructorRows = useMemo(
    () => (data?.constructors ?? []).map(c => ({
      ...c,
      _color: teamColor(c.team_name),
    })),
    [data],
  );

  // Position deltas (driver) — compare ranking at the latest round to the
  // round before. Positive = moved UP, negative = moved DOWN, null = no
  // prior-round data (round 1 of the season).
  const driverPositionDelta = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!progression || progression.rounds.length < 2) return map;
    const last = progression.rounds.length - 1;
    const prev = last - 1;
    const rankAt = (idx: number) => {
      const sorted = progression.drivers
        .map(d => ({ code: d.driver_code, pts: d.cumulative_points[idx] ?? 0 }))
        .sort((a, b) => b.pts - a.pts);
      const r: Record<string, number> = {};
      sorted.forEach((d, i) => { r[d.code] = i + 1; });
      return r;
    };
    const cur = rankAt(last);
    const old = rankAt(prev);
    progression.drivers.forEach(d => {
      const c = cur[d.driver_code];
      const o = old[d.driver_code];
      map[d.driver_code] = c != null && o != null ? o - c : null;
    });
    return map;
  }, [progression]);

  // Position deltas (constructor) — aggregate driver cumulatives by team.
  const constructorPositionDelta = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!progression || progression.rounds.length < 2) return map;
    const n = progression.rounds.length;
    const teamCum = new Map<string, number[]>();
    progression.drivers.forEach(d => {
      if (!d.team_name) return;
      if (!teamCum.has(d.team_name)) teamCum.set(d.team_name, new Array(n).fill(0));
      const arr = teamCum.get(d.team_name)!;
      for (let i = 0; i < n; i++) arr[i] += d.cumulative_points[i] ?? 0;
    });
    const rankAt = (idx: number) => {
      const sorted = [...teamCum.entries()]
        .map(([team, arr]) => ({ team, pts: arr[idx] }))
        .sort((a, b) => b.pts - a.pts);
      const r: Record<string, number> = {};
      sorted.forEach((t, i) => { r[t.team] = i + 1; });
      return r;
    };
    const cur = rankAt(n - 1);
    const old = rankAt(n - 2);
    for (const team of teamCum.keys()) {
      const c = cur[team];
      const o = old[team];
      map[team] = c != null && o != null ? o - c : null;
    }
    return map;
  }, [progression]);

  const filteredDriverRows = useMemo(() => {
    if (!selectedTeam) return driverRows;
    return driverRows.filter(d => d.team_name === selectedTeam);
  }, [driverRows, selectedTeam]);

  const driverLeaderPts = driverRows[0]?.points ?? 0;
  const constructorLeaderPts = constructorRows[0]?.points ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Trophy size={20} className="text-paddock-coral" />
            Championship Standings
          </h1>
          <p className="text-xs text-f1-muted mt-1">
            Live data via Jolpica · click a driver to jump to their profile · click a team's colour stripe to filter
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-f1-muted">Season</span>
          <Select
            value={season}
            onChange={(e) => onSeason(parseInt(e.target.value, 10))}
            className="h-9 w-24"
          >
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <span className="text-[10px] uppercase tracking-widest text-f1-muted ml-1">After round</span>
          <Select
            value={round === "all" ? "all" : String(round)}
            onChange={(e) => {
              const v = e.target.value;
              onRound(v === "all" ? "all" : parseInt(v, 10));
            }}
            className="h-9 w-32"
            title="Standings snapshot as of the end of this round. Pick 'Final' for end-of-season totals."
          >
            <option value="all">Final</option>
            {(schedule?.events ?? []).map(ev => (
              <option key={ev.round} value={ev.round}>R{ev.round} · {ev.race_name}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Hero strip — recent race podium + season progression */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        <div className="flex-1 min-w-0">
          <PodiumHero
            raceLabel="Recent Race"
            raceName={recentRace?.race_name ?? "Most recent race"}
            description={
              recentRace?.podium && recentRace.podium.length > 0
                ? `${recentRace.podium[0].driver_code} took victory at ${recentRace.race_name}, ahead of ${recentRace.podium[1]?.driver_code ?? "—"} and ${recentRace.podium[2]?.driver_code ?? "—"}.`
                : `Round ${recentRace?.round ?? "—"} of the ${season} season.`
            }
            podium={(recentRace?.podium ?? []).map(p => ({
              position:    p.position,
              driver_code: p.driver_code,
              team_name:   p.team_name ?? undefined,
            }))}
          />
        </div>
        <SeasonProgressionCard
          racesCompleted={recentRace?.round ?? 0}
          totalRaces={season === 2026 ? 22 : 24}
          nextRaceDate={nextRaceDate}
          leaderCode={driverRows[0]?.driver_code}
          leaderPoints={driverRows[0]?.points}
          leaderTeam={driverRows[0]?.team_name}
          constructorLeader={constructorRows[0]?.team_name}
          constructorLeaderPoints={constructorRows[0]?.points}
        />
      </div>

      {/* Championship development line chart — every driver's cumulative points across rounds */}
      <ChampionshipProgressionChart data={progression} isLoading={progressionLoading} />

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        {/* Drivers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Drivers' Championship</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading…"
                : selectedTeam
                  ? `${filteredDriverRows.length} of ${driverRows.length} drivers · filtered to ${selectedTeam}`
                  : `${driverRows.length} drivers · top scorer ${driverRows[0]?.points ?? "—"} pts`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTeam && (
              <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[10px]">
                <span className="h-2 w-2 rounded-sm" style={{ background: teamColor(selectedTeam) }} />
                <span className="text-f1-white font-mono">Team: {selectedTeam}</span>
                <button type="button"
                  onClick={() => setSelectedTeam(null)}
                  aria-label="Clear team filter"
                  className="text-f1-muted hover:text-f1-white p-0.5 rounded-full hover:bg-white/10"
                >
                  <X size={9} />
                </button>
              </div>
            )}

            {isLoading ? (
              <Skeleton className="h-[420px] w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-f1-muted uppercase tracking-wider">
                    <tr className="border-b border-f1-edge">
                      <th className="text-left pb-2 pl-1">Pos</th>
                      <th className="text-left pb-2">Driver</th>
                      <th className="text-left pb-2">Team</th>
                      <th className="text-right pb-2 pr-1">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDriverRows.map((d) => (
                      <tr key={d.driver_code} className="border-b border-f1-edge/60 hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pl-1 tabular-nums font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-f1-muted">{d.championship_position}</span>
                            <PositionDelta delta={driverPositionDelta[d.driver_code] ?? null} />
                          </div>
                        </td>
                        <td className="py-2">
                          <Link
                            to={`/driver/${d.driver_code}?season=${season}`}
                            className="flex items-center gap-2 hover:text-f1-red transition-colors"
                          >
                            <span className="h-3 w-1 rounded-sm" style={{ background: d._color }} />
                            <span className="font-mono">{d.driver_code}</span>
                          </Link>
                        </td>
                        <td className="py-2 text-xs text-f1-muted truncate max-w-[200px]">{d.team_name}</td>
                        <td className="py-2 pr-1">
                          <PointsBar pts={d.points} maxPts={driverLeaderPts} color={d._color} />
                        </td>
                      </tr>
                    ))}
                    {filteredDriverRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-f1-muted">
                          No drivers on {selectedTeam} found in this season's roster.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Constructors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Constructors' Championship</CardTitle>
            <CardDescription>
              {isLoading ? "Loading…" : `${constructorRows.length} teams competing · click a stripe to filter the drivers' table`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[420px] w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-f1-muted uppercase tracking-wider">
                    <tr className="border-b border-f1-edge">
                      <th className="text-left pb-2 pl-1">Pos</th>
                      <th className="text-left pb-2">Team</th>
                      <th className="text-right pb-2 pr-1">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constructorRows.map((c) => {
                      const isSelected = selectedTeam === c.team_name;
                      const toggle = () => setSelectedTeam(isSelected ? null : c.team_name);
                      return (
                        <tr
                          key={c.team_name}
                          className={cn(
                            "border-b border-f1-edge/60 transition-colors",
                            isSelected ? "bg-paddock-coral/8" : "hover:bg-white/[0.02]",
                          )}
                        >
                          <td className="py-2 pl-1 tabular-nums font-mono">
                            <div className="flex items-center gap-1.5">
                              <span className="text-f1-muted">{c.constructor_position}</span>
                              <PositionDelta delta={constructorPositionDelta[c.team_name] ?? null} />
                            </div>
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={toggle}
                              title={isSelected ? "Clear team filter" : `Filter drivers by ${c.team_name}`}
                              className="flex items-center gap-2 group/team"
                            >
                              <span
                                className={cn(
                                  "h-3 w-1 rounded-sm transition-all",
                                  isSelected ? "h-5 w-1.5" : "group-hover/team:h-4",
                                )}
                                style={{ background: c._color }}
                              />
                              <span className={cn(
                                "transition-colors",
                                isSelected ? "text-paddock-coral font-semibold" : "text-f1-white group-hover/team:text-paddock-coral",
                              )}>
                                {c.team_name}
                              </span>
                            </button>
                          </td>
                          <td className="py-2 pr-1">
                            <PointsBar pts={c.points} maxPts={constructorLeaderPts} color={c._color} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leader callout */}
      {!isLoading && driverRows.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-md bg-f1-red/15 text-f1-red p-2.5">
                <Trophy size={18} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-f1-muted">Championship leader</div>
                <div className="text-base font-semibold">{driverRows[0].driver_code} · {driverRows[0].team_name}</div>
                <div className="text-xs text-f1-muted">
                  {Math.round(driverRows[0].points)} points ·
                  {driverRows[1]
                    ? ` ${Math.round(driverRows[0].points - driverRows[1].points)} pt lead over ${driverRows[1].driver_code}`
                    : " uncontested"}
                </div>
              </div>
            </div>
            <Badge tone="live">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-f1-red f1-pulse" />
              {season} Season
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


/**
 * Inline horizontal-bar visualisation of points relative to the leader.
 * The bar sits behind the number at ~20% opacity so the column still
 * scans as a tabular figure but you can also see the gap at a glance.
 */
function PointsBar({ pts, maxPts, color }: { pts: number; maxPts: number; color: string }) {
  const pct = maxPts > 0 ? Math.max(0, Math.min(100, (pts / maxPts) * 100)) : 0;
  return (
    <div className="relative h-5 flex items-center justify-end">
      <div
        className="absolute inset-y-0.5 left-0 rounded-sm transition-all"
        style={{ background: color, opacity: 0.22, width: `${pct}%` }}
      />
      <span className="relative tabular-nums font-semibold pr-1 text-f1-white">
        {Math.round(pts)}
      </span>
    </div>
  );
}

/**
 * Tiny ▲N / ▼N / — chip showing how this row moved versus the previous
 * round. Positive delta = moved up the order, negative = dropped. Null
 * (round 1 of the season) renders as a muted dash.
 */
function PositionDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[9px] text-f1-muted/60 font-bold">·</span>;
  if (delta === 0) return <span className="text-[9px] text-f1-muted font-bold">—</span>;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center text-[9px] font-bold tabular-nums leading-none",
        up ? "text-paddock-cyan" : "text-paddock-coral",
      )}
      title={`${up ? "Up" : "Down"} ${Math.abs(delta)} from last round`}
    >
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  );
}

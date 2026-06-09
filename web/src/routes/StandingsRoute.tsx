import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { PodiumHero } from "@/components/panels/PodiumHero";
import { SeasonProgressionCard } from "@/components/panels/SeasonProgressionCard";
import { api } from "@/lib/api";
import { teamColor } from "@/lib/teams";
import type { ScheduleResponse, StandingsResponse } from "@/lib/types";

interface RecentRaceResponse {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string | null;
  date: string | null;
  podium: { position: number; driver_code: string; team_name: string | null }[];
}

const SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export default function StandingsRoute() {
  const [search, setSearch] = useSearchParams();
  const season = parseInt(search.get("season") ?? "2026", 10);

  const onSeason = (s: number) => {
    const next = new URLSearchParams(search);
    next.set("season", String(s));
    setSearch(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["standings", season],
    queryFn: () => api.get<StandingsResponse>(`/api/standings/${season}`),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Trophy size={20} className="text-paddock-coral" />
            Championship Standings
          </h1>
          <p className="text-xs text-f1-muted mt-1">
            Live data via Jolpica · click a driver to jump to their profile
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-f1-muted">Season</span>
          <Select
            value={season}
            onChange={(e) => onSeason(parseInt(e.target.value, 10))}
            className="h-9 w-28"
          >
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
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
          constructorLeader={constructorRows[0]?.team_name}
          constructorLeaderPoints={constructorRows[0]?.points}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        {/* Drivers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Drivers' Championship</CardTitle>
            <CardDescription>
              {isLoading ? "Loading…" : `${driverRows.length} drivers · top scorer ${driverRows[0]?.points ?? "—"} pts`}
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
                      <th className="text-left pb-2">Driver</th>
                      <th className="text-left pb-2">Team</th>
                      <th className="text-right pb-2 pr-1">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverRows.map((d) => (
                      <tr key={d.driver_code} className="border-b border-f1-edge/60 hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pl-1 tabular-nums font-mono text-f1-muted">
                          {d.championship_position}
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
                        <td className="py-2 pr-1 text-right tabular-nums font-semibold">{Math.round(d.points)}</td>
                      </tr>
                    ))}
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
              {isLoading ? "Loading…" : `${constructorRows.length} teams competing`}
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
                    {constructorRows.map((c) => (
                      <tr key={c.team_name} className="border-b border-f1-edge/60 hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 pl-1 tabular-nums font-mono text-f1-muted">{c.constructor_position}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-1 rounded-sm" style={{ background: c._color }} />
                            <span className="text-f1-white">{c.team_name}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-1 text-right tabular-nums font-semibold">{Math.round(c.points)}</td>
                      </tr>
                    ))}
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

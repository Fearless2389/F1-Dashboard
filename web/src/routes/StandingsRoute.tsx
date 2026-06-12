import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Input";
import { NewToF1Strip } from "@/components/NewToF1Strip";
import { SectionHeader } from "@/components/SectionHeader";
import { GlossaryTerm } from "@/lib/glossary";
import { PodiumHero } from "@/components/panels/PodiumHero";
import { SeasonProgressionCard } from "@/components/panels/SeasonProgressionCard";
import { ChampionshipProgressionChart } from "@/components/panels/ChampionshipProgressionChart";
import { SplitFlapDigit } from "@/components/SplitFlapDigit";
import { useCountUp } from "@/hooks/useCountUp";
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
      <NewToF1Strip storageKey="standings.primer.v2" title="New to F1?">
        Each driver scores championship points based on race results — 25 for the winner, down to 1 for P10.
        The <GlossaryTerm term="championship-position">Drivers' Championship</GlossaryTerm> goes to whoever
        has the most points at the end of the season; the{" "}
        <GlossaryTerm term="constructor">Constructors' Championship</GlossaryTerm> sums points from both
        of a team's drivers. Switch the round dropdown to see standings as of any race weekend.
      </NewToF1Strip>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <SectionHeader
          className="flex-1 min-w-[260px]"
          kicker="Standings"
          title="Championship"
          index={round === "all" ? `${season} · FINAL` : `${season} · AFTER R${String(round).padStart(2, "0")}`}
          description="Live data via Jolpica · click a driver to jump to their profile · click a team's colour stripe to filter"
        />
        <div className="flex items-center gap-2 flex-wrap pb-1">
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
      <SectionHeader
        kicker="Development"
        title="Points across the season"
        index={recentRace?.round ? `R1–R${recentRace.round}` : "—"}
      />
      <ChampionshipProgressionChart data={progression} isLoading={progressionLoading} />

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        {/* Drivers */}
        <FiaTable
          title="Drivers' Championship"
          subtitle={
            isLoading
              ? "Loading…"
              : selectedTeam
                ? `${filteredDriverRows.length} of ${driverRows.length} drivers · filtered to ${selectedTeam}`
                : `${driverRows.length} drivers · top scorer ${driverRows[0]?.points ?? "—"} pts`
          }
          index={`P1–P${driverRows.length || "—"}`}
        >
          {selectedTeam && (
            <div className="mb-3 inline-flex items-center gap-1.5 border border-paddock-cream/25 bg-white/[0.03] px-2 py-1 text-[10px] font-mono">
              <span className="h-2 w-[3px]" style={{ background: teamColor(selectedTeam) }} />
              <span className="text-paddock-cream uppercase tracking-[0.18em]">FILTER · {selectedTeam}</span>
              <button type="button"
                onClick={() => setSelectedTeam(null)}
                aria-label="Clear team filter"
                className="text-f1-muted hover:text-paddock-cream px-1"
              >
                <X size={9} />
              </button>
            </div>
          )}

          {isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <FiaTh align="left"   width="7ch">Pos</FiaTh>
                    <FiaTh align="left"   width="7ch">Driver</FiaTh>
                    <FiaTh align="left"             >Team</FiaTh>
                    <FiaTh align="right"  width="9ch" lastCol>Pts</FiaTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredDriverRows.map((d) => (
                    <tr key={d.driver_code} className="group">
                      <FiaTd>
                        <FiaHoverEdge />
                        <div className="flex items-center gap-1.5">
                          <PositionFlap pos={d.championship_position} />
                          <PositionDelta delta={driverPositionDelta[d.driver_code] ?? null} />
                        </div>
                      </FiaTd>
                      <FiaTd>
                        <Link
                          to={`/driver/${d.driver_code}?season=${season}`}
                          className="flex items-center gap-2 hover:text-paddock-coral transition-colors"
                        >
                          <span className="h-3 w-[2px]" style={{ background: d._color }} />
                          <span className="font-mono">{d.driver_code}</span>
                        </Link>
                      </FiaTd>
                      <FiaTd>
                        <span className="text-xs text-f1-muted truncate max-w-[180px] inline-block font-mono uppercase tracking-[0.1em]">{d.team_name}</span>
                      </FiaTd>
                      <FiaTd lastCol align="right">
                        <PointsBar pts={d.points} maxPts={driverLeaderPts} color={d._color} />
                      </FiaTd>
                    </tr>
                  ))}
                  {filteredDriverRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-f1-muted font-mono uppercase tracking-[0.18em]">
                        No drivers on {selectedTeam} found in this season's roster.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </FiaTable>

        {/* Constructors */}
        <FiaTable
          title="Constructors' Championship"
          subtitle={
            isLoading
              ? "Loading…"
              : `${constructorRows.length} teams · click a stripe to filter drivers`
          }
          index={`P1–P${constructorRows.length || "—"}`}
        >
          {isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <FiaTh align="left"  width="7ch">Pos</FiaTh>
                    <FiaTh align="left"            >Team</FiaTh>
                    <FiaTh align="right" width="9ch" lastCol>Pts</FiaTh>
                  </tr>
                </thead>
                <tbody>
                  {constructorRows.map((c) => {
                    const isSelected = selectedTeam === c.team_name;
                    const toggle = () => setSelectedTeam(isSelected ? null : c.team_name);
                    return (
                      <tr key={c.team_name} className="group">
                        <FiaTd>
                          <FiaHoverEdge active={isSelected} />
                          <div className="flex items-center gap-1.5">
                            <PositionFlap pos={c.constructor_position} />
                            <PositionDelta delta={constructorPositionDelta[c.team_name] ?? null} />
                          </div>
                        </FiaTd>
                        <FiaTd>
                          <button
                            type="button"
                            onClick={toggle}
                            title={isSelected ? "Clear team filter" : `Filter drivers by ${c.team_name}`}
                            className="flex items-center gap-2 group/team"
                          >
                            <span
                              className={cn(
                                "transition-all",
                                isSelected ? "h-5 w-[3px]" : "h-3 w-[2px] group-hover/team:h-4",
                              )}
                              style={{ background: c._color }}
                            />
                            <span className={cn(
                              "transition-colors font-mono uppercase tracking-[0.08em]",
                              isSelected ? "text-paddock-coral font-semibold" : "text-f1-white group-hover/team:text-paddock-coral",
                            )}>
                              {c.team_name}
                            </span>
                          </button>
                        </FiaTd>
                        <FiaTd lastCol align="right">
                          <PointsBar pts={c.points} maxPts={constructorLeaderPts} color={c._color} />
                        </FiaTd>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </FiaTable>
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
 *
 * Hard-edged for the FIA-table aesthetic — no border-radius.
 */
function PointsBar({ pts, maxPts, color }: { pts: number; maxPts: number; color: string }) {
  const pct = maxPts > 0 ? Math.max(0, Math.min(100, (pts / maxPts) * 100)) : 0;
  // Count-up tween — when the round dropdown changes, the points figure
  // counts from the previous round's value up to the new one over ~600 ms.
  // First mount snaps to the target (no theatre on cold page load).
  const displayPts = useCountUp(pts, 600);
  return (
    <div className="relative h-5 flex items-center justify-end">
      <div
        className="absolute inset-y-0.5 left-0 transition-all duration-500"
        style={{ background: color, opacity: 0.22, width: `${pct}%` }}
      />
      <span className="relative tabular-nums font-mono font-semibold pr-2 text-f1-white">
        {displayPts}
      </span>
    </div>
  );
}

/**
 * Two-card split-flap rendering of a championship position number.
 * Each digit is its own card; when the position changes (round dropdown
 * tick), the AnimatePresence inside each SplitFlapDigit fires a Solari
 * flip. Used in the standings tables' Pos column.
 */
function PositionFlap({ pos }: { pos: number | null | undefined }) {
  const safe = pos != null ? pos : 0;
  const tens = Math.floor(safe / 10);
  const ones = safe % 10;
  if (safe <= 0) {
    return <span className="font-mono text-f1-muted text-sm">—</span>;
  }
  return (
    <span className="inline-flex items-center" style={{ gap: 1 }}>
      <SplitFlapDigit char={String(tens)} size="sm" />
      <SplitFlapDigit char={String(ones)} size="sm" />
    </span>
  );
}

// ── FIA-table primitives ─────────────────────────────────────────────
// Shared rule colours used by the matrix; restated here so the standings
// surface matches without sharing state with the panel package.

const FIA_RULE = "rgba(237, 228, 211, 0.12)";
const FIA_STRONG = "rgba(237, 228, 211, 0.25)";

function FiaTable({
  title, subtitle, index, children,
}: {
  title: string;
  subtitle?: string;
  index?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-f1-edge bg-paddock-panel">
      {/* Label band — matches DistributionMatrix's header strip so all */}
      {/* FIA-aesthetic surfaces share the same opening register. */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${FIA_STRONG}` }}
      >
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-paddock-cream font-semibold font-mono">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] text-f1-muted mt-0.5">{subtitle}</div>
          )}
        </div>
        {index && (
          <span className="text-[9px] uppercase tracking-[0.18em] text-f1-muted font-mono whitespace-nowrap">
            {index}
          </span>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function FiaTh({
  children, align = "left", width, lastCol = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
  lastCol?: boolean;
}) {
  return (
    <th
      className={cn(
        "text-[9px] uppercase tracking-[0.18em] text-paddock-cream/75 font-semibold py-2 px-2 font-mono",
        align === "left"  ? "text-left"  : "text-right",
      )}
      style={{
        width,
        borderRight: lastCol ? "none" : `1px solid ${FIA_RULE}`,
        borderBottom: `1px solid ${FIA_STRONG}`,
      }}
    >
      {children}
    </th>
  );
}

function FiaTd({
  children, align = "left", lastCol = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  lastCol?: boolean;
}) {
  return (
    <td
      className={cn(
        "py-2 px-2 relative",
        align === "left" ? "text-left" : "text-right",
      )}
      style={{
        borderRight: lastCol ? "none" : `1px solid ${FIA_RULE}`,
        borderBottom: `1px solid ${FIA_RULE}`,
      }}
    >
      {children}
    </td>
  );
}

/**
 * 2px coral left-edge flash that appears on row hover (or always when
 * `active` is true). Drops the row-background hover pattern in favour
 * of an FIA-style single-edge indicator.
 */
function FiaHoverEdge({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-0 top-0 bottom-0 w-[2px] transition-opacity",
        active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      style={{ background: "var(--color-paddock-coral)" }}
    />
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
        up ? "text-paddock-mint" : "text-paddock-coral",
      )}
      title={`${up ? "Up" : "Down"} ${Math.abs(delta)} from last round`}
    >
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  );
}

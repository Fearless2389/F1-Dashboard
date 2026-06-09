import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { DriverCard } from "@/components/cards/DriverCard";
import { SeasonResultsGrid } from "@/components/cards/SeasonResultsGrid";
import { PerformanceRadar } from "@/components/panels/PerformanceRadar";
import { LastTenRaces } from "@/components/panels/LastTenRaces";
import { api } from "@/lib/api";
import { teamColor } from "@/lib/teams";

const SEASON = 2026;

interface DriverCardData {
  driver_code: string;
  driver_number: number | null;
  full_name: string | null;
  team_name: string | null;
  team_colour: string | null;
  headshot_url: string | null;
  nationality: string | null;
  country_name: string | null;
  season_points: number;
  championship_position: number | null;
  debut_year?: number | null;
  experience_years?: number | null;
}

interface RadarValues {
  qualifying: number;
  race_pace: number;
  tyre_mgmt: number;
  consistency: number;
  overtaking: number;
}

interface DriverProfileData {
  driver_code: string;
  current_team: string | null;
  races: number;
  avg_finish_L5: number | null;
  avg_finish_L10: number | null;
  dnf_rate_L10: number | null;
  points_L5: number | null;
  season_points: number | null;
  championship_position: number | null;
  season_results: any[];
  timeline: any[];
  // Phase 14
  debut_year?: number | null;
  experience_years?: number | null;
  radar?: RadarValues | null;
  aggression_pct?: number | null;
  experience_pct?: number | null;
  last_10?: any[];
  headshot_url?: string | null;
  nationality?: string | null;
  country_name?: string | null;
  driver_number?: number | null;
  full_name?: string | null;
  team_colour?: string | null;
}

// ── List view ────────────────────────────────────────────────────────────────

function DriverList({ season }: { season: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["drivers", "grid", season],
    queryFn: () => api.get<DriverCardData[] | string[]>(`/api/drivers?season=${season}`),
  });

  const cards = useMemo<DriverCardData[]>(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    if (typeof data[0] === "string") return [];
    return data as DriverCardData[];
  }, [data]);

  const codeList = useMemo<string[]>(() => {
    if (!data || !Array.isArray(data) || data.length === 0 || typeof data[0] !== "string") return [];
    return data as string[];
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
      </div>
    );
  }

  if (cards.length > 0) {
    const sorted = [...cards].sort((a, b) => {
      const ap = a.championship_position ?? 99;
      const bp = b.championship_position ?? 99;
      if (ap !== bp) return ap - bp;
      return (a.driver_number ?? 99) - (b.driver_number ?? 99);
    });
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {sorted.map(c => <DriverCard key={c.driver_code} card={c} season={season} />)}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="py-8">
        <CardDescription className="mb-3">
          No curated roster for {season}. Pick any historical driver below.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5">
          {codeList.map(c => (
            <Link
              key={c}
              to={`/driver/${c}?season=${season}`}
              className="rounded-full border border-f1-edge text-f1-muted hover:text-f1-white hover:border-f1-red/40 px-3 py-1 text-xs font-mono"
            >
              {c}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Profile view ─────────────────────────────────────────────────────────────

function DriverProfile({ code, season }: { code: string; season: number }) {
  const { data: prof, isLoading } = useQuery({
    queryKey: ["driver", code, season],
    queryFn: () => api.get<DriverProfileData>(`/api/drivers/${code}?season=${season}`),
    enabled: !!code,
  });

  const teamName = prof?.current_team ?? "";
  const color = teamColor(teamName);
  const fullName = prof?.full_name ?? code;

  return (
    <div className="space-y-4">
      <Link to="/driver">
        <Button variant="ghost" size="sm"><ArrowLeft size={14} /> All drivers</Button>
      </Link>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {prof && (
        <>
          {/* ── Hero: italic name + team-colour gradient (photo removed) ── */}
          <div className="relative overflow-hidden rounded-xl border border-f1-edge bg-gradient-to-br from-paddock-panel via-[#1a1f33] to-paddock-dark">
            {/* Team-colour ambient glow (no photo — gradient is the whole backdrop) */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  `radial-gradient(ellipse 80% 60% at 85% 30%, ${color}33 0%, transparent 60%), ` +
                  `radial-gradient(ellipse 60% 50% at 15% 80%, ${color}22 0%, transparent 55%)`,
              }}
            />
            {/* Faint number watermark on the right — pure typography */}
            {prof.driver_number != null && (
              <div
                className="absolute right-6 top-1/2 -translate-y-1/2 font-display font-black italic select-none pointer-events-none leading-none"
                style={{
                  color: `${color}22`,
                  fontSize: "min(22rem, 30vw)",
                  textShadow: `0 0 80px ${color}33`,
                }}
              >
                {String(prof.driver_number).padStart(2, "0")}
              </div>
            )}

            <div className="relative p-6 md:p-10">
              <div className="flex items-center gap-3 mb-4">
                {prof.driver_number != null && (
                  <div className="px-3 py-1.5 rounded-md text-white font-display font-bold text-base tabular-nums"
                    style={{ background: color }}>
                    {String(prof.driver_number).padStart(2, "0")}
                  </div>
                )}
                <span className="text-[10px] uppercase tracking-widest text-f1-muted">
                  {teamName || "—"}
                </span>
              </div>

              <h1 className="font-display font-black italic text-5xl md:text-7xl leading-[0.95] tracking-tight"
                style={{
                  background: `linear-gradient(135deg, #f5f5f7 0%, ${color} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                {fullName.toUpperCase()}
              </h1>

              <p className="mt-4 text-sm text-f1-muted max-w-md leading-relaxed">
                {prof.races > 0
                  ? `${prof.races} career races · current championship ${prof.championship_position != null ? "P" + prof.championship_position : "—"} · ${(prof.season_points ?? 0).toFixed(0)} pts this season.`
                  : "Profile awaiting first race data."}
              </p>

              {/* Compact pills: nationality + years in F1 (no big card any more) */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {prof.nationality && (
                  <span className="paddock-dashed rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-semibold text-paddock-cyan bg-f1-panel/40">
                    {prof.nationality}
                  </span>
                )}
                {prof.experience_years != null && (
                  <span
                    className="paddock-dashed-coral rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-semibold text-paddock-coral bg-f1-panel/40"
                    title={prof.debut_year ? `Debuted in ${prof.debut_year}` : undefined}
                  >
                    {prof.experience_years}Y in F1
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats row + radar (two-column) ── */}
          {/* Big stat tiles (2×2) beside the Performance Radar */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-[3fr_2fr] items-stretch">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BigStat
                label="Season Points"
                value={prof.season_points != null ? Math.round(prof.season_points).toString() : "—"}
                accent="coral"
                hint={`${(prof.season_points ?? 0).toFixed(0)} points in season ${season}`}
              />
              <BigStat
                label="Championship"
                value={prof.championship_position != null ? `P${prof.championship_position}` : "—"}
                accent="cyan"
                hint="Position in the drivers' championship"
              />
              <BigStat
                label="Avg Finish · L10"
                value={prof.avg_finish_L10 != null ? `P${prof.avg_finish_L10.toFixed(1)}` : "—"}
                accent="coral"
                hint="Rolling average finishing position over the last 10 races"
              />
              <BigStat
                label="DNF Rate · L10"
                value={prof.dnf_rate_L10 != null ? `${Math.round(prof.dnf_rate_L10 * 100)}%` : "—"}
                accent="cyan"
                hint="Share of last 10 races where the driver did not finish"
              />
            </div>

            <PerformanceRadar
              driverCode={code}
              values={prof.radar}
            />
          </div>

          {/* ── Last 10 races visual ── */}
          <LastTenRaces results={prof.last_10 ?? []} />

          {/* ── Full season grid (per-round colour chips) ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Season {season} results</CardTitle>
              <CardDescription>One cell per round · colour = finish position</CardDescription>
            </CardHeader>
            <CardContent>
              <SeasonResultsGrid
                results={prof.season_results ?? []}
                totalRounds={Math.max(prof.season_results?.length ?? 0, 22)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function BigStat({
  label, value, accent = "coral", hint,
}: {
  label: string;
  value: string;
  accent?: "coral" | "cyan";
  hint?: string;
}) {
  const accentVar = accent === "coral" ? "var(--color-paddock-coral)" : "var(--color-paddock-cyan)";
  return (
    <div
      className="relative rounded-xl border border-f1-edge bg-f1-panel/60 px-6 py-7 overflow-hidden flex flex-col justify-between min-h-[140px]"
      title={hint}
      style={{
        background:
          `radial-gradient(ellipse 100% 100% at 100% 0%, ${accent === "coral" ? "rgba(255,94,108,0.10)" : "rgba(34,232,201,0.08)"} 0%, transparent 60%), ` +
          "var(--color-paddock-panel)",
      }}
    >
      {/* Top accent stripe */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accentVar }}
      />
      <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
        {label}
      </div>
      <div
        className="font-display font-black tabular-nums leading-none"
        style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", color: accentVar }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Route entry ──────────────────────────────────────────────────────────────

export default function DriverRoute() {
  const { code } = useParams<{ code?: string }>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Drivers</h1>
          <p className="text-xs text-f1-muted mt-1">
            {code ? `Profile for ${code.toUpperCase()}` : `${SEASON} grid — click any driver for the full profile.`}
          </p>
        </div>
      </div>

      {code
        ? <DriverProfile code={code.toUpperCase()} season={SEASON} />
        : <DriverList season={SEASON} />}
    </div>
  );
}

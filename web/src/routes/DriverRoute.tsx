import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { DriverCard } from "@/components/cards/DriverCard";
import { SeasonResultsGrid } from "@/components/cards/SeasonResultsGrid";
import { PerformanceRadar } from "@/components/panels/PerformanceRadar";
import { LastTenRaces } from "@/components/panels/LastTenRaces";
import { DriverCareerChart } from "@/components/panels/DriverCareerChart";
import { SeasonComparisonChart } from "@/components/panels/SeasonComparisonChart";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { teamColor } from "@/lib/teams";
import type { DriverSeasonResult, DriverSeasonRow } from "@/lib/types";

const DEFAULT_SEASON = 2026;
// Trimmed to seasons the deployed Space carries (2025 + 2026). Driver
// season-results below 2025 fall through to Jolpica anyway, but cross-page
// links (e.g. into Replay) only make sense for the years we actually ship.
const SEASONS = [2026, 2025];

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
  season_results: DriverSeasonResult[];
  timeline: DriverSeasonRow[];
  debut_year?: number | null;
  experience_years?: number | null;
  radar?: RadarValues | null;
  aggression_pct?: number | null;
  experience_pct?: number | null;
  last_10?: DriverSeasonResult[];
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

function DriverProfile({
  code, season, compareSeason,
}: {
  code: string;
  season: number;
  compareSeason: number | null;
}) {
  const { data: prof, isLoading } = useQuery({
    queryKey: ["driver", code, season],
    queryFn: () => api.get<DriverProfileData>(`/api/drivers/${code}?season=${season}`),
    enabled: !!code,
  });

  const { data: compareProf } = useQuery({
    queryKey: ["driver", code, compareSeason],
    queryFn: () => api.get<DriverProfileData>(`/api/drivers/${code}?season=${compareSeason}`),
    enabled: !!code && compareSeason != null,
  });

  const teamName = prof?.current_team ?? "";
  const color = teamColor(teamName);
  const fullName = prof?.full_name ?? code;

  // For rookies (Antonelli, Bearman, etc.) the comparison season may predate
  // their F1 debut. The API returns zeroed-out fields rather than a 404, so
  // we detect "no data" defensively and gate the comparison panels behind it.
  const compareHasData = compareProf != null && (
    (compareProf.season_results?.length ?? 0) > 0
    || (compareProf.season_points ?? 0) > 0
  );
  const isComparing = compareSeason != null && compareProf != null;
  const isComparingWithData = isComparing && compareHasData;

  return (
    <div className="space-y-4">
      {isLoading && <Skeleton className="h-64 w-full" />}

      {prof && (
        <>
          {/* ── Hero: italic name + team-colour gradient ── */}
          <div className="relative overflow-hidden rounded-xl border border-f1-edge bg-gradient-to-br from-paddock-panel via-[#1a1f33] to-paddock-dark">
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  `radial-gradient(ellipse 80% 60% at 85% 30%, ${color}33 0%, transparent 60%), ` +
                  `radial-gradient(ellipse 60% 50% at 15% 80%, ${color}22 0%, transparent 55%)`,
              }}
            />
            {prof.driver_number != null && (
              // Flex-centre the watermark inside an absolute box that fills the
              // hero so the italic glyph's ascender + descender are both safely
              // inside the card. (Previous top-1/2/translate-y centering was
              // measuring from the line-box, which clipped the bottom curve of
              // numbers like "1" once font-size grew past ~14rem.)
              <div className="absolute inset-0 flex items-center justify-end pr-6 md:pr-10 pointer-events-none">
                <div
                  className="font-display font-black italic select-none leading-[0.85]"
                  style={{
                    color: `${color}22`,
                    fontSize: "min(14rem, 24vw)",
                    textShadow: `0 0 80px ${color}33`,
                  }}
                >
                  {String(prof.driver_number).padStart(2, "0")}
                </div>
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
                  {teamName || "—"} · {season}
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

          {/* ── Career trajectory across all seasons (only if 2+ seasons) ── */}
          <DriverCareerChart driverCode={code} timeline={prof.timeline ?? []} />

          {/* "Driver did not race in YYYY" notice — surfaced when the user
              compares a rookie against a season that predates their debut. */}
          {isComparing && !compareHasData && (
            <div className="rounded-md border border-paddock-cyan/30 bg-paddock-cyan/5 px-4 py-3 text-xs text-paddock-cyan">
              <span className="font-semibold">{fullName.toUpperCase()}</span>
              <span className="text-f1-muted"> did not race in</span> <span className="font-mono font-semibold">{compareSeason}</span>
              <span className="text-f1-muted"> — comparison panels show only the {season} season.</span>
            </div>
          )}

          {/* ── Stats row + radar (two-column) ── */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-[3fr_2fr] items-stretch">
            <BigStatsBlock prof={prof} comparison={isComparing ? compareProf : null} season={season} compareSeason={compareSeason} />
            <PerformanceRadar
              driverCode={code}
              values={prof.radar}
              compareValues={isComparingWithData ? compareProf.radar : null}
              primaryLabel={String(season)}
              compareLabel={compareSeason != null ? String(compareSeason) : undefined}
            />
          </div>

          {/* ── Race-by-race comparison — only when the comparison season
              actually has results. For rookies the dropdown might offer a
              pre-debut season; in that case we skip this chart entirely
              rather than draw a one-line graph that looks broken. ── */}
          {isComparingWithData && (
            <SeasonComparisonChart
              primary={{
                season,
                team_name: prof.current_team,
                results: prof.season_results ?? [],
              }}
              compare={{
                season: compareSeason,
                team_name: compareProf.current_team,
                results: compareProf.season_results ?? [],
              }}
            />
          )}

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


/**
 * BigStats block. In single-season mode renders the original 2×2 grid.
 * In compare mode it becomes a 4-row stack of season-vs-season rows with a
 * delta chip between them — same information, denser layout for the
 * inevitable side-by-side reading.
 */
function BigStatsBlock({
  prof, comparison, season, compareSeason,
}: {
  prof: DriverProfileData;
  comparison: DriverProfileData | null;
  season: number;
  compareSeason: number | null;
}) {
  const stats: Array<{
    label: string;
    primaryValue: number | null;
    compareValue: number | null;
    format: (v: number) => string;
    direction: "higher_better" | "lower_better";
    hint: string;
    accent: "coral" | "cyan";
  }> = [
    {
      label: "Season Points",
      primaryValue: prof.season_points ?? null,
      compareValue: comparison?.season_points ?? null,
      format: (v) => Math.round(v).toString(),
      direction: "higher_better",
      hint: "Points scored in this season",
      accent: "coral",
    },
    {
      label: "Championship",
      primaryValue: prof.championship_position ?? null,
      compareValue: comparison?.championship_position ?? null,
      format: (v) => `P${Math.round(v)}`,
      direction: "lower_better",
      hint: "Position in the drivers' championship",
      accent: "cyan",
    },
    {
      label: "Avg Finish · L10",
      primaryValue: prof.avg_finish_L10 ?? null,
      compareValue: comparison?.avg_finish_L10 ?? null,
      format: (v) => `P${v.toFixed(1)}`,
      direction: "lower_better",
      hint: "Rolling average finishing position over the last 10 races",
      accent: "coral",
    },
    {
      label: "DNF Rate · L10",
      primaryValue: prof.dnf_rate_L10 ?? null,
      compareValue: comparison?.dnf_rate_L10 ?? null,
      format: (v) => `${Math.round(v * 100)}%`,
      direction: "lower_better",
      hint: "Share of last 10 races where the driver did not finish",
      accent: "cyan",
    },
  ];

  if (!comparison) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map(s => (
          <BigStat
            key={s.label}
            label={s.label}
            value={s.primaryValue != null ? s.format(s.primaryValue) : "—"}
            accent={s.accent}
            hint={s.hint}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-f1-edge bg-f1-panel/60 overflow-hidden divide-y divide-f1-edge">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
        <div>Metric</div>
        <div className="text-right w-16">{season}</div>
        <div className="text-right w-16">{compareSeason}</div>
        <div className="text-right w-16">Δ</div>
      </div>
      {stats.map(s => (
        <BigStatCompareRow key={s.label} stat={s} season={season} compareSeason={compareSeason!} />
      ))}
    </div>
  );
}

function BigStatCompareRow({
  stat, season, compareSeason,
}: {
  stat: {
    label: string;
    primaryValue: number | null;
    compareValue: number | null;
    format: (v: number) => string;
    direction: "higher_better" | "lower_better";
    hint: string;
    accent: "coral" | "cyan";
  };
  season: number;
  compareSeason: number;
}) {
  const { label, primaryValue, compareValue, format, direction, hint, accent } = stat;
  const accentVar = accent === "coral" ? "var(--color-paddock-coral)" : "var(--color-paddock-cyan)";

  let deltaText = "—";
  let deltaTone: "up" | "down" | "flat" = "flat";
  if (primaryValue != null && compareValue != null) {
    const diff = primaryValue - compareValue;
    const better = direction === "higher_better" ? diff > 0 : diff < 0;
    const worse = direction === "higher_better" ? diff < 0 : diff > 0;
    deltaTone = better ? "up" : worse ? "down" : "flat";
    // Show the actual diff value with sign; finish positions get the symbol flipped
    // since lower-is-better — but easier to read raw diff and rely on tone colour.
    const absDiff = Math.abs(diff);
    if (label === "DNF Rate · L10") {
      deltaText = `${diff >= 0 ? "+" : "−"}${Math.round(absDiff * 100)}%`;
    } else if (label === "Championship" || label === "Avg Finish · L10") {
      // Position numbers — show the magnitude with the directional arrow
      deltaText = `${better ? "▲" : worse ? "▼" : "—"}${absDiff.toFixed(label === "Championship" ? 0 : 1)}`;
    } else {
      deltaText = `${diff >= 0 ? "+" : "−"}${absDiff.toFixed(0)}`;
    }
  }

  return (
    <div className="relative grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center" title={hint}>
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentVar }} />
      <div className="text-xs text-f1-muted font-medium">{label}</div>
      <div className="text-right w-16 font-mono tabular-nums font-semibold" style={{ color: accentVar }}>
        {primaryValue != null ? format(primaryValue) : "—"}
      </div>
      <div className="text-right w-16 font-mono tabular-nums text-f1-muted">
        {compareValue != null ? format(compareValue) : "—"}
      </div>
      <div className={cn(
        "text-right w-16 font-mono tabular-nums text-[11px]",
        deltaTone === "up"   && "text-paddock-cyan",
        deltaTone === "down" && "text-paddock-coral",
        deltaTone === "flat" && "text-f1-muted",
      )}>
        {deltaText}
      </div>
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
  const [search, setSearch] = useSearchParams();

  const season = parseInt(search.get("season") ?? String(DEFAULT_SEASON), 10);
  const vsParam = search.get("vs");
  const compareSeason = vsParam ? parseInt(vsParam, 10) : null;

  function update(next: { season?: number; vs?: number | null }) {
    const params = new URLSearchParams(search);
    if (next.season != null) params.set("season", String(next.season));
    if (next.vs === null) params.delete("vs");
    else if (next.vs != null) params.set("vs", String(next.vs));
    setSearch(params, { replace: true });
  }

  // Default comparison season picker — the next year down from the primary
  // season, or one prior if we'd otherwise pick the same year.
  const defaultCompareSeason = (() => {
    const candidate = season - 1;
    if (candidate < SEASONS[SEASONS.length - 1]) return season + 1;
    return candidate;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl">Drivers</h1>
          <p className="text-xs text-f1-muted mt-1">
            {code ? `Profile for ${code.toUpperCase()}` : `${season} grid — click any driver for the full profile.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {code && (
            <Link to={`/driver?season=${season}`}>
              <Button variant="ghost" size="sm"><ArrowLeft size={14} /> All drivers</Button>
            </Link>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-f1-muted">Season</span>
            <Select
              value={season}
              onChange={(e) => update({ season: parseInt(e.target.value, 10) })}
              className="h-9 w-24"
            >
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          {/* Compare-with picker — only meaningful on the profile view */}
          {code && (
            compareSeason != null ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-paddock-cyan/10 border border-paddock-cyan/40 pl-2 pr-1 py-0.5">
                <span className="text-[10px] uppercase tracking-widest text-paddock-cyan">vs</span>
                <Select
                  value={compareSeason}
                  onChange={(e) => update({ vs: parseInt(e.target.value, 10) })}
                  className="h-7 w-20 text-xs"
                >
                  {SEASONS.filter(s => s !== season).map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <button
                  onClick={() => update({ vs: null })}
                  aria-label="Clear comparison"
                  className="text-paddock-cyan hover:text-f1-white p-1 rounded-full hover:bg-white/10"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => update({ vs: defaultCompareSeason })}
                className="border border-dashed border-f1-edge hover:border-paddock-cyan/60"
              >
                <Plus size={12} /> Compare
              </Button>
            )
          )}
        </div>
      </div>

      {code
        ? <DriverProfile code={code.toUpperCase()} season={season} compareSeason={compareSeason} />
        : <DriverList season={season} />}
    </div>
  );
}

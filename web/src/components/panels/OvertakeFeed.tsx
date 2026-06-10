import { useEffect, useMemo, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { ArrowRight, Crown, Flame, Plus, X, Zap } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { useCircuitPath, type CircuitPathData } from "@/hooks/useCircuitPath";
import { teamColor } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { OvertakeEvent } from "@/lib/types";

interface Props {
  overtakes: OvertakeEvent[];
  /** Current playback session-time (seconds from race start). Events with
   *  time <= this value are revealed; later events stay hidden until the
   *  playhead reaches them. */
  sessionTime: number;
  /** Leader's lap-completion session-times — used to compute the sector for
   *  each overtake (S1 / S2 / S3) from its `time` field. */
  lapMarks: number[];
  /** Lap-progress (0..1) where sectors 1 and 2 end. (S3 ends at 1.0.) */
  sectorMarks: number[];
  /** Race start session-time — needed for the lap-1 sector lookup. */
  raceStartT: number;
  /** Circuit slug (e.g. "bahrain") used to load the SVG outline for the
   *  per-row mini track thumbnails. */
  circuitId?: string | null;
}

/** Filter-chip identity. "driver:VER" or "team:Ferrari". */
type ChipId = string;
const chipDriver = (code: string): ChipId => `driver:${code}`;
const chipTeam   = (team: string): ChipId => `team:${team}`;

function matchesChips(o: OvertakeEvent, chips: Set<ChipId>): boolean {
  if (chips.size === 0) return true;
  if (chips.has(chipDriver(o.overtaker_code))) return true;
  if (o.overtaken_code && chips.has(chipDriver(o.overtaken_code))) return true;
  if (o.overtaker_team && chips.has(chipTeam(o.overtaker_team))) return true;
  if (o.overtaken_team && chips.has(chipTeam(o.overtaken_team))) return true;
  return false;
}

/**
 * "Live" overtake feed — events stream in as the replay playhead crosses
 * their session-time. Newest event sits at the top, briefly tagged "NEW"
 * with a pulsing gold border. Past events render normally below.
 *
 * Filter chips: click a driver or team in any row, or use the "+ Filter"
 * picker, to pin one or more storylines. Multiple chips compose with OR
 * semantics — events involving ANY of the selected entities show through.
 * "Clear all" wipes the chip set when one or more chips are active.
 *
 * Each row shows a 26×26 mini track thumbnail with a team-coloured dot
 * pinpointing the exact spot of the move, plus the usual driver swap +
 * sector + position badge. Rows are read-only — no click handlers.
 */
export function OvertakeFeed({
  overtakes, sessionTime, lapMarks, sectorMarks, raceStartT, circuitId,
}: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const [chips, setChips] = useState<Set<ChipId>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load circuit path once for the whole feed; per-row thumbnails sample
  // from it instead of each spinning up their own probe SVG.
  const { pathData, pathInfo, sample } = useCircuitPath(circuitId);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (!filterBarRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  function toggleChip(id: ChipId) {
    setChips(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Events that have happened. Newest first.
  const elapsed = useMemo(() => {
    return overtakes
      .filter(o => o.time <= sessionTime)
      .slice()
      .sort((a, b) => b.time - a.time);
  }, [overtakes, sessionTime]);

  // Apply chip filter on top of elapsed.
  const visible = useMemo(
    () => elapsed.filter(o => matchesChips(o, chips)),
    [elapsed, chips],
  );

  const latest = visible[0];
  // "NEW" highlight window — 4 s of session time. At 8x playback that's
  // ~0.5 s real time, just long enough to draw the eye without lingering.
  const latestIsFresh = latest != null && sessionTime - latest.time < 4;

  // Auto-scroll: keep the feed pinned to the top when new events arrive,
  // unless the user has scrolled down to read older entries.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (node.scrollTop < 40) node.scrollTop = 0;
  }, [latest?.time]);

  // Picker options — surface every driver / team that appears anywhere in
  // the race's overtakes, sorted alphabetically.
  const { driverOptions, teamOptions } = useMemo(() => {
    const drivers = new Set<string>();
    const teams = new Set<string>();
    overtakes.forEach(o => {
      if (o.overtaker_code) drivers.add(o.overtaker_code);
      if (o.overtaken_code) drivers.add(o.overtaken_code);
      if (o.overtaker_team) teams.add(o.overtaker_team);
      if (o.overtaken_team) teams.add(o.overtaken_team);
    });
    return {
      driverOptions: [...drivers].sort(),
      teamOptions:   [...teams].sort(),
    };
  }, [overtakes]);

  // Lap-progress (0..1) for an event — same math the sector lookup uses.
  function lapProgressFor(o: OvertakeEvent): number {
    const lapStart = o.lap <= 1 ? raceStartT : (lapMarks[o.lap - 2] ?? raceStartT);
    const lapEnd = lapMarks[o.lap - 1] ?? (lapStart + 90);
    const dur = Math.max(1, lapEnd - lapStart);
    return Math.max(0, Math.min(0.9999, (o.time - lapStart) / dur));
  }

  function sectorFor(o: OvertakeEvent): number {
    if (sectorMarks.length < 2) return 0;
    const frac = lapProgressFor(o);
    if (frac < sectorMarks[0]) return 1;
    if (frac < sectorMarks[1]) return 2;
    return 3;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header: live counter + total */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-f1-edge">
        <div className="flex items-center gap-2">
          <div className="relative p-1.5 rounded-md bg-f1-red/15 text-f1-red">
            <Zap size={14} />
            {latestIsFresh && (
              <span className="absolute -top-0.5 -right-0.5 inline-block h-2 w-2 rounded-full bg-paddock-coral"
                style={{ boxShadow: "0 0 8px 2px #ff5e6c" }}>
                <span className="absolute inset-0 rounded-full bg-paddock-coral animate-ping" />
              </span>
            )}
          </div>
          <div>
            <div className="font-display font-semibold text-sm">Overtakes</div>
            <div className="text-[10px] text-f1-muted tabular-nums">
              {chips.size > 0 ? (
                <>
                  <span className="text-f1-white font-semibold">{visible.length}</span>
                  {" "}matching · {elapsed.length} so far · {overtakes.length} total
                </>
              ) : (
                <>
                  <span className="text-f1-white font-semibold">{elapsed.length}</span>
                  {" "}so far · {overtakes.length} total
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar — chips + picker */}
      <div ref={filterBarRef}
        className="relative px-3 py-1.5 border-b border-f1-edge/60 flex items-center gap-1.5 flex-wrap min-h-[34px]">
        {[...chips].map(id => {
          const [kind, ...rest] = id.split(":");
          const value = rest.join(":");
          const isTeam = kind === "team";
          return (
            <span key={id}
              className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-1 py-0.5 text-[10px]
                         bg-white/[0.07] border border-white/10">
              {isTeam && (
                <span className="h-2 w-2 rounded-sm" style={{ background: teamColor(value) }} />
              )}
              <span className={cn("font-mono", isTeam ? "text-f1-white" : "text-f1-white")}>{value}</span>
              <button
                aria-label={`Remove filter ${value}`}
                onClick={() => toggleChip(id)}
                className="text-f1-muted hover:text-f1-white p-0.5 rounded-full hover:bg-white/10"
              >
                <X size={9} />
              </button>
            </span>
          );
        })}
        <button
          onClick={() => setPickerOpen(o => !o)}
          aria-expanded={pickerOpen}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-dashed transition-colors",
            pickerOpen
              ? "border-paddock-coral/60 text-paddock-coral bg-paddock-coral/8"
              : "border-f1-edge text-f1-muted hover:text-f1-white hover:border-f1-muted/60",
          )}
        >
          <Plus size={10} /> Filter
        </button>

        {chips.size > 0 && (
          <button
            onClick={() => setChips(new Set())}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]
                       text-f1-muted hover:text-f1-white transition-colors"
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        )}

        {/* Picker popover */}
        {pickerOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 z-30 rounded-md border border-f1-edge
                          bg-f1-dark/95 backdrop-blur p-2 shadow-2xl">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-f1-muted mb-1">Drivers</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {driverOptions.length === 0 && (
                <span className="text-[10px] text-f1-muted italic">No drivers yet — waiting for the first overtake.</span>
              )}
              {driverOptions.map(code => {
                const id = chipDriver(code);
                const active = chips.has(id);
                return (
                  <button key={id} onClick={() => toggleChip(id)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-mono border transition-colors",
                      active
                        ? "bg-paddock-coral/20 border-paddock-coral/60 text-paddock-coral"
                        : "bg-white/[0.04] border-white/10 text-f1-white hover:bg-white/[0.08]",
                    )}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-f1-muted mb-1">Teams</div>
            <div className="flex flex-wrap gap-1">
              {teamOptions.length === 0 && (
                <span className="text-[10px] text-f1-muted italic">No teams yet.</span>
              )}
              {teamOptions.map(team => {
                const id = chipTeam(team);
                const active = chips.has(id);
                return (
                  <button key={id} onClick={() => toggleChip(id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border transition-colors",
                      active
                        ? "bg-paddock-coral/20 border-paddock-coral/60 text-paddock-coral"
                        : "bg-white/[0.04] border-white/10 text-f1-white hover:bg-white/[0.08]",
                    )}
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ background: teamColor(team) }} />
                    {team}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ul ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {visible.length === 0 && (
          <li className="text-xs text-f1-muted text-center py-6">
            {overtakes.length === 0
              ? "No overtakes detected."
              : elapsed.length === 0
                ? "Waiting for the first overtake of the race…"
                : "No moves match these filters yet."}
          </li>
        )}
        <AnimatePresence initial={false}>
          {visible.map((o, i) => {
            const ovrColor = teamColor(o.overtaker_team);
            const ovdColor = teamColor(o.overtaken_team);
            const isLatest = i === 0 && latestIsFresh;
            const sector = sectorFor(o);
            const xy = pathInfo ? sample(lapProgressFor(o)) : null;
            const gain = o.new_position;
            const isForLead = o.new_position === 1;

            const ovrChipId = chipDriver(o.overtaker_code);
            const ovrChipActive = chips.has(ovrChipId);
            const ovdChipId = o.overtaken_code ? chipDriver(o.overtaken_code) : null;
            const ovdChipActive = ovdChipId ? chips.has(ovdChipId) : false;

            return (
              <m.li
                key={`${o.time.toFixed(2)}-${o.overtaker_code}-${o.overtaken_code}`}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={cn(
                  "relative group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  isLatest
                    ? "border border-paddock-coral/60 bg-paddock-coral/8"
                    : "border border-transparent",
                )}
                style={isLatest ? { boxShadow: "0 0 0 1px rgba(255,94,108,0.35), 0 0 18px rgba(255,94,108,0.18)" } : undefined}
              >
                {/* Mini track-map column: thumbnail + lap/sector label below */}
                <div className="shrink-0 flex flex-col items-center min-w-[36px]">
                  <MiniTrack pathData={pathData} xy={xy} dotColor={ovrColor} />
                  <span className="text-[8px] font-mono text-f1-muted leading-tight mt-0.5 tabular-nums">
                    L{o.lap}·S{sector}
                  </span>
                </div>

                {/* Overtaker — driver code is a click-to-filter button */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovrColor }} />
                  <button
                    type="button"
                    onClick={() => toggleChip(ovrChipId)}
                    title={`Filter feed by ${o.overtaker_code}`}
                    className={cn(
                      "font-mono font-semibold rounded-sm px-1 py-0.5 -mx-0.5 transition-colors",
                      ovrChipActive
                        ? "bg-paddock-coral/20 text-paddock-coral"
                        : "text-f1-white hover:bg-white/[0.08]",
                    )}
                  >
                    {o.overtaker_code}
                  </button>
                </div>

                <ArrowRight size={11} className="text-f1-muted shrink-0" />

                {/* Overtaken */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovdColor }} />
                  {o.overtaken_code && ovdChipId ? (
                    <button
                      type="button"
                      onClick={() => toggleChip(ovdChipId)}
                      title={`Filter feed by ${o.overtaken_code}`}
                      className={cn(
                        "font-mono rounded-sm px-1 py-0.5 -mx-0.5 transition-colors",
                        ovdChipActive
                          ? "bg-paddock-coral/20 text-paddock-coral"
                          : "text-f1-muted hover:bg-white/[0.08] hover:text-f1-white",
                      )}
                    >
                      {o.overtaken_code}
                    </button>
                  ) : (
                    <span className="font-mono text-f1-muted">—</span>
                  )}
                </div>

                {/* Position badge + editorial tag */}
                <div className="ml-auto flex items-center gap-1.5">
                  {isForLead && (
                    <span className="hidden lg:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-paddock-coral/20 text-paddock-coral">
                      <Crown size={9} /> Lead
                    </span>
                  )}
                  {!isForLead && o.new_position <= 3 && (
                    <span className="hidden lg:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-paddock-cyan/15 text-paddock-cyan">
                      <Flame size={9} /> Podium
                    </span>
                  )}
                  <Badge tone="muted" className="shrink-0 text-[10px] font-mono tabular-nums">
                    P{gain}
                  </Badge>
                </div>

                {isLatest && (
                  <span className="absolute -top-1.5 left-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded bg-paddock-coral text-white"
                    style={{ position: "absolute", animation: "pulse 1.4s ease-in-out infinite" }}>
                    NEW
                  </span>
                )}
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

/**
 * 26×26 circuit thumbnail with a single team-coloured dot at the overtake
 * location. The path + sample point come from the parent's `useCircuitPath`
 * call, so every row reuses one fetch + one probe SVG instead of N.
 */
interface MiniTrackProps {
  pathData: CircuitPathData | null;
  xy: { x: number; y: number } | null;
  dotColor: string;
}
function MiniTrack({ pathData, xy, dotColor }: MiniTrackProps) {
  const viewBox = pathData?.viewBox ?? "0 0 800 450";
  return (
    <svg
      width={26}
      height={26}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="rounded-sm bg-white/[0.03] border border-white/5"
      aria-hidden="true"
    >
      {pathData && (
        <path d={pathData.d} fill="none" stroke="#6b6b89" strokeWidth={11}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {xy && (
        <circle cx={xy.x} cy={xy.y} r={26} fill={dotColor} stroke="#000" strokeWidth={4} />
      )}
    </svg>
  );
}

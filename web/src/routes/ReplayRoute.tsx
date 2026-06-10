import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { m, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Keyboard, LineChart as LineChartIcon, X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { TimingTower } from "@/components/panels/TimingTower";
import { ReplayControls } from "@/components/panels/ReplayControls";
import { ReplayLapTicker } from "@/components/panels/ReplayLapTicker";
import { ReplayTrackMap } from "@/components/panels/ReplayTrackMap";
import { OvertakeFeed } from "@/components/panels/OvertakeFeed";
import { TrackStatusBanner } from "@/components/panels/TrackStatusBanner";
import { WinProbabilityChart } from "@/components/panels/WinProbabilityChart";
import { DriverTelemetry } from "@/components/panels/DriverTelemetry";
import { useReplay } from "@/hooks/useReplay";
import { api } from "@/lib/api";
import type { OvertakesResponse, ReplayDriver } from "@/lib/types";

export default function ReplayRoute() {
  const params = useParams<{ season: string; round: string }>();
  const season = parseInt(params.season ?? "", 10);
  const roundNum = parseInt(params.round ?? "", 10);

  const replay = useReplay(season, roundNum);
  const [selected, setSelected] = useState<string | null>(null);
  const [towerOpen, setTowerOpen] = useState(true);
  const [winProbOpen, setWinProbOpen] = useState(false);
  // Default ON — broadcast-style code labels above every dot. Press L to
  // declutter when you want a clean track view.
  const [showLabels, setShowLabels] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  // Default ON — once the race starts we show telemetry for the current
  // leader (or the driver the user has clicked). Press D or the close button
  // to dismiss; clicking another driver re-opens it on that driver.
  const [telemetryOpen, setTelemetryOpen] = useState(true);

  const handleSelectDriver = (code: string | null) => {
    setSelected(code);
    if (code) setTelemetryOpen(true);
  };

  // Keyboard shortcuts — matches Tom Shaw's reference repo so muscle memory
  // transfers. We ignore events while typing in inputs / when a modifier is
  // held so we don't fight the search bar or browser shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const SPEEDS = [2, 4, 8, 16, 32] as const;
      switch (e.key) {
        case " ": e.preventDefault(); replay.toggle(); break;
        case "ArrowRight": e.preventDefault(); replay.step(+1); break;
        case "ArrowLeft":  e.preventDefault(); replay.step(-1); break;
        case "1": case "2": case "3": case "4": case "5": {
          const idx = parseInt(e.key, 10) - 1;
          if (idx >= 0 && idx < SPEEDS.length) replay.setSpeed(SPEEDS[idx]);
          break;
        }
        case "l": case "L": setShowLabels(v => !v); break;
        case "t": case "T": setTowerOpen(v => !v); break;
        case "w": case "W": setWinProbOpen(v => !v); break;
        case "d": case "D": setTelemetryOpen(v => !v); break;
        case "h": case "H": case "?": setHelpOpen(v => !v); break;
        case "Escape": setTelemetryOpen(false); setHelpOpen(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  // Overtakes
  const { data: overtakesData } = useQuery({
    queryKey: ["replay", "overtakes", season, roundNum],
    queryFn: () => api.get<OvertakesResponse>(`/api/replay/${season}/${roundNum}/overtakes`),
    enabled: !!(season && roundNum),
    staleTime: 60 * 60 * 1000,
  });

  // Snapshot drivers as the ReplayDriver shape (with lap_progress)
  const drivers = useMemo<ReplayDriver[]>(
    () => (replay.snapshot?.drivers ?? []) as unknown as ReplayDriver[],
    [replay.snapshot],
  );

  const focusedDriver = useMemo(
    () => drivers.find(d => d.driver_code === selected) ?? drivers[0] ?? null,
    [drivers, selected],
  );

  if (!season || !roundNum) {
    return (
      <div className="p-8 text-center text-sm text-f1-muted">Invalid replay URL.</div>
    );
  }

  return (
    <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* TOP STRIP — back / breadcrumb + scrub controls.
          Compact so the map gets maximum vertical room. */}
      <div className="shrink-0 border-b border-f1-edge bg-f1-dark/80 backdrop-blur px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/live">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={14} /> Live
            </Button>
          </Link>
          <Badge tone="muted">Replay</Badge>
          {replay.meta && (
            <div className="hidden md:block min-w-0 truncate">
              <span className="font-display font-semibold text-sm">{replay.meta.race_name}</span>
              <span className="text-f1-muted text-xs ml-2">
                {season} R{roundNum} · {replay.meta.n_laps} laps
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {replay.meta?.podium?.length === 3 && (
            <div className="hidden lg:flex items-center gap-3 text-xs mr-2">
              {replay.meta.podium.map(p => (
                <div key={p.position}>
                  <span className="text-f1-muted">P{p.position}</span>{" "}
                  <span className="font-mono">{p.driver_code}</span>
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant={winProbOpen ? "primary" : "secondary"}
            onClick={() => setWinProbOpen(v => !v)}
          >
            <LineChartIcon size={14} /> Win Prob
          </Button>
          <Button
            size="sm"
            variant={helpOpen ? "primary" : "secondary"}
            onClick={() => setHelpOpen(v => !v)}
            title="Keyboard shortcuts (H)"
          >
            <Keyboard size={14} /> Keys
          </Button>
        </div>
      </div>

      {/* MAIN MAP CANVAS — fills remaining viewport */}
      <div className="relative flex-1 min-h-0 bg-f1-dark">
        {/* Background: the track map fills the entire region */}
        <div className="absolute inset-0">
          <ReplayTrackMap
            drivers={drivers}
            circuitId={replay.meta?.circuit_id ?? null}
            sessionTime={replay.sessionTime}
            trackStatus={(replay.snapshot as any)?.track_status ?? null}
            overtakes={overtakesData?.events ?? []}
            onSelectDriver={handleSelectDriver}
            selected={focusedDriver?.driver_code}
            safetyCar={replay.safetyCar}
            showLabels={showLabels}
            sectorMarks={replay.sectorMarks}
          />
        </div>

        {/* Always-visible race progress line — driven by raceProgress so it
            advances continuously, not lap-by-lap. */}
        {replay.meta && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-f1-edge z-20">
            <div
              className="h-full bg-gradient-to-r from-f1-red to-f1-red/40"
              style={{ width: `${(replay.raceProgress / replay.meta.n_laps) * 100}%` }}
            />
          </div>
        )}

        {/* Compact lap chip — top-RIGHT corner of the map (above overtake feed) */}
        <div className="absolute top-3 right-[340px] z-20 hidden md:block">
          {replay.meta && (
            <ReplayLapTicker
              currentLap={replay.lap}
              totalLaps={replay.meta.n_laps}
              raceName={replay.meta.race_name}
            />
          )}
        </div>
        {/* On mobile / narrow screens, anchor lap chip to top-right of viewport instead */}
        <div className="absolute top-3 right-3 z-20 md:hidden">
          {replay.meta && (
            <ReplayLapTicker
              currentLap={replay.lap}
              totalLaps={replay.meta.n_laps}
              raceName={replay.meta.race_name}
            />
          )}
        </div>

        {/* Status banner — top-CENTRE (where the old lap card used to be).
            Only renders when track_status is non-clear. */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <TrackStatusBanner status={(replay.snapshot as any)?.track_status} />
        </div>

        {/* Timing tower — collapsible left drawer, widened to 360px */}
        <AnimatePresence>
          {towerOpen && (
            <m.div
              key="tower"
              initial={{ x: -380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -380, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 30 }}
              className="absolute left-4 top-20 bottom-20 z-10 w-[360px] rounded-xl border border-f1-edge bg-f1-dark/90 backdrop-blur shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-f1-edge shrink-0">
                <div className="font-display font-semibold text-sm">Timing Tower</div>
                <button onClick={() => setTowerOpen(false)} className="text-f1-muted hover:text-f1-white">
                  <ChevronLeft size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {replay.loading && drivers.length === 0 ? (
                  <div className="p-3"><Skeleton className="h-64 w-full" /></div>
                ) : (
                  <TimingTower
                    drivers={drivers as any}
                    onSelectDriver={handleSelectDriver}
                    selected={focusedDriver?.driver_code}
                  />
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Re-open tower button when collapsed */}
        {!towerOpen && (
          <button
            onClick={() => setTowerOpen(true)}
            className="absolute left-4 top-20 z-10 rounded-r-xl border border-f1-edge border-l-0 bg-f1-dark/85 backdrop-blur px-2 py-3 text-f1-muted hover:text-f1-white"
            aria-label="Show timing tower"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Right rail — overtake feed top-half, driver telemetry bottom-half.
            Both panels share the column 50/50 so neither obscures the other.
            Telemetry defaults to the race leader; clicking any driver (track
            dot or tower row) swaps the trace. Close (X or D) collapses the
            telemetry slot into a thin pill so the overtake feed expands to
            fill the column. */}
        <div className="absolute right-4 top-20 bottom-20 z-10 w-[320px] hidden md:flex flex-col gap-2">
          {/* Overtake feed — top half (or full column when telemetry collapsed) */}
          <div className="flex-1 min-h-0 rounded-xl border border-f1-edge bg-f1-dark/90 backdrop-blur shadow-2xl overflow-hidden flex">
            <OvertakeFeed
              overtakes={overtakesData?.events ?? []}
              sessionTime={replay.sessionTime}
              lapMarks={replay.lapMarks}
              sectorMarks={replay.sectorMarks}
              raceStartT={replay.raceStartT}
              circuitId={replay.meta?.circuit_id ?? null}
            />
          </div>

          {/* Telemetry — bottom half. flex-1 + min-h-0 + overflow-y-auto so
              the panel never grows past its allotted half-column; if the
              charts don't fit on a short viewport, the panel scrolls inside. */}
          {telemetryOpen && focusedDriver && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DriverTelemetry
                driver={focusedDriver}
                season={season}
                roundNum={roundNum}
                sessionTime={replay.sessionTime}
                onClose={() => setTelemetryOpen(false)}
              />
            </div>
          )}

          {/* Re-open telemetry pill when collapsed (sits below the now-full
              overtake feed) */}
          {!telemetryOpen && focusedDriver && (
            <button
              onClick={() => setTelemetryOpen(true)}
              className="shrink-0 flex items-center justify-center gap-1.5 rounded-md border border-f1-edge bg-f1-dark/85 backdrop-blur px-3 py-2 text-xs text-f1-muted hover:text-f1-white"
              aria-label="Show driver telemetry"
              title="Show telemetry (D)"
            >
              <LineChartIcon size={13} /> Telemetry · {focusedDriver.driver_code}
            </button>
          )}
        </div>

        {/* Keyboard shortcuts cheat-sheet — bottom-right popover */}
        <AnimatePresence>
          {helpOpen && (
            <m.div
              key="help"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-4 right-4 z-30 w-[280px] rounded-xl border border-f1-edge bg-f1-dark/95 backdrop-blur shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-f1-edge">
                <div className="flex items-center gap-2 font-display font-semibold text-sm">
                  <Keyboard size={14} /> Keyboard Shortcuts
                </div>
                <button onClick={() => setHelpOpen(false)} className="text-f1-muted hover:text-f1-white">
                  <X size={14} />
                </button>
              </div>
              <div className="px-4 py-3 text-xs space-y-1.5">
                {[
                  ["Space",  "Play / Pause"],
                  ["←  →",   "Step lap back / forward"],
                  ["1-5",    "Speed 2× · 4× · 8× · 16× · 32×"],
                  ["L",      "Toggle driver labels on track"],
                  ["T",      "Toggle timing tower"],
                  ["D",      "Toggle driver telemetry"],
                  ["W",      "Toggle win-probability chart"],
                  ["H or ?", "Show / hide this panel"],
                  ["Esc",    "Close telemetry / close panel"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <kbd className="font-mono text-[10px] tracking-wider px-2 py-0.5 rounded border border-f1-edge bg-f1-panel/60 text-paddock-cyan shrink-0 min-w-[44px] text-center">
                      {key}
                    </kbd>
                    <span className="text-f1-muted text-right flex-1">{label}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-f1-edge text-[10px] text-f1-muted/70 italic">
                  Click any dot or row → driver telemetry. Click <span className="font-mono">/replay/&lt;y&gt;/&lt;r&gt;</span> in the URL bar to jump races.
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Win-probability drawer (slides up from bottom) */}
        <AnimatePresence>
          {winProbOpen && (
            <m.div
              key="winprob"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
              className="absolute left-4 right-4 bottom-4 md:left-[336px] md:right-[336px] z-20 rounded-xl border border-f1-edge bg-f1-dark/95 backdrop-blur shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-f1-edge">
                <div className="font-display font-semibold text-sm">Live Win Probability</div>
                <button onClick={() => setWinProbOpen(false)} className="text-f1-muted hover:text-f1-white">
                  <X size={16} />
                </button>
              </div>
              <div className="p-2">
                <WinProbabilityChart
                  season={season}
                  roundNum={roundNum}
                  currentLap={replay.lap}
                  podium={replay.meta?.podium}
                />
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* BOTTOM STRIP — replay controls (always visible) */}
      {replay.meta && (
        <div className="shrink-0 border-t border-f1-edge bg-f1-dark/85 backdrop-blur px-3 py-2">
          <ReplayControls
            lap={replay.lap}
            nLaps={replay.meta.n_laps}
            isPlaying={replay.isPlaying}
            speed={replay.speed}
            onTogglePlay={replay.toggle}
            onStep={replay.step}
            onSeek={replay.setLap}
            onSpeed={replay.setSpeed}
          />
        </div>
      )}
    </div>
  );
}

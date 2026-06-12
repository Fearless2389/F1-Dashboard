import { useEffect, useMemo, useRef, useState } from "react";
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
  // Default ON — broadcast-style code labels above every dot. Press L to
  // declutter when you want a clean track view.
  const [showLabels, setShowLabels] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  // Telemetry panel collapsed by default — viewer opens by clicking a
  // driver or pressing D. Prevents the empty-window flash during cold
  // load and lets the overtake feed take the full right column on first
  // open.
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  // Right-column split — telemetry's share of the column when open, as a
  // fraction in [0.25, 0.75]. The user drags the divider to adjust;
  // default 0.5 (50/50). Stored as a number so we can pass straight to
  // flexBasis. Could be persisted to localStorage in a follow-up.
  const [telemetryShare, setTelemetryShare] = useState(0.5);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [draggingDivider, setDraggingDivider] = useState(false);

  // Mouse-drag handler — wired to the divider's onPointerDown. While
  // dragging we follow the pointer's y position relative to the rail and
  // compute the telemetry's share as (rail.bottom − pointerY) / rail.height.
  useEffect(() => {
    if (!draggingDivider) return;
    const onMove = (e: PointerEvent) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const share = (rect.bottom - e.clientY) / rect.height;
      setTelemetryShare(Math.max(0.25, Math.min(0.75, share)));
    };
    const onUp = () => setDraggingDivider(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingDivider]);

  const handleSelectDriver = (code: string | null) => {
    setSelected(code);
    // Clicking a driver is an explicit "show me their telemetry" signal —
    // open the panel even if the user previously dismissed it.
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
        {/* Background: the track map is constrained to the visible region
            between the rails and above the scrubber so the SVG's
            preserveAspectRatio="xMidYMid meet" centers the circuit on the
            *actually visible* area, not the full overflow-hidden region.
            Previously the map filled inset-0, which centered the circuit
            in the full canvas — so on long-and-thin tracks like Spa the
            visible portion ended up off-centre and clipped at the bottom
            by the scrubber. The new bounds match the rails' positions:
            left-[388px] = tower's right edge + 12 px gap; right-[388px]
            mirrors the overtake/telemetry column; bottom-[64px] keeps the
            map's bottom edge above the 40-ish-px scrubber that sits at
            bottom-4. On mobile (< md) where the side rails are hidden,
            the map fills horizontally via inset-x-0. */}
        <div className="absolute top-0 bottom-[64px] inset-x-0 md:left-[388px] md:right-[388px]">
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
              className="absolute left-4 top-16 bottom-16 z-10 w-[360px] rounded-xl border border-f1-edge bg-f1-dark/90 backdrop-blur shadow-2xl overflow-hidden flex flex-col"
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
            className="absolute left-4 top-16 z-10 rounded-r-xl border border-f1-edge border-l-0 bg-f1-dark/85 backdrop-blur px-2 py-3 text-f1-muted hover:text-f1-white"
            aria-label="Show timing tower"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Right column — Overtakes on top, Telemetry on bottom, with a
            resizable divider in between. Both panels share the column
            via flex-basis (telemetryShare ∈ [0.25, 0.75]; default 0.5).
            Column stretches top-16 → bottom-4 so telemetry has the same
            bottom edge as the scrubber. */}
        <div
          ref={railRef}
          className={`absolute right-4 top-16 bottom-4 z-10 w-[360px] hidden md:flex flex-col ${draggingDivider ? "select-none" : ""}`}
        >
          {/* Overtake feed — gets (1 − telemetryShare) of the column when
              telemetry is open, the whole column otherwise. */}
          <div
            className="min-h-0 rounded-xl border border-f1-edge bg-f1-dark/90 backdrop-blur shadow-2xl overflow-hidden flex"
            style={
              telemetryOpen && focusedDriver && replay.sessionTime > 0
                ? { flexBasis: `${(1 - telemetryShare) * 100}%`, flexShrink: 1, flexGrow: 0 }
                : { flexBasis: "100%", flexShrink: 1, flexGrow: 1 }
            }
          >
            <OvertakeFeed
              overtakes={overtakesData?.events ?? []}
              sessionTime={replay.sessionTime}
              lapMarks={replay.lapMarks}
              sectorMarks={replay.sectorMarks}
              raceStartT={replay.raceStartT}
              circuitId={replay.meta?.circuit_id ?? null}
            />
          </div>

          {/* Draggable divider — only when telemetry is open. The pointer
              capture is on the bar itself; useEffect listens for global
              pointermove/up while draggingDivider is true. */}
          {telemetryOpen && focusedDriver && replay.sessionTime > 0 && (
            <div
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDraggingDivider(true);
              }}
              className="h-1.5 my-1 shrink-0 rounded-full bg-f1-edge hover:bg-paddock-coral/60 cursor-row-resize transition-colors"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize overtakes / telemetry split"
              title="Drag to resize"
            />
          )}

          {/* Telemetry — content-sized scroll inside its allotted share.
              When the divider sits at 50/50 on a 1080p viewport the
              panel has ~400px which fits all the charts without scrolling;
              shrinking the share scrolls the panel internally. */}
          {telemetryOpen && focusedDriver && replay.sessionTime > 0 ? (
            <div
              className="min-h-0 overflow-y-auto"
              style={{ flexBasis: `${telemetryShare * 100}%`, flexShrink: 1, flexGrow: 0 }}
            >
              <DriverTelemetry
                driver={focusedDriver}
                season={season}
                roundNum={roundNum}
                sessionTime={replay.sessionTime}
                onClose={() => setTelemetryOpen(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => focusedDriver && setTelemetryOpen(true)}
              disabled={!focusedDriver}
              className="shrink-0 mt-2 flex items-center justify-center gap-1.5 rounded-md border border-f1-edge bg-f1-dark/85 backdrop-blur px-3 py-2 text-[11px] uppercase tracking-widest text-f1-muted hover:text-f1-white disabled:hover:text-f1-muted disabled:cursor-not-allowed"
              title={focusedDriver ? "Show telemetry (D)" : "Pick a driver from the track or the tower first"}
            >
              <LineChartIcon size={13} />
              {focusedDriver ? (
                replay.sessionTime > 0 ? (
                  <>Telemetry · <span className="font-mono text-f1-white">{focusedDriver.driver_code}</span></>
                ) : "Loading replay…"
              ) : "Pick a driver"}
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

        {/* Scrubber — absolute, only spans the map width (between the
            timing tower on the left and the overtake/telemetry column on
            the right). Sits at bottom-4 like the right column so neither
            covers the other. On mobile (< md) the side rails are hidden,
            so the scrubber spans the full width via inset-x-4. */}
        {replay.meta && (
          <>
            {/* Desktop scrubber — between tower (left-4 + 360 + 8 gap = 388px from left)
                and right column (right-4 + 360 + 8 gap = 388px from right) */}
            <div className="absolute bottom-4 left-[388px] right-[388px] z-10 hidden md:block">
              <div className="rounded-xl border border-f1-edge bg-f1-dark/85 backdrop-blur px-3 py-1">
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
            </div>
            {/* Mobile scrubber — full width since side rails are hidden */}
            <div className="absolute bottom-4 left-4 right-4 z-10 md:hidden">
              <div className="rounded-xl border border-f1-edge bg-f1-dark/85 backdrop-blur px-3 py-1">
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
            </div>
          </>
        )}
      </div>

    </div>
  );
}

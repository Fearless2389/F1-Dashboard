import { useMemo } from "react";
import { Flag } from "lucide-react";

import { useCircuitPath } from "@/hooks/useCircuitPath";
import { teamColorFallback } from "@/lib/teams";
import type { OvertakeEvent, ReplayDriver } from "@/lib/types";

interface Props {
  drivers: ReplayDriver[];
  circuitId?: string | null;
  /** Current playback session-time (seconds from race start). Drives the
   *  on-track overtake flash — events glow only inside a ~2.5 s window
   *  starting at their actual time, not for the whole lap. */
  sessionTime?: number;
  /** "AllClear" | "Yellow" | "SC" | "VSC" | "Red" — controls track tint */
  trackStatus?: string | null;
  /** Overtakes — used to render a brief gold pulse on the track at the
   *  moment the playhead crosses each event's session-time. */
  overtakes?: OvertakeEvent[];
  onSelectDriver?: (code: string) => void;
  selected?: string | null;
  /** Safety Car overlay — when non-null, render an amber pulsing dot. */
  safetyCar?: { lapProgress: number; phase: "deploying" | "on_track" | "returning" } | null;
  /** When true: render every driver's code label on the track (toggle via L key).
   *  When false: only the leader + selected driver are labelled. */
  showLabels?: boolean;
  /** Lap-progress where sectors 1 and 2 end — drives light sector-divider ticks. */
  sectorMarks?: number[];
}

function statusTint(status?: string | null): { stroke: string; pulse: boolean } | null {
  switch (status) {
    case "Yellow":
    case "VSC":   return { stroke: "#ffd200", pulse: true };
    case "SC":    return { stroke: "#ff8000", pulse: true };
    case "Red":   return { stroke: "#e10600", pulse: true };
    default:      return null;   // AllClear / null → default racing red
  }
}

/**
 * Fullscreen track-map specialised for replay playback. Reads each driver's
 * `lap_progress` (0..1) and places them at the actual point on the racing
 * line via `SVGPathElement.getPointAtLength`. Designed to fill its container.
 */
export function ReplayTrackMap({
  drivers, circuitId, sessionTime, trackStatus, overtakes = [], onSelectDriver, selected, safetyCar, showLabels = false,
  sectorMarks = [],
}: Props) {
  const tint = statusTint(trackStatus);
  const { pathData, pathInfo, sample, pathError } = useCircuitPath(circuitId);

  // Compute the (x, y) and tangent at each sector-end mark so we can draw
  // small perpendicular ticks across the racing line. Kept light (low
  // opacity, short ticks) so they read as subtle dividers rather than
  // foreground graphics.
  const sectorTicks = useMemo(() => {
    if (!pathInfo || sectorMarks.length === 0) return [];
    const total = pathInfo.total;
    const epsilon = Math.min(8, total / 400) / total;
    const out: Array<{ x: number; y: number; nx: number; ny: number; label: string }> = [];
    sectorMarks.forEach((m, i) => {
      const p = sample(m);
      const ahead = sample(Math.min(0.9999, m + epsilon));
      if (!p || !ahead) return;
      const tx = ahead.x - p.x;
      const ty = ahead.y - p.y;
      const len = Math.hypot(tx, ty) || 1;
      // Perpendicular = rotate tangent 90°
      out.push({ x: p.x, y: p.y, nx: -ty / len, ny: tx / len, label: `S${i + 1}` });
    });
    return out;
  }, [pathInfo, sectorMarks, sample]);

  // Compute driver dot positions on each render — strictly on the racing line.
  // Retired drivers are filtered out so DNF'd cars don't appear to keep racing.
  const dots = useMemo(() => {
    if (!pathInfo) return [] as Array<{ d: ReplayDriver; x: number; y: number }>;
    return drivers
      .filter(d => !d.retired)
      .map(d => {
        const progress = ((d.lap_progress ?? 0) % 1 + 1) % 1;
        const xy = sample(progress);
        if (!xy) return null;
        return { d, x: xy.x, y: xy.y };
      }).filter(Boolean) as Array<{ d: ReplayDriver; x: number; y: number }>;
  }, [drivers, pathInfo, sample]);

  // On-track flashes — show the gold pulse for the ~2.5 s window starting at
  // each overtake's session-time, NOT for the whole lap the event lives on.
  // (Earlier version filtered by `lap`, which left cars glowing for ~80 s.)
  const activeOvertakes = useMemo(() => {
    if (sessionTime == null) return [];
    return overtakes.filter(o => sessionTime >= o.time && sessionTime <= o.time + 2.5);
  }, [overtakes, sessionTime]);

  const arrowDeg = pathInfo
    ? (Math.atan2(pathInfo.tangent.y, pathInfo.tangent.x) * 180) / Math.PI
    : 0;
  const viewBox = pathData?.viewBox ?? "0 0 800 450";

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-f1-edge bg-f1-dark">
      {/* Layer 1: background + circuit outline */}
      <svg
        viewBox={viewBox}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="rtm-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15152c" />
            <stop offset="100%" stopColor="#080812" />
          </linearGradient>
          <pattern id="rtm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#252548" opacity="0.6" />
          </pattern>
          <filter id="rtm-glow">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#rtm-bg)" />
        <rect width="100%" height="100%" fill="url(#rtm-grid)" />

        {pathData && (
          <>
            <path d={pathData.d} fill="none" stroke="#2c2c4a" strokeWidth="14"
              strokeLinejoin="round" strokeLinecap="round" />
            {/* Racing line — colour shifts to yellow / orange / red based on track status */}
            <path d={pathData.d} fill="none"
              stroke={tint?.stroke ?? "#e10600"} strokeWidth="3"
              strokeLinejoin="round" filter="url(#rtm-glow)" opacity="0.85">
              {tint?.pulse && (
                <animate attributeName="opacity" values="0.95;0.35;0.95" dur="1.2s" repeatCount="indefinite" />
              )}
            </path>
            <path d={pathData.d} fill="none" stroke="#ffffff" strokeWidth="0.6"
              strokeDasharray="3 6" />

            {/* Sector dividers — small perpendicular ticks (~24px) at the
                two interior sector boundaries. Low opacity + thin stroke so
                they sit lightly on the circuit without competing with cars. */}
            {sectorTicks.map((s, i) => {
              const L = 14;
              const x1 = s.x - s.nx * L;
              const y1 = s.y - s.ny * L;
              const x2 = s.x + s.nx * L;
              const y2 = s.y + s.ny * L;
              const tagX = s.x + s.nx * (L + 8);
              const tagY = s.y + s.ny * (L + 8);
              return (
                <g key={`sector-${i}`} opacity={0.45} pointerEvents="none">
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#8a8aa3" strokeWidth={1.5} strokeLinecap="round" />
                  <text x={tagX} y={tagY} fontSize="7" fontWeight="700" fill="#8a8aa3"
                    textAnchor="middle" dominantBaseline="middle">
                    {s.label}
                  </text>
                </g>
              );
            })}

            {/* Start/finish line + direction arrow */}
            {pathInfo && (
              <g>
                <g transform={`translate(${pathInfo.start.x} ${pathInfo.start.y}) rotate(${arrowDeg + 90})`}>
                  {[-8, -4, 0, 4].map((dx, i) => (
                    <rect key={dx} x={dx} y={-12} width="4" height="6"
                      fill={i % 2 === 0 ? "#ffffff" : "#000000"} />
                  ))}
                  {[-8, -4, 0, 4].map((dx, i) => (
                    <rect key={`b-${dx}`} x={dx} y={-6} width="4" height="6"
                      fill={i % 2 === 0 ? "#000000" : "#ffffff"} />
                  ))}
                </g>
                <g transform={`translate(${pathInfo.start.x} ${pathInfo.start.y}) rotate(${arrowDeg})`}>
                  <polygon points="14,0 6,-5 6,5" fill="#27f4d2" opacity="0.95" />
                </g>
              </g>
            )}
          </>
        )}

        {pathError && (
          <text x="50%" y="50%" textAnchor="middle" fill="#8a8aa3" fontSize="14">
            No track outline for "{circuitId}"
          </text>
        )}

        {/* Overtake ripples — single expanding coral ring at the overtake */}
        {/* location, fading to transparent. Replaces the previous gold    */}
        {/* indefinite-throb with a one-shot ripple per event so the page  */}
        {/* reads as "something just happened" rather than "this driver is */}
        {/* permanently flagged." The ring repeats every 1.4 s while the   */}
        {/* event is inside the activeOvertakes window (~2.5 s total).     */}
        {activeOvertakes.slice(0, 6).map((o, i) => {
          const driver = drivers.find(d => d.driver_code === o.overtaker_code);
          if (!driver || driver.lap_progress == null) return null;
          const xy = sample(driver.lap_progress);
          if (!xy) return null;
          return (
            <g key={`ov-${o.time}-${o.overtaker_code}-${i}`} transform={`translate(${xy.x} ${xy.y})`}>
              {/* Outer ripple ring */}
              <circle r="10" fill="none" stroke="var(--color-paddock-coral)" strokeWidth="2.5" opacity="0.85">
                <animate attributeName="r" values="8;38;38" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.85;0;0" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="strokeWidth" values="2.5;0.6;0.6" dur="1.4s" repeatCount="indefinite" />
              </circle>
              {/* Inner glow */}
              <circle r="6" fill="var(--color-paddock-coral)" opacity="0.35">
                <animate attributeName="opacity" values="0.55;0;0" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="r" values="6;14;14" dur="1.4s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Layer 2: driver dots + Safety Car overlay */}
      <svg
        viewBox={viewBox}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Safety Car — amber, larger than driver dots, with pulsing glow.
            Position is ~250 m (0.05 lap) ahead of the leader so it visually
            leads the field, matching what we see on a real broadcast.
            Phase drives opacity: 0.3 → 1 over the 2-second deploy window,
            1 → 0.3 over the 2-second return window, steady at 1 otherwise. */}
        {safetyCar && (() => {
          const xy = sample(safetyCar.lapProgress);
          if (!xy) return null;
          const opacity =
            safetyCar.phase === "deploying" ? 0.55 :
            safetyCar.phase === "returning" ? 0.45 : 1;
          const label =
            safetyCar.phase === "deploying" ? "SC DEPLOYING" :
            safetyCar.phase === "returning" ? "SC IN" : "SC";
          return (
            <g transform={`translate(${xy.x} ${xy.y})`} opacity={opacity}>
              {/* Outer pulsing halo */}
              <circle r={18} fill="#ff8000" opacity={0.25}>
                <animate attributeName="r" values="16;26;16" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.05;0.4" dur="1.4s" repeatCount="indefinite" />
              </circle>
              {/* Outline ring */}
              <circle r={12} fill="none" stroke="#ff8000" strokeWidth={2.5} opacity={0.85} />
              {/* Filled SC dot — amber */}
              <circle r={9} fill="#ffa64d" stroke="#1a1a1a" strokeWidth={1.5} />
              {/* "SC" label */}
              <text y={3} fontSize="7" fontWeight="900" fill="#1a1a1a" textAnchor="middle"
                pointerEvents="none">
                SC
              </text>
              {/* Phase label above */}
              <text y={-16} fontSize="7" fontWeight="700" fill="#ff8000" textAnchor="middle"
                pointerEvents="none" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                {label}
              </text>
            </g>
          );
        })()}

        {dots.map(({ d, x, y }, i) => {
          const color = teamColorFallback(d.team_colour, d.team_name);
          const isSel = selected === d.driver_code;
          const isLeader = d.position === 1;
          // Raw <g transform> — NOT motion.g — because lap-wraps
          // (progress 0.99 → 0.01) would otherwise lerp the dot across the
          // track interior. The 60fps rAF-driven sessionTime updates already
          // give us smooth motion frame-to-frame. Dots sit ON the racing
          // line; bunched cars overlap (broadcast-accurate behavior).
          // Dim pitting cars to ~30% opacity so they read as "in the pits"
          // rather than visually overtaking on the racing line (their gap
          // jumps +25s, which would otherwise snap them backwards on track).
          const dotOpacity = d.is_pitting ? 0.3 : 1;
          return (
            <g
              key={d.driver_code || d.driver_number || `i${i}`}
              transform={`translate(${x} ${y})`}
              onClick={() => onSelectDriver?.(d.driver_code)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDriver?.(d.driver_code);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${d.driver_code}${d.team_name ? ` (${d.team_name})` : ""} — click to view telemetry${d.is_pitting ? ", currently in the pits" : ""}`}
              style={{ cursor: "pointer", outline: "none" }}
              opacity={dotOpacity}
            >
              {isLeader && !d.is_pitting && (
                <circle r={13} fill="none" stroke="#ffd200" strokeWidth={2} opacity={0.7}>
                  <animate attributeName="r" values="12;18;12" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Selected-driver pulse — soft coral ring expanding around */}
              {/* the dot at 1.6 s loop. Makes the focused car obvious     */}
              {/* among 20 dots without needing to enlarge the dot itself  */}
              {/* (which would mask the team-colour stripe).               */}
              {isSel && !d.is_pitting && (
                <circle r={14} fill="none" stroke="var(--color-paddock-coral)" strokeWidth={1.5} opacity={0.85}>
                  <animate attributeName="r" values="11;19;11" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={isSel ? 10 : isLeader ? 8 : 6}
                fill={color}
                stroke={isSel ? "#fff" : "rgba(0,0,0,0.55)"}
                strokeWidth={isSel ? 2 : 1}
              />
              {(showLabels || isLeader || isSel) && (
                <text y={-10} fontSize="8" fontWeight="700" fill="#f5f5f7" textAnchor="middle"
                  pointerEvents="none" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}>
                  {d.driver_code}{d.is_pitting ? " · PIT" : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Empty-state */}
      {drivers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-md bg-f1-dark/70 backdrop-blur px-4 py-2 text-xs text-f1-muted border border-f1-edge">
            Waiting for driver positions…
          </div>
        </div>
      )}

      {/* Top-left small chequered-flag chip showing leader */}
      {drivers[0] && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-f1-dark/85 backdrop-blur border border-f1-red/35 px-3 py-1 text-xs text-f1-white">
          <Flag size={11} className="text-f1-red" />
          <span className="font-mono">{drivers[0].driver_code}</span>
          <span className="text-f1-muted">leads</span>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RaceEvent } from "@/lib/types";

interface Props {
  events: RaceEvent[];
}

type Status = "past" | "next" | "future";

interface Dot {
  ev: RaceEvent;
  x: number;
  y: number;
  status: Status;
}

const MAP_W = 900;
const MAP_H = 460;
const LON_SPAN = 360;
const LAT_SPAN = 180;
// Crop to slightly less than full globe to give the dots breathing room
const X_PAD = 18;
const Y_PAD_TOP = 24;
const Y_PAD_BOTTOM = 90;

function project(lat: number, lon: number): { x: number; y: number } {
  const x = X_PAD + ((lon + 180) / LON_SPAN) * (MAP_W - 2 * X_PAD);
  const y =
    Y_PAD_TOP +
    ((90 - lat) / LAT_SPAN) * (MAP_H - Y_PAD_TOP - Y_PAD_BOTTOM);
  return { x, y };
}

function statusColor(s: Status): { fill: string; stroke: string } {
  switch (s) {
    case "next":   return { fill: "#e10600", stroke: "#ff3a36" };
    case "past":   return { fill: "#38383f", stroke: "#52525c" };
    case "future": return { fill: "#27f4d2", stroke: "#52ffe1" };
  }
}

/**
 * Stylised dark "broadcast" world map.
 * - Equirectangular projection: x = (lon+180)/360 * W,  y = (90-lat)/180 * H
 * - Subtle latitude grid lines hint at globe shape without continent outlines
 * - Circuit dots colored by status (past / next-up / future)
 */
export function CalendarMap({ events }: Props) {
  const [hovered, setHovered] = useState<RaceEvent | null>(null);

  const dots: Dot[] = useMemo(() => {
    const now = Date.now();
    // Find the next upcoming race (status = "next")
    const futureSorted = events
      .filter(e => e.event_date && new Date(e.event_date).getTime() >= now - 6 * 3600_000)
      .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
    const nextRound = futureSorted[0]?.round;

    return events
      .filter(e => e.circuit_meta?.lat != null && e.circuit_meta?.lon != null)
      .map(ev => {
        const { x, y } = project(ev.circuit_meta!.lat!, ev.circuit_meta!.lon!);
        const t = ev.event_date ? new Date(ev.event_date).getTime() : 0;
        const status: Status =
          ev.round === nextRound ? "next" : t < now ? "past" : "future";
        return { ev, x, y, status };
      });
  }, [events]);

  const counts = useMemo(() => ({
    past:   dots.filter(d => d.status === "past").length,
    next:   dots.filter(d => d.status === "next").length,
    future: dots.filter(d => d.status === "future").length,
  }), [dots]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle>World Map</CardTitle>
          <div className="text-xs text-f1-muted mt-1">
            {dots.length} circuits · click any dot for details
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LegendDot label={`Past (${counts.past})`}   color={statusColor("past").fill} />
          <LegendDot label="Next"                       color={statusColor("next").fill} pulse />
          <LegendDot label={`Future (${counts.future})`} color={statusColor("future").fill} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative rounded-lg overflow-hidden border border-f1-edge">
          <svg
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="w-full h-auto block"
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <radialGradient id="bgGrad" cx="50%" cy="40%" r="80%">
                <stop offset="0%" stopColor="#1d1d36" />
                <stop offset="100%" stopColor="#0a0a16" />
              </radialGradient>
              <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="0.8" fill="#2c2c4a" opacity="0.5" />
              </pattern>
              <filter id="dotGlow">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            <rect width={MAP_W} height={MAP_H} fill="url(#bgGrad)" />
            <rect width={MAP_W} height={MAP_H} fill="url(#dotGrid)" />

            {/* Latitude grid (every 30°) */}
            {[-60, -30, 0, 30, 60].map(lat => {
              const { y } = project(lat, 0);
              return (
                <g key={`lat-${lat}`}>
                  <line
                    x1={X_PAD} x2={MAP_W - X_PAD} y1={y} y2={y}
                    stroke={lat === 0 ? "#3a3a5c" : "#232342"}
                    strokeWidth={lat === 0 ? 0.8 : 0.4}
                    strokeDasharray={lat === 0 ? undefined : "3 6"}
                  />
                  <text x={X_PAD - 4} y={y + 3} fontSize="8" fill="#52525c" textAnchor="end">
                    {lat}°
                  </text>
                </g>
              );
            })}

            {/* Longitude grid (every 60°) */}
            {[-120, -60, 0, 60, 120].map(lon => {
              const { x } = project(0, lon);
              return (
                <line
                  key={`lon-${lon}`}
                  x1={x} x2={x} y1={Y_PAD_TOP} y2={MAP_H - Y_PAD_BOTTOM}
                  stroke={lon === 0 ? "#3a3a5c" : "#232342"}
                  strokeWidth={lon === 0 ? 0.8 : 0.4}
                  strokeDasharray={lon === 0 ? undefined : "3 6"}
                />
              );
            })}

            {/* Circuit dots */}
            {dots.map(d => {
              const c = statusColor(d.status);
              const isHover = hovered?.round === d.ev.round;
              const r = isHover ? 7.5 : d.status === "next" ? 6 : 4.5;
              return (
                <g
                  key={`${d.ev.season}-${d.ev.round}`}
                  onMouseEnter={() => setHovered(d.ev)}
                  style={{ cursor: "pointer" }}
                >
                  {d.status === "next" && (
                    <motion.circle
                      cx={d.x} cy={d.y} r={r * 2.4}
                      fill={c.fill}
                      filter="url(#dotGlow)"
                      animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.15, 1] }}
                      transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                    />
                  )}
                  <circle
                    cx={d.x} cy={d.y} r={r}
                    fill={c.fill} stroke={c.stroke} strokeWidth={1.4}
                  />
                </g>
              );
            })}

            {/* Round-number labels for past + next, so the map reads as a calendar */}
            {dots.filter(d => d.status !== "future").map(d => (
              <text
                key={`label-${d.ev.round}`}
                x={d.x} y={d.y - 9}
                fontSize="8"
                fill="#f5f5f7"
                textAnchor="middle"
                pointerEvents="none"
                opacity={d.status === "next" ? 1 : 0.6}
                fontWeight={d.status === "next" ? 700 : 500}
              >
                R{d.ev.round}
              </text>
            ))}
          </svg>

          {/* Hover tooltip overlay */}
          <AnimatePresence>
            {hovered && hovered.circuit_meta?.lat != null && hovered.circuit_meta?.lon != null && (
              <motion.div
                key={hovered.round}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:max-w-xs rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur px-4 py-3 shadow-lg pointer-events-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-f1-muted">
                      Round {hovered.round}
                    </div>
                    <div className="text-sm font-semibold mt-0.5">{hovered.race_name}</div>
                    <div className="text-xs text-f1-muted">
                      {hovered.location}, {hovered.country}
                    </div>
                  </div>
                  {hovered.weather_forecast?.air_temp_mean != null && (
                    <Badge tone="muted">
                      {hovered.weather_forecast.air_temp_mean.toFixed(0)}°C
                    </Badge>
                  )}
                </div>
                {hovered.event_date && (
                  <div className="text-[11px] text-f1-muted mt-2 font-mono">
                    {new Date(hovered.event_date).toUTCString().slice(0, 16)}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ label, color, pulse }: { label: string; color: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-f1-muted">
      <span
        className={"inline-block h-2 w-2 rounded-full" + (pulse ? " f1-pulse" : "")}
        style={{ background: color }}
      />
      {label}
    </div>
  );
}

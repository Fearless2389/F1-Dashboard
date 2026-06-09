import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flag } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { teamColorFallback } from "@/lib/teams";
import type { LiveDriver } from "@/lib/types";

interface Props {
  drivers: LiveDriver[];
  circuitId?: string | null;
  circuitName?: string | null;
  onSelectDriver?: (code: string) => void;
  selected?: string | null;
}

/**
 * Renders a circuit outline from `/circuits/{id}.svg` when available and
 * lays driver dots on top, ordered by current position.
 *
 * Improvements vs v1:
 *   - The path data is fetched (not just <img>) so we can place driver dots
 *     ALONG the actual track shape using getPointAtLength().
 *   - A clearly drawn start/finish line + chequered flag pin.
 *   - Direction-of-travel arrow.
 *   - The leading driver gets a gold ring + "LEADER" tag.
 *   - Driver dots stay ordered by position, so the snake of cars reads
 *     correctly along the racing line instead of evenly spaced around a circle.
 */
export function TrackMap({ drivers, circuitId, circuitName, onSelectDriver, selected }: Props) {
  const ordered = useMemo(
    () => [...drivers]
      .filter(d => d.position != null)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    [drivers],
  );

  const [pathData, setPathData] = useState<{ d: string; viewBox: string } | null>(null);
  const [pathLoadFailed, setPathLoadFailed] = useState(false);

  // Fetch the SVG and extract the racing-line path so we can sample positions along it
  useEffect(() => {
    if (!circuitId) { setPathLoadFailed(true); setPathData(null); return; }
    let cancelled = false;
    setPathLoadFailed(false);
    setPathData(null);
    fetch(`/circuits/${circuitId}.svg`)
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(txt => {
        if (cancelled) return;
        const viewMatch = txt.match(/viewBox\s*=\s*"([^"]+)"/i);
        // Pick the LAST <path d="..."> with fill="none" (the racing line)
        const paths = Array.from(txt.matchAll(/<path[^>]*\bd\s*=\s*"([^"]+)"/gi))
          .map(m => m[1])
          .filter((d) => d.includes("Z") || d.length > 20);
        const d = paths[paths.length - 1] ?? paths[0];
        if (d && viewMatch) {
          setPathData({ d, viewBox: viewMatch[1] });
        } else {
          setPathLoadFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setPathLoadFailed(true); });
    return () => { cancelled = true; };
  }, [circuitId]);

  // Compute per-driver (x, y) positions along the actual path using SVGPathElement.getPointAtLength
  const [dotPositions, setDotPositions] = useState<Array<{ code: string; x: number; y: number }>>([]);
  const [pathTotalLength, setPathTotalLength] = useState(0);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [startTangent, setStartTangent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pathData) {
      setDotPositions([]);
      setStartPoint(null);
      return;
    }
    // Off-screen SVG to measure the path
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", pathData.d);
    svg.appendChild(path);
    document.body.appendChild(svg);

    try {
      const total = path.getTotalLength();
      setPathTotalLength(total);
      // Start = beginning of the path
      const s = path.getPointAtLength(0);
      setStartPoint({ x: s.x, y: s.y });
      // Tangent ≈ direction from t=0 to t=small for the arrow
      const tan = path.getPointAtLength(Math.min(20, total / 50));
      setStartTangent({ x: tan.x - s.x, y: tan.y - s.y });

      // Distribute drivers behind the leader, spaced by ~3% of lap length each.
      const spacing = total * 0.03;
      const positions = ordered.map((d, i) => {
        // Lead car sits AT the start line; cars trail back along the track
        // (we sample backwards by spacing*i, wrapping)
        const dist = (i * spacing) % total;
        const measured = path.getPointAtLength(total - dist);
        return { code: d.driver_code || String(d.driver_number ?? i), x: measured.x, y: measured.y };
      });
      setDotPositions(positions);
    } catch (err) {
      // jsdom / older browsers may not support getPointAtLength on detached path
      setDotPositions([]);
    } finally {
      document.body.removeChild(svg);
    }
  }, [pathData, ordered]);

  // Fallback viewBox if no SVG loaded
  const fallbackW = 800;
  const fallbackH = 450;
  const fallbackVB = `0 0 ${fallbackW} ${fallbackH}`;
  const viewBox = pathData?.viewBox ?? fallbackVB;

  // Arrow rotation in degrees from tangent
  const arrowAngle = startTangent
    ? (Math.atan2(startTangent.y, startTangent.x) * 180) / Math.PI
    : 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Track Map</CardTitle>
            {circuitName && (
              <div className="text-xs text-f1-muted mt-1 truncate">{circuitName}</div>
            )}
          </div>
          {ordered[0] && (
            <Badge tone="live">
              <Flag size={10} />
              Leader · {ordered[0].driver_code}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-[280px]">
        <div className="relative w-full h-full">
          {/* Background SVG (the circuit outline). Render it inline so we own the dots above it. */}
          {pathData ? (
            <svg viewBox={viewBox} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="tm-bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d1d36" />
                  <stop offset="100%" stopColor="#0e0e1a" />
                </linearGradient>
                <pattern id="tm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="0.8" fill="#252548" />
                </pattern>
                <filter id="tm-glow">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="url(#tm-bg)" />
              <rect width="100%" height="100%" fill="url(#tm-grid)" opacity="0.5" />
              {/* Track halo + red core */}
              <path d={pathData.d} fill="none" stroke="#2c2c4a" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
              <path d={pathData.d} fill="none" stroke="#e10600" strokeWidth="3" strokeLinejoin="round" filter="url(#tm-glow)" opacity="0.85" />
              <path d={pathData.d} fill="none" stroke="#ffffff" strokeWidth="0.6" strokeDasharray="3 6" />
              {/* Start/finish + arrow */}
              {startPoint && (
                <g>
                  {/* Chequered start/finish line — drawn perpendicular to tangent */}
                  <g transform={`translate(${startPoint.x} ${startPoint.y}) rotate(${arrowAngle + 90})`}>
                    {[-8, -4, 0, 4].map((dx, i) => (
                      <rect
                        key={dx}
                        x={dx} y={-12}
                        width="4" height="6"
                        fill={i % 2 === 0 ? "#ffffff" : "#000000"}
                      />
                    ))}
                    {[-8, -4, 0, 4].map((dx, i) => (
                      <rect
                        key={`b-${dx}`}
                        x={dx} y={-6}
                        width="4" height="6"
                        fill={i % 2 === 0 ? "#000000" : "#ffffff"}
                      />
                    ))}
                  </g>
                  {/* Direction arrow */}
                  <g transform={`translate(${startPoint.x} ${startPoint.y}) rotate(${arrowAngle})`}>
                    <polygon points="14,0 6,-5 6,5" fill="#27f4d2" opacity="0.9" />
                  </g>
                </g>
              )}
            </svg>
          ) : (
            <svg viewBox={fallbackVB} className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="tg-fb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d1d36" />
                  <stop offset="100%" stopColor="#0e0e1a" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#tg-fb)" />
              <ellipse cx={fallbackW / 2} cy={fallbackH / 2} rx={fallbackW / 2 - 80} ry={fallbackH / 2 - 80}
                fill="none" stroke="#2a2a44" strokeWidth={20} />
              <ellipse cx={fallbackW / 2} cy={fallbackH / 2} rx={fallbackW / 2 - 80} ry={fallbackH / 2 - 80}
                fill="none" stroke="#e10600" strokeWidth={2} opacity="0.6" />
            </svg>
          )}

          {/* Driver dots — sampled along the actual path */}
          <svg viewBox={viewBox} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
            {dotPositions.length > 0 ? (
              dotPositions.map((p, i) => {
                const driver = ordered[i];
                if (!driver) return null;
                const color = teamColorFallback(driver.team_colour, driver.team_name);
                const isSel = selected === driver.driver_code;
                const isLeader = i === 0;
                return (
                  <motion.g
                    key={driver.driver_code || driver.driver_number || i}
                    initial={false}
                    animate={{ x: p.x, y: p.y }}
                    transition={{ type: "spring", stiffness: 140, damping: 24 }}
                    onClick={() => onSelectDriver?.(driver.driver_code)}
                    style={{ cursor: "pointer" }}
                  >
                    {isLeader && (
                      <circle r={14} fill="none" stroke="#ffd200" strokeWidth={2} opacity={0.7}>
                        <animate attributeName="r" values="13;18;13" dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      r={isSel ? 11 : isLeader ? 9 : 7}
                      fill={color}
                      stroke={isSel ? "#fff" : "rgba(0,0,0,0.45)"}
                      strokeWidth={isSel ? 2 : 1}
                    />
                    <text y={-12} fontSize="9" fontWeight="700" fill="#f5f5f7" textAnchor="middle" pointerEvents="none">
                      {driver.driver_code}
                    </text>
                  </motion.g>
                );
              })
            ) : (
              // Fallback distribution: evenly along outline if getPointAtLength wasn't usable
              ordered.map((d, i) => {
                const angle = (i / Math.max(ordered.length, 1)) * Math.PI * 2 - Math.PI / 2;
                const cx = fallbackW / 2 + (fallbackW / 2 - 80) * Math.cos(angle);
                const cy = fallbackH / 2 + (fallbackH / 2 - 80) * Math.sin(angle);
                const color = teamColorFallback(d.team_colour, d.team_name);
                return (
                  <motion.g key={d.driver_code || d.driver_number || i}
                    initial={false} animate={{ x: cx, y: cy }}
                    transition={{ type: "spring", stiffness: 140, damping: 22 }}>
                    <circle r={i === 0 ? 9 : 7} fill={color} />
                    <text y={-12} fontSize="9" fontWeight="700" fill="#f5f5f7" textAnchor="middle">{d.driver_code}</text>
                  </motion.g>
                );
              })
            )}
          </svg>

          {/* Empty-state overlay */}
          {ordered.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-md bg-f1-dark/70 backdrop-blur px-4 py-2 text-xs text-f1-muted border border-f1-edge">
                Waiting for driver positions…
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

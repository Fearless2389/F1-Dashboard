import { useCallback, useEffect, useRef, useState } from "react";

export interface CircuitPathData {
  d: string;
  viewBox: string;
}

export interface CircuitPathInfo {
  total: number;
  start: { x: number; y: number };
  tangent: { x: number; y: number };
}

export interface UseCircuitPathResult {
  pathData: CircuitPathData | null;
  pathInfo: CircuitPathInfo | null;
  /** Sample a point on the racing line at progress in [0, 1]. Safe at 60 Hz. */
  sample: (progress: number) => { x: number; y: number } | null;
  pathError: boolean;
}

/**
 * Loads `/circuits/{circuitId}.svg` and exposes a `sample(progress)` helper
 * backed by a single persistent offscreen path so consumers (track map,
 * mini-thumbnails) can call `getPointAtLength` cheaply without re-fetching.
 */
export function useCircuitPath(circuitId?: string | null): UseCircuitPathResult {
  const [pathData, setPathData] = useState<CircuitPathData | null>(null);
  const [pathError, setPathError] = useState(false);
  const measurePathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    if (!circuitId) { setPathError(true); setPathData(null); return; }
    let cancelled = false;
    setPathError(false);
    setPathData(null);
    fetch(`/circuits/${circuitId}.svg`)
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(txt => {
        if (cancelled) return;
        const viewMatch = txt.match(/viewBox\s*=\s*"([^"]+)"/i);
        const paths = Array.from(txt.matchAll(/<path[^>]*\bd\s*=\s*"([^"]+)"/gi))
          .map(m => m[1])
          .filter(d => d.includes("Z") || d.length > 20);
        const d = paths[paths.length - 1] ?? paths[0];
        if (d && viewMatch) {
          setPathData({ d, viewBox: viewMatch[1] });
        } else {
          setPathError(true);
        }
      })
      .catch(() => { if (!cancelled) setPathError(true); });
    return () => { cancelled = true; };
  }, [circuitId]);

  const [pathInfo, setPathInfo] = useState<CircuitPathInfo | null>(null);

  useEffect(() => {
    if (!pathData) { setPathInfo(null); return; }
    const svgNS = "http://www.w3.org/2000/svg";
    const probe = document.createElementNS(svgNS, "svg");
    probe.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden;");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", pathData.d);
    probe.appendChild(path);
    document.body.appendChild(probe);
    try {
      const total = path.getTotalLength();
      const start = path.getPointAtLength(0);
      const tan = path.getPointAtLength(Math.min(20, total / 50));
      setPathInfo({
        total,
        start: { x: start.x, y: start.y },
        tangent: { x: tan.x - start.x, y: tan.y - start.y },
      });
      measurePathRef.current = path;
    } catch {
      setPathInfo(null);
    }
    return () => {
      if (document.body.contains(probe)) document.body.removeChild(probe);
      measurePathRef.current = null;
    };
  }, [pathData]);

  const sample = useCallback(
    (progress: number): { x: number; y: number } | null => {
      const path = measurePathRef.current;
      if (!path || !pathInfo) return null;
      try {
        const p = path.getPointAtLength(((progress % 1) + 1) % 1 * pathInfo.total);
        return { x: p.x, y: p.y };
      } catch {
        return null;
      }
    },
    [pathInfo],
  );

  return { pathData, pathInfo, sample, pathError };
}

import { keepPreviousData, useQuery } from "@tanstack/react-query";

// Same base resolution as src/lib/api.ts — empty string in dev (so Vite's
// proxy can intercept /api), the VITE_API_URL host in production. Using a
// raw fetch (instead of api.get) so we can detect the 204 no-content
// response that flags "telemetry never fetched for this race" — but we
// still need the base URL or the production build hits Vercel for /api
// and 404s on every telemetry request.
const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface TelemetryWindow {
  driver_code: string;
  from_t: number;
  to_t: number;
  t:        number[];
  speed:    number[];
  throttle: number[];
  brake:    boolean[];
  gear:     number[];
  drs:      number[];
}

interface Args {
  season: number;
  roundNum: number;
  driverCode: string | null;
  sessionTime: number;
  windowSeconds?: number;   // default 30
  enabled?: boolean;
}

/**
 * Rolling-window driver telemetry.
 *
 * Polls the backend's `/api/replay/{season}/{round}/telemetry/{driver}`
 * endpoint as the replay playhead advances. We key the query by
 * `Math.floor(sessionTime / 5)` so React Query only refetches every ~5 session
 * seconds — not every rAF tick. The backend slices the cached `car_data` to
 * the [sessionTime − 30s, sessionTime] window.
 *
 * Returns `notAvailable: true` when the backend signals 204 (older races
 * where car_data.ff1pkl was never fetched).
 */
export function useDriverTelemetry({
  season, roundNum, driverCode, sessionTime, windowSeconds = 30, enabled = true,
}: Args): { samples: TelemetryWindow | null; isLoading: boolean; notAvailable: boolean } {
  const windowKey = Math.floor(sessionTime / 5);
  const isOn = enabled && !!driverCode && !!season && !!roundNum;

  // Destructure only the fields we actually read — lets TanStack Query's
  // tracked-property optimisation skip re-renders when other fields change.
  const { data, isLoading } = useQuery({
    queryKey: ["telemetry-window", season, roundNum, driverCode, windowKey],
    queryFn: async () => {
      const from_t = Math.max(0, sessionTime - windowSeconds);
      const to_t = sessionTime;
      // Use the raw fetch so we can detect a 204 (no-content) response.
      const url = `${API_BASE}/api/replay/${season}/${roundNum}/telemetry/${driverCode}?from_t=${from_t}&to_t=${to_t}`;
      const res = await fetch(url);
      if (res.status === 204) return { __notAvailable: true } as const;
      if (!res.ok) throw new Error(`Telemetry fetch failed: ${res.status}`);
      return (await res.json()) as TelemetryWindow;
    },
    enabled: isOn,
    staleTime: 10_000,
    gcTime:    60_000,
    // The windowKey advances every 5 session-seconds — without
    // keepPreviousData, the chart would flicker to "loading" each rollover
    // because the new query starts with `data: undefined`. Holding the
    // previous response keeps the trace continuously rendered.
    placeholderData: keepPreviousData,
  });

  const notAvailable = !!(data && (data as any).__notAvailable);
  return {
    samples: notAvailable ? null : ((data as TelemetryWindow | undefined) ?? null),
    isLoading,
    notAvailable,
  };
}

/** Helper: FastF1 DRS code → bool active. Codes ≥10 mean the system is open. */
export function isDrsActive(code: number | undefined): boolean {
  return typeof code === "number" && code >= 10;
}

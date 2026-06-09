import type { QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const HOUR = 60 * 60_000;
const MIN_5 = 5 * 60_000;

/**
 * Hover-prefetch helper — when a user hovers a nav link, kick off the queries
 * that route is about to need so the network round-trip happens during the
 * hover (~150-300 ms), not after the click. By the time React mounts the new
 * route, the data is already in cache and the page renders instantly.
 *
 * Safe to call on every hover — React Query dedupes inflight requests.
 */
export function prefetchForRoute(qc: QueryClient, route: string, season = 2026): void {
  const pf = (key: any[], path: string, staleTime = MIN_5) =>
    qc.prefetchQuery({
      queryKey: key,
      queryFn:  () => api.get(path),
      staleTime,
    });

  if (route === "/live") {
    pf(["live", "snapshot"], "/api/live/snapshot", 10_000);
    pf(["schedule", season, false], `/api/schedule/${season}?include_weather=false`, HOUR);
    return;
  }
  if (route === "/apex") {
    pf(["apex", "next"], "/api/apex/next", MIN_5);
    return;
  }
  if (route === "/standings") {
    pf(["standings", season], `/api/standings/${season}`, MIN_5);
    pf(["recent-race", season], `/api/recent-race/${season}`, MIN_5);
    pf(["schedule", season, false], `/api/schedule/${season}?include_weather=false`, HOUR);
    return;
  }
  if (route === "/calendar") {
    pf(["schedule", season, true], `/api/schedule/${season}?include_weather=true`, HOUR);
    return;
  }
  if (route === "/driver") {
    pf(["drivers", "grid", season], `/api/drivers?season=${season}`, MIN_5);
    return;
  }
  if (route === "/model") {
    pf(["manifest"], "/api/models", Infinity);
    return;
  }
}

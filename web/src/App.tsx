import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Shell from "@/components/Shell";
import { Skeleton } from "@/components/ui/Skeleton";

// ── Route-level code splitting ──────────────────────────────────────
//
// Every route below is React.lazy() so it becomes its own chunk. The
// landing page used to ship 989 KB of JS on first paint because every
// route component (recharts-heavy Apex, replay's WebGL-ish track map,
// the FastF1-bound telemetry panel) was pulled into the initial bundle
// regardless of which URL the visitor opened.
//
// Each chunk loads only when its route mounts; the Suspense fallback
// below is what the browser shows for the ~150 ms it takes to fetch
// the chunk over HTTP/2 multiplex. The fallback uses the shimmer
// Skeleton so the placeholder reads as "data on the way" rather than
// "broken empty page."
//
// Landing stays eagerly imported because it's the first paint surface
// for every cold visit and the chunk is ~3 KB — splitting it would
// just add a network round-trip before "Paddock Dashboard" appears.
const AboutRoute     = lazy(() => import("@/routes/AboutRoute"));
const LiveRoute      = lazy(() => import("@/routes/LiveRoute"));
const CalendarRoute  = lazy(() => import("@/routes/CalendarRoute"));
const DriverRoute    = lazy(() => import("@/routes/DriverRoute"));
const ModelRoute     = lazy(() => import("@/routes/ModelRoute"));
const ReplayRoute    = lazy(() => import("@/routes/ReplayRoute"));
const StandingsRoute = lazy(() => import("@/routes/StandingsRoute"));
const ApexRoute      = lazy(() => import("@/routes/ApexRoute"));
import LandingRoute from "@/routes/LandingRoute";

/**
 * /forecast → /apex (forecast was merged into the predictor page);
 * /live remains the home of the replay picker; /dashboard is an alias
 * so the landing page's "Open dashboard" CTA goes somewhere stable.
 */
function ForecastRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/apex${search}`} replace />;
}

function DashboardAlias() {
  const { search } = useLocation();
  return <Navigate to={`/live${search}`} replace />;
}

/**
 * Suspense fallback used while a route chunk is downloading. Matches
 * the overall page rhythm (a header strip + a content area) so the
 * shimmer doesn't read as a layout shift when the real route arrives.
 */
function RouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton variant="hero" className="w-full" />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_3fr]">
        <Skeleton variant="card" className="w-full" />
        <Skeleton variant="card" className="w-full" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Shell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/dashboard" element={<DashboardAlias />} />
          <Route path="/about" element={<AboutRoute />} />
          <Route path="/live" element={<LiveRoute />} />
          <Route path="/calendar" element={<CalendarRoute />} />
          <Route path="/apex" element={<ApexRoute />} />
          <Route path="/forecast" element={<ForecastRedirect />} />
          <Route path="/standings" element={<StandingsRoute />} />
          <Route path="/driver/:code" element={<DriverRoute />} />
          <Route path="/driver" element={<DriverRoute />} />
          <Route path="/model" element={<ModelRoute />} />
          <Route path="/replay/:season/:round" element={<ReplayRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

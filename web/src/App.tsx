import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Shell from "@/components/Shell";
import LandingRoute from "@/routes/LandingRoute";
import AboutRoute from "@/routes/AboutRoute";
import LiveRoute from "@/routes/LiveRoute";
import CalendarRoute from "@/routes/CalendarRoute";
import DriverRoute from "@/routes/DriverRoute";
import ModelRoute from "@/routes/ModelRoute";
import ReplayRoute from "@/routes/ReplayRoute";
import StandingsRoute from "@/routes/StandingsRoute";
import ApexRoute from "@/routes/ApexRoute";

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

export default function App() {
  return (
    <Shell>
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
    </Shell>
  );
}

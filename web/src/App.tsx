import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Shell from "@/components/Shell";
import LiveRoute from "@/routes/LiveRoute";
import CalendarRoute from "@/routes/CalendarRoute";
import DriverRoute from "@/routes/DriverRoute";
import ModelRoute from "@/routes/ModelRoute";
import ReplayRoute from "@/routes/ReplayRoute";
import StandingsRoute from "@/routes/StandingsRoute";
import ApexRoute from "@/routes/ApexRoute";

/**
 * /forecast was merged into /apex so the entire race-prediction surface
 * lives on one page. Preserve any `?season=…&round=…` query params from
 * old bookmarks or external links — the search string drops through to
 * the new route which reads the same params.
 */
function ForecastRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/apex${search}`} replace />;
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/live" replace />} />
        <Route path="/live" element={<LiveRoute />} />
        <Route path="/calendar" element={<CalendarRoute />} />
        <Route path="/apex" element={<ApexRoute />} />
        <Route path="/forecast" element={<ForecastRedirect />} />
        <Route path="/standings" element={<StandingsRoute />} />
        <Route path="/driver/:code" element={<DriverRoute />} />
        <Route path="/driver" element={<DriverRoute />} />
        <Route path="/model" element={<ModelRoute />} />
        <Route path="/replay/:season/:round" element={<ReplayRoute />} />
        <Route path="*" element={<Navigate to="/live" replace />} />
      </Routes>
    </Shell>
  );
}

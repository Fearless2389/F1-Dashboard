import { Navigate, Route, Routes } from "react-router-dom";

import Shell from "@/components/Shell";
import LiveRoute from "@/routes/LiveRoute";
import CalendarRoute from "@/routes/CalendarRoute";
import PredictRoute from "@/routes/PredictRoute";
import ExploreRoute from "@/routes/ExploreRoute";
import DriverRoute from "@/routes/DriverRoute";
import ModelRoute from "@/routes/ModelRoute";
import ReplayRoute from "@/routes/ReplayRoute";
import StandingsRoute from "@/routes/StandingsRoute";
import ApexRoute from "@/routes/ApexRoute";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/live" replace />} />
        <Route path="/live" element={<LiveRoute />} />
        <Route path="/calendar" element={<CalendarRoute />} />
        <Route path="/predict" element={<PredictRoute />} />
        <Route path="/apex" element={<ApexRoute />} />
        <Route path="/standings" element={<StandingsRoute />} />
        <Route path="/explore" element={<ExploreRoute />} />
        <Route path="/driver/:code" element={<DriverRoute />} />
        <Route path="/driver" element={<DriverRoute />} />
        <Route path="/model" element={<ModelRoute />} />
        <Route path="/replay/:season/:round" element={<ReplayRoute />} />
        <Route path="*" element={<Navigate to="/live" replace />} />
      </Routes>
    </Shell>
  );
}

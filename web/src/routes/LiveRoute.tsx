import { useMemo, useState } from "react";
import { m } from "framer-motion";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { TimingTower } from "@/components/panels/TimingTower";
import { TrackMap } from "@/components/panels/TrackMap";
import { TelemetryPanel } from "@/components/panels/TelemetryPanel";
import { RaceControlFeed } from "@/components/panels/RaceControlFeed";
import { ReplayPicker } from "@/components/panels/ReplayPicker";
import { Countdown } from "@/components/Countdown";
import { Calendar as CalIcon, Radio } from "lucide-react";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import { useSchedule } from "@/hooks/useApi";
import { useRaceContext } from "@/store/raceContext";

export default function LiveRoute() {
  const { snapshot, status, lastMessageAt } = useLiveSocket();
  const [selected, setSelected] = useState<string | null>(null);
  const { season } = useRaceContext();
  const { data: schedule } = useSchedule(season, false);

  const drivers = snapshot?.drivers ?? [];
  const focusedDriver = useMemo(
    () => drivers.find((d) => d.driver_code === selected) ?? drivers[0] ?? null,
    [selected, drivers],
  );

  const sessionKey = snapshot?.session_key ?? null;
  const w = snapshot?.weather;
  const lastSeen = lastMessageAt ? Math.max(0, Math.round((Date.now() - lastMessageAt) / 1000)) : null;

  // Build a circuit id from the live session, falling back to the next-up race
  const liveCircuitId = useMemo(() => {
    if (!snapshot?.circuit_short_name) return null;
    return snapshot.circuit_short_name.toLowerCase().replace(/\s+/g, "_");
  }, [snapshot]);

  const nextRace = useMemo(() => {
    const evs = schedule?.events ?? [];
    if (evs.length === 0) return null;
    const now = Date.now();
    return evs.find(ev => {
      const t = ev.session5_date ?? ev.event_date;
      return t ? new Date(t).getTime() > now - 6 * 3600_000 : false;
    }) ?? evs[0];
  }, [schedule]);

  const noSession = drivers.length === 0;

  return (
    <div className="space-y-4">
      {/* Hero strip */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {!noSession ? (
              <Badge tone="live">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-f1-red f1-pulse" />
                Live · WebSocket {status}
              </Badge>
            ) : (
              <Badge tone="muted">
                <Radio size={12} />
                No active session
              </Badge>
            )}
            {snapshot && !noSession ? (
              <div>
                <div className="text-sm font-semibold">
                  {snapshot.session_name ?? snapshot.session_type ?? "Session"}
                  {snapshot.circuit_short_name ? ` · ${snapshot.circuit_short_name}` : ""}
                </div>
                <div className="text-xs text-f1-muted mt-0.5">
                  Status: {snapshot.status} {lastSeen != null && `· last update ${lastSeen}s ago`}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-semibold">Standby</div>
                <div className="text-xs text-f1-muted mt-0.5">
                  This page lights up when an F1 session goes live (FP1, FP2, FP3, Qualifying, Sprint, Race).
                </div>
              </div>
            )}
          </div>
          {w && (w.air_temperature != null || w.track_temperature != null) && (
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-f1-muted">Air</span>{" "}
                <span className="text-f1-white">{w.air_temperature ?? "—"}°C</span>
              </div>
              <div>
                <span className="text-f1-muted">Track</span>{" "}
                <span className="text-f1-white">{w.track_temperature ?? "—"}°C</span>
              </div>
              <div>
                <span className="text-f1-muted">Wind</span>{" "}
                <span className="text-f1-white">{w.wind_speed ?? "—"} m/s</span>
              </div>
              {w.rainfall && <Badge color="#0080ff">WET</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next race banner — only show when there's nothing live */}
      {noSession && nextRace && (
        <Card>
          <CardContent className="py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="rounded-md bg-f1-red/15 text-f1-red p-2.5">
                <CalIcon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-f1-muted">Next race</div>
                <div className="font-display text-xl font-semibold truncate tracking-tight">{nextRace.race_name}</div>
                <div className="text-xs text-f1-muted truncate">
                  Round {nextRace.round} · {nextRace.location}, {nextRace.country}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-f1-muted">Lights out in</div>
                <div className="text-2xl text-f1-white tracking-tight tabular-nums">
                  <Countdown target={nextRace.session5_date ?? nextRace.event_date} />
                </div>
              </div>
              {nextRace.event_date && (
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] uppercase tracking-widest text-f1-muted">Race date (UTC)</div>
                  <div className="text-sm tabular-nums">{new Date(nextRace.event_date).toUTCString().slice(0, 16)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Replay picker — only when no live session */}
      {noSession && <ReplayPicker />}

      {/* 3-column main */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr_minmax(0,360px)]">
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <TimingTower
            drivers={drivers}
            onSelectDriver={setSelected}
            selected={focusedDriver?.driver_code}
          />
        </m.div>
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <TrackMap
            drivers={drivers}
            circuitId={liveCircuitId ?? nextRace?.circuit_id ?? null}
            circuitName={snapshot?.circuit_short_name ?? nextRace?.race_name ?? null}
            onSelectDriver={setSelected}
            selected={focusedDriver?.driver_code}
          />
        </m.div>
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <TelemetryPanel driver={focusedDriver} sessionKey={sessionKey} />
        </m.div>
      </div>

      {/* Bottom: race control + prediction overlay placeholder */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <RaceControlFeed messages={snapshot?.race_control ?? []} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Live Win Probability</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-f1-muted">
            Re-prediction overlay updates every 10 laps. Wire `/api/predict` into this card
            with the current grid + remaining laps once a live session is running.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

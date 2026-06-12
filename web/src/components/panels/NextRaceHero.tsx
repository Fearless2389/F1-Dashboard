import { m } from "framer-motion";
import { Cloud, CloudRain, MapPin, Sun } from "lucide-react";

import { Countdown } from "@/components/Countdown";
import type { RaceEvent } from "@/lib/types";

interface Props {
  next?: RaceEvent | null;
}

function weatherIcon(ev?: RaceEvent | null) {
  const wf = ev?.weather_forecast;
  if (!wf) return <Sun size={14} />;
  if (wf.wet_race_likely) return <CloudRain size={14} />;
  if ((wf.rain_probability_max ?? 0) > 30) return <Cloud size={14} />;
  return <Sun size={14} />;
}

/**
 * Editorial hero for the next upcoming race. Big italic Playfair race name on
 * a circuit-SVG backdrop, big lights-out countdown on the right, circuit-spec
 * stat tiles underneath.
 */
export function NextRaceHero({ next }: Props) {
  if (!next) {
    return (
      <div className="rounded-xl border border-dashed border-f1-edge p-8 text-center text-sm text-f1-muted">
        No upcoming race in this season.
      </div>
    );
  }

  const meta = next.circuit_meta;
  const target = next.session5_date ?? next.event_date;

  return (
    <div className="relative overflow-hidden rounded-xl paddock-dashed-coral bg-paddock-panel">
      <div className="relative p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/* Left — title block */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="paddock-pill">NEXT RACE</span>
              <span className="text-[10px] uppercase tracking-widest text-f1-muted">
                Round {next.round}
              </span>
            </div>

            {/* Race name — big italic Playfair with coral gradient */}
            <h2 className="font-display font-black italic text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[0.95]"
              style={{
                background: "linear-gradient(110deg, #f5f5f7 0%, #ff5e6c 90%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {(next.race_name ?? "").toUpperCase()}
            </h2>

            <div className="mt-3 flex items-center gap-3 text-xs text-f1-muted">
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {next.location}, {next.country}
              </span>
              {next.weather_forecast?.air_temp_mean != null && (
                <span className="flex items-center gap-1">
                  {weatherIcon(next)}
                  {next.weather_forecast.air_temp_mean.toFixed(0)}°C
                </span>
              )}
            </div>
          </div>

          {/* Right — countdown */}
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-f1-muted">Lights out in</div>
            <m.div
              key={target ?? "no-date"}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display font-bold text-paddock-coral text-3xl md:text-4xl tabular-nums leading-tight mt-1"
            >
              <Countdown target={target} />
            </m.div>
            {next.event_date && (
              <div className="text-[10px] text-f1-muted mt-1 font-mono">
                {new Date(next.event_date).toUTCString().slice(0, 16)}
              </div>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <Stat label="Lap length" value={meta?.lap_length_km ? `${meta.lap_length_km.toFixed(2)} km` : "—"} />
          <Stat label="Corners"    value={meta?.num_corners ?? "—"} />
          <Stat label="DRS zones"  value={meta?.drs_zones ?? "—"} />
          <Stat label="Downforce"  value={(meta?.downforce_level ?? "—").toString().toUpperCase()} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border border-f1-edge bg-f1-panel/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-f1-muted">{label}</div>
      <div className="font-display font-bold text-f1-white text-base mt-0.5">{value}</div>
    </div>
  );
}

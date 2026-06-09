import { useMemo } from "react";
import { X } from "lucide-react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { teamColorFallback } from "@/lib/teams";
import type { ReplayDriver } from "@/lib/types";
import { useDriverTelemetry, isDrsActive } from "@/hooks/useDriverTelemetry";

interface Props {
  driver: ReplayDriver | null;
  season: number;
  roundNum: number;
  sessionTime: number;
  onClose?: () => void;
}

const COMPOUND_DOT: Record<string, string> = {
  SOFT:        "#ff3030",
  MEDIUM:      "#ffd200",
  HARD:        "#ffffff",
  INTERMEDIATE:"#22aa44",
  WET:         "#1e6fe0",
};

const COMPOUND_TAG: Record<string, string> = {
  SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W",
};

// Trace colours match the existing live-telemetry panel + Tom Shaw's reference:
//  - Speed → anti-flash white
//  - Throttle → green
//  - Brake → red
//  - Gear → light grey, stepwise
const SPEED_COL = "#F0F0F0";
const THROTTLE_COL = "#2ECC71";
const BRAKE_COL = "#E74C3C";
const GEAR_COL = "#B0B0B0";

/**
 * Floating telemetry mini-window for the race replay.
 *
 * Header: number / code / team. 4-stat row: Pos / Gap / Int / Pits.
 * Tyre badge with compound + stint + IN-PIT / DNF flags.
 * Three stacked telemetry panels driven by the per-tick `car_data` cache
 * via `useDriverTelemetry`:
 *   - Speed   (top, 50% of chart height, anti-flash white area chart)
 *   - Gear    (middle, 25%, light-grey step line)
 *   - Throttle + Brake (bottom, 25%, green/red overlaid)
 *
 * If the race's car_data.ff1pkl isn't on disk (older 2024 ingestion), the
 * panel still shows header/stats/tyre but explains that telemetry isn't
 * cached for the selected race.
 */
export function DriverTelemetry({ driver, season, roundNum, sessionTime, onClose }: Props) {
  if (!driver) return null;

  const color = teamColorFallback(driver.team_colour, driver.team_name);
  const compoundKey = (driver.compound ?? "").toUpperCase();
  const compoundDot = COMPOUND_DOT[compoundKey] ?? "#888";
  const compoundTag = COMPOUND_TAG[compoundKey] ?? "?";

  const { samples, isLoading, notAvailable } = useDriverTelemetry({
    season, roundNum,
    driverCode: driver.driver_code,
    sessionTime,
    windowSeconds: 30,
  });

  // Recharts expects an array of points with all dimensions on each row.
  // Build one array shared by all three panels (the t axis is unified).
  const chartData = useMemo(() => {
    if (!samples) return [];
    const n = samples.t.length;
    const rows: Array<{
      t: number;
      speed: number;
      throttle: number;
      brake: number;
      gear: number;
      drsActive: boolean;
    }> = [];
    for (let i = 0; i < n; i++) {
      rows.push({
        t: samples.t[i],
        speed: samples.speed[i] ?? 0,
        throttle: samples.throttle[i] ?? 0,
        brake: samples.brake[i] ? 100 : 0,
        gear: samples.gear[i] ?? 0,
        drsActive: isDrsActive(samples.drs[i]),
      });
    }
    return rows;
  }, [samples]);

  // Last sample is the "now" datum that we badge at the right edge.
  const last = chartData.length ? chartData[chartData.length - 1] : null;

  return (
    <div
      className="rounded-xl border border-f1-edge bg-f1-dark/95 backdrop-blur shadow-2xl w-[420px] overflow-hidden"
      style={{ boxShadow: `0 0 0 1px ${color}33, 0 12px 40px rgba(0,0,0,0.6)` }}
    >
      {/* Header — team-coloured stripe + close */}
      <div className="relative px-4 py-3 flex items-start gap-3 border-b border-f1-edge"
        style={{ background: `linear-gradient(90deg, ${color}33 0%, transparent 80%)` }}>
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            {driver.driver_number != null && (
              <span className="font-display font-black text-xl tabular-nums" style={{ color }}>
                {String(driver.driver_number).padStart(2, "0")}
              </span>
            )}
            <span className="font-display font-bold text-lg">{driver.driver_code}</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-f1-muted mt-0.5">
            {driver.team_name || "—"}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-f1-muted hover:text-f1-white p-1" aria-label="Close">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Live stats row */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 text-center border-b border-f1-edge">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Pos</div>
          <div className="font-display font-bold text-xl tabular-nums" style={{ color }}>
            {driver.position != null ? `P${driver.position}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Gap</div>
          <div className="font-mono text-sm mt-1">{driver.gap_to_leader ?? "—"}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Int</div>
          <div className="font-mono text-sm mt-1">{driver.interval ?? "—"}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Pits</div>
          <div className="font-display font-bold text-xl tabular-nums mt-0.5">{driver.pit_count}</div>
        </div>
      </div>

      {/* Tyre / stint row */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-f1-edge text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: compoundDot }} />
          <span className="font-display font-semibold">{driver.compound ?? "—"}</span>
          {compoundTag !== "?" && (
            <span className="font-mono text-[10px] text-f1-muted">[{compoundTag}]</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-f1-muted">
          <span>Stint {driver.stint_number ?? "—"}</span>
          {last?.drsActive && (
            <span className="rounded-full px-2 py-0.5 bg-paddock-cyan/20 text-paddock-cyan font-semibold">
              DRS
            </span>
          )}
          {driver.is_pitting && (
            <span className="rounded-full px-2 py-0.5 bg-paddock-coral/20 text-paddock-coral font-semibold">
              IN PIT
            </span>
          )}
          {driver.retired && (
            <span className="rounded-full px-2 py-0.5 bg-f1-red/30 text-f1-red font-semibold">
              DNF
            </span>
          )}
        </div>
      </div>

      {/* Telemetry traces */}
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">
            Telemetry · last 30 s
          </div>
          {last && (
            <div className="text-[10px] font-mono text-f1-muted flex gap-3">
              <span><span className="text-f1-white">{last.speed}</span> km/h</span>
              <span>G<span className="text-f1-white">{last.gear || "-"}</span></span>
              <span style={{ color: THROTTLE_COL }}>{last.throttle}%</span>
              <span style={{ color: BRAKE_COL }}>{last.brake ? "BRK" : "—"}</span>
            </div>
          )}
        </div>

        {notAvailable ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center px-4 gap-1.5 rounded-md border border-dashed border-f1-edge bg-f1-panel/30">
            <div className="text-xs text-f1-muted">Telemetry not cached for this race</div>
            <div className="text-[10px] text-f1-muted/70 leading-relaxed">
              FastF1's per-tick data was never fetched for {season}/R{roundNum}.<br />
              Re-ingest the race with <span className="font-mono">telemetry=True</span> to enable.
            </div>
          </div>
        ) : isLoading && chartData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-[11px] text-f1-muted">
            Loading telemetry…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-[11px] text-f1-muted">
            Awaiting telemetry samples…
          </div>
        ) : (
          <div className="space-y-1">
            {/* SPEED — 110px (50% of total chart height) */}
            <div className="h-[110px] rounded-md border border-f1-edge bg-f1-panel/40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="dt-speed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SPEED_COL} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SPEED_COL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[0, 360]} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid #2c3149", borderRadius: 6, fontSize: 11 }}
                    labelFormatter={() => ""}
                    formatter={(v: any) => [`${v} km/h`, "Speed"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="speed"
                    stroke={SPEED_COL}
                    strokeWidth={1.4}
                    fill="url(#dt-speed)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* GEAR — 55px (25%) */}
            <div className="h-[55px] rounded-md border border-f1-edge bg-f1-panel/40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 6, bottom: 0, left: 4 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[0, 8.5]} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid #2c3149", borderRadius: 6, fontSize: 11 }}
                    labelFormatter={() => ""}
                    formatter={(v: any) => [`G${v}`, "Gear"]}
                  />
                  <Line
                    type="step"
                    dataKey="gear"
                    stroke={GEAR_COL}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* THROTTLE + BRAKE overlay — 55px (25%) */}
            <div className="h-[55px] rounded-md border border-f1-edge bg-f1-panel/40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 6, bottom: 0, left: 4 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[-5, 105]} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,10,20,0.95)", border: "1px solid #2c3149", borderRadius: 6, fontSize: 11 }}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="throttle"
                    stroke={THROTTLE_COL}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    name="Throttle %"
                  />
                  <Line
                    type="stepAfter"
                    dataKey="brake"
                    stroke={BRAKE_COL}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    name="Brake"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

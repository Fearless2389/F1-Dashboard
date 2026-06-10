import { m } from "framer-motion";

interface Props {
  currentLap: number;
  totalLaps: number;
  /** Optional race name shown as a tooltip on hover */
  raceName?: string;
}

/**
 * Compact lap counter chip — ~150×60px. Designed to be pinned to a corner
 * of the map without blocking the track. Big Playfair lap number, monospace
 * total, no progress bar inside (a separate thin line at the top of the map
 * shows race-wide progress).
 */
export function ReplayLapTicker({ currentLap, totalLaps, raceName }: Props) {
  return (
    <m.div
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      title={raceName}
      className="rounded-lg border border-f1-edge bg-f1-dark/90 backdrop-blur px-3 py-1.5 shadow-[0_10px_40px_-16px_rgba(0,0,0,0.8)] flex items-center gap-2.5"
    >
      <div className="text-[9px] uppercase tracking-widest text-f1-muted leading-none">Lap</div>
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="font-display text-2xl font-semibold leading-none">{currentLap}</span>
        <span className="text-sm text-f1-muted leading-none">/ {totalLaps}</span>
      </div>
    </m.div>
  );
}

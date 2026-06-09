import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Crown, Flame, Zap } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { teamColor } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { OvertakeEvent } from "@/lib/types";

interface Props {
  overtakes: OvertakeEvent[];
  /** Current playback session-time (seconds from race start). Events with
   *  time <= this value are revealed; later events stay hidden until the
   *  playhead reaches them. */
  sessionTime: number;
  /** Leader's lap-completion session-times — used to compute the sector for
   *  each overtake (S1 / S2 / S3) from its `time` field. */
  lapMarks: number[];
  /** Lap-progress (0..1) where sectors 1 and 2 end. (S3 ends at 1.0.) */
  sectorMarks: number[];
  /** Race start session-time — needed for the lap-1 sector lookup. */
  raceStartT: number;
  /** Click → seek the playhead. We seek ~3 s before the event so the user
   *  actually sees the move on the track, not just its aftermath. */
  onSeek?: (sessionTime: number) => void;
}

/**
 * "Live" overtake feed — events stream in as the replay playhead crosses
 * their session-time. Newest event sits at the top, briefly tagged "NEW"
 * with a pulsing gold border. Past events render normally below.
 *
 * Each row shows:
 *   - lap chip + sector (S1/S2/S3)
 *   - team-coloured stripe + driver code (overtaker)
 *   - arrow + the overtaken driver
 *   - position-change badge ("P5 → P4")
 *   - editorial tag ("FOR THE LEAD" / "BIG MOVE") when applicable
 */
export function OvertakeFeed({
  overtakes, sessionTime, lapMarks, sectorMarks, raceStartT, onSeek,
}: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);

  // Only show events that have happened. Newest first so the feed reads
  // top-down chronologically with the latest move at eye-level.
  const visible = useMemo(() => {
    return overtakes
      .filter(o => o.time <= sessionTime)
      .slice()
      .sort((a, b) => b.time - a.time);
  }, [overtakes, sessionTime]);

  const latest = visible[0];
  // "NEW" highlight window — 4 s of session time. At 8x playback that's
  // ~0.5 s real time, just long enough to draw the eye without lingering.
  const latestIsFresh = latest != null && sessionTime - latest.time < 4;

  // Auto-scroll: keep the feed pinned to the top when new events arrive,
  // unless the user has scrolled down to read older entries.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (node.scrollTop < 40) node.scrollTop = 0;
  }, [latest?.time]);

  // Sector lookup: for an event at session-time `t` in lap `lap`, find what
  // fraction of that lap has elapsed, then compare to sector_marks.
  function sectorFor(o: OvertakeEvent): number {
    if (sectorMarks.length < 2) return 0;
    const lapStart = o.lap <= 1 ? raceStartT : (lapMarks[o.lap - 2] ?? raceStartT);
    const lapEnd = lapMarks[o.lap - 1] ?? (lapStart + 90);
    const dur = Math.max(1, lapEnd - lapStart);
    const frac = Math.max(0, Math.min(0.9999, (o.time - lapStart) / dur));
    if (frac < sectorMarks[0]) return 1;
    if (frac < sectorMarks[1]) return 2;
    return 3;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header: live counter + total */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-f1-edge">
        <div className="flex items-center gap-2">
          <div className="relative p-1.5 rounded-md bg-f1-red/15 text-f1-red">
            <Zap size={14} />
            {latestIsFresh && (
              <span className="absolute -top-0.5 -right-0.5 inline-block h-2 w-2 rounded-full bg-paddock-coral"
                style={{ boxShadow: "0 0 8px 2px #ff5e6c" }}>
                <span className="absolute inset-0 rounded-full bg-paddock-coral animate-ping" />
              </span>
            )}
          </div>
          <div>
            <div className="font-display font-semibold text-sm">Overtakes</div>
            <div className="text-[10px] text-f1-muted tabular-nums">
              <span className="text-f1-white font-semibold">{visible.length}</span>
              {" "}so far · {overtakes.length} total
            </div>
          </div>
        </div>
      </div>

      <ul ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {visible.length === 0 && (
          <li className="text-xs text-f1-muted text-center py-6">
            {overtakes.length === 0
              ? "No overtakes detected."
              : "Waiting for the first overtake of the race…"}
          </li>
        )}
        <AnimatePresence initial={false}>
          {visible.map((o, i) => {
            const ovrColor = teamColor(o.overtaker_team);
            const ovdColor = teamColor(o.overtaken_team);
            const isLatest = i === 0 && latestIsFresh;
            const sector = sectorFor(o);
            const gain = o.new_position;  // we have new_position but not old
            const isForLead = o.new_position === 1;
            // "BIG MOVE" — overtaker took at least 3 places at once. We
            // approximate from new_position vs overtaken's implied position
            // (overtaken was at new_position before the move). Without an
            // "old_position" field we can't always tell; just flag P1 swaps.
            return (
              <motion.li
                key={`${o.time.toFixed(2)}-${o.overtaker_code}-${o.overtaken_code}`}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{
                  opacity: 1, y: 0, scale: 1,
                }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                onClick={() => onSeek?.(Math.max(0, o.time - 3))}
                className={cn(
                  "relative group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  isLatest
                    ? "border border-paddock-coral/60 bg-paddock-coral/8"
                    : "border border-transparent hover:bg-white/[0.04]",
                )}
                style={isLatest ? { boxShadow: "0 0 0 1px rgba(255,94,108,0.35), 0 0 18px rgba(255,94,108,0.18)" } : undefined}
              >
                {/* Lap + sector chip */}
                <div className="shrink-0 flex flex-col items-center min-w-[36px]">
                  <span className="text-[10px] font-mono text-f1-white tabular-nums leading-tight">
                    L{o.lap}
                  </span>
                  <span className="text-[8px] font-mono text-f1-muted leading-tight">
                    S{sector}
                  </span>
                </div>

                {/* Overtaker */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovrColor }} />
                  <span className="font-mono font-semibold text-f1-white">{o.overtaker_code}</span>
                </div>

                <ArrowRight size={11} className="text-f1-muted shrink-0" />

                {/* Overtaken */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovdColor }} />
                  <span className="font-mono text-f1-muted">{o.overtaken_code ?? "—"}</span>
                </div>

                {/* Position badge + editorial tag */}
                <div className="ml-auto flex items-center gap-1.5">
                  {isForLead && (
                    <span className="hidden lg:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-paddock-coral/20 text-paddock-coral">
                      <Crown size={9} /> Lead
                    </span>
                  )}
                  {!isForLead && o.new_position <= 3 && (
                    <span className="hidden lg:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-paddock-cyan/15 text-paddock-cyan">
                      <Flame size={9} /> Podium
                    </span>
                  )}
                  <Badge tone="muted" className="shrink-0 text-[10px] font-mono tabular-nums">
                    P{gain}
                  </Badge>
                </div>

                {isLatest && (
                  <span className="absolute -top-1.5 left-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded bg-paddock-coral text-white"
                    style={{ position: "absolute", animation: "pulse 1.4s ease-in-out infinite" }}>
                    NEW
                  </span>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

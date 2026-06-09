import { useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { teamColor } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { OvertakeEvent } from "@/lib/types";

interface Props {
  overtakes: OvertakeEvent[];
  currentLap?: number;
  onSeek?: (lap: number) => void;
}

/**
 * Scrolling feed of overtake events. Auto-scrolls to keep "current lap" in view.
 * Each entry shows: lap, overtaker (team-coloured), arrow, overtaken, new position.
 * Clicking jumps the replay scrubber to that lap.
 */
export function OvertakeFeed({ overtakes, currentLap, onSeek }: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);

  // Counts before / at / after current lap
  const stats = useMemo(() => {
    if (currentLap == null) return { past: 0, now: 0, future: overtakes.length };
    return {
      past:   overtakes.filter(o => o.lap < currentLap).length,
      now:    overtakes.filter(o => o.lap === currentLap).length,
      future: overtakes.filter(o => o.lap > currentLap).length,
    };
  }, [overtakes, currentLap]);

  // Auto-scroll: keep the "current lap" anchor in view
  useEffect(() => {
    if (!listRef.current || currentLap == null) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-lap="${currentLap}"]`);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentLap]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-f1-edge">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-f1-red/15 text-f1-red">
            <Zap size={14} />
          </div>
          <div>
            <div className="font-display font-semibold text-sm">Overtakes</div>
            <div className="text-[10px] text-f1-muted">
              {overtakes.length} total · {stats.past} past · {stats.future} ahead
            </div>
          </div>
        </div>
      </div>
      <ul ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {overtakes.length === 0 && (
          <li className="text-xs text-f1-muted text-center py-6">No overtakes detected.</li>
        )}
        <AnimatePresence initial={false}>
          {overtakes.map((o, i) => {
            const ovrColor = teamColor(o.overtaker_team);
            const ovdColor = teamColor(o.overtaken_team);
            const isPast = currentLap != null && o.lap < currentLap;
            const isNow  = currentLap != null && o.lap === currentLap;
            return (
              <motion.li
                key={`${o.lap}-${o.overtaker_code}-${o.overtaken_code}-${i}`}
                data-lap={o.lap}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: isPast ? 0.45 : 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => onSeek?.(o.lap)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  isNow ? "bg-f1-red/15 border border-f1-red/30" : "border border-transparent hover:bg-white/[0.04]",
                )}
              >
                <Badge tone="muted" className="shrink-0 text-[10px] font-mono">
                  L{o.lap}
                </Badge>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovrColor }} />
                  <span className="font-mono text-f1-white">{o.overtaker_code}</span>
                </div>
                <span className="text-f1-muted text-[10px]">overtook</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-1 rounded-sm shrink-0" style={{ background: ovdColor }} />
                  <span className="font-mono text-f1-muted">{o.overtaken_code ?? "—"}</span>
                </div>
                <span className="ml-auto text-[10px] tabular-nums text-f1-muted">P{o.new_position}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

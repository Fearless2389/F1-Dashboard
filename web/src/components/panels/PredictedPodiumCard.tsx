import { m } from "framer-motion";
import { Trophy } from "lucide-react";

import { teamColorFallback } from "@/lib/teams";
import type { PodiumSlot, ReliabilityScore } from "@/lib/types";

interface Props {
  podium: PodiumSlot[];
  reliability?: ReliabilityScore | null;
}

// Hoisted: pure function, no component-scope dependencies. Stops React from
// creating a fresh copy each render and breaking React.memo on any child that
// receives this as a prop.
const tileHeight = (pos: number) =>
  pos === 1 ? "h-40 md:h-44" : pos === 2 ? "h-32 md:h-36" : "h-28 md:h-32";

/**
 * Stepped podium card with WIN probability percentages inside each tile.
 * Reliability score line under the podium.
 */
export function PredictedPodiumCard({ podium, reliability }: Props) {
  const by = Object.fromEntries(podium.map(p => [p.position, p]));
  const order = [by[2], by[1], by[3]];

  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/80 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Predicted Podium
        </div>
        <Trophy size={14} className="text-paddock-coral" />
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3 items-end">
        {order.map((slot, idx) => {
          if (!slot) {
            return (
              <div key={idx} className="h-24 rounded-md border border-dashed border-f1-edge" />
            );
          }
          const color = teamColorFallback(slot.team_colour, slot.team_name);
          const pct = Math.round((slot.prob || 0) * 100);
          const isWinner = slot.position === 1;
          return (
            <m.div
              key={slot.position}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: idx * 0.08, type: "spring", stiffness: 220, damping: 24 }}
              className={`relative ${tileHeight(slot.position)} rounded-md flex flex-col items-center justify-end pb-3`}
              style={{
                background:
                  isWinner
                    ? "linear-gradient(180deg, #ff5e6c 0%, #c43d4a 100%)"
                    : slot.position === 2
                      ? "linear-gradient(180deg, #c7ccd7 0%, #5d6577 100%)"
                      : "linear-gradient(180deg, #cd7f32 0%, #7a4a1a 100%)",
                boxShadow: isWinner ? "0 0 28px rgba(255,94,108,0.45)" : undefined,
              }}
            >
              <div className="absolute top-2 left-0 right-0 text-center text-[10px] font-bold tracking-widest text-white/90">
                {slot.driver_code}
              </div>
              <div className={`font-display font-black text-white ${isWinner ? "text-5xl" : "text-3xl"} leading-none`}>
                {slot.position}
              </div>
              <div className={`font-mono font-semibold text-white ${isWinner ? "text-sm" : "text-xs"} mt-1`}>
                {pct}%
              </div>
              <span
                className="absolute left-2 right-2 bottom-1 h-0.5 rounded-sm"
                style={{ background: color }}
              />
            </m.div>
          );
        })}
      </div>

      {reliability && (
        <div className="mt-5 flex items-center justify-between border-t border-f1-edge pt-3">
          <span className="text-[10px] uppercase tracking-widest text-f1-muted">
            Reliability Score
          </span>
          <span className="font-display font-bold text-paddock-cyan tabular-nums">
            {reliability.accuracy_pct?.toFixed(1)}% accuracy
          </span>
        </div>
      )}
    </div>
  );
}

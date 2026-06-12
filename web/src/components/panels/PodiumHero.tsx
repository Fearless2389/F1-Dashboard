import { m } from "framer-motion";
import { teamColor } from "@/lib/teams";

interface Driver {
  position: number;
  driver_code: string;
  team_name?: string;
}

interface Props {
  raceName?: string;
  raceLabel?: string;          // e.g. "RECENT RACE" / "FEATURED"
  description?: string;
  podium?: Driver[];           // expected length 3, ordered by position
}

/**
 * Hero card with a real-podium-style stepped layout:
 *
 *      ┌─────┐
 *      │  1  │     ← biggest, centred, coral
 *  ┌───┤     ├───┐
 *  │ 2 │     │ 3 │
 *  └───┴─────┴───┘
 *
 * Inspired by the mockup. P2 left (silver), P1 centre + tallest (coral), P3 right (bronze).
 */
export function PodiumHero({
  raceName, raceLabel = "Recent Race", description, podium = [],
}: Props) {
  const by = Object.fromEntries(podium.map(d => [d.position, d]));
  const p1 = by[1], p2 = by[2], p3 = by[3];

  return (
    <div className="relative rounded-xl border border-f1-edge bg-paddock-panel overflow-hidden">
      <div className="relative p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
        {/* Left — label + race title + description */}
        <div className="min-w-0">
          <span className="inline-block paddock-pill mb-3 text-[10px]">
            {raceLabel.toUpperCase()}
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight text-f1-white">
            {raceName ?? "Recent Race"}
          </h2>
          {description && (
            <p className="mt-3 text-sm text-f1-muted max-w-md leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Right — stepped podium tiles */}
        <div className="grid grid-cols-3 items-end gap-2 md:gap-3 shrink-0 self-end">
          {[p2, p1, p3].map((d, idx) => {
            if (!d) return <div key={idx} className="h-24 w-20 rounded-md border border-dashed border-f1-edge" />;
            const isWinner = d.position === 1;
            // Reveal order — P3 first, then P2, climax on P1. The grid
            // layout stays left-to-right [p2, p1, p3]; only the entrance
            // delay maps to championship position for the drum-roll.
            //
            // Wider spacing than the first cut — the previous 0/180/420 ms
            // cadence read as "the tiles all appear, oh and then P1"
            // rather than as a real reveal. 0/350/900 gives the eye time
            // to absorb each tile before the next one drops, and the
            // winner arrives only after a full beat of silence.
            const revealDelay = d.position === 3 ? 0 : d.position === 2 ? 0.35 : 0.90;
            const heights = { 1: "h-36 md:h-40", 2: "h-28 md:h-32", 3: "h-24 md:h-28" } as const;
            // Olympic medal palette — vivid top, darker bottom for a metallic feel.
            // The team-colour accent stripe at the base keeps the team identity readable.
            const colors = {
              1: { bg: "linear-gradient(180deg, #ffe27a 0%, #c79321 100%)", text: "#1a1206", glow: "rgba(255,216,77,0.55)" },
              2: { bg: "linear-gradient(180deg, #e6e9ef 0%, #7e8493 100%)", text: "#0e0e1a", glow: "rgba(220,225,234,0.35)" },
              3: { bg: "linear-gradient(180deg, #e29a52 0%, #8a4d18 100%)", text: "#1a0e04", glow: "rgba(226,154,82,0.35)" },
            } as const;
            const c = colors[d.position as 1 | 2 | 3];
            return (
              <m.div
                key={d.position}
                initial={{ y: 24, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{
                  delay: revealDelay,
                  // Softer spring across the board so each tile takes
                  // ~700-900 ms to settle instead of snapping into
                  // place in ~300 ms. P1 gets a lower stiffness and
                  // a bit more damping so it "lands heavy" — the
                  // climax tile should feel like it's coming to rest,
                  // not being kicked into position.
                  type: "spring",
                  stiffness: isWinner ? 140 : 170,
                  damping:   isWinner ? 19  : 22,
                  // Spring tweens are duration-less, but Framer lets
                  // us scale the implicit duration via mass — a heavier
                  // P1 swings the spring longer for the same stiffness.
                  mass: isWinner ? 1.4 : 1,
                }}
                className={`relative w-20 md:w-24 ${heights[d.position as 1 | 2 | 3]} rounded-md flex flex-col items-center justify-end pb-3`}
                style={{ background: c.bg, color: c.text, boxShadow: isWinner ? `0 0 28px ${c.glow}` : `0 0 18px ${c.glow}` }}
              >
                <div className="absolute top-2 left-0 right-0 text-center text-[10px] font-bold tracking-widest opacity-90">
                  {d.driver_code}
                </div>
                <div className={`font-display font-black ${isWinner ? "text-5xl md:text-6xl" : "text-3xl md:text-4xl"} leading-none`}>
                  {d.position}
                </div>
                {/* Team accent stripe at base */}
                <span
                  className="absolute left-2 right-2 bottom-1 h-0.5 rounded-sm"
                  style={{ background: teamColor(d.team_name) }}
                />
              </m.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
